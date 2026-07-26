import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { resolveTradieTier } from "../_shared/pricing.ts";
import { resolveChargeFee } from "../_shared/feeContext.ts";
import type { Insert } from "../_shared/dbTypes.ts";
import { hasServiceRole, getBearerUser } from "../_shared/serviceAuth.ts";

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

    // Authorization: this function initiates a BANK DEBIT on a saved mandate, so a
    // bare "any valid JWT" gate (the old startsWith("Bearer ey")) was unsafe — it
    // let any signed-in user charge an arbitrary invoice. Accept EITHER:
    //   • a service-role key (cron auto-charge, generate-auto-invoices), or
    //   • the authenticated user who OWNS this invoice (the tradie/homeowner) —
    //     the path used by generate-recurring-invoice, which forwards the caller's
    //     user JWT after its own ownership check.
    // Service vs user is resolved here; ownership is enforced after the invoice is
    // loaded (below), because we need the invoice's tradie_id/homeowner_id first.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Unauthorized", 401);
    }
    const isServiceCaller = await hasServiceRole(authHeader, supabaseUrl);
    const callerUser = isServiceCaller ? null : await getBearerUser(authHeader, supabaseUrl, supabaseServiceKey);
    if (!isServiceCaller && !callerUser) {
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

    // Ownership gate for user callers: only the invoice's tradie or homeowner may
    // trigger the debit. Service-role callers (cron) bypass this.
    if (!isServiceCaller && callerUser &&
        callerUser.id !== invoice.tradie_id && callerUser.id !== invoice.homeowner_id) {
      return errorJson("Forbidden", 403);
    }

    const totalCents = Math.round(Number(invoice.total) * 100);

    // Get tradie tier for platform fee (from tradie_details, not profiles)
    const { data: tradieDetails } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", invoice.tradie_id)
      .maybeSingle();

    const tier = resolveTradieTier(tradieDetails?.subscription_tier);
    const { data: feeOverrideRow } = await supabase
      .from("profiles")
      .select("platform_fee_override_bps")
      .eq("id", invoice.tradie_id)
      .maybeSingle();
    const overrideBps = feeOverrideRow?.platform_fee_override_bps ?? null;
    // Pricing v2.1: an invoice carries no labour/materials split, so the whole
    // total is treated as labour. The repeat-client rate still applies if this
    // tradie/client pair has a prior completed + released job.
    const fee = await resolveChargeFee(supabase, {
      amountCents: totalCents,
      tier,
      overrideBps,
      tradieId: invoice.tradie_id,
      clientId: invoice.homeowner_id,
    });
    // v2.1: the client is charged the invoice total and nothing more.
    const chargeAmount = totalCents;

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

    // Platform keeps the commission + at-cost materials processing; the remainder
    // transfers to the tradie automatically as part of the destination charge.
    const applicationFeeCents = fee.applicationFeeAmount;

    // §7A: recurring invoices had NO payments row, and platform_fee_charges
    // (the only table issue-fee-invoices reads) is keyed on payment_id — so
    // commission collected here was never tax-invoiced. Create the row now so
    // the ledger has something to hang off.
    //
    //   profile_id = the TRADIE, deliberately diverging from job_funding rows
    //   (where it is the payer). Off-app client_contacts have no profiles row,
    //   so the payer cannot be used. Only src consumer of payment.profile_id is
    //   Invoice.tsx:61, which serves job payments, not these.
    //
    //   payment_type 'recurring_invoice' keeps these OUT of earnings reporting:
    //   Payouts.tsx filters payments to 'job_funding' and reads
    //   recurring_invoices separately, so this cannot double-count.
    //
    //   status stays 'pending' — BECS settles asynchronously. The webhook flips
    //   it to completed and records the fee only once Stripe confirms, so we
    //   never book commission on money that was never collected.
    const becsPaymentRow: Insert<'payments'> = {
      profile_id: invoice.tradie_id,
      payment_type: "recurring_invoice",
      amount: chargeAmount,
      status: "pending",
      ...fee.paymentColumns,
      metadata: {
        ...fee.metadata,
        type: "recurring_invoice_becs",
        routing: "destination",
        invoice_id: invoiceId,
        recurring_job_id: recurringJobId,
        tradie_id: invoice.tradie_id,
        homeowner_id: invoice.homeowner_id,
      },
    };
    const { data: becsPayment, error: becsPaymentErr } = await supabase
      .from("payments")
      .insert(becsPaymentRow)
      .select("id")
      .maybeSingle();
    if (becsPaymentErr || !becsPayment?.id) {
      // Fail BEFORE charging rather than debit a client with no ledger row —
      // an untracked charge is worse than a deferred one.
      console.error("[charge-becs-invoice] could not create payment row", becsPaymentErr);
      return errorJson("Could not record this payment. Please try again.", 500);
    }

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
        // Lets the webhook find the row above to complete it and record the fee.
        payment_record_id: becsPayment.id,
        invoice_id: invoiceId,
        recurring_job_id: recurringJobId,
        homeowner_id: invoice.homeowner_id,
        tradie_id: invoice.tradie_id,
        processing_fee: "0",
        ...fee.metadata,
        tradie_tier: tier,
      },
    };

    if (saved.stripe_mandate_id) {
      paymentIntentParams.mandate = saved.stripe_mandate_id;
    }

    // Idempotency: keyed on the invoice so a retry (network blip, cron overlap,
    // double-tap) can never create a SECOND direct debit for the same invoice —
    // Stripe returns the original PaymentIntent instead of charging again.
    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, {
      idempotencyKey: `becs-invoice:${invoiceId}`,
    });

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
