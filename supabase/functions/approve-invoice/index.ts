import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { calculateBecsProcessingFeeCents, calculateProcessingFeeCents, calculatePlatformFee, resolveTradieTier } from "../_shared/pricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, authorization",
};

function errorJson(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonOk(data: unknown) {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
    }

    // Auth
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const { data: { user }, error: authErr } = await createClient(
      supabaseUrl, anonKey,
      { global: { headers: { Authorization: authHeader } } },
    ).auth.getUser();

    if (authErr || !user) {
      return errorJson(`Auth failed: ${authErr?.message || "no user"}`, 401);
    }

    const body = await req.json();
    const { invoiceId, action, disputeReason, forceCheckout } = body;

    if (!invoiceId) return errorJson("Missing invoiceId", 400);
    if (!action || !["approve", "decline"].includes(action)) {
      return errorJson("Invalid action", 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch invoice
    const { data: invoice, error: invErr } = await supabase
      .from("recurring_invoices")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr) return errorJson(`Invoice query error: ${invErr.message}`, 500);
    if (!invoice) return errorJson("Invoice not found", 404);
    if (invoice.homeowner_id !== user.id) return errorJson("Not your invoice", 403);
    if (invoice.status !== "pending_approval") {
      return errorJson(`Invoice status is '${invoice.status}', expected 'pending_approval'`, 400);
    }

    // Get the recurring job for trade info
    const { data: recurringJob } = await supabase
      .from("recurring_jobs")
      .select("tradie_id, trade_category")
      .eq("id", invoice.recurring_job_id)
      .maybeSingle();

    const tradeLabel = (recurringJob?.trade_category || "service").replace(/_/g, " ");
    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
    const siteUrl = allowedOrigin && allowedOrigin !== "*"
      ? allowedOrigin
      : req.headers.get("origin") || "https://connectradie.com.au";
    const now = new Date().toISOString();

    // ─── DECLINE ───
    if (action === "decline") {
      if (!disputeReason) return errorJson("Missing disputeReason", 400);

      await supabase.from("recurring_invoices").update({
        status: "disputed",
        dispute_reason: disputeReason,
        disputed_at: now,
        disputed_by: user.id,
        updated_at: now,
      }).eq("id", invoiceId);

      if (recurringJob?.tradie_id) {
        await supabase.from("notifications").insert({
          user_id: recurringJob.tradie_id,
          type: "invoice_disputed",
          title: "Invoice Disputed",
          message: `Your client disputed the ${tradeLabel} invoice for $${Number(invoice.total).toFixed(2)}. Reason: ${disputeReason}`,
          metadata: { invoice_id: invoiceId },
          read: false,
        });
      }

      return jsonOk({ status: "disputed" });
    }

    // ─── APPROVE ───
    if (!stripeSecretKey) return errorJson("Stripe not configured", 500);

    // Look up tradie tier for fee calculations
    const { data: tradieDetails } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", recurringJob?.tradie_id)
      .maybeSingle();

    const tier = resolveTradieTier(tradieDetails?.subscription_tier);

    // Resolve the tradie's Connect account — both BECS and card payments route funds
    // directly to it (destination charge). If onboarding isn't complete, neither path
    // can pay, so fail early with a clear, client-facing message.
    const { data: tradieConnect } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", recurringJob?.tradie_id)
      .maybeSingle();

    const destinationAccount = tradieConnect?.stripe_connect_onboarding_complete
      ? tradieConnect.stripe_connect_account_id
      : null;

    if (!destinationAccount) {
      return errorJson(
        "This tradie hasn't finished setting up payments yet, so this invoice can't be paid. Please ask them to complete their payment setup.",
        409,
      );
    }

    // Try BECS if available and not forced to checkout
    if (!forceCheckout) {
      const { data: savedMethod } = await supabase
        .from("saved_payment_methods")
        .select("stripe_customer_id, stripe_payment_method_id, stripe_mandate_id, mandate_status")
        .eq("recurring_job_id", invoice.recurring_job_id)
        .eq("mandate_status", "active")
        .maybeSingle();

      if (savedMethod?.stripe_payment_method_id) {
        try {
          const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
          const totalCents = Math.round(Number(invoice.total) * 100);
          const processingFeeCents = calculateBecsProcessingFeeCents(totalCents);
          const platformFeeCents = Math.round(calculatePlatformFee(Number(invoice.total), tier) * 100);
          const chargeAmount = totalCents + processingFeeCents;

          const pi = await stripe.paymentIntents.create({
            amount: chargeAmount,
            currency: "aud",
            customer: savedMethod.stripe_customer_id,
            payment_method: savedMethod.stripe_payment_method_id,
            payment_method_types: ["au_becs_debit"],
            mandate: savedMethod.stripe_mandate_id || undefined,
            off_session: true,
            confirm: true,
            application_fee_amount: platformFeeCents + processingFeeCents,
            transfer_data: { destination: destinationAccount },
            // No on_behalf_of — au_becs_debit needs that capability on the destination
            // account; transfer_data alone still routes funds to the tradie in one step.
            metadata: {
              type: "recurring_invoice_becs",
              routing: "destination",
              invoice_id: invoiceId,
              recurring_job_id: invoice.recurring_job_id,
              homeowner_id: user.id,
              tradie_id: recurringJob?.tradie_id || "",
              platform_fee: String(platformFeeCents),
              processing_fee: String(processingFeeCents),
              tradie_tier: tier,
            },
          });

          await supabase.from("recurring_invoices").update({
            status: "processing",
            approved_at: now,
            approved_by: user.id,
            payment_method: "au_becs_debit",
            becs_charge_status: "pending",
            stripe_payment_intent_id: pi.id,
            updated_at: now,
          }).eq("id", invoiceId);

          return jsonOk({ status: "approved", payment_method: "becs", payment_intent_id: pi.id });
        } catch (becsErr) {
          console.error("BECS failed, falling back to checkout:", becsErr);
        }
      }
    }

    // ─── Stripe Checkout ───
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });
    const totalCents = Math.round(Number(invoice.total) * 100);
    const processingFeeCents = calculateProcessingFeeCents(totalCents);
    const platformFeeCents = Math.round(calculatePlatformFee(Number(invoice.total), tier) * 100);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      price_data: {
        currency: "aud",
        product_data: {
          name: `${tradeLabel} — Invoice`,
          description: `${invoice.regular_sessions_count || 0} session(s)`,
        },
        unit_amount: totalCents,
      },
      quantity: 1,
    }];

    if (processingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Secure Processing Fee" },
          unit_amount: processingFeeCents,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      success_url: `${siteUrl}/payment-success`,
      cancel_url: `${siteUrl}/leads?tab=services`,
      payment_intent_data: {
        application_fee_amount: platformFeeCents + processingFeeCents,
        transfer_data: { destination: destinationAccount },
      },
      metadata: {
        type: "recurring_invoice",
        routing: "destination",
        invoice_id: invoiceId,
        recurring_job_id: invoice.recurring_job_id,
        homeowner_id: user.id,
        tradie_id: recurringJob?.tradie_id || "",
        platform_fee: String(platformFeeCents),
        processing_fee: String(processingFeeCents),
        tradie_tier: tier,
      },
    });

    await supabase.from("recurring_invoices").update({
      status: "sent",
      approved_at: now,
      approved_by: user.id,
      payment_method: "card",
      stripe_checkout_session_id: session.id,
      stripe_payment_url: session.url,
      updated_at: now,
    }).eq("id", invoiceId);

    return jsonOk({
      status: "approved",
      payment_method: "card",
      checkout_url: session.url,
    });
  } catch (err) {
    console.error("approve-invoice error:", err);
    return errorJson(err instanceof Error ? err.message : "Internal server error", 500);
  }
});
