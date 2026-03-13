import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PROCESSING_FEE_RATE = 0.02;

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
    const requiredEnvVars = [
      "STRIPE_SECRET_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    for (const envVar of requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        return errorJson(`Missing required configuration: ${envVar}`, 500);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    // Authenticate caller
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

    const { recurringJobId, billingPeriodStart, billingPeriodEnd } = body as {
      recurringJobId?: string;
      billingPeriodStart?: string;
      billingPeriodEnd?: string;
    };

    if (!recurringJobId || !billingPeriodStart || !billingPeriodEnd) {
      return errorJson(
        "Missing required parameters: recurringJobId, billingPeriodStart, billingPeriodEnd",
        400,
      );
    }

    // ── 1. Fetch the recurring job ──────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from("recurring_jobs")
      .select("id, client_id, tradie_id, agreed_price, trade_category, billing_cycle")
      .eq("id", recurringJobId)
      .maybeSingle();

    if (jobError) return errorJson(jobError.message, 500);
    if (!job) return errorJson("Recurring job not found", 404);

    // Only the tradie assigned to this job (or the homeowner) can generate
    if (user.id !== job.tradie_id && user.id !== job.client_id) {
      return errorJson("Not authorised to generate invoice for this job", 403);
    }

    const agreedPrice = (job.agreed_price as number) ?? 0;

    // ── 2. Query sessions for the billing period ────────────────
    const { data: sessions, error: sessionsError } = await supabase
      .from("recurring_sessions")
      .select("*")
      .eq("recurring_job_id", recurringJobId)
      .gte("scheduled_date", billingPeriodStart)
      .lte("scheduled_date", billingPeriodEnd)
      .order("scheduled_date", { ascending: true });

    if (sessionsError) return errorJson(sessionsError.message, 500);

    const allSessions = sessions ?? [];
    const completedSessions = allSessions.filter(
      (s: { status: string }) => s.status === "completed",
    );
    const extraSessions = allSessions.filter(
      (s: { status: string }) => s.status === "extra",
    );

    // ── 3. Calculate totals ─────────────────────────────────────
    const subtotal = agreedPrice * completedSessions.length;
    const extrasTotal = extraSessions.reduce(
      (sum: number, s: { extra_cost?: number }) => sum + ((s.extra_cost as number) ?? 0),
      0,
    );
    const total = subtotal + extrasTotal;

    if (total <= 0) {
      return errorJson("No billable sessions in this period", 400);
    }

    // ── 4. Calculate due date (billing period end + 7 days) ─────
    const dueDate = new Date(billingPeriodEnd + "T00:00:00");
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split("T")[0];

    // ── 5. Create Stripe Checkout Session ───────────────────────
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Get homeowner email for Stripe
    const { data: homeowner } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", job.client_id)
      .maybeSingle();

    // Check for existing Stripe customer
    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", job.client_id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    }

    const totalCents = Math.round(total * 100);
    const processingFee = Math.round(totalCents * PROCESSING_FEE_RATE);

    // Build month label for invoice
    const periodStart = new Date(billingPeriodStart + "T00:00:00");
    const monthLabel = periodStart.toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
    });

    const tradeLabel = (job.trade_category as string)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `${tradeLabel} — ${monthLabel} (${completedSessions.length} sessions)`,
          },
          unit_amount: Math.round(subtotal * 100),
        },
        quantity: 1,
      },
    ];

    if (extrasTotal > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: {
            name: `Extra sessions (${extraSessions.length})`,
          },
          unit_amount: Math.round(extrasTotal * 100),
        },
        quantity: 1,
      });
    }

    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Secure Processing Fee" },
          unit_amount: processingFee,
        },
        quantity: 1,
      });
    }

    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : homeowner?.email,
      line_items: lineItems,
      mode: "payment",
      success_url: `${siteUrl}/dashboard?invoice_paid=true`,
      cancel_url: `${siteUrl}/dashboard?invoice_cancelled=true`,
      metadata: {
        type: "recurring_invoice",
        recurring_job_id: recurringJobId,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        homeowner_id: job.client_id,
        tradie_id: job.tradie_id ?? "",
      },
    });

    // ── 6. Insert recurring_invoices row ────────────────────────
    const { data: invoice, error: insertError } = await supabase
      .from("recurring_invoices")
      .insert({
        recurring_job_id: recurringJobId,
        homeowner_id: job.client_id,
        tradie_id: job.tradie_id,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        regular_sessions_count: completedSessions.length,
        extra_sessions_count: extraSessions.length,
        subtotal,
        extras_total: extrasTotal,
        total,
        status: "sent",
        stripe_payment_intent_id: checkoutSession.payment_intent as string | null,
        stripe_payment_url: checkoutSession.url,
        due_date: dueDateStr,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert invoice:", insertError);
      return errorJson("Failed to create invoice record", 500);
    }

    // ── 7. Notify homeowner ─────────────────────────────────────
    const totalFormatted = total.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
    });

    await supabase.from("notifications").insert({
      user_id: job.client_id,
      type: "invoice_ready",
      message: `Your ${monthLabel} invoice is ready — ${totalFormatted} due by ${new Date(dueDateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
      metadata: {
        invoice_id: invoice.id,
        recurring_job_id: recurringJobId,
        total,
        due_date: dueDateStr,
      },
      read: false,
    });

    // ── 8. Update last_invoiced_at on recurring job ─────────────
    await supabase
      .from("recurring_jobs")
      .update({ last_invoiced_at: new Date().toISOString() })
      .eq("id", recurringJobId);

    return new Response(
      JSON.stringify({
        invoiceId: invoice.id,
        total,
        stripePaymentUrl: checkoutSession.url,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error generating recurring invoice:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
