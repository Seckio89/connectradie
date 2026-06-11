import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateGstCents } from "../_shared/pricing.ts";

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

function okJson(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
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

    const { paymentId, approve } = body as {
      paymentId?: string;
      approve?: boolean;
    };

    if (!paymentId) {
      return errorJson("Missing required parameter: paymentId", 400);
    }
    if (typeof approve !== "boolean") {
      return errorJson("Missing required parameter: approve (boolean)", 400);
    }

    // -----------------------------------------------------------------------
    // 1. Fetch payment with pending_reduction
    // -----------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, profile_id, tradie_id, job_id, amount, processing_fee, status, stripe_payment_intent_id, metadata"
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Payment not found", 404);
    }

    const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;
    const pendingReduction = existingMetadata.pending_reduction as
      | {
          proposed_amount_cents?: number;
          original_amount_cents?: number;
          diff_cents?: number;
          reason?: string | null;
        }
      | undefined;

    if (!pendingReduction) {
      return errorJson("No pending reduction found for this payment", 400);
    }

    if (existingMetadata.released_at) {
      return errorJson(
        "Funds have already been released — reduction is no longer possible through escrow",
        400
      );
    }

    // -----------------------------------------------------------------------
    // 2. Verify tradie is on the job
    // -----------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, tradie_id, client_id, title, description")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    const tradieIdOnJob = job.tradie_id || payment.tradie_id;
    if (tradieIdOnJob !== user.id) {
      return errorJson("Only the tradie on this job can respond to a reduction request", 403);
    }

    const jobTitle =
      job.title ||
      job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") ||
      "a job";

    // -----------------------------------------------------------------------
    // 3. REJECT → clear pending_reduction + notify client
    // -----------------------------------------------------------------------
    if (!approve) {
      const cleanedMetadata = { ...existingMetadata };
      delete cleanedMetadata.pending_reduction;

      const { error: clearError } = await supabase
        .from("payments")
        .update({ metadata: cleanedMetadata })
        .eq("id", paymentId);

      if (clearError) {
        console.error("Failed to clear pending_reduction on reject:", clearError);
        return errorJson("Failed to save response. Please try again.", 500);
      }

      try {
        await supabase.from("notifications").insert({
          user_id: job.client_id,
          type: "price_reduction_declined",
          title: "Reduction Request Declined",
          message: `The tradie has declined your request to reduce the amount paid on ${jobTitle}. Contact them directly if you'd like to discuss further.`,
          job_id: payment.job_id,
          metadata: { payment_id: paymentId },
          read: false,
        });
      } catch {
        // Non-critical
      }

      return okJson({ action: "declined" });
    }

    // -----------------------------------------------------------------------
    // 4. APPROVE → issue partial Stripe refund (mirrors adjust-quote-price decrease branch)
    // -----------------------------------------------------------------------
    if (!payment.stripe_payment_intent_id) {
      return errorJson("Payment has no Stripe reference — cannot issue refund", 400);
    }

    const originalAmountCents = payment.amount;
    const proposedAmountCents = pendingReduction.proposed_amount_cents;
    if (typeof proposedAmountCents !== "number" || proposedAmountCents <= 0) {
      return errorJson("Pending reduction data is malformed", 400);
    }

    // Re-validate that nothing has shifted since the client filed the request
    if (proposedAmountCents >= originalAmountCents) {
      // Stale request — current amount already matches / is lower than proposed. Just clear.
      const cleanedMetadata = { ...existingMetadata };
      delete cleanedMetadata.pending_reduction;
      await supabase
        .from("payments")
        .update({ metadata: cleanedMetadata })
        .eq("id", paymentId);
      return errorJson(
        "The payment amount has already changed — no refund needed. The request has been cleared.",
        409
      );
    }

    const diffCents = originalAmountCents - proposedAmountCents;
    const refundRatio = diffCents / originalAmountCents;

    const originalProcessingFee = payment.processing_fee || 0;
    const processingFeeRefund = Math.round(originalProcessingFee * refundRatio);

    // GST refund on the base delta if tradie is GST-registered
    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("is_gst_registered")
      .eq("id", user.id)
      .maybeSingle();
    const tradieIsGstRegistered = tradieProfile?.is_gst_registered === true;
    const gstRefundCents = tradieIsGstRegistered ? calculateGstCents(diffCents) : 0;

    // Proportional platform fee reduction
    const originalPlatformFee =
      typeof existingMetadata.platform_fee === "number"
        ? existingMetadata.platform_fee
        : 0;
    const platformFeeReduction = Math.round(originalPlatformFee * refundRatio);
    const newPlatformFee = originalPlatformFee - platformFeeReduction;

    const totalRefundCents = diffCents + gstRefundCents + processingFeeRefund;

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const refund = await stripe.refunds.create({
      payment_intent: payment.stripe_payment_intent_id,
      amount: totalRefundCents,
      reason: "requested_by_customer",
      metadata: {
        type: "client_requested_reduction",
        payment_id: paymentId,
        job_id: payment.job_id,
        original_amount: String(originalAmountCents),
        final_amount: String(proposedAmountCents),
        approved_by: user.id,
      },
    });

    // Update payment — clear pending_reduction, set new amount, record adjustment history
    const cleanedMetadata = { ...existingMetadata };
    delete cleanedMetadata.pending_reduction;

    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        original_amount: originalAmountCents,
        amount: proposedAmountCents,
        processing_fee: originalProcessingFee - processingFeeRefund,
        metadata: {
          ...cleanedMetadata,
          platform_fee: newPlatformFee,
          adjustment: {
            type: "client_requested_reduction",
            refund_id: refund.id,
            original_amount: originalAmountCents,
            final_amount: proposedAmountCents,
            refund_amount: totalRefundCents,
            gst_refunded: gstRefundCents,
            processing_fee_refunded: processingFeeRefund,
            platform_fee_reduced_by: platformFeeReduction,
            adjusted_at: new Date().toISOString(),
            adjusted_by: user.id,
            reason: pendingReduction.reason || null,
          },
        },
      })
      .eq("id", paymentId);

    if (paymentUpdateError) {
      console.error(
        "CRITICAL: Stripe refund succeeded but payment update failed. Refund ID:",
        refund.id,
        "Payment:",
        paymentId,
        paymentUpdateError
      );
    }

    // Update job budget so UI reflects the new agreed amount
    const { error: jobUpdateError } = await supabase
      .from("jobs")
      .update({ budget_amount: proposedAmountCents / 100 })
      .eq("id", payment.job_id);

    if (jobUpdateError) {
      console.error(
        "Non-critical: Stripe refund succeeded but job budget update failed. Refund ID:",
        refund.id,
        "Job:",
        payment.job_id,
        jobUpdateError
      );
    }

    // Notify client
    try {
      await supabase.from("notifications").insert({
        user_id: job.client_id,
        type: "price_reduction_approved",
        title: "Reduction Approved — Refund Processing",
        message: `Your request to reduce the amount on ${jobTitle} to $${(proposedAmountCents / 100).toFixed(2)} has been approved. A refund of $${(totalRefundCents / 100).toFixed(2)} is being processed to your card.`,
        job_id: payment.job_id,
        metadata: {
          payment_id: paymentId,
          refund_amount: totalRefundCents / 100,
          new_total: proposedAmountCents / 100,
        },
        read: false,
      });
    } catch {
      // Non-critical
    }

    return okJson({
      action: "approved",
      refundId: refund.id,
      refundAmount: totalRefundCents / 100,
      newTotal: proposedAmountCents / 100,
    });
  } catch (err) {
    console.error("Error in approve-price-reduction:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
