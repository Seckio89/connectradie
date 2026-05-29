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

    if (!supabaseUrl || !supabaseServiceKey || !stripeSecretKey) {
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

    const { paymentId, checkoutSessionId, invoiceId, type } = body as {
      paymentId?: string;
      checkoutSessionId?: string;
      invoiceId?: string;
      type?: string;
    };

    // ── Recurring invoice verification ──────────────────────────────
    if (type === 'recurring_invoice' && checkoutSessionId && invoiceId) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Verify the invoice belongs to this user
      const { data: invoice } = await supabase
        .from("recurring_invoices")
        .select("id, status, homeowner_id, stripe_checkout_session_id")
        .eq("id", invoiceId)
        .maybeSingle();

      if (!invoice || invoice.homeowner_id !== user.id) {
        return errorJson("Invoice not found", 404);
      }

      if (invoice.status === 'paid') {
        return new Response(
          JSON.stringify({ paid: true, message: "Invoice already paid" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check Stripe checkout session
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

      // Verify this checkout session actually belongs to this invoice
      if (invoice.stripe_checkout_session_id && invoice.stripe_checkout_session_id !== checkoutSessionId) {
        return new Response(
          JSON.stringify({ paid: false, message: "Checkout session does not match this invoice" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (session.payment_status === 'paid') {
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : null;

        await supabase
          .from("recurring_invoices")
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq("id", invoiceId)
          .in("status", ["sent", "processing", "overdue"]);

        console.info(`Recurring invoice ${invoiceId} verified as paid (fallback)`);

        return new Response(
          JSON.stringify({ paid: true, message: "Invoice verified and marked as paid" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ paid: false, message: `Checkout session status: ${session.payment_status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Standard payment verification ───────────────────────────────
    if (!paymentId) {
      return errorJson("Missing paymentId", 400);
    }

    // Look up the payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, profile_id, job_id, status, stripe_checkout_session_id, stripe_payment_intent_id")
      .eq("id", paymentId)
      .maybeSingle();

    if (paymentError || !payment) {
      return errorJson("Payment not found", 404);
    }

    // Only the client can verify their own payment
    if (payment.profile_id !== user.id) {
      return errorJson("Not authorized", 403);
    }

    // Already completed — ensure job is also funded (catches cases where
    // a previous verify-payment completed the payment but didn't update the job)
    if (payment.status === "completed") {
      if (payment.job_id) {
        const { error: jobFixError } = await supabase
          .from("jobs")
          .update({ status: "funded" })
          .eq("id", payment.job_id)
          .in("status", ["pending", "accepted"]);

        if (!jobFixError) {
          console.info(`Job ${payment.job_id} status fixed to funded (payment already completed)`);
        }
      }
      return new Response(
        JSON.stringify({ status: "completed", message: "Payment already confirmed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No checkout session — can't verify
    if (!payment.stripe_checkout_session_id) {
      return new Response(
        JSON.stringify({ status: payment.status, message: "No Stripe session to verify" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(
      payment.stripe_checkout_session_id,
      { expand: ["payment_intent"] }
    );

    console.info(`Verify payment ${paymentId}: session status=${session.status}, payment_status=${session.payment_status}`);

    if (session.payment_status === "paid" && payment.status === "pending") {
      // Payment was successful but webhook missed it — update the record
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent)?.id || null;

      const processingFee = session.metadata?.processing_fee
        ? parseInt(session.metadata.processing_fee, 10)
        : payment.processing_fee;

      const { error: updateError } = await supabase
        .from("payments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntentId,
          processing_fee: processingFee,
        })
        .eq("id", paymentId);

      if (updateError) {
        console.error("Failed to update payment:", updateError);
        return errorJson("Failed to update payment record", 500);
      }

      // Also update the job status to 'funded' (mirrors stripe-webhook behavior)
      if (session.metadata?.job_id) {
        const { error: jobUpdateError } = await supabase
          .from("jobs")
          .update({ status: "funded" })
          .eq("id", session.metadata.job_id)
          .in("status", ["pending", "accepted"]);

        if (jobUpdateError) {
          console.error("Failed to update job status to funded:", jobUpdateError);
        } else {
          console.info(`Job ${session.metadata.job_id} status updated to funded (webhook fallback)`);
        }
      }

      console.info(`Payment ${paymentId} verified and marked as completed (webhook fallback)`);

      return new Response(
        JSON.stringify({
          status: "completed",
          message: "Payment verified and confirmed",
          verified_via: "fallback",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Session exists but not paid
    return new Response(
      JSON.stringify({
        status: payment.status,
        stripe_status: session.payment_status,
        message: session.payment_status === "unpaid"
          ? "Payment has not been completed yet"
          : `Stripe session status: ${session.payment_status}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error verifying payment:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
