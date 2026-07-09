// Sweep cron for recurring_invoices whose payment succeeded but whose payout to
// the tradie never landed. Companion to auto-release-payments (which only
// handles the one-off payments table). This function recovers from:
//
//   1. Legacy webhook paths where stripe.transfers.create threw and the error
//      was logged but no state was written — invoice sat at payout_status=NULL.
//   2. Tradie Connect account not yet onboarded at webhook time — flagged as
//      held_onboarding_incomplete or held_no_connect — pickable on retry once
//      onboarding completes.
//   3. Transient transfer failures — flagged held_transfer_error — retried
//      until success.
//
// Idempotency keys EXACTLY mirror the original webhook attempts
// (`becs_transfer_${invoice_id}_${pi_id}` for BECS, `checkout_transfer_${invoice_id}_${session_id}` for cards),
// so if the original transfer actually landed at Stripe but the webhook's DB
// write was lost, Stripe returns the same transfer instead of double-paying.
//
// Eligible invoices: status='paid', payout_status IS NULL OR payout_status LIKE 'held_%',
// paid_at < now() - 1 hour. The 1-hour window gives the webhook room to
// complete on the happy path before the sweep tries.
//
// Safe to run hourly. Cancellation status of the parent recurring_job is
// intentionally NOT a filter — paid invoices belong to the tradie regardless
// of whether the client has since cancelled the service.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, resolveTradieTier } from "../_shared/pricing.ts";

