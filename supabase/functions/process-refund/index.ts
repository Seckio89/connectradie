import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
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

    const { allowed } = checkRateLimit(`${user.id}-process-refund`, 5, 60000);
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

    const { paymentId, reason, idempotencyKey } = body as {
      paymentId?: string;
      reason?: string;
      idempotencyKey?: string;
    };

    if (!paymentId) {
      return errorJson("Missing required parameter: paymentId", 400);
    }

    // Look up the payment record
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, profile_id, job_id, amount, processing_fee, status, stripe_payment_intent_id, metadata"
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Payment not found", 404);
    }

    if (payment.status !== "completed") {
      return errorJson(
        "Only completed payments can be refunded",
        400
      );
    }

    if (!payment.stripe_payment_intent_id) {
      return errorJson(
        "Payment does not have a Stripe payment intent",
        400
      );
    }

    // Check if already refunded
    if (payment.status === "refunded") {
      return errorJson("Payment has already been refunded", 409);
    }

    // Verify user is the client on the associated job, or an admin
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Associated job not found", 404);
    }

    // Check if user is the client or an admin
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isClient = job.client_id === user.id;
    const isAdmin = userProfile?.role === "admin";

    if (!isClient && !isAdmin) {
      return errorJson(
        "Only the client on this job or an admin can process refunds",
        403
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Determine payment flow: destination charges (new) vs custodial escrow (legacy)
    const isDestinationCharge = payment.metadata?.flow === "destination";

    // Create refund for the full amount (base + processing fee)
    const refundAmount = payment.amount + (payment.processing_fee || 0);

    // ── DESTINATION CHARGE REFUND ──────────────────────────────────────
    // For destination charges, the funds were split at payment time between
    // the connected account (tradie) and the platform (application fee).
    // We add reverse_transfer and refund_application_fee so Stripe
    // automatically reverses both sides of the split.
    //
    // ── LEGACY CUSTODIAL REFUND ────────────────────────────────────────
    // For legacy payments, funds sit in the platform's Stripe balance.
    // A simple refund from the PaymentIntent is sufficient.
    const refund = await stripe.refunds.create(
      {
        payment_intent: payment.stripe_payment_intent_id,
        amount: refundAmount,
        reason: "requested_by_customer",
        ...(isDestinationCharge
          ? { reverse_transfer: true, refund_application_fee: true }
          : {}),
        metadata: {
          payment_id: paymentId,
          job_id: payment.job_id,
          refunded_by: user.id,
          custom_reason: reason || "No reason provided",
          flow: isDestinationCharge ? "destination" : "custodial",
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Update payment status to refunded
    const existingMetadata = payment.metadata || {};
    await supabase
      .from("payments")
      .update({
        status: "refunded",
        metadata: {
          ...existingMetadata,
          refund_id: refund.id,
          refund_amount: refundAmount,
          refund_reason: reason || null,
          refunded_at: new Date().toISOString(),
          refunded_by: user.id,
          ...(isDestinationCharge
            ? { reverse_transfer: true, refund_application_fee: true, flow: "destination" }
            : {}),
        },
      })
      .eq("id", paymentId);

    return new Response(
      JSON.stringify({
        success: true,
        refundId: refund.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error processing refund:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
