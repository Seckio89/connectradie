import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

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

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
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

    const { paymentId, newTotal, reason } = body as {
      paymentId?: string;
      newTotal?: number;
      reason?: string;
    };

    if (!paymentId) {
      return errorJson("Missing required parameter: paymentId", 400);
    }
    if (newTotal == null || typeof newTotal !== "number" || newTotal < 1) {
      return errorJson("newTotal must be a number of at least $1", 400);
    }

    // -----------------------------------------------------------------------
    // 1. Fetch payment
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

    if (payment.profile_id !== user.id) {
      return errorJson("Only the client on this payment can request a reduction", 403);
    }

    if (payment.status !== "completed") {
      return errorJson("Payment must be completed to request a reduction", 400);
    }

    if (!payment.stripe_payment_intent_id) {
      return errorJson("Payment has no Stripe reference — reduction cannot be processed automatically", 400);
    }

    const existingMetadata = (payment.metadata || {}) as Record<string, unknown>;

    // Funds already released to tradie — can't reduce through escrow
    if (existingMetadata.released_at) {
      return errorJson(
        "These funds have already been released to the tradie. A reduction must be arranged directly with the tradie or through support.",
        400
      );
    }

    if (existingMetadata.pending_reduction) {
      return errorJson("A reduction request is already pending for this payment", 409);
    }

    if (existingMetadata.pending_increase) {
      return errorJson(
        "A price increase is currently pending on this payment. Resolve that first before requesting a reduction.",
        409
      );
    }

    // -----------------------------------------------------------------------
    // 2. Validate new total
    // -----------------------------------------------------------------------
    const originalAmountCents = payment.amount;
    const newTotalCents = Math.round(newTotal * 100);

    if (newTotalCents >= originalAmountCents) {
      return errorJson(
        "New total must be less than the current amount paid",
        400
      );
    }

    const diffCents = originalAmountCents - newTotalCents;

    // -----------------------------------------------------------------------
    // 3. Fetch job for context + notification target
    // -----------------------------------------------------------------------
    const { data: job } = await supabase
      .from("jobs")
      .select("id, tradie_id, title, description")
      .eq("id", payment.job_id)
      .maybeSingle();

    if (!job) {
      return errorJson("Job not found", 404);
    }

    const targetTradieId = job.tradie_id || payment.tradie_id;
    if (!targetTradieId) {
      return errorJson("No tradie assigned to this job", 400);
    }

    const jobTitle =
      job.title ||
      job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") ||
      "a job";

    // -----------------------------------------------------------------------
    // 4. Store pending_reduction on payment metadata
    // -----------------------------------------------------------------------
    const sanitisedReason =
      typeof reason === "string" ? reason.slice(0, 500).trim() : "";

    const { error: updateError } = await supabase
      .from("payments")
      .update({
        metadata: {
          ...existingMetadata,
          pending_reduction: {
            proposed_amount_cents: newTotalCents,
            original_amount_cents: originalAmountCents,
            diff_cents: diffCents,
            reason: sanitisedReason || null,
            requested_at: new Date().toISOString(),
            requested_by: user.id,
          },
        },
      })
      .eq("id", paymentId);

    if (updateError) {
      console.error("Failed to store pending_reduction:", updateError);
      return errorJson("Failed to save reduction request. Please try again.", 500);
    }

    // -----------------------------------------------------------------------
    // 5. Notify tradie
    // -----------------------------------------------------------------------
    try {
      await supabase.from("notifications").insert({
        user_id: targetTradieId,
        type: "price_reduction_requested",
        title: "Client Requested Price Reduction",
        message: `The client on ${jobTitle} has asked to reduce the amount paid from $${(originalAmountCents / 100).toFixed(2)} to $${(newTotalCents / 100).toFixed(2)}${sanitisedReason ? ` — "${sanitisedReason}"` : ""}. Approve or decline in the job details.`,
        job_id: payment.job_id,
        metadata: {
          payment_id: paymentId,
          original_amount: originalAmountCents / 100,
          proposed_amount: newTotalCents / 100,
          refund_amount: diffCents / 100,
        },
        read: false,
      });
    } catch {
      // Non-critical
    }

    return okJson({
      success: true,
      proposedAmount: newTotalCents / 100,
      refundAmount: diffCents / 100,
    });
  } catch (err) {
    console.error("Error in client-request-reduction:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
