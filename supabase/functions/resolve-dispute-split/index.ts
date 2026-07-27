import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { frozenCents, recordFeeCharge } from "../_shared/feeContext.ts";
import { computeSplit, SplitAmountError } from "../_shared/disputeSplit.ts";

/*
  resolve-dispute-split — Phase 5 of AI-assisted dispute handling.

  Resolves a dispute by returning part of the money to the client and paying
  the rest to the tradie. `resolved_split` has been a valid dispute status since
  the table was created with nothing implementing it; the Phase 3 admin screen
  deliberately shipped without a Split button rather than set a status claiming
  the money was divided when none of it moved.

  ─────────────────────────────────────────────────────────────────────────────
  ORDER IS LOAD-BEARING. Refund first, THEN pay out.
  ─────────────────────────────────────────────────────────────────────────────
  These are destination charges: the money is already in the TRADIE's Connect
  balance from the moment the client paid, and Connect accounts are on manual
  payout so it sits there. The refund reverses money back OUT of that balance.
  Pay out first and the balance is gone — the reversal then fails or drives the
  account negative.

  ─────────────────────────────────────────────────────────────────────────────
  AND THE DISPUTE IS RESOLVED LAST.
  ─────────────────────────────────────────────────────────────────────────────
  Resolving sets a terminal status, which clears `blocks_release`, which stops
  auto-release-payments skipping the job. If that happened before the split
  finished, the cron would pay out the FULL original amount under its own
  idempotency key. So: money first, dispute last. If Stripe fails, the dispute
  stays open and frozen — the safe direction to fail in.

  The split also leaves the payment at status='released', because auto-release
  only ever picks up 'completed'.

  Deploy:
    npx supabase functions deploy resolve-dispute-split
*/

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return errorJson("Method not allowed", 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return errorJson("Server configuration error", 500);
    if (!stripeSecretKey) return errorJson("Stripe not configured", 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return errorJson("Missing Authorization header", 401);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return errorJson(authError?.message || "Unauthorized", 401);

    const { allowed } = checkRateLimit(`${user.id}-resolve-dispute-split`, 5, 60_000);
    if (!allowed) return errorJson("Rate limit exceeded. Please try again later.", 429);

    // Admin only. Same shape as process-refund/index.ts:130-146 — the platform
    // owner holds is_admin while keeping role='tradie'.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    const p = profileRow as { role?: string | null; is_admin?: boolean | null } | null;
    if (!(p?.role === "admin" || p?.is_admin === true)) {
      return errorJson("Only an administrator can split a disputed payment", 403);
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return errorJson("Invalid JSON body", 400); }

    const { disputeId, refundCents, reasoning, aiSuggestion, overridden } = body as {
      disputeId?: string;
      refundCents?: number;
      reasoning?: string;
      aiSuggestion?: unknown;
      overridden?: boolean;
    };

    if (!disputeId) return errorJson("Missing required parameter: disputeId", 400);
    if (typeof refundCents !== "number" || !Number.isInteger(refundCents)) {
      return errorJson("refundCents must be a whole number of cents", 400);
    }
    if (!reasoning || !reasoning.trim()) {
      return errorJson("A written reason is required to resolve a dispute", 400);
    }

    // ── The dispute must still be live ──────────────────────────────────────
    const { data: disputeRow } = await supabase
      .from("disputes")
      .select("id, job_id, blocks_release")
      .eq("id", disputeId)
      .maybeSingle();
    const dispute = disputeRow as { id: string; job_id: string; blocks_release: boolean } | null;
    if (!dispute) return errorJson("Dispute not found", 404);
    if (!dispute.blocks_release) return errorJson("This dispute has already been resolved", 409);

    // ── The payment must still be pre-payout escrow ─────────────────────────
    // status='completed' means the funds are in the tradie's Stripe balance and
    // have NOT yet gone to their bank. Splitting after payout would need a
    // negative balance and a bank debit — a materially different act, out of
    // scope here. The admin full refund in Admin → Payments remains the tool.
    const { data: paymentRow } = await supabase
      .from("payments")
      .select("id, job_id, amount, status, processing_fee, stripe_payment_intent_id, metadata, fee_rate_bps, fee_rate_type")
      .eq("job_id", dispute.job_id)
      .eq("payment_type", "job_funding")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const payment = paymentRow as {
      id: string; job_id: string; amount: number; status: string;
      processing_fee: number | null; stripe_payment_intent_id: string | null;
      metadata: Record<string, unknown> | null;
      fee_rate_bps: number | null; fee_rate_type: string | null;
    } | null;

    if (!payment) {
      return errorJson(
        "This job has no held payment to split. If the payout has already gone out, use the refund in Admin → Payments instead.",
        409,
      );
    }
    if (!payment.stripe_payment_intent_id) {
      return errorJson("That payment has no Stripe payment intent to refund against", 409);
    }

    const meta = payment.metadata || {};
    if (meta.flow !== "destination") {
      // The legacy custodial flow holds funds in the PLATFORM balance and
      // releases via transfers.create, so the split maths and the reversal
      // behaviour are both different. Refuse outright rather than half-support
      // it and get the arithmetic quietly wrong on someone's money.
      return errorJson(
        "This payment used the older custodial escrow flow, which cannot be split automatically. Resolve it in full and adjust manually.",
        409,
      );
    }

    // ── Amounts ─────────────────────────────────────────────────────────────
    let split;
    try {
      split = computeSplit({
        amountCents: payment.amount,
        gstCents: frozenCents(meta.gst),
        processingFeeCents: payment.processing_fee || 0,
        platformFeeCents: frozenCents(meta.platform_fee),
        refundCents,
        commissionCents: frozenCents(meta.commission),
        materialsProcessingCents: frozenCents(meta.materials_processing),
      });
    } catch (err) {
      if (err instanceof SplitAmountError) return errorJson(err.message, 400);
      throw err;
    }

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("id, tradie_id")
      .eq("id", dispute.job_id)
      .maybeSingle();
    const tradieId = (jobRow as { tradie_id: string | null } | null)?.tradie_id;
    if (!tradieId) return errorJson("That job has no assigned tradie", 409);

    const { data: tradieRow } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", tradieId)
      .maybeSingle();
    const tradie = tradieRow as {
      stripe_connect_account_id: string | null;
      stripe_connect_onboarding_complete: boolean | null;
    } | null;
    if (!tradie?.stripe_connect_account_id) {
      return errorJson("The tradie has no connected Stripe account", 409);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // ── LEG 1: refund the client, while the tradie's balance still holds it ──
    // reverse_transfer + refund_application_fee make Stripe reverse BOTH sides
    // proportionally, so the platform keeps commission on the released portion
    // only without us computing a fee ourselves.
    //
    // The key is DERIVED from the dispute, never caller-supplied: a key the
    // caller controls is not idempotency. Keyed on the dispute (not the
    // payment) so retrying the same decision is safe.
    let refundId: string;
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: payment.stripe_payment_intent_id,
          amount: split.refundCents,
          reason: "requested_by_customer",
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: {
            payment_id: payment.id,
            job_id: payment.job_id,
            dispute_id: disputeId,
            resolved_by: user.id,
            flow: "destination",
            leg: "dispute_split_refund",
          },
        },
        { idempotencyKey: `dispute_split_refund_${disputeId}` },
      );
      refundId = refund.id;
    } catch (refundErr) {
      // Nothing has moved. Leave the dispute open and frozen.
      const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
      console.error("dispute split: refund leg failed, nothing moved.", disputeId, msg);
      return errorJson(`Could not refund the client's share: ${msg}`, 502);
    }

    // ── LEG 2: pay the tradie their remainder ───────────────────────────────
    // A DISTINCT idempotency key from `release_payout_${paymentId}`, which
    // release-escrow and auto-release-payments have already bound to the FULL
    // amount — reusing it with a different amount makes Stripe reject.
    let payoutId: string | null = null;
    let payoutError: string | null = null;
    if (split.tradiePayoutCents > 0) {
      try {
        const payout = await stripe.payouts.create(
          {
            amount: split.tradiePayoutCents,
            currency: "aud",
            metadata: {
              payment_id: payment.id,
              job_id: payment.job_id,
              dispute_id: disputeId,
              tradie_id: tradieId,
              flow: "destination",
              leg: "dispute_split_payout",
            },
          },
          {
            stripeAccount: tradie.stripe_connect_account_id,
            idempotencyKey: `dispute_split_payout_${disputeId}`,
          },
        );
        payoutId = payout.id;
      } catch (payoutErr) {
        payoutError = payoutErr instanceof Error ? payoutErr.message : String(payoutErr);
        // DELIBERATE: we do NOT leave status='completed' for the cron to retry,
        // which is what release-escrow:289 does. The cron would pay the FULL
        // amount, not the remainder — and the client has already been refunded.
        // Mark it released so nothing can double-pay; the tradie's remainder
        // stays in their Stripe balance and needs a manual payout.
        console.error(
          "dispute split: refund SUCCEEDED but payout FAILED. Tradie remainder is stranded in their Stripe balance and needs a manual payout.",
          JSON.stringify({ disputeId, paymentId: payment.id, tradieId, amount: split.tradiePayoutCents, error: payoutError }),
        );
      }
    }

    // ── Record it ───────────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "released",
        metadata: {
          ...meta,
          split_dispute_id: disputeId,
          split_refund_cents: split.refundCents,
          split_payout_cents: split.tradiePayoutCents,
          split_refund_id: refundId,
          released_at: now,
          released_by: user.id,
          ...(payoutId ? { payout_id: payoutId } : { payout_pending: true, payout_last_error: payoutError }),
          platform_fee_deducted: split.applicationFeeCents,
          commission_deducted: split.retainedCommissionCents,
          materials_processing_deducted: split.retainedMaterialsProcessingCents,
          flow: "destination",
        },
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("dispute split: payment record update failed after money moved", payment.id, updateError);
    }

    // §7A: commission for tax-invoicing, scaled to the released portion.
    // Best-effort by design — recordFeeCharge never throws, so paperwork cannot
    // fail a payout that has already moved.
    await recordFeeCharge(supabase, {
      tradieProfileId: tradieId,
      paymentId: payment.id,
      jobId: payment.job_id,
      commissionCents: split.retainedCommissionCents,
      materialsProcessingCents: split.retainedMaterialsProcessingCents,
      feeRateBps: payment.fee_rate_bps ?? null,
      feeRateType: payment.fee_rate_type ?? null,
    });

    // ── LAST: resolve the dispute ───────────────────────────────────────────
    // Only now is it safe to clear blocks_release. The RPC writes the
    // append-only decision row and the status change in one transaction.
    const { error: resolveError } = await supabase.rpc("resolve_dispute", {
      p_dispute_id: disputeId,
      p_outcome: "resolved_split",
      p_reasoning: reasoning.trim(),
      p_ai_suggestion: (aiSuggestion ?? null) as never,
      p_overridden: overridden === true,
    });

    if (resolveError) {
      // The money is already where it should be, so do not report failure —
      // but the dispute is still open and an admin must close it by hand.
      console.error("dispute split: money moved but resolve_dispute failed", disputeId, resolveError);
      return new Response(
        JSON.stringify({
          success: true,
          refundId,
          payoutId,
          warning: "The split was paid but the dispute could not be closed automatically. Resolve it manually.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        refundId,
        payoutId,
        refundCents: split.refundCents,
        payoutCents: split.tradiePayoutCents,
        ...(payoutError
          ? { warning: "The client's refund went through, but the tradie's share could not be paid out automatically and needs a manual payout." }
          : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("resolve-dispute-split: unhandled", err);
    return errorJson(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
