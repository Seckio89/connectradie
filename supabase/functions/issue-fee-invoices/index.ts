// ─────────────────────────────────────────────────────────────────────────────
// issue-fee-invoices — turns uninvoiced commission charges into tax invoices
// (pricing spec v2.1 §7A).
//
// Deliberately SEPARATE from the money path. release-escrow only records an
// immutable ledger row; this function issues the document and emails it. That
// way a failing mail server can never break a payout.
//
// Frequency is per tradie (profiles.fee_invoice_frequency):
//   'monthly'     — default per §7A.2; one consolidated invoice per calendar month
//   'per_release' — one invoice per released payment
//
// COMMISSION ONLY. The at-cost materials card-processing pass-through is not
// ConnecTradie revenue, so invoicing it would overstate our GST turnover. It is
// carried on the charge rows for the accountant, never in these totals.
//
// Idempotent: charges are claimed by stamping invoice_id, and only rows where
// invoice_id IS NULL are ever picked up. Re-running is safe.
//
// Invoke:
//   POST {}                        → issue for all eligible tradies (cron)
//   POST { tradieProfileId }       → just that tradie
//   POST { dryRun: true }          → report what would be issued, write nothing
// ─────────────────────────────────────────────────────────────────────────────
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Charge {
  id: string;
  tradie_profile_id: string;
  commission_cents: number;
  gst_cents: number;
  ex_gst_cents: number;
  charged_at: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const dayOf = (iso: string) => iso.slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration error" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Authorization: cron/service-role or a platform admin ONLY ──────────────
  // verify_jwt alone is not enough here: it proves the caller is *some* signed-in
  // user, and issuing tax invoices across every tradie is not a user action.
  //
  // The service-role JWT is identified by its `role` claim, NOT by byte-comparing
  // the key — a comparison like that silently breaks the moment the key is
  // rotated, and this must keep working unattended.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const jwtRole = (t: string): string | null => {
    try {
      return JSON.parse(atob(t.split(".")[1] ?? "")).role ?? null;
    } catch {
      return null;
    }
  };

  let authorized = jwtRole(token) === "service_role";
  if (!authorized && token) {
    const { data: caller } = await supabase.auth.getUser(token);
    if (caller?.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", caller.user.id)
        .maybeSingle();
      authorized = (prof as { is_admin?: boolean } | null)?.is_admin === true;
    }
  }
  if (!authorized) return json({ error: "Forbidden" }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    const onlyTradie: string | undefined = body?.tradieProfileId;
    const dryRun: boolean = body?.dryRun === true;

    // Everything not yet on an invoice. Zero-commission charges never reach here
    // (recordFeeCharge skips them), so fee-exempt accounts get no empty invoice.
    let q = supabase
      .from("platform_fee_charges")
      .select("id, tradie_profile_id, commission_cents, gst_cents, ex_gst_cents, charged_at")
      .is("invoice_id", null)
      .order("charged_at", { ascending: true });
    if (onlyTradie) q = q.eq("tradie_profile_id", onlyTradie);

    const { data: charges, error: chargesErr } = await q;
    if (chargesErr) return json({ error: "Could not load charges", detail: chargesErr.message }, 500);
    if (!charges || charges.length === 0) return json({ issued: 0, note: "Nothing to invoice." });

    // Group by tradie, then by billing period according to their preference.
    const byTradie = new Map<string, Charge[]>();
    for (const c of charges as Charge[]) {
      const list = byTradie.get(c.tradie_profile_id) ?? [];
      list.push(c);
      byTradie.set(c.tradie_profile_id, list);
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name, fee_invoice_frequency")
      .in("id", [...byTradie.keys()]);
    const profileById = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

    const results: Array<Record<string, unknown>> = [];

    for (const [tradieId, tradieCharges] of byTradie) {
      const profile = profileById.get(tradieId);
      const perRelease = profile?.fee_invoice_frequency === "per_release";

      // Monthly consolidates by calendar month; per-release is one per charge.
      const groups = new Map<string, Charge[]>();
      for (const c of tradieCharges) {
        const key = perRelease ? c.id : c.charged_at.slice(0, 7); // id | YYYY-MM
        const list = groups.get(key) ?? [];
        list.push(c);
        groups.set(key, list);
      }

      for (const [, group] of groups) {
        const subtotal = group.reduce((s, c) => s + c.ex_gst_cents, 0);
        const gst = group.reduce((s, c) => s + c.gst_cents, 0);
        const total = group.reduce((s, c) => s + c.commission_cents, 0);
        const periodStart = dayOf(group[0].charged_at);
        const periodEnd = dayOf(group[group.length - 1].charged_at);

        if (dryRun) {
          results.push({ tradieId, charges: group.length, total_cents: total, periodStart, periodEnd, dryRun: true });
          continue;
        }

        const { data: invoice, error: invErr } = await supabase
          .from("platform_fee_invoices")
          .insert({
            tradie_profile_id: tradieId,
            period_start: periodStart,
            period_end: periodEnd,
            subtotal_ex_gst_cents: subtotal,
            gst_cents: gst,
            total_cents: total,
          })
          .select("id, invoice_number")
          .single();

        if (invErr || !invoice) {
          console.error("[issue-fee-invoices] insert failed", tradieId, invErr);
          results.push({ tradieId, error: invErr?.message ?? "insert failed" });
          continue;
        }

        // Claim the charges. Guarded on invoice_id IS NULL so two concurrent runs
        // can never attach the same charge to two invoices.
        const { error: claimErr } = await supabase
          .from("platform_fee_charges")
          .update({ invoice_id: invoice.id })
          .in("id", group.map((c) => c.id))
          .is("invoice_id", null);

        if (claimErr) {
          console.error("[issue-fee-invoices] claim failed; invoice left unattached", invoice.id, claimErr);
          results.push({ tradieId, invoice_number: invoice.invoice_number, error: "claim failed" });
          continue;
        }

        // Email it. Failure here must NOT undo the invoice — it is legally issued
        // the moment it exists; emailed_at simply stays null for a later resend.
        const email = profile?.email as string | undefined;
        if (email) {
          try {
            const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
            const periodLabel = periodStart === periodEnd
              ? new Date(periodStart).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
              : new Date(periodStart).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

            const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({
                recipientUserId: tradieId,
                subject: `Tax Invoice ${invoice.invoice_number} — ConnecTradie fees, ${periodLabel}`,
                body:
                  `Here's your tax invoice for ConnecTradie platform fees (${periodLabel}).\n\n` +
                  `Fees ex GST: ${money(subtotal)}\nGST: ${money(gst)}\nTotal: ${money(total)}\n\n` +
                  `This covers our commission only — we charge nothing on your materials.\n` +
                  `If you're GST-registered you can claim the GST back on your BAS.\n\n` +
                  `View or download it: ${siteUrl}/tax-invoice/${invoice.id}`,
                notificationType: "FEE_TAX_INVOICE",
              }),
            });
            if (res.ok) {
              await supabase
                .from("platform_fee_invoices")
                .update({ emailed_at: new Date().toISOString() })
                .eq("id", invoice.id);
            } else {
              console.error("[issue-fee-invoices] email rejected", invoice.invoice_number, await res.text());
            }
          } catch (e) {
            console.error("[issue-fee-invoices] email threw", invoice.invoice_number, e);
          }
        }

        results.push({
          tradieId,
          invoice_number: invoice.invoice_number,
          charges: group.length,
          total_cents: total,
        });
      }
    }

    return json({ issued: results.filter((r) => r.invoice_number).length, results });
  } catch (err) {
    console.error("issue-fee-invoices error:", err);
    return json({ error: "An internal error occurred" }, 500);
  }
});