// Invoices paid at/after this instant get an automatic BANK PAYOUT (Stripe
// balance → bank) once their funds settle. Tradie accounts are on MANUAL payouts
// (see migrate-payout-schedules — the escrow replacement), and modern invoices use
// destination charges that land funds in the tradie's balance at charge time, so
// nothing ever moved them to the bank. This cutover is the deploy time of that fix:
// invoices paid BEFORE it were auto-paid-out under the old automatic-payout schedule
// (or reconciled by a one-time balance release), so gating on it prevents re-paying
// historical earnings.
const BANK_PAYOUT_CUTOVER = "2026-07-09T12:00:00Z";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type PayoutResult = {
  invoice_id: string;
  outcome: "transferred" | "held_no_connect" | "held_transfer_error" | "skipped" | "already_settled";
  reason?: string;
  transfer_id?: string;
  amount_cents?: number;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    let supabaseUrl: string, supabaseServiceKey: string, stripeSecretKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    } catch (e) {
      console.error(e);
      return errorJson("Server configuration error", 500);
    }

    // Defence-in-depth: caller has passed verify_jwt=true, but require a JWT
    // bearer to avoid surprises if the function gets reconfigured later.
    // Deliberately NOT byte-compared against env var — auto-injected service
    // role key can drift from the vault secret used by pg_cron after rotation.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Cron posts '{}'; an admin/ops call may pass a body for the one-time release.
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no/invalid body → treat as empty */ }

    // ── Admin one-time release: pay out a tradie's settled Connect balance ────
    // Clears earnings that piled up as "available" while accounts were on manual
    // payouts with nothing moving them to the bank. A payout can NEVER exceed the
    // available balance, so it can't over-pay; reserveCents leaves escrow-held
    // one-off funds (funded but not yet released) untouched.
    if (typeof body.releaseAvailableBalanceForTradie === "string") {
      const tradieId = body.releaseAvailableBalanceForTradie;
      const reserveCents = typeof body.reserveCents === "number" ? Math.max(0, Math.round(body.reserveCents)) : 0;
      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
        .eq("id", tradieId)
        .maybeSingle();
      if (!prof?.stripe_connect_account_id || !prof.stripe_connect_onboarding_complete) {
        return errorJson("Tradie has no completed Connect account", 400);
      }
      const bal = await stripe.balance.retrieve({ stripeAccount: prof.stripe_connect_account_id });
      const availableAud = bal.available.filter((b) => b.currency === "aud").reduce((s, b) => s + b.amount, 0);
      const payoutAmount = availableAud - reserveCents;
      if (payoutAmount <= 0) {
        return jsonResponse({ mode: "balance_release", tradie_id: tradieId, available_cents: availableAud, reserve_cents: reserveCents, paid_out_cents: 0, note: "Nothing available to pay out after reserve." });
      }
      const idem = typeof body.idempotencyKey === "string" ? body.idempotencyKey : `manual_release_${tradieId}`;
      const payout = await stripe.payouts.create(
        { amount: payoutAmount, currency: "aud", description: "ConnecTradie balance release", metadata: { type: "manual_balance_release", tradie_id: tradieId } },
        { stripeAccount: prof.stripe_connect_account_id, idempotencyKey: idem },
      );
      try {
        await supabase.from("notifications").insert({
          user_id: tradieId,
          title: "Payout On Its Way",
          message: `$${(payoutAmount / 100).toFixed(2)} from your ConnecTradie balance is heading to your bank account.`,
          type: "payment_received",
          read: false,
          metadata: { payout_id: payout.id },
        });
      } catch { /* non-fatal */ }
      return jsonResponse({ mode: "balance_release", tradie_id: tradieId, available_cents: availableAud, reserve_cents: reserveCents, paid_out_cents: payoutAmount, payout_id: payout.id, payout_status: payout.status, arrival_date: payout.arrival_date });
    }

    const cutoffIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // status='paid' AND (payout_status IS NULL OR payout_status starts with 'held_')
    //                AND paid_at <= cutoff
    // Supabase doesn't expose a single OR with NULL + LIKE easily — split into
    // two queries and merge in JS for clarity.
    const [nullRes, heldRes] = await Promise.all([
      supabase
        .from("recurring_invoices")
        .select("id, recurring_job_id, tradie_id, total, stripe_payment_intent_id, stripe_checkout_session_id, payment_method, paid_at")
        .eq("status", "paid")
        .is("payout_status", null)
        .lte("paid_at", cutoffIso),
      supabase
        .from("recurring_invoices")
        .select("id, recurring_job_id, tradie_id, total, stripe_payment_intent_id, stripe_checkout_session_id, payment_method, paid_at")
        .eq("status", "paid")
        .like("payout_status", "held_%")
        .lte("paid_at", cutoffIso),
    ]);

    if (nullRes.error) {
      console.error("Failed to fetch null-payout-status invoices:", nullRes.error);
      return errorJson("Failed to fetch invoices", 500);
    }
    if (heldRes.error) {
      console.error("Failed to fetch held invoices:", heldRes.error);
      return errorJson("Failed to fetch invoices", 500);
    }

    const invoices = [...(nullRes.data || []), ...(heldRes.data || [])];

    if (invoices.length === 0) {
      return jsonResponse({ processed: 0, released: 0, total_amount_cents: 0, results: [] });
    }

    const results: PayoutResult[] = [];
    let released = 0;
    let totalAmount = 0;

    for (const inv of invoices) {
      if (!inv.tradie_id) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "no tradie_id on invoice" });
        continue;
      }

      if (!inv.stripe_payment_intent_id && !inv.stripe_checkout_session_id) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "no stripe payment reference" });
        continue;
      }

      // Pull the PI to read the original metadata (platform_fee, processing_fee,
      // routing flag, tradie_id). This is the canonical source — what the
      // webhook would have used.
      let pi: Stripe.PaymentIntent | null = null;
      try {
        if (inv.stripe_payment_intent_id) {
          pi = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent_id);
        } else if (inv.stripe_checkout_session_id) {
          const session = await stripe.checkout.sessions.retrieve(inv.stripe_checkout_session_id, { expand: ["payment_intent"] });
          if (typeof session.payment_intent === "string") {
            pi = await stripe.paymentIntents.retrieve(session.payment_intent);
          } else if (session.payment_intent) {
            pi = session.payment_intent as Stripe.PaymentIntent;
          }
        }
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`Invoice ${inv.id}: failed to fetch Stripe PI — ${msg}`);
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: `stripe fetch failed: ${msg}` });
        continue;
      }

      if (!pi) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: "could not resolve payment intent" });
        continue;
      }

      // If the charge was a destination charge, funds already routed at charge
      // time — just record transferred and move on.
      const routedAtCharge = pi.metadata?.routing === "destination";
      if (routedAtCharge) {
        await supabase
          .from("recurring_invoices")
          .update({ payout_status: "transferred" })
          .eq("id", inv.id);
        results.push({ invoice_id: inv.id, outcome: "already_settled", reason: "destination charge — routed at charge time" });
        continue;
      }

      // Legacy path: pull amounts from PI metadata to mirror the original
      // webhook math exactly.
      const platformFeeCents = pi.metadata?.platform_fee ? parseInt(pi.metadata.platform_fee, 10) : 0;
      const processingFeeCents = pi.metadata?.processing_fee ? parseInt(pi.metadata.processing_fee, 10) : 0;
      const baseAmount = pi.amount - processingFeeCents;
      const transferAmount = baseAmount - platformFeeCents;

      if (transferAmount <= 0) {
        results.push({ invoice_id: inv.id, outcome: "skipped", reason: `non-positive transfer amount (${transferAmount})` });
        continue;
      }

      // Check tradie's Connect account
      const { data: tradieProfile } = await supabase
        .from("profiles")
        .select("stripe_connect_account_id, stripe_connect_onboarding_complete, email, full_name")
        .eq("id", inv.tradie_id)
        .maybeSingle();

      if (!tradieProfile?.stripe_connect_account_id || !tradieProfile.stripe_connect_onboarding_complete) {
        // Flag and continue — sweep will retry once onboarding completes.
        await supabase
          .from("recurring_invoices")
          .update({
            payout_status: "held_no_connect",
            payout_error_message: `Tradie has no completed Stripe Connect account (account_id=${tradieProfile?.stripe_connect_account_id ?? "none"}, onboarding_complete=${tradieProfile?.stripe_connect_onboarding_complete ?? false}).`,
          })
          .eq("id", inv.id);
        results.push({
          invoice_id: inv.id,
          outcome: "held_no_connect",
          reason: `tradie ${inv.tradie_id} has no completed Connect account`,
        });
        continue;
      }

      // Idempotency key MUST match the original webhook's so a previously
      // succeeded-but-unrecorded transfer isn't duplicated.
      const isBecs = inv.payment_method === "au_becs_debit" || pi.metadata?.type === "recurring_invoice_becs";
      const idempotencyKey = isBecs
        ? `becs_transfer_${inv.id}_${pi.id}`
        : inv.stripe_checkout_session_id
          ? `checkout_transfer_${inv.id}_${inv.stripe_checkout_session_id}`
          : `sweep_transfer_${inv.id}_${pi.id}`;

      try {
        const transfer = await stripe.transfers.create({
          amount: transferAmount,
          currency: "aud",
          destination: tradieProfile.stripe_connect_account_id,
          transfer_group: `recurring_${inv.recurring_job_id}`,
          metadata: {
            type: "recurring_invoice_payout",
            recurring_job_id: inv.recurring_job_id ?? "",
            tradie_id: inv.tradie_id,
            invoice_id: inv.id,
            platform_fee: String(platformFeeCents),
            swept: "true",
          },
        }, { idempotencyKey });

        await supabase
          .from("recurring_invoices")
          .update({ payout_status: "transferred", payout_error_message: null })
          .eq("id", inv.id);

        results.push({
          invoice_id: inv.id,
          outcome: "transferred",
          transfer_id: transfer.id,
          amount_cents: transferAmount,
        });
        released++;
        totalAmount += transferAmount;

        // Notify tradie that the held payout has now landed.
        try {
          await supabase.from("notifications").insert({
            user_id: inv.tradie_id,
            title: "Payout Released",
            message: `A previously held payout of $${(transferAmount / 100).toFixed(2)} for a recurring service invoice has been released to your account.`,
            type: "payment_received",
            read: false,
            metadata: { invoice_id: inv.id, transfer_id: transfer.id, recurring_job_id: inv.recurring_job_id },
          });
        } catch (notifErr) {
          console.error(`Failed to notify tradie for swept payout on invoice ${inv.id}:`, notifErr);
        }

        console.info(`Swept payout: invoice ${inv.id} → transfer ${transfer.id} (${transferAmount} cents to ${inv.tradie_id})`);
      } catch (transferErr) {
        const msg = transferErr instanceof Error ? transferErr.message : String(transferErr);
        // Extract Stripe error code if present for cleaner DB storage.
        const stripeCode = (transferErr as { code?: string } | undefined)?.code;
        const storedMsg = stripeCode ? `[${stripeCode}] ${msg}` : msg;
        console.error(`Sweep transfer failed for invoice ${inv.id}: ${storedMsg}`);
        await supabase
          .from("recurring_invoices")
          .update({
            payout_status: "held_transfer_error",
            payout_error_message: storedMsg.slice(0, 500),
          })
          .eq("id", inv.id);
        results.push({ invoice_id: inv.id, outcome: "held_transfer_error", reason: storedMsg });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bank-payout stage — move SETTLED recurring earnings from the tradie's Stripe
    // balance to their bank. Destination charges land funds in the tradie's balance
    // at charge time and accounts are on MANUAL payouts, so without this nothing
    // reaches the bank. Gated to paid_at >= BANK_PAYOUT_CUTOVER so historical
    // 'transferred' invoices are never re-paid; 'transferred' → 'paid_out' with a
    // per-invoice idempotency key as belt-and-suspenders.
    const bankPayouts: { invoice_id: string; outcome: string; amount_cents?: number; payout_id?: string; reason?: string }[] = [];
    let bankPaidCount = 0;
    let bankPaidAmount = 0;

    const { data: awaiting, error: awaitingErr } = await supabase
      .from("recurring_invoices")
      .select("id, tradie_id, total, recurring_job_id, paid_at")
      .eq("status", "paid")
      .eq("payout_status", "transferred")
      .gte("paid_at", BANK_PAYOUT_CUTOVER)
      .lte("paid_at", cutoffIso);

    if (awaitingErr) {
      console.error("Failed to fetch awaiting-bank-payout invoices:", awaitingErr);
    } else {
      const tradieCache = new Map<string, { connectId: string | null; onboarded: boolean; tier: ReturnType<typeof resolveTradieTier> }>();
      for (const inv of awaiting || []) {
        if (!inv.tradie_id) { bankPayouts.push({ invoice_id: inv.id, outcome: "skipped", reason: "no tradie_id" }); continue; }

        let meta = tradieCache.get(inv.tradie_id);
        if (!meta) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
            .eq("id", inv.tradie_id)
            .maybeSingle();
          const { data: td } = await supabase
            .from("tradie_details")
            .select("subscription_tier")
            .eq("profile_id", inv.tradie_id)
            .maybeSingle();
          meta = {
            connectId: prof?.stripe_connect_account_id ?? null,
            onboarded: !!prof?.stripe_connect_onboarding_complete,
            tier: resolveTradieTier(td?.subscription_tier),
          };
          tradieCache.set(inv.tradie_id, meta);
        }

        if (!meta.connectId || !meta.onboarded) { bankPayouts.push({ invoice_id: inv.id, outcome: "skipped", reason: "no connect account" }); continue; }

        // Net that landed in the tradie's balance = total − platform fee (processing
        // was added on top of the charge and taken back as part of the application fee).
        const totalDollars = Number(inv.total) || 0;
        const netCents = Math.round(totalDollars * 100) - Math.round(calculatePlatformFee(totalDollars, meta.tier) * 100);
        if (netCents <= 0) { bankPayouts.push({ invoice_id: inv.id, outcome: "skipped", reason: "non-positive net" }); continue; }

        try {
          const payout = await stripe.payouts.create(
            { amount: netCents, currency: "aud", description: "ConnecTradie recurring invoice", metadata: { type: "recurring_invoice_bank_payout", invoice_id: inv.id, tradie_id: inv.tradie_id, recurring_job_id: inv.recurring_job_id ?? "" } },
            { stripeAccount: meta.connectId, idempotencyKey: `bank_payout_${inv.id}` },
          );
          await supabase
            .from("recurring_invoices")
            .update({ payout_status: "paid_out", payout_error_message: null })
            .eq("id", inv.id);
          bankPayouts.push({ invoice_id: inv.id, outcome: "paid_out", amount_cents: netCents, payout_id: payout.id });
          bankPaidCount++;
          bankPaidAmount += netCents;
        } catch (payErr) {
          const msg = payErr instanceof Error ? payErr.message : String(payErr);
          const code = (payErr as { code?: string } | undefined)?.code;
          // Insufficient available balance (funds still settling) → leave as
          // 'transferred' so the next hourly run retries once they clear.
          console.warn(`Bank payout deferred for invoice ${inv.id}: ${code ?? ""} ${msg}`);
          await supabase
            .from("recurring_invoices")
            .update({ payout_error_message: `[bank_payout] ${code ?? ""} ${msg}`.slice(0, 500) })
            .eq("id", inv.id);
          bankPayouts.push({ invoice_id: inv.id, outcome: "deferred", reason: code ?? msg });
        }
      }
    }

    return jsonResponse({
      processed: invoices.length,
      released,
      total_amount_cents: totalAmount,
      total_amount_dollars: `$${(totalAmount / 100).toFixed(2)}`,
      results,
      bank_paid_count: bankPaidCount,
      bank_paid_amount_cents: bankPaidAmount,
      bank_payouts: bankPayouts,
    });
  } catch (err) {
    console.error("auto-release-recurring-payouts error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
