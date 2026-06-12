import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateProcessingFeeCents, calculatePlatformFee, calculateGstCents, resolveTradieTier } from "../_shared/pricing.ts";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

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

    const { allowed } = checkRateLimit(`${user.id}-create-job-payment-checkout`, 5, 60000);
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

    const { paymentId, successUrl, cancelUrl, idempotencyKey } = body as {
      paymentId?: string;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    };

    if (!paymentId || !successUrl || !cancelUrl) {
      return errorJson(
        "Missing required parameters: paymentId, successUrl, cancelUrl",
        400
      );
    }

    // Validate redirect URLs to prevent open redirects
    const allowedDomain = Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
    const isValidRedirectUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        const allowed = new URL(allowedDomain);
        return parsed.hostname === allowed.hostname;
      } catch {
        return false;
      }
    };
    if (!isValidRedirectUrl(successUrl as string) || !isValidRedirectUrl(cancelUrl as string)) {
      return errorJson("Invalid redirect URL", 400);
    }

    // Look up the existing payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, profile_id, job_id, amount, status, payment_type, stripe_checkout_session_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Payment not found", 404);
    }

    // Only the client (profile_id) can pay
    if (payment.profile_id !== user.id) {
      return errorJson("Only the client on this payment can pay", 403);
    }

    if (payment.status !== "pending") {
      return errorJson("Payment is not in pending status", 400);
    }

    if (payment.amount <= 0) {
      return errorJson("Payment amount must be greater than zero", 400);
    }

    // If already has a checkout session, check if it's still valid
    if (payment.stripe_checkout_session_id) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(
          payment.stripe_checkout_session_id
        );
        if (existingSession.status === "open" && existingSession.url) {
          return new Response(
            JSON.stringify({ url: existingSession.url }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } catch {
        // Session expired or invalid — create a new one
      }
    }

    // Get job details for the line item description and tradie info
    let jobDescription = "Service Payment";
    let tradieIsGstRegistered = false;
    let tradieConnectAccountId: string | null = null;
    let tradieId: string | null = null;
    let platformFeeCents = 0;

    if (payment.job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("description, tradie_id")
        .eq("id", payment.job_id)
        .maybeSingle();
      if (job?.description) {
        jobDescription = job.description.replace(/^\[[^\]]+\]\s*/, "");
      }
      if (job?.tradie_id) {
        tradieId = job.tradie_id;
        const { data: tradieProfile } = await supabase
          .from("profiles")
          .select("is_gst_registered, stripe_connect_account_id, stripe_connect_onboarding_complete")
          .eq("id", job.tradie_id)
          .maybeSingle();
        tradieIsGstRegistered = tradieProfile?.is_gst_registered === true;
        tradieConnectAccountId = tradieProfile?.stripe_connect_account_id || null;

        if (!tradieProfile?.stripe_connect_account_id || !tradieProfile?.stripe_connect_onboarding_complete) {
          return errorJson(
            "This tradie hasn't finished setting up their payout account yet. They need to complete Stripe onboarding before you can pay.",
            400,
          );
        }

        // Look up tradie subscription tier for platform fee
        const { data: tradieSubRecord } = await supabase
          .from("tradie_details")
          .select("subscription_tier")
          .eq("profile_id", job.tradie_id)
          .maybeSingle();

        const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);
        const platformFeeDollars = calculatePlatformFee(payment.amount / 100, tradieSubscriptionTier);
        platformFeeCents = Math.round(platformFeeDollars * 100);
      }
    }

    if (!tradieConnectAccountId) {
      return errorJson("No tradie with a connected Stripe account found for this payment", 400);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Get user profile for Stripe customer info
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined;
    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      // Check stripe_subscriptions table
      const { data: existingSub } = await supabase
        .from("stripe_subscriptions")
        .select("stripe_customer_id")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (existingSub?.stripe_customer_id) {
        customerId = existingSub.stripe_customer_id;
      }
    }

    const baseAmount = payment.amount;
    const gst = tradieIsGstRegistered ? calculateGstCents(baseAmount) : 0;
    const processingFee = calculateProcessingFeeCents(baseAmount);

    // application_fee_amount is what the platform retains from the destination charge.
    const applicationFeeAmount = platformFeeCents + processingFee;

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: { name: jobDescription },
          unit_amount: baseAmount,
        },
        quantity: 1,
      },
    ];

    if (gst > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "GST (10%)" },
          unit_amount: gst,
        },
        quantity: 1,
      });
    }

    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Processing Fee" },
          unit_amount: processingFee,
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          capture_method: "automatic",
          transfer_data: {
            destination: tradieConnectAccountId,
          },
          application_fee_amount: applicationFeeAmount,
          metadata: {
            payment_record_id: paymentId,
            job_id: payment.job_id || "",
            flow: "destination",
            payment_type: payment.payment_type,
            tradie_id: tradieId || "",
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user.id,
          payment_type: payment.payment_type,
          job_id: payment.job_id || "",
          payment_record_id: paymentId,
          base_amount: String(baseAmount),
          gst: String(gst),
          processing_fee: String(processingFee),
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    // Update payment record with checkout session ID and processing fee
    await supabase
      .from("payments")
      .update({
        stripe_checkout_session_id: session.id,
        processing_fee: processingFee,
      })
      .eq("id", paymentId);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating job payment checkout:", err);
    console.error("Error creating job payment checkout:", err);
    return errorJson("An internal error occurred", 500);
  }
});
