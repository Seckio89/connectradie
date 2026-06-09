import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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

    // Check if transfer has already been made
    const existingMetadata = payment.metadata || {};
    if (existingMetadata.transfer_id) {
      return errorJson(
        "Escrow funds have already been released for this payment",
        409
      );
    }

    // Note: a pending_increase used to block release. We now let release proceed
    // (releasing the original amount) so the client only ever waits one 48hr
    // auto-release window — paying the increase remains optional from their side.
    // The pending_increase flag is cleared below alongside the transfer write.

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Sum any completed price_adjustment child payments
    const { data: additionalPayments } = await supabase
      .from("payments")
      .select("amount, metadata")
      .eq("parent_payment_id", paymentId)
      .eq("status", "completed")
      .eq("payment_type", "price_adjustment");

    let totalBase = payment.amount;
    let totalPlatformFee = typeof existingMetadata.platform_fee === "number"
      ? existingMetadata.platform_fee
      : 0;

    for (const addl of (additionalPayments || [])) {
      totalBase += addl.amount;
      const addlPlatformFee = typeof addl.metadata?.platform_fee === "number"
        ? addl.metadata.platform_fee
        : 0;
      totalPlatformFee += addlPlatformFee;
    }

    // Calculate transfer amount: total base minus total platform fees
    const platformFeeCents = totalPlatformFee;
    const transferAmount = totalBase - platformFeeCents;

    if (transferAmount <= 0) {
      return errorJson("Transfer amount must be positive after platform fee deduction", 400);
    }

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
        console.error(
          "Failed to resolve PI to charge for source_transaction:",
          lookupErr,
        );
        sourceChargeId = null;
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
        metadata: {
          ...cleanMetadata,
          transfer_id: transfer.id,
          transfer_amount: transfer.amount,
          platform_fee_deducted: platformFeeCents,
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
