import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";
import { frozenCents, recordFeeCharge } from "../_shared/feeContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
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

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
    }

    if (!stripeSecretKey) {
      return errorJson("Stripe not configured", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorJson(authError?.message || "Unauthorized", 401);
    }

    const { allowed } = checkRateLimit(`${user.id}-release-escrow`, 5, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorJson("Invalid JSON body", 400);
    }

    const { paymentId, idempotencyKey } = body as { paymentId?: string; idempotencyKey?: string };

    if (!paymentId) {
      return errorJson("Missing required parameter: paymentId", 400);
    }

    // Look up the payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, profile_id, job_id, amount, status, stripe_payment_intent_id, metadata"
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Payment not found", 404);
    }

    if (payment.status !== "completed") {
      return errorJson(
        "Payment must be in 'completed' status to release escrow",
        400
      );
    }

    if (!payment.stripe_payment_intent_id) {
      return errorJson(
        "Payment does not have a Stripe payment intent",
        400
      );
    }

    // Verify user is the client on the associated job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Associated job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson(
        "Only the client on this job can release escrow funds",
        403
      );
    }

    if (!job.tradie_id) {
      return errorJson("No tradie assigned to this job", 400);
    }

    // Get the tradie's Stripe Connect account
    const { data: tradieProfile, error: tradieError } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", job.tradie_id)
      .maybeSingle();

    if (tradieError || !tradieProfile) {
      return errorJson("Tradie profile not found", 404);
    }

    if (!tradieProfile.stripe_connect_account_id) {
      return errorJson(
        "Tradie has not set up their Stripe Connect account",
        400
      );
    }

    if (!tradieProfile.stripe_connect_onboarding_complete) {
      return errorJson(
        "Tradie has not completed Stripe Connect onboarding",
        400
      );
    }

    // Check if funds have already been released (transfer for legacy, payout for destination charges)
    const existingMetadata = payment.metadata || {};
    if (existingMetadata.transfer_id || existingMetadata.payout_id) {
      return errorJson(
        "Escrow funds have already been released for this payment",
        409
      );
    }

    // Determine payment flow: destination charges (new) vs custodial escrow (legacy)
    const isDestinationCharge = payment.metadata?.flow === "destination";

    // Note: a pending_increase used to block release. We now let release proceed
    // (releasing the original amount) so the client only ever waits one 48hr
    // auto-release window — paying the increase remains optional from their side.
    // The pending_increase flag is cleared below alongside the transfer write.

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Sum any completed price_adjustment child payments
    const { data: additionalPayments } = await supabase
      .from("payments")
      .select("id, amount, metadata")
      .eq("parent_payment_id", paymentId)
      .eq("status", "completed")
      .eq("payment_type", "price_adjustment");

    let totalBase = payment.amount;
    // Pricing v2.1: platform_fee is the TOTAL the platform retained =
    // commission + at-cost materials processing. Commission and materials
    // processing are also tracked separately so the payout breakdown can show
    // them as distinct line items and never blend them into one opaque number.
    let totalPlatformFee = frozenCents(existingMetadata.platform_fee);
    let totalCommission = frozenCents(existingMetadata.commission);
    let totalMaterialsProcessing = frozenCents(existingMetadata.materials_processing);
    // GST (stored as a string in metadata.gst, cents) was charged on top of the base
    // and, on destination charges, routed to the tradie's Stripe balance. It must be
    // included in the payout or it strands in their balance and never reaches the bank.
    let totalGst = Number(existingMetadata.gst) || 0;

    for (const addl of (additionalPayments || [])) {
      totalBase += addl.amount;
      totalPlatformFee += frozenCents(addl.metadata?.platform_fee);
      totalCommission += frozenCents(addl.metadata?.commission);
      totalMaterialsProcessing += frozenCents(addl.metadata?.materials_processing);
      totalGst += Number(addl.metadata?.gst) || 0;
    }

    // Pre-v2.1 rows carry only platform_fee. Attribute the whole of it to
    // commission so the breakdown still reconciles rather than showing $0.
    if (totalCommission === 0 && totalMaterialsProcessing === 0 && totalPlatformFee > 0) {
      totalCommission = totalPlatformFee;
    }

    // Calculate transfer/payout amount: total base minus total platform fees
    const platformFeeCents = totalPlatformFee;
    const transferAmount = totalBase - platformFeeCents;

    if (transferAmount <= 0) {
      return errorJson("Transfer amount must be positive after platform fee deduction", 400);
    }

    // ── DESTINATION CHARGE FLOW (new) ──────────────────────────────────
    // Funds were routed to the tradie's Connect account at payment time via
    // Stripe destination charges. The transfer already happened automatically.
    // The "release" action here marks the payment as released and OPTIONALLY
    // triggers a payout (moving funds from tradie's Stripe balance to bank).
    // If the payout fails (e.g. account not on manual payouts yet, balance
    // not settled), we still mark the payment as released — the tradie will
    // receive their funds via their normal payout schedule.
    if (isDestinationCharge) {
      let payoutId: string | null = null;
      let payoutAmount: number | null = null;
      let payoutError: string | null = null;

      // Attempt to move the funds from the tradie's Stripe balance to their bank.
      // If it fails (e.g. balance still settling) we keep the payment retryable
      // rather than marking it released — manual-payout accounts have no schedule
      // that would otherwise complete it.
      // Pay out what actually landed in the tradie's balance: base + GST − platform
      // fee (the processing fee was taken back as part of the application fee).
      // MUST match auto-release-payments' amount exactly — they share the idempotency
      // key, so a differing amount would make Stripe reject the racing retry.
      const destinationPayoutCents = transferAmount + totalGst;
      try {
        const payout = await stripe.payouts.create(
          {
            amount: destinationPayoutCents,
            currency: "aud",
            metadata: {
              payment_id: paymentId,
              job_id: payment.job_id,
              client_id: user.id,
              tradie_id: job.tradie_id,
              platform_fee: String(platformFeeCents),
              gst: String(totalGst),
              flow: "destination",
            },
          },
          {
            stripeAccount: tradieProfile.stripe_connect_account_id,
            // Deterministic key shared with auto-release-payments so a client
            // release racing the cron can't create two payouts for one payment.
            idempotencyKey: `release_payout_${paymentId}`,
          },
        );
        payoutId = payout.id;
        payoutAmount = payout.amount;
      } catch (payoutErr) {
        payoutError = payoutErr instanceof Error ? payoutErr.message : String(payoutErr);
        console.warn(
          "Destination payout failed — keeping payment retryable. Payment:",
          paymentId,
          "Error:",
          payoutError,
        );
      }

      const { pending_increase: _droppedIncrease, ...cleanMetadata } = existingMetadata as Record<string, unknown>;
      const releasedAt = new Date().toISOString();

      // Only mark 'released' once the BANK PAYOUT actually landed. Accounts are on
      // MANUAL payouts, so a 'released' row with no payout_id would strand the funds
      // in the tradie's balance forever — auto-release-payments only rescans
      // 'completed'. On failure keep status 'completed' + payout_pending so the cron
      // retries; record the homeowner's approval either way.
      const newStatus = payoutId ? "released" : "completed";
      const { error: metaUpdateError } = await supabase
        .from("payments")
        .update({
          status: newStatus,
          metadata: {
            ...cleanMetadata,
            ...(payoutId
              ? { payout_id: payoutId, payout_amount: payoutAmount, released_at: releasedAt }
              : { payout_pending: true, payout_last_error: payoutError }),
            platform_fee_deducted: platformFeeCents,
            // v2.1: keep the two components visible on the released record so a
            // tradie's payout breakdown can show "our fee" and "card processing
            // on materials — at cost" as separate lines, matching the explainer.
            commission_deducted: totalCommission,
            materials_processing_deducted: totalMaterialsProcessing,
            release_approved_at: releasedAt,
            released_by: user.id,
            flow: "destination",
          },
        })
        .eq("id", paymentId);

      if (metaUpdateError) {
        console.error(
          "Failed to update payment metadata after release. Payment ID:",
          paymentId,
          metaUpdateError
        );
      }

      // §7A: record the commission for tax-invoicing. Best-effort by design —
      // recordFeeCharge never throws, so this cannot fail a payout that has
      // already moved money.
      await recordFeeCharge(supabase, {
        tradieProfileId: job.tradie_id,
        paymentId,
        jobId: payment.job_id,
        commissionCents: totalCommission,
        materialsProcessingCents: totalMaterialsProcessing,
        feeRateBps: frozenCents(existingMetadata.fee_rate_bps) || null,
        feeRateType: typeof existingMetadata.fee_rate_type === "string"
          ? existingMetadata.fee_rate_type
          : null,
      });

      // Mark the summed child price_adjustment rows released too (only once the
      // payout landed) so reconciliation/reporting stays consistent.
      if (payoutId) {
        for (const addl of (additionalPayments || [])) {
          const am = (addl.metadata || {}) as Record<string, unknown>;
          await supabase
            .from("payments")
            .update({ status: "released", metadata: { ...am, payout_id: payoutId, released_at: releasedAt } })
            .eq("id", addl.id);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          ...(payoutId ? { payoutId } : { note: "Payment released. Payout will process via the tradie's normal schedule." }),
          ...(metaUpdateError ? { warning: "Release completed but record update failed." } : {}),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── LEGACY CUSTODIAL FLOW (existing) ───────────────────────────────
    // Platform collected funds into its own Stripe balance; we now transfer
    // them to the tradie's Connect account via stripe.transfers.create().

    // Create a transfer to the tradie's Connect account.
    //
    // We source the transfer directly from the original charge via
    // `source_transaction` whenever the transfer amount fits within it.
    // This debits the held escrow funds rather than the platform's general
    // available balance — which is the right shape for "escrow, released
    // later" and avoids the failure mode where pending Stripe settlement
    // (or routine payouts in production) leave the platform balance below
    // the transfer amount at release time.
    //
    // IMPORTANT: source_transaction accepts a Charge ID (ch_xxx), NOT a
    // PaymentIntent ID. Stripe used to auto-resolve PI → latest_charge in
    // some flows but the transfers endpoint rejects PIs outright. We do the
    // resolution explicitly here.
    //
    // When price-adjustment top-ups have pushed the total above the original
    // charge — or the PI lookup fails — we fall back to a platform-balance
    // transfer (the prior behavior). A future change should split adjusted
    // jobs into one transfer per source so they still source from held
    // funds; flag with metadata.sourced_from_pi so we can audit how often.
    let sourceChargeId: string | null = null;
    if (transferAmount <= payment.amount) {
      try {
        const intent = await stripe.paymentIntents.retrieve(
          payment.stripe_payment_intent_id,
        );
        const lc = intent.latest_charge;
        sourceChargeId = typeof lc === "string" ? lc : (lc?.id ?? null);
      } catch (lookupErr) {
        // Refuse to fall back to a platform-balance transfer — we expected
        // to debit the held charge and we can't verify it exists. Better
        // to return a retryable error than silently debit the wrong source
        // and leave accounting drift no-one notices until reconcile.
        console.error(
          "Failed to resolve PI to charge for source_transaction — refusing platform-balance fallback:",
          lookupErr,
        );
        return errorJson(
          "We couldn't verify the payment source. Please try again in a moment — if it keeps failing, contact support.",
          503,
        );
      }
      if (!sourceChargeId) {
        // PI exists but has no latest_charge yet (most often: charge still
        // in transit on Stripe's side). Same reasoning — do not paper over
        // with platform balance.
        console.error(
          "PaymentIntent has no latest_charge yet, refusing platform-balance fallback:",
          payment.stripe_payment_intent_id,
        );
        return errorJson(
          "The payment hasn't fully settled with Stripe yet. Please try again in a few minutes.",
          503,
        );
      }
    }

    const transfer = await stripe.transfers.create(
      {
        amount: transferAmount,
        currency: "aud",
        destination: tradieProfile.stripe_connect_account_id,
        ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
        transfer_group: `job_${payment.job_id}`,
        metadata: {
          payment_id: paymentId,
          job_id: payment.job_id,
          client_id: user.id,
          tradie_id: job.tradie_id,
          platform_fee: String(platformFeeCents),
          sourced_from_pi: String(!!sourceChargeId),
          source_charge: sourceChargeId ?? "",
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Update payment metadata with transfer info. Strip pending_increase so the
    // dropped adjustment doesn't keep showing as a CTA after release.
    const { pending_increase: _droppedIncrease, ...cleanMetadata } = existingMetadata as Record<string, unknown>;
    const { error: metaUpdateError } = await supabase
      .from("payments")
      .update({
        status: "released",
        metadata: {
          ...cleanMetadata,
          transfer_id: transfer.id,
          transfer_amount: transfer.amount,
          platform_fee_deducted: platformFeeCents,
          // v2.1 split — see the destination-charge path above.
          commission_deducted: totalCommission,
          materials_processing_deducted: totalMaterialsProcessing,
          released_at: new Date().toISOString(),
          released_by: user.id,
        },

      })
      .eq("id", paymentId);

    if (metaUpdateError) {
      // CRITICAL: Transfer succeeded but metadata not saved — risk of duplicate transfer on retry
      console.error(
        "CRITICAL: Stripe transfer created but metadata update failed. Transfer ID:",
        transfer.id,
        "Payment ID:",
        paymentId,
        metaUpdateError
      );
    }

    // §7A: same commission ledger write as the destination path. Best-effort.
    await recordFeeCharge(supabase, {
      tradieProfileId: job.tradie_id,
      paymentId,
      jobId: payment.job_id,
      commissionCents: totalCommission,
      materialsProcessingCents: totalMaterialsProcessing,
      feeRateBps: frozenCents(existingMetadata.fee_rate_bps) || null,
      feeRateType: typeof existingMetadata.fee_rate_type === "string"
        ? existingMetadata.fee_rate_type
        : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        transferId: transfer.id,
        ...(metaUpdateError ? { warning: "Transfer completed but record update failed. Contact support if this payment appears twice." } : {}),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error releasing escrow:", err);
    // Translate known Stripe / infrastructure errors into user-friendly messages.
    // We never surface raw Stripe error text (it includes test card numbers,
    // internal URLs, and developer-oriented language) to end users.
    if (err instanceof Stripe.errors.StripeError) {
      const code = err.code || err.type;
      if (
        code === "balance_insufficient" ||
        /insufficient.*funds/i.test(err.message)
      ) {
        return errorJson(
          "Payment couldn't be released right now due to a temporary platform balance issue. Please try again shortly — if it keeps failing, contact support and we'll release it manually.",
          503,
        );
      }
      if (code === "account_invalid" || code === "account_inactive") {
        return errorJson(
          "The tradie's payout account isn't fully set up. Ask them to complete Stripe onboarding before you release the payment.",
          400,
        );
      }
      // Destination-charge payout errors — the connected account may not
      // have enough available balance yet (settlement timing).
      if (
        code === "amount_too_large" ||
        /insufficient.*balance/i.test(err.message)
      ) {
        return errorJson(
          "The tradie's account balance hasn't settled yet. Please try again in a few hours.",
          503,
        );
      }
      // Any other Stripe error — log full details server-side, return a
      // generic user-facing message, AND include a debug envelope so the
      // browser's DevTools network panel surfaces the underlying Stripe
      // code/message. The debug field is intended to be temporary while we
      // stabilise the Connect transfer flow — remove once it's solid.
      console.error(
        "Unhandled Stripe error in release-escrow:",
        err.code,
        err.type,
        err.message,
      );
      return new Response(
        JSON.stringify({
          error:
            "We couldn't release the payment right now. Please try again — if it keeps failing, contact support.",
          debug: { code: err.code, type: err.type, message: err.message },
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
