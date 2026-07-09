// payout-reconciliation — scheduled OBSERVABILITY sweep for the payout system.
//
// Deliberately does NO money movement (the release crons own that, with
// deterministic idempotency keys). It only DETECTS states that would otherwise
// rot silently and raises an admin alert:
//   1. Recurring invoices stuck in a held_/deferred payout state.
//   2. One-off payments approved but with the bank payout still pending.
//   3. Drift: payments marked 'released' but with no payout_id/transfer_id
//      (money supposedly sent but nothing recorded moving it).
//
// Retries are handled elsewhere on their own cadence (auto-release-payments every
// 6h for one-off, auto-release-recurring-payouts hourly for recurring) — keeping
// this read-only avoids the double-retrier / idempotency-cache hazards.
//
// Auth: service-role JWT (verify_jwt=true + Bearer ey), same as the other crons.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) return json({ error: "Unauthorized" }, 401);

    // Optional { alert: true } forces the admin notification regardless of the
    // once-daily gate (handy for manual/ops invocation).
    let forceAlert = false;
    try { const b = await req.json(); forceAlert = b?.alert === true; } catch { /* no body */ }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Recurring invoices stuck in a payout-failure state.
    const { data: heldInvoices } = await supabase
      .from("recurring_invoices")
      .select("id, tradie_id, total, payout_status, payout_error_message, paid_at")
      .eq("status", "paid")
      .or("payout_status.eq.held_no_connect,payout_status.eq.held_transfer_error")
      .limit(100);

    // Bank payouts that keep deferring (funds not settling / payouts disabled).
    const { data: deferredInvoices } = await supabase
      .from("recurring_invoices")
      .select("id, tradie_id, total, payout_error_message, paid_at")
      .eq("status", "paid")
      .eq("payout_status", "transferred")
      .not("payout_error_message", "is", null)
      .ilike("payout_error_message", "[bank_payout]%")
      .limit(100);

    // 2. One-off releases approved but with the payout still pending.
    const { data: pendingPayouts } = await supabase
      .from("payments")
      .select("id, job_id, amount, metadata")
      .eq("status", "completed")
      .eq("metadata->>payout_pending", "true")
      .limit(100);

    // 3. Drift — 'released' but nothing recorded actually moving the money.
    const { data: driftPayments } = await supabase
      .from("payments")
      .select("id, job_id, amount, status, metadata")
      .eq("status", "released")
      .eq("metadata->>flow", "destination")
      .is("metadata->>payout_id", null)
      .limit(100);

    const held = heldInvoices ?? [];
    const deferred = deferredInvoices ?? [];
    const pending = pendingPayouts ?? [];
    const drift = driftPayments ?? [];
    const totalIssues = held.length + deferred.length + pending.length + drift.length;

    const summary = {
      checked_at: new Date().toISOString(),
      held_recurring: held.length,
      deferred_bank_payouts: deferred.length,
      pending_oneoff_payouts: pending.length,
      released_without_payout: drift.length,
      total_issues: totalIssues,
      samples: {
        held: held.slice(0, 5).map((i) => ({ invoice_id: i.id, tradie_id: i.tradie_id, status: i.payout_status, error: i.payout_error_message })),
        deferred: deferred.slice(0, 5).map((i) => ({ invoice_id: i.id, tradie_id: i.tradie_id, error: i.payout_error_message })),
        pending: pending.slice(0, 5).map((p) => ({ payment_id: p.id, job_id: p.job_id })),
        drift: drift.slice(0, 5).map((p) => ({ payment_id: p.id, job_id: p.job_id })),
      },
    };

    // Alert admins once daily (or when forced). Alerting on every run would spam a
    // persistent-but-known issue; a UTC-hour gate gives one clean daily digest.
    const hourUtc = new Date().getUTCHours();
    const shouldAlert = totalIssues > 0 && (forceAlert || hourUtc === 22); // ~08:00 AEST

    let alerted = 0;
    if (shouldAlert) {
      const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
      const message =
        `Payout reconciliation found ${totalIssues} issue(s): ` +
        `${held.length} held recurring, ${deferred.length} deferred bank payouts, ` +
        `${pending.length} pending one-off payouts, ${drift.length} released-without-payout. ` +
        `Review the Payouts admin / function logs.`;
      for (const a of admins ?? []) {
        try {
          await supabase.from("notifications").insert({
            user_id: a.id,
            title: "Payout reconciliation alert",
            message,
            type: "payout_reconciliation",
            read: false,
            metadata: summary,
          });
          alerted++;
        } catch (e) {
          console.error("Failed to insert admin alert:", e);
        }
      }
    }

    console.info("payout-reconciliation:", JSON.stringify({ ...summary, alerted }));
    return json({ ...summary, admins_alerted: alerted });
  } catch (err) {
    console.error("payout-reconciliation error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
