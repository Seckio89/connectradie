import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, calculateGstCents, resolveTradieTier } from "../_shared/pricing.ts";
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

    const { allowed } = checkRateLimit(`${user.id}-pay-milestone`, 5, 60000);
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

    const { milestoneId, successUrl, cancelUrl, idempotencyKey } = body as {
      milestoneId?: string;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    };

    if (!milestoneId || !successUrl || !cancelUrl) {
      return errorJson(
        "Missing required parameters: milestoneId, successUrl, cancelUrl",
        400
      );
    }

    // Look up the milestone
    const { data: milestone, error: milestoneError } = await supabase
      .from("job_milestones")
      .select("id, job_id, title, amount, status")
      .eq("id", milestoneId)
      .maybeSingle();

    if (milestoneError || !milestone) {
      return errorJson("Milestone not found", 404);
    }

    if (milestone.status !== "approved") {
      return errorJson(
        "Milestone must be in 'approved' status before payment",
        400
      );
    }

    // Validate user is the client on the associated job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, description")
      .eq("id", milestone.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Associated job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson(
        "Only the client on this job can pay milestones",
        403
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Get user profile for Stripe customer info
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    // Check for existing Stripe customer
    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    }

    // Look up tradie subscription tier for platform fee and GST status
    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", job.tradie_id)
      .maybeSingle();

    const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);

    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("is_gst_registered, stripe_connect_account_id, stripe_connect_onboarding_complete, platform_fee_override_bps")
      .eq("id", job.tradie_id)
      .maybeSingle();
    const tradieIsGstRegistered = tradieProfile?.is_gst_registered === true;

    // Destination charges require the tradie to have a connected Stripe account
    if (!tradieProfile?.stripe_connect_account_id || !tradieProfile?.stripe_connect_onboarding_complete) {
      return errorJson(
        "This tradie hasn't finished setting up their payout account yet. They need to complete Stripe onboarding before you can pay.",
        400,
      );
    }

    // Milestone amount is stored as numeric (dollars), convert to cents
    const milestoneDollars = Number(milestone.amount);
    const baseAmount = Math.round(milestoneDollars * 100);
    const gst = tradieIsGstRegistered ? calculateGstCents(baseAmount) : 0;
    const processingFee = calculateProcessingFeeCents(baseAmount);

    // Calculate platform fee based on tradie's subscription tier
    const platformFeeDollars = calculatePlatformFee(milestoneDollars, tradieSubscriptionTier, tradieProfile?.platform_fee_override_bps ?? null);
    const platformFeeCents = Math.round(platformFeeDollars * 100);

    // application_fee_amount is what the platform retains from the destination charge.
    const applicationFeeAmount = platformFeeCents + processingFee;

    if (baseAmount <= 0) {
      return errorJson("Milestone amount must be positive", 400);
    }

    // Create payment record
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        payment_type: "job_funding",
        job_id: milestone.job_id,
        amount: baseAmount,
        processing_fee: processingFee,
        currency: "aud",
        status: "pending",
        metadata: {
          milestone_id: milestoneId,
          milestone_title: milestone.title,
          flow: "destination",
          tradie_id: job.tradie_id,
          tradie_stripe_account: tradieProfile.stripe_connect_account_id,
          gst: String(gst),
          platform_fee: platformFeeCents,
          tradie_tier: tradieSubscriptionTier,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert payment record:", insertError);
      return errorJson("Failed to create payment record", 500);
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `Milestone Payment: ${milestone.title}`,
          },
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
          product_data: { name: "Secure Processing Fee" },
          unit_amount: processingFee,
        },
        quantity: 1,
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          capture_method: "automatic",
          transfer_data: {
            destination: tradieProfile.stripe_connect_account_id,
          },
          application_fee_amount: applicationFeeAmount,
          metadata: {
            payment_record_id: paymentRecord.id,
            flow: "destination",
            payment_type: "job_funding",
            job_id: milestone.job_id,
            milestone_id: milestoneId,
            tradie_id: job.tradie_id,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user.id,
          payment_type: "job_funding",
          job_id: milestone.job_id,
          milestone_id: milestoneId,
          payment_record_id: paymentRecord.id,
          base_amount: String(baseAmount),
          processing_fee: String(processingFee),
          platform_fee: String(platformFeeCents),
          tradie_tier: tradieSubscriptionTier,
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Update payment record with checkout session ID
    await supabase
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", paymentRecord.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating milestone payment session:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
