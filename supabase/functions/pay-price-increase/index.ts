import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateProcessingFeeCents, calculatePlatformFee, calculateGstCents, resolveTradieTier } from "../_shared/pricing.ts";
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

// Exported so tests can call it with a fabricated Request. `import.meta.main`
// is true for the runtime entrypoint and false when a test imports this module,
// so importing it does not start a server.
export const handler = async (req: Request): Promise<Response> => {
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

    const { allowed } = await checkRateLimit(`${user.id}-pay-price-increase`, 5, 60000);
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
    // 1. Fetch the original payment with pending_increase
    // -----------------------------------------------------------------------
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
      return errorJson("Original payment must be completed", 400);
    }

    const pendingIncrease = payment.metadata?.pending_increase;
    if (!pendingIncrease) {
      return errorJson(
        "No pending price increase found for this payment",
        400
      );
    }

    // -----------------------------------------------------------------------
    // 2. Verify user is the client on the job
    // -----------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, description")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson(
        "Only the client on this job can pay the price increase",
        403
      );
    }

    if (!job.tradie_id) {
      return errorJson("No tradie assigned to this job", 400);
    }

    // Fetch tradie profile for Stripe Connect account
    const { data: tradieProfile, error: tradieError } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", job.tradie_id)
      .maybeSingle();

    if (tradieError || !tradieProfile) {
      return errorJson("Tradie profile not found", 404);
    }

    if (!tradieProfile.stripe_connect_account_id || !tradieProfile.stripe_connect_onboarding_complete) {
      return errorJson(
        "This tradie hasn't finished setting up their payout account yet. They need to complete Stripe onboarding before you can pay.",
        400
      );
    }

    // -----------------------------------------------------------------------
    // 3. Check for existing additional payment (prevent duplicates)
    // -----------------------------------------------------------------------
    // Scoped to THIS increase, newest first. Two things were wrong with an
    // unfiltered maybeSingle() on parent_payment_id + payment_type:
    //
    //  • A job carries several variations over its life and each gets its own
    //    price_adjustment row, so a COMPLETED row from an earlier variation was
    //    read as "this one is already paid" — the second variation on any job
    //    409'd forever with "Additional payment has already been completed".
    //  • decline-variation leaves a cancelled attempt behind as 'failed' for
    //    the audit trail. A 'failed' row is neither completed (no 409) nor
    //    pending (not deleted), so the next approval inserted a SECOND row and
    //    the call after that errored on multiple rows.
    //
    // pending_increase carries the variation id, so scope by it when present.
    // Quote adjustments have no variation_id and keep the original behaviour.
    const scopedVariationId = typeof pendingIncrease.variation_id === "string"
      ? pendingIncrease.variation_id
      : null;

    let existingAdditionalQuery = supabase
      .from("payments")
      .select("id, status")
      .eq("parent_payment_id", paymentId)
      .eq("payment_type", "price_adjustment")
      .in("status", ["pending", "completed"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (scopedVariationId) {
      existingAdditionalQuery = existingAdditionalQuery.eq(
        "metadata->>variation_id",
        scopedVariationId,
      );
    } else {
      // Symmetric: a quote adjustment must not be blocked by a variation's row
      // either. Only earlier quote adjustments count against this one.
      existingAdditionalQuery = existingAdditionalQuery.is("metadata->>variation_id", null);
    }

    const { data: existingAdditional } = await existingAdditionalQuery.maybeSingle();

    if (existingAdditional?.status === "completed") {
      return errorJson("Additional payment has already been completed", 409);
    }

    // Delete stale pending additional payment
    if (existingAdditional?.status === "pending") {
      await supabase
        .from("payments")
        .delete()
        .eq("id", existingAdditional.id);
    }

    // -----------------------------------------------------------------------
    // 4. Create payment record for the additional amount
    // -----------------------------------------------------------------------
    const diffCents = pendingIncrease.diff_cents;
    const processingFee = pendingIncrease.additional_processing_fee;
    const platformFee = pendingIncrease.additional_platform_fee;
    // GST on the delta — may be absent on legacy pending_increase records (pre-GST-fix), default to 0
    const additionalGst = typeof pendingIncrease.additional_gst === "number"
      ? pendingIncrease.additional_gst
      : 0;
    // Set by approve-variation when this increase came from a job variation
    // rather than a quote adjustment. Forwarded to Stripe so stripe-webhook can
    // approve the variation and raise the budget once the money lands. Absent
    // on quote adjustments, which take the accepted-quote path instead.
    const variationId = typeof pendingIncrease.variation_id === "string"
      ? pendingIncrease.variation_id
      : null;

    // application_fee_amount is what the platform retains from the destination charge.
    const applicationFeeAmount = (typeof platformFee === "number" ? platformFee : 0) +
      (typeof processingFee === "number" ? processingFee : 0);

    if (
      typeof diffCents !== "number" || diffCents <= 0 ||
      typeof processingFee !== "number" || processingFee < 0 ||
      typeof platformFee !== "number" || platformFee < 0
    ) {
      console.error("Malformed pending_increase metadata:", pendingIncrease);
      return errorJson(
        "Price increase data is invalid. Please ask the tradie to re-submit the final price.",
        400
      );
    }

    const { data: additionalPayment, error: insertError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        payment_type: "price_adjustment",
        job_id: payment.job_id,
        amount: diffCents,
        processing_fee: processingFee,
        currency: "aud",
        status: "pending",
        parent_payment_id: paymentId,
        metadata: {
          type: "price_increase",
          flow: "destination",
          parent_payment_id: paymentId,
          tradie_id: job.tradie_id,
          tradie_stripe_account: tradieProfile.stripe_connect_account_id,
          platform_fee: platformFee,
          gst: additionalGst,
          tradie_tier: payment.metadata?.tradie_tier || "free",
          ...(variationId ? { variation_id: variationId } : {}),
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert additional payment:", insertError);
      return errorJson("Failed to create payment record", 500);
    }

    // -----------------------------------------------------------------------
    // 5. Create Stripe Checkout session
    // -----------------------------------------------------------------------
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Get client info for Stripe
    const { data: profile } = await supabase
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

    const jobDesc = (job.description || "").slice(0, 60);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            // A variation and a post-inspection quote adjustment both land
            // here, but the client only agreed to one of them. Labelling a
            // subfloor variation "after site inspection" on the Stripe page
            // describes something that never happened.
            name: variationId
              ? `Variation — ${jobDesc}`
              : `Price Adjustment — ${jobDesc}`,
            description: variationId
              ? "Approved change to the agreed scope. Secured with Stripe."
              : "Additional amount after site inspection. Secured with Stripe.",
          },
          unit_amount: diffCents,
        },
        quantity: 1,
      },
    ];

    if (additionalGst > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "GST (10%)", description: "Goods and Services Tax on the price adjustment." },
          unit_amount: additionalGst,
        },
        quantity: 1,
      });
    }

    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Secure Processing Fee (2%)" },
          unit_amount: processingFee,
        },
        quantity: 1,
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(
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
              payment_record_id: additionalPayment.id,
              flow: "destination",
              payment_type: "price_adjustment",
              job_id: payment.job_id,
              parent_payment_id: paymentId,
              tradie_id: job.tradie_id,
              ...(variationId ? { variation_id: variationId } : {}),
            },
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata: {
            user_id: user.id,
            payment_type: "price_adjustment",
            job_id: payment.job_id,
            payment_record_id: additionalPayment.id,
            parent_payment_id: paymentId,
            base_amount: String(diffCents),
            processing_fee: String(processingFee),
            platform_fee: String(platformFee),
            ...(variationId ? { variation_id: variationId } : {}),
          },
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );
    } catch (stripeErr) {
      // Clean up orphaned payment record since Stripe session failed
      console.error("Stripe session creation failed, cleaning up payment record:", stripeErr);
      await supabase.from("payments").delete().eq("id", additionalPayment.id);
      throw stripeErr;
    }

    // Update payment record with checkout session ID
    await supabase
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", additionalPayment.id);

    return new Response(
      JSON.stringify({ url: session.url, paymentId: additionalPayment.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error in pay-price-increase:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
};

if (import.meta.main) Deno.serve(handler);
