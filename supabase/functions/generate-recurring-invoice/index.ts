import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier } from "../_shared/pricing.ts";

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
      .select("id, client_id, tradie_id, agreed_price, trade_category, billing_cycle, is_active, cancelled_at")
      .eq("id", recurringJobId)
      .maybeSingle();

    if (jobError) return errorJson(jobError.message, 500);
    if (!job) return errorJson("Recurring job not found", 404);

    // Only the tradie assigned to this job (or the homeowner) can generate
    if (user.id !== job.tradie_id && user.id !== job.client_id) {
      return errorJson("Not authorised to generate invoice for this job", 403);
    }

    // Prevent invoicing cancelled services
    if (job.cancelled_at) {
      return errorJson("Cannot generate invoice for a cancelled service", 400);
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

    // Prevent duplicate invoices for the same billing period
    const { data: existingInvoice } = await supabase
      .from("recurring_invoices")
      .select("id, status")
      .eq("recurring_job_id", recurringJobId)
      .eq("billing_period_start", billingPeriodStart)
      .not("status", "eq", "cancelled")
      .maybeSingle();

    if (existingInvoice) {
      return errorJson(
        `An invoice already exists for this period (${existingInvoice.status}). Cancel it first to regenerate.`,
        409,
      );
    }

    const completedSessions = allSessions.filter(
      (s: { status: string }) => s.status === "completed",
    );
    const extraSessions = allSessions.filter(
      (s: { status: string }) => s.status === "extra",
    );

    // ── 3. Calculate totals ─────────────────────────────────────
    const subtotal = agreedPrice * completedSessions.length;
    const extrasTotal = extraSessions.reduce(
      (sum: number, s: { extra_cost?: number; id?: string }) => {
        const cost = Number(s.extra_cost) || 0;
        if (cost === 0) {
          console.warn(`[generate-invoice] Extra session ${s.id} has no cost — invoiced at $0`);
        }
        return sum + cost;
      },
      0,
    );
    const suppliesTotal = allSessions.reduce(
      (sum: number, s: { supply_cost?: number }) => sum + (Number(s.supply_cost) || 0),
      0,
    );
    const total = subtotal + extrasTotal + suppliesTotal;

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

    // Look up tradie subscription tier for platform fee
    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", job.tradie_id)
      .maybeSingle();

    const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);

    // Resolve the tradie's Connect account — payments route directly to it (destination
    // charge). If onboarding isn't complete, neither BECS nor card can route funds, so
    // fail early rather than creating an invoice that can't be charged.
    const { data: tradieConnect } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete, platform_fee_override_bps")
      .eq("id", job.tradie_id)
      .maybeSingle();

    const platformFeeDollars = calculatePlatformFee(total, tradieSubscriptionTier, tradieConnect?.platform_fee_override_bps ?? null);
    const platformFeeCents = Math.round(platformFeeDollars * 100);

    const destinationAccount = tradieConnect?.stripe_connect_onboarding_complete
      ? tradieConnect.stripe_connect_account_id
      : null;

    if (!destinationAccount) {
      return errorJson(
        "Tradie has not completed payment setup — cannot generate a payable invoice yet.",
        409,
      );
    }

    const totalCents = Math.round(total * 100);
    const processingFee = calculateProcessingFeeCents(totalCents);

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

    if (suppliesTotal > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Supplies & Materials" },
          unit_amount: Math.round(suppliesTotal * 100),
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

    // Redirect base for Stripe checkout. NEVER fall back to localhost — these
    // sessions are stored on the invoice and reused by "Pay Now" days later, so a
    // bad success_url is baked in permanently (sessions are immutable) and strands
    // the payer on Stripe's domain after paying.
    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "";
    const siteUrl = Deno.env.get("SITE_URL") ||
      (allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : "https://connectradie.com");

    // Check for saved BECS payment method
    const { data: savedBecs } = await supabase
      .from("saved_payment_methods")
      .select("id")
      .eq("recurring_job_id", recurringJobId)
      .eq("mandate_status", "active")
      .maybeSingle();

    let invoice: { id: string } | null = null;
    let usedBecs = false;
    let stripePaymentUrl: string | null = null;

    if (savedBecs) {
      // BECS path: insert invoice, then charge
      const { data: becsInvoice, error: becsInsertErr } = await supabase
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
          supplies_total: suppliesTotal,
          total,
          status: "processing",
          payment_method: "au_becs_debit",
          due_date: dueDateStr,
        })
        .select("id")
        .single();

      if (becsInsertErr) {
        console.error("Failed to insert BECS invoice:", becsInsertErr);
        return errorJson("Failed to create invoice record", 500);
      }

      invoice = becsInvoice;

      try {
        const chargeResp = await fetch(`${supabaseUrl}/functions/v1/charge-becs-invoice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Forward the caller's valid JWT, not the env service key (which can be
            // stale after a key rotation and gets 401'd by charge-becs-invoice's verify_jwt).
            "Authorization": authHeader as string,
          },
          body: JSON.stringify({ invoiceId: becsInvoice.id, recurringJobId }),
        });

        if (chargeResp.ok) {
          usedBecs = true;
        } else {
          console.warn("BECS charge failed, falling back to card");
        }
      } catch (becsErr) {
        console.warn("BECS charge error, falling back to card:", becsErr);
      }

      // Fallback to card if BECS failed
      if (!usedBecs) {
        const checkoutSession = await stripe.checkout.sessions.create({
          customer: customerId,
          customer_email: customerId ? undefined : homeowner?.email,
          line_items: lineItems,
          mode: "payment",
          success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/payment-cancelled`,
          payment_intent_data: {
            application_fee_amount: platformFeeCents + processingFee,
            transfer_data: { destination: destinationAccount },
          },
          metadata: {
            type: "recurring_invoice",
            routing: "destination",
            recurring_job_id: recurringJobId,
            billing_period_start: billingPeriodStart,
            billing_period_end: billingPeriodEnd,
            homeowner_id: job.client_id,
            tradie_id: job.tradie_id ?? "",
            platform_fee: String(platformFeeCents),
            processing_fee: String(processingFee),
            tradie_tier: tradieSubscriptionTier,
          },
        });

        await supabase
          .from("recurring_invoices")
          .update({
            status: "sent",
            payment_method: "card",
            stripe_checkout_session_id: checkoutSession.id,
            stripe_payment_intent_id: checkoutSession.payment_intent as string | null,
            stripe_payment_url: checkoutSession.url,
          })
          .eq("id", becsInvoice.id);

        stripePaymentUrl = checkoutSession.url;
      }
    } else {
      // Card path (no saved BECS)
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        customer_email: customerId ? undefined : homeowner?.email,
        line_items: lineItems,
        mode: "payment",
        success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/payment-cancelled`,
        payment_intent_data: {
          application_fee_amount: platformFeeCents + processingFee,
          transfer_data: { destination: destinationAccount },
        },
        metadata: {
          type: "recurring_invoice",
          routing: "destination",
          recurring_job_id: recurringJobId,
          billing_period_start: billingPeriodStart,
          billing_period_end: billingPeriodEnd,
          homeowner_id: job.client_id,
          tradie_id: job.tradie_id ?? "",
          platform_fee: String(platformFeeCents),
          processing_fee: String(processingFee),
          tradie_tier: tradieSubscriptionTier,
        },
      });

      const { data: cardInvoice, error: insertError } = await supabase
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
          supplies_total: suppliesTotal,
          total,
          status: "sent",
          stripe_checkout_session_id: checkoutSession.id,
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

      invoice = cardInvoice;
      stripePaymentUrl = checkoutSession.url;
    }

    // ── 7. Notify homeowner ─────────────────────────────────────
    const totalFormatted = total.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
    });

    await supabase.from("notifications").insert({
      user_id: job.client_id,
      type: usedBecs ? "becs_charge_initiated" : "invoice_ready",
      message: usedBecs
        ? `Your ${tradeLabel} direct debit of ${totalFormatted} for ${monthLabel} has been initiated. Processing takes 3-5 business days.`
        : `Your ${tradeLabel} invoice for ${monthLabel} is ready — ${totalFormatted} (${completedSessions.length} session${completedSessions.length !== 1 ? 's' : ''}${extraSessions.length > 0 ? ` + ${extraSessions.length} extra` : ''}) due by ${new Date(dueDateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
      metadata: {
        invoice_id: invoice!.id,
        recurring_job_id: recurringJobId,
        total,
        due_date: dueDateStr,
      },
      read: false,
    });

    // ── 8. Update last_invoiced_at on recurring job ─────────────
    // Must match the cron: store billing_period_end, not NOW — the auto-invoice cron
    // computes the next period as last_invoiced_at + 1 day. Using NOW here caused a
    // silent skip-loop with the cron.
    await supabase
      .from("recurring_jobs")
      .update({ last_invoiced_at: billingPeriodEnd })
      .eq("id", recurringJobId);

    return new Response(
      JSON.stringify({
        invoiceId: invoice!.id,
        total,
        paymentMethod: usedBecs ? "au_becs_debit" : "card",
        stripePaymentUrl,
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
