import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";
import { calculateBecsProcessingFeeCents, calculatePlatformFee, resolveTradieTier } from "../_shared/pricing.ts";

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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
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

    // Caller has already passed Supabase JWT verification (verify_jwt=true).
    // Accept any valid JWT bearer — do NOT byte-compare against the env var, which
    // drifts from the key the caller actually holds after a key rotation and was
    // silently 401'ing every internal call (cron auto-charge, generate-recurring-invoice).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const { invoiceId, recurringJobId } = await req.json();
    if (!invoiceId || !recurringJobId) {
      return errorJson("Missing invoiceId or recurringJobId", 400);
    }

    // Look up saved payment method
    const { data: saved, error: savedErr } = await supabase
      .from("saved_payment_methods")
      .select("stripe_customer_id, stripe_payment_method_id, stripe_mandate_id")
      .eq("recurring_job_id", recurringJobId)
      .eq("mandate_status", "active")
      .maybeSingle();

    if (savedErr || !saved) {
      return errorJson("No active BECS payment method found", 404);
    }

    // Look up invoice
    const { data: invoice, error: invErr } = await supabase
      .from("recurring_invoices")
      .select("id, total, homeowner_id, tradie_id, billing_period_start, billing_period_end")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr || !invoice) {
      return errorJson("Invoice not found", 404);
    }

    const totalCents = Math.round(Number(invoice.total) * 100);

    // Get tradie tier for platform fee (from tradie_details, not profiles)
    const { data: tradieDetails } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", invoice.tradie_id)
      .maybeSingle();

    const tier = resolveTradieTier(tradieDetails?.subscription_tier);
    const platformFeeCents = Math.round(calculatePlatformFee(Number(invoice.total), tier) * 100);
    const processingFeeCents = calculateBecsProcessingFeeCents(totalCents);
    const chargeAmount = totalCents + processingFeeCents;

    // Resolve the tradie's Connect account — the charge routes funds directly to it.
    // If onboarding isn't complete, Stripe would reject a destination charge, so fail
    // early with a clear message rather than debiting the client into a stranded payout.
    const { data: tradieConnect } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", invoice.tradie_id)
      .maybeSingle();

    const destinationAccount = tradieConnect?.stripe_connect_onboarding_complete
      ? tradieConnect.stripe_connect_account_id
      : null;

    if (!destinationAccount) {
      return errorJson(
        "Tradie has not completed payment setup — cannot charge this invoice yet.",
        409,
      );
    }

    // Platform keeps the platform fee + processing fee; the remainder is transferred
    // to the tradie automatically as part of the charge (destination charge).
    const applicationFeeCents = platformFeeCents + processingFeeCents;

    // Create off-session destination charge — funds settle to the tradie in one step.
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeAmount,
      currency: "aud",
      customer: saved.stripe_customer_id,
      payment_method: saved.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      payment_method_types: ["au_becs_debit"],
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: destinationAccount },
      // NOTE: no on_behalf_of — au_becs_debit requires the destination account to hold
      // that capability, which it typically doesn't. transfer_data alone still routes the
      // net amount straight to the tradie; the platform stays merchant of record.
      metadata: {
        type: "recurring_invoice_becs",
        routing: "destination",
        invoice_id: invoiceId,
        recurring_job_id: recurringJobId,
        homeowner_id: invoice.homeowner_id,
        tradie_id: invoice.tradie_id,
        platform_fee: String(platformFeeCents),
        processing_fee: String(processingFeeCents),
        tradie_tier: tier,
      },
    };

    if (saved.stripe_mandate_id) {
      paymentIntentParams.mandate = saved.stripe_mandate_id;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Update invoice with BECS details
    await supabase
      .from("recurring_invoices")
      .update({
        payment_method: "au_becs_debit",
        becs_charge_status: "pending",
        status: "processing",
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("id", invoiceId);

    // Notify client
    const amountDollars = `$${(chargeAmount / 100).toFixed(2)}`;
    await supabase.from("notifications").insert({
      user_id: invoice.homeowner_id,
      type: "becs_charge_initiated",
      title: "Direct Debit Initiated",
      message: `A direct debit of ${amountDollars} has been initiated for your recurring service invoice. This will be processed within 3-5 business days.`,
      metadata: { recurring_job_id: recurringJobId, invoice_id: invoiceId },
      read: false,
    });

    return jsonResponse({
      success: true,
      paymentIntentId: paymentIntent.id,
      amount: chargeAmount,
      status: paymentIntent.status,
    });
  } catch (err) {
    // If Stripe rejects immediately (e.g., invalid mandate), return the error
    // so the caller can fall back to card checkout
    console.error("charge-becs-invoice error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, err instanceof Stripe.errors.StripeError ? 400 : 500);
  }
});
