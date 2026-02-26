import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    const { paymentId } = body as { paymentId?: string };

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

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Create a transfer to the tradie's Connect account
    // Transfer the base payment amount (excluding processing fee)
    const transfer = await stripe.transfers.create({
      amount: payment.amount,
      currency: "aud",
      destination: tradieProfile.stripe_connect_account_id,
      transfer_group: `job_${payment.job_id}`,
      metadata: {
        payment_id: paymentId,
        job_id: payment.job_id,
        client_id: user.id,
        tradie_id: job.tradie_id,
      },
    });

    // Update payment metadata with transfer info
    await supabase
      .from("payments")
      .update({
        metadata: {
          ...existingMetadata,
          transfer_id: transfer.id,
          transfer_amount: transfer.amount,
          released_at: new Date().toISOString(),
          released_by: user.id,
        },
      })
      .eq("id", paymentId);

    return new Response(
      JSON.stringify({
        success: true,
        transferId: transfer.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error releasing escrow:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
