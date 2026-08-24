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

    const { allowed } = await checkRateLimit(`${user.id}-verify-payment`, 15, 60000);
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

    const { paymentId, checkoutSessionId, invoiceId, type } = body as {
      paymentId?: string;
      checkoutSessionId?: string;
      invoiceId?: string;
      type?: string;
    };

    // ── Recurring invoice verification ──────────────────────────────
    if (type === 'recurring_invoice' && checkoutSessionId && invoiceId) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

      // Verify the invoice belongs to this user. `total` funds the amount check
      // below; `stripe_payment_intent_id` is read so we never clobber a real one.
      const { data: invoice } = await supabase
        .from("recurring_invoices")
        .select("id, status, homeowner_id, stripe_checkout_session_id, stripe_payment_intent_id, total")
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

      // The session that proves payment MUST be the one we minted for THIS
      // invoice. This guard used to be conditional on a stored id existing
      // (`if (invoice.stripe_checkout_session_id && ...)`), so an invoice whose
      // stored id is NULL — the normal state for a BECS invoice, which never
      // creates a Checkout session at all — accepted ANY paid session the caller
      // passed, with no amount check. The invoice's own homeowner could buy
      // something cheap (a $4.99 estimate pack), hand that session id back here,
      // and clear an arbitrarily large invoice: the tradie sees "paid" and is
      // never transferred the money.
      //
      // Every legitimate Checkout path stores the session id on the invoice when
      // it creates the session, and the only in-app caller (PaymentHistory's
      // reconcileSentInvoices) reads that stored id straight off the row before
      // passing it back — so requiring it breaks no real flow.
      if (!invoice.stripe_checkout_session_id) {
        return new Response(
          JSON.stringify({
            paid: false,
            message:
              "There's no checkout session to verify for this invoice. If it's paid by direct debit, the confirmation arrives automatically.",
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (invoice.stripe_checkout_session_id !== checkoutSessionId) {
        return new Response(
          JSON.stringify({ paid: false, message: "Checkout session does not match this invoice" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retrieve the STORED session id, not the caller-supplied one. The equality
      // check above already makes them identical; reading from the invoice keeps
      // the trusted value the single source of truth for what gets inspected.
      const session = await stripe.checkout.sessions.retrieve(invoice.stripe_checkout_session_id);

      if (session.payment_status === 'paid') {
        // Defence in depth: confirm the session actually covers this invoice.
        // generate-recurring-invoice builds THREE independently-rounded line items
        // (subtotal, extras, supplies — the processing-fee line is an integer cent
        // passthrough, not a rounding), and the stored total is itself rounded, so
        // amount_total can legitimately sit up to 2 cents below expected. Tolerate
        // exactly that; reject a real shortfall. If a fourth genuinely-rounded line
        // item is ever added there, widen this tolerance to match.
        const expectedCents = Math.round(Number(invoice.total) * 100);
        const paidCents = session.amount_total ?? 0;
        const currency = (session.currency ?? "aud").toLowerCase();

        // Guard the comparison itself: `paidCents < NaN` is false, so a
        // non-numeric total would sail through. Fail closed instead.
        if (!Number.isFinite(expectedCents) || currency !== "aud" || paidCents < expectedCents - 2) {
          console.error(
            `verify-payment: session ${session.id} does not cover invoice ${invoiceId} — paid ${paidCents} ${currency} vs expected ${expectedCents} aud`,
          );
          return new Response(
            JSON.stringify({ paid: false, message: "That payment doesn't match this invoice's amount." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : null;

        // Never overwrite an existing PaymentIntent id. A BECS invoice already
        // carries the real off-session PI, and auto-release-recurring-payouts
        // resolves the charge — and keys its transfer idempotency — from it, so
        // replacing it with a Checkout session's PI would strand the payout.
        const { data: updated, error: updateError } = await supabase
          .from("recurring_invoices")
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            ...(invoice.stripe_payment_intent_id ? {} : { stripe_payment_intent_id: paymentIntentId }),
          })
          .eq("id", invoiceId)
          .in("status", ["sent", "processing", "overdue"])
          .select("id");

        if (updateError) {
          console.error("verify-payment: failed to mark recurring invoice paid", invoiceId, updateError);
          return errorJson("We couldn't update this invoice. Please try again in a moment.", 500);
        }

        // Report honestly. The status filter above legitimately matches zero rows
        // for a disputed or cancelled invoice, and the old code still answered
        // "verified and marked as paid" — telling the client a state change
        // happened when it did not.
        //
        // Zero rows is ambiguous though, so re-read before answering: the webhook
        // may simply have won the race and already flipped the invoice to 'paid'
        // between our read and this update. That is a success, not a conflict —
        // reporting it as one would be its own kind of lie.
        if (!updated || updated.length === 0) {
          const { data: recheck } = await supabase
            .from("recurring_invoices")
            .select("status")
            .eq("id", invoiceId)
            .maybeSingle();

          if (recheck?.status === "paid") {
            return new Response(
              JSON.stringify({ paid: true, message: "Invoice already paid" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              paid: false,
              message: `This invoice can't be marked paid while it is '${recheck?.status ?? invoice.status}'.`,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

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
      // processing_fee is READ below as the fallback when the Stripe session
      // carries no processing_fee metadata. It was missing from this select, so
      // that fallback was `undefined` — the key then dropped out of the PATCH
      // entirely, which happened to preserve the stored value but only by
      // accident. Select it so the fallback is the real one.
      .select("id, profile_id, job_id, status, stripe_checkout_session_id, stripe_payment_intent_id, processing_fee")
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
