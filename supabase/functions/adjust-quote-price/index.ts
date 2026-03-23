import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import {
  calculateProcessingFeeCents,
  calculatePlatformFee,
  resolveTradieTier,
} from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
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

    const { quoteId, finalPrice } = body as {
      quoteId?: string;
      finalPrice?: number;
    };

    if (!quoteId) {
      return errorJson("Missing required parameter: quoteId", 400);
    }
    if (finalPrice == null || typeof finalPrice !== "number" || finalPrice < 1) {
      return errorJson("finalPrice must be a number of at least $1", 400);
    }

    // -----------------------------------------------------------------------
    // 1. Fetch quote — must be accepted and require site inspection
    // -----------------------------------------------------------------------
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        "id, job_id, tradie_id, firm_price, price_min, price_max, status, requires_site_inspection, final_price"
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) {
      return errorJson("Quote not found", 404);
    }

    if (quote.tradie_id !== user.id) {
      return errorJson("Only the tradie who submitted this quote can set a final price", 403);
    }

    if (quote.status !== "accepted") {
      return errorJson("Quote must be in 'accepted' status", 400);
    }

    if (!quote.requires_site_inspection) {
      return errorJson("Final price adjustment is only available for quotes that require a site inspection", 400);
    }

    if (quote.final_price != null) {
      return errorJson("A final price has already been set for this quote", 409);
    }

    // -----------------------------------------------------------------------
    // 2. Fetch job — must be funded or in_progress
    // -----------------------------------------------------------------------
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, title, description, status")
      .eq("id", quote.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.status !== "funded" && job.status !== "in_progress") {
      return errorJson(
        "Final price can only be set when the job is funded or in progress",
        400
      );
    }

    // -----------------------------------------------------------------------
    // 3. Fetch completed payment for this job
    // -----------------------------------------------------------------------
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select(
        "id, amount, processing_fee, status, stripe_payment_intent_id, metadata"
      )
      .eq("job_id", quote.job_id)
      .eq("payment_type", "job_funding")
      .eq("status", "completed")
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("No completed payment found for this job", 404);
    }

    if (!payment.stripe_payment_intent_id) {
      return errorJson("Payment does not have a Stripe payment intent", 400);
    }

    const originalAmountCents = payment.amount;
    const originalPriceDollars = originalAmountCents / 100;
    const finalPriceCents = Math.round(finalPrice * 100);

    const jobTitle =
      job.title ||
      job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") ||
      "a job";

    // -----------------------------------------------------------------------
    // CASE C — No change
    // -----------------------------------------------------------------------
    if (finalPriceCents === originalAmountCents) {
      const { error: noChangeError } = await supabase
        .from("quotes")
        .update({ final_price: finalPrice })
        .eq("id", quoteId);

      if (noChangeError) {
        console.error("Failed to update quote final_price (no-change):", noChangeError);
        return errorJson("Failed to save final price. Please try again.", 500);
      }

      return okJson({ action: "no_change", finalPrice });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const existingMetadata = payment.metadata || {};

    // -----------------------------------------------------------------------
    // CASE A — Price DECREASE → partial refund
    // -----------------------------------------------------------------------
    if (finalPriceCents < originalAmountCents) {
      const diffCents = originalAmountCents - finalPriceCents;
      const refundRatio = diffCents / originalAmountCents;

      // Proportional processing fee refund
      const originalProcessingFee = payment.processing_fee || 0;
      const processingFeeRefund = Math.round(
        originalProcessingFee * refundRatio
      );

      // Proportional platform fee reduction
      const originalPlatformFee =
        typeof existingMetadata.platform_fee === "number"
          ? existingMetadata.platform_fee
          : 0;
      const platformFeeReduction = Math.round(
        originalPlatformFee * refundRatio
      );
      const newPlatformFee = originalPlatformFee - platformFeeReduction;

      // Total refund = base difference + proportional processing fee
      const totalRefundCents = diffCents + processingFeeRefund;

      // Issue partial Stripe refund
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: totalRefundCents,
        reason: "requested_by_customer",
        metadata: {
          type: "price_adjustment",
          quote_id: quoteId,
          job_id: quote.job_id,
          original_amount: String(originalAmountCents),
          final_amount: String(finalPriceCents),
          adjusted_by: user.id,
        },
      });

      // Update quote with final price
      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update({ final_price: finalPrice })
        .eq("id", quoteId);

      if (quoteUpdateError) {
        console.error("CRITICAL: Stripe refund succeeded but quote update failed. Refund ID:", refund.id, "Quote:", quoteId, quoteUpdateError);
      }

      // Update payment record
      const { error: paymentUpdateError } = await supabase
        .from("payments")
        .update({
          original_amount: originalAmountCents,
          amount: finalPriceCents,
          processing_fee: originalProcessingFee - processingFeeRefund,
          metadata: {
            ...existingMetadata,
            platform_fee: newPlatformFee,
            adjustment: {
              type: "decrease",
              refund_id: refund.id,
              original_amount: originalAmountCents,
              final_amount: finalPriceCents,
              refund_amount: totalRefundCents,
              processing_fee_refunded: processingFeeRefund,
              platform_fee_reduced_by: platformFeeReduction,
              adjusted_at: new Date().toISOString(),
              adjusted_by: user.id,
            },
          },
        })
        .eq("id", payment.id);

      if (paymentUpdateError) {
        console.error("CRITICAL: Stripe refund succeeded but payment update failed. Refund ID:", refund.id, "Payment:", payment.id, paymentUpdateError);
      }

      // Update job budget
      const { error: jobUpdateError } = await supabase
        .from("jobs")
        .update({ budget_amount: finalPrice })
        .eq("id", quote.job_id);

      if (jobUpdateError) {
        console.error("CRITICAL: Stripe refund succeeded but job budget update failed. Refund ID:", refund.id, "Job:", quote.job_id, jobUpdateError);
      }

      // If any DB update failed, still return success (refund is done) but flag the issue
      const dbErrors = [quoteUpdateError, paymentUpdateError, jobUpdateError].filter(Boolean);
      if (dbErrors.length > 0) {
        return okJson({
          action: "decrease",
          finalPrice,
          refundAmount: totalRefundCents / 100,
          refundId: refund.id,
          warning: "Refund processed but some records may need manual reconciliation. Contact support if amounts appear incorrect.",
        });
      }

      // Notify client
      try {
        await supabase.from("notifications").insert({
          user_id: job.client_id,
          type: "price_adjusted",
          title: "Price Adjusted",
          message: `The final price for ${jobTitle} has been adjusted from $${originalPriceDollars.toFixed(2)} to $${finalPrice.toFixed(2)}. A refund of $${(totalRefundCents / 100).toFixed(2)} is being processed to your card.`,
          job_id: quote.job_id,
          metadata: {
            original_price: originalPriceDollars,
            final_price: finalPrice,
            refund_amount: totalRefundCents / 100,
          },
          read: false,
        });
      } catch {
        // Non-critical
      }

      // Notify tradie
      try {
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "price_adjusted",
          title: "Final Price Confirmed",
          message: `Final price of $${finalPrice.toFixed(2)} confirmed for ${jobTitle}.`,
          job_id: quote.job_id,
          metadata: { final_price: finalPrice },
          read: false,
        });
      } catch {
        // Non-critical
      }

      return okJson({
        action: "decrease",
        finalPrice,
        refundAmount: totalRefundCents / 100,
        refundId: refund.id,
      });
    }

    // -----------------------------------------------------------------------
    // CASE B — Price INCREASE → request additional payment from client
    // -----------------------------------------------------------------------
    const diffCents = finalPriceCents - originalAmountCents;
    const additionalProcessingFee = calculateProcessingFeeCents(diffCents);

    // Calculate additional platform fee for the difference
    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", quote.tradie_id)
      .maybeSingle();

    const tradieTier = resolveTradieTier(tradieSubRecord?.subscription_tier);
    const additionalPlatformFeeDollars = calculatePlatformFee(
      diffCents / 100,
      tradieTier
    );
    const additionalPlatformFeeCents = Math.round(
      additionalPlatformFeeDollars * 100
    );

    // Update quote with final price
    const { error: quoteUpdateError } = await supabase
      .from("quotes")
      .update({ final_price: finalPrice })
      .eq("id", quoteId);

    if (quoteUpdateError) {
      console.error("Failed to update quote final_price:", quoteUpdateError);
      return errorJson("Failed to save final price. Please try again.", 500);
    }

    // Store pending increase in payment metadata
    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        metadata: {
          ...existingMetadata,
          pending_increase: {
            diff_cents: diffCents,
            additional_processing_fee: additionalProcessingFee,
            additional_platform_fee: additionalPlatformFeeCents,
            requested_at: new Date().toISOString(),
            requested_by: user.id,
          },
        },
      })
      .eq("id", payment.id);

    if (paymentUpdateError) {
      console.error("Failed to store pending_increase in payment metadata:", paymentUpdateError);
      // Roll back the quote update
      await supabase.from("quotes").update({ final_price: null }).eq("id", quoteId);
      return errorJson("Failed to save price increase details. Please try again.", 500);
    }

    // Notify client
    try {
      await supabase.from("notifications").insert({
        user_id: job.client_id,
        type: "price_increase_requested",
        title: "Price Adjustment — Additional Payment Required",
        message: `The final price for ${jobTitle} has been adjusted from $${originalPriceDollars.toFixed(2)} to $${finalPrice.toFixed(2)}. An additional payment of $${(diffCents / 100).toFixed(2)} is required.`,
        job_id: quote.job_id,
        metadata: {
          original_price: originalPriceDollars,
          final_price: finalPrice,
          additional_amount: diffCents / 100,
        },
        read: false,
      });
    } catch {
      // Non-critical
    }

    // Notify tradie
    try {
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "price_adjusted",
        title: "Price Increase Requested",
        message: `Price increase request of $${(diffCents / 100).toFixed(2)} sent to client for ${jobTitle}.`,
        job_id: quote.job_id,
        metadata: { final_price: finalPrice },
        read: false,
      });
    } catch {
      // Non-critical
    }

    return okJson({
      action: "increase_pending",
      finalPrice,
      additionalAmount: diffCents / 100,
    });
  } catch (err) {
    console.error("Error in adjust-quote-price:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
