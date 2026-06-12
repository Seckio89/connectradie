import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import {
  calculateProcessingFeeCents,
  calculatePlatformFee,
  resolveTradieTier,
  calculateGstCents,
} from "../_shared/pricing.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
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

    const { allowed } = checkRateLimit(`${user.id}-create-bonus-payment`, 5, 60000);
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

    const { originalPaymentId, bonusAmount, successUrl, cancelUrl, idempotencyKey } = body as {
      originalPaymentId?: string;
      bonusAmount?: number;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    };

    if (!originalPaymentId || !successUrl || !cancelUrl) {
      return errorJson(
        "Missing required parameters: originalPaymentId, successUrl, cancelUrl",
        400
      );
    }
    if (bonusAmount == null || typeof bonusAmount !== "number" || bonusAmount < 1) {
      return errorJson("bonusAmount must be a number of at least $1", 400);
    }

    // Validate redirect URLs
    const allowedOrigin =
      Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
    const isValidRedirectUrl = (url: string) => {
      if (allowedOrigin === "*") return true;
      try {
        const parsed = new URL(url);
        const allowed = new URL(allowedOrigin);
        return parsed.hostname === allowed.hostname;
      } catch {
        return false;
      }
    };
    if (!isValidRedirectUrl(successUrl) || !isValidRedirectUrl(cancelUrl)) {
      return errorJson("Invalid redirect URL", 400);
    }

    // -----------------------------------------------------------------------
    // 1. Fetch the original (released) payment
    // -----------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, profile_id, tradie_id, job_id, amount, status, metadata"
      )
      .eq("id", originalPaymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Original payment not found", 404);
    }

    if (payment.profile_id !== user.id) {
      return errorJson("Only the client on this payment can give a bonus", 403);
    }

    if (payment.status !== "completed") {
      return errorJson("Original payment must be completed", 400);
    }

    const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;

    // Bonus only makes sense AFTER the escrow has been released to the tradie —
    // otherwise the client should adjust the original payment upward via pay-price-increase instead.
    if (!existingMetadata.transfer_id) {
      return errorJson(
        "You can only add a bonus after the original payment has been released. Try adjusting the payment amount instead.",
        400
      );
    }

    // Sanity cap: bonus cannot exceed 2x the original amount (guard against slipped decimals)
    const originalAmountCents = payment.amount;
    const bonusCents = Math.round(bonusAmount * 100);
    if (bonusCents > originalAmountCents * 2) {
      return errorJson(
        `Bonus is capped at 2× the original amount ($${((originalAmountCents * 2) / 100).toFixed(2)}). Please enter a lower figure.`,
        400
      );
    }

    // -----------------------------------------------------------------------
    // 2. Fetch job + tradie
    // -----------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, title, description")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    const tradieId = job.tradie_id || payment.tradie_id;
    if (!tradieId) {
      return errorJson("No tradie assigned to this job", 400);
    }

    const { data: tradieProfile, error: tradieError } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete, is_gst_registered, full_name")
      .eq("id", tradieId)
      .maybeSingle();

    if (tradieError || !tradieProfile) {
      return errorJson("Tradie profile not found", 404);
    }

    if (!tradieProfile.stripe_connect_account_id || !tradieProfile.stripe_connect_onboarding_complete) {
      return errorJson(
        "Your tradie hasn't finished setting up payouts yet, so bonuses can't be sent right now.",
        400
      );
    }

    const tradieIsGstRegistered = tradieProfile.is_gst_registered === true;

    // -----------------------------------------------------------------------
    // 3. Compute fees
    // -----------------------------------------------------------------------
    const processingFeeCents = calculateProcessingFeeCents(bonusCents);
    const gstCents = tradieIsGstRegistered ? calculateGstCents(bonusCents) : 0;

    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", tradieId)
      .maybeSingle();

    const tradieTier = resolveTradieTier(tradieSubRecord?.subscription_tier);
    const platformFeeDollars = calculatePlatformFee(bonusCents / 100, tradieTier);
    const platformFeeCents = Math.round(platformFeeDollars * 100);

    // application_fee_amount is what the platform retains from the destination charge.
    // Tradie receives: (bonus + gst) - application_fee_amount.
    // Client pays:     bonus + gst + processingFee.
    // So the platform retains the processingFee + platformFee out of the collected amount.
    const applicationFeeAmount = platformFeeCents + processingFeeCents;

    // -----------------------------------------------------------------------
    // 4. Create payment record (pending)
    // -----------------------------------------------------------------------
    const { data: bonusPayment, error: insertError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        tradie_id: tradieId,
        payment_type: "bonus",
        job_id: payment.job_id,
        amount: bonusCents,
        processing_fee: processingFeeCents,
        currency: "aud",
        status: "pending",
        parent_payment_id: originalPaymentId,
        metadata: {
          type: "bonus",
          parent_payment_id: originalPaymentId,
          platform_fee: platformFeeCents,
          gst: gstCents,
          tradie_tier: tradieTier,
          tradie_stripe_account: tradieProfile.stripe_connect_account_id,
        },
      })
      .select("id")
      .single();

    if (insertError || !bonusPayment) {
      console.error("Failed to insert bonus payment record:", insertError);
      return errorJson("Failed to create payment record", 500);
    }

    // -----------------------------------------------------------------------
    // 5. Create Stripe Checkout session (destination charge)
    // -----------------------------------------------------------------------
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const { data: clientProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    }

    const jobLabel =
      job.title ||
      job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") ||
      "your job";

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `Bonus for ${tradieProfile.full_name || "your tradie"}`,
            description: `Extra payment for ${jobLabel.slice(0, 80)}. Sent directly to the tradie.`,
          },
          unit_amount: bonusCents,
        },
        quantity: 1,
      },
    ];

    if (gstCents > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "GST (10%)", description: "Goods and Services Tax on the bonus." },
          unit_amount: gstCents,
        },
        quantity: 1,
      });
    }

    if (processingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Secure Processing Fee" },
          unit_amount: processingFeeCents,
        },
        quantity: 1,
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          customer: customerId,
          customer_email: customerId ? undefined : clientProfile?.email,
          line_items: lineItems,
          mode: "payment",
          payment_intent_data: {
            capture_method: "automatic",
            // Destination charge: platform collects, routes the tradie's share automatically to their Connect account.
            transfer_data: {
              destination: tradieProfile.stripe_connect_account_id,
            },
            application_fee_amount: applicationFeeAmount,
            metadata: {
              payment_record_id: bonusPayment.id,
              payment_type: "bonus",
              job_id: payment.job_id,
              parent_payment_id: originalPaymentId,
              tradie_id: tradieId,
            },
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            user_id: user.id,
            payment_type: "bonus",
            job_id: payment.job_id,
            payment_record_id: bonusPayment.id,
            parent_payment_id: originalPaymentId,
            tradie_id: tradieId,
            base_amount: String(bonusCents),
            processing_fee: String(processingFeeCents),
            platform_fee: String(platformFeeCents),
            gst: String(gstCents),
          },
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );
    } catch (stripeErr) {
      console.error("Stripe session creation failed, cleaning up payment record:", stripeErr);
      await supabase.from("payments").delete().eq("id", bonusPayment.id);
      throw stripeErr;
    }

    // Link the checkout session id back to the payment record
    await supabase
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", bonusPayment.id);

    return new Response(
      JSON.stringify({ url: session.url, paymentId: bonusPayment.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in create-bonus-payment:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
