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

    // Get tradie tier for platform fee
    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", invoice.tradie_id)
      .maybeSingle();

    const tier = resolveTradieTier(tradieProfile?.subscription_tier);
    const platformFeeCents = Math.round(calculatePlatformFee(Number(invoice.total), tier) * 100);
    const processingFeeCents = calculateBecsProcessingFeeCents(totalCents);
    const chargeAmount = totalCents + processingFeeCents;

    // Create off-session PaymentIntent
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: chargeAmount,
      currency: "aud",
      customer: saved.stripe_customer_id,
      payment_method: saved.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      payment_method_types: ["au_becs_debit"],
      metadata: {
        type: "recurring_invoice_becs",
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
