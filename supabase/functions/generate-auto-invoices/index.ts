import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier } from "../_shared/pricing.ts";

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

// Format date as YYYY-MM-DD
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Current date/time in AEST (UTC+10)
    const nowUtc = new Date();
    const aestOffset = 10 * 60 * 60 * 1000;
    const nowAest = new Date(nowUtc.getTime() + aestOffset);
    const todayStr = fmt(nowAest);
    const currentHour = nowAest.getHours();
    const currentDayOfWeek = nowAest.getDay() === 0 ? 7 : nowAest.getDay(); // 1=Mon, 7=Sun
    const currentDayOfMonth = nowAest.getDate();

    console.log(`[auto-invoices] Running at ${nowAest.toISOString()} AEST, today=${todayStr}, hour=${currentHour}, dayOfWeek=${currentDayOfWeek}, dayOfMonth=${currentDayOfMonth}`);

    // Fetch all active recurring jobs with auto_invoice enabled
    const { data: jobs, error: jobsError } = await supabase
      .from("recurring_jobs")
      .select("id, client_id, tradie_id, agreed_price, trade_category, billing_cycle, auto_invoice, invoice_send_day, invoice_send_time, last_invoiced_at, is_active, cancelled_at")
      .eq("is_active", true)
      .is("cancelled_at", null)
      .eq("auto_invoice", true);

    if (jobsError) {
      console.error("[auto-invoices] Failed to fetch jobs:", jobsError);
      return errorJson("Failed to fetch recurring jobs", 500);
    }

    if (!jobs || jobs.length === 0) {
      console.log("[auto-invoices] No jobs with auto_invoice enabled");
      return jsonResponse({ processed: 0, skipped: 0, errors: 0 });
    }

    console.log(`[auto-invoices] Found ${jobs.length} auto-invoice jobs`);

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const results: { jobId: string; status: string; detail?: string }[] = [];

    for (const job of jobs) {
      try {
        // Parse send time hour (e.g. "10:00:00" -> 10)
        const sendTimeStr = (job.invoice_send_time as string) || "09:00:00";
        const sendHour = parseInt(sendTimeStr.split(":")[0], 10);
        const sendDay = (job.invoice_send_day as number) || 1;
        const billingCycle = (job.billing_cycle as string) || "monthly";

        // Check if this is the right hour (run within the same hour window)
        if (currentHour !== sendHour) {
          skipped++;
          continue;
        }

        // Check if this is the right day
        if (billingCycle === "fortnightly") {
          // For fortnightly: invoice_send_day is day of week (1=Mon, 7=Sun)
          if (currentDayOfWeek !== sendDay) {
            skipped++;
            continue;
          }
          // For fortnightly, also check we haven't invoiced in the last 12 days
          if (job.last_invoiced_at) {
            const lastInvoiced = new Date(job.last_invoiced_at);
            const daysSince = Math.floor((nowAest.getTime() - lastInvoiced.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince < 12) {
              skipped++;
              results.push({ jobId: job.id, status: "skipped", detail: `Invoiced ${daysSince} days ago (fortnightly)` });
              continue;
            }
          }
        } else {
          // Monthly: invoice_send_day is day of month (1-28)
          if (currentDayOfMonth !== sendDay) {
            skipped++;
            continue;
          }
        }

        // Determine billing period
        const periodEnd = new Date(nowAest);
        periodEnd.setDate(periodEnd.getDate() - 1); // Yesterday is the last day of the period

        let periodStart: Date;
        if (job.last_invoiced_at) {
          // Start from the day after the last invoiced date
          periodStart = new Date(job.last_invoiced_at);
          periodStart.setDate(periodStart.getDate() + 1);
        } else if (billingCycle === "fortnightly") {
          periodStart = new Date(periodEnd);
          periodStart.setDate(periodStart.getDate() - 13); // 14-day period
        } else {
          // Monthly: start of current month
          periodStart = new Date(nowAest.getFullYear(), nowAest.getMonth(), 1);
        }

        const billingPeriodStart = fmt(periodStart);
        const billingPeriodEnd = fmt(periodEnd);

        // Check for completed sessions in this period
        const { data: sessions, error: sessionsError } = await supabase
          .from("recurring_sessions")
          .select("id, status, extra_cost, scheduled_date")
          .eq("recurring_job_id", job.id)
          .gte("scheduled_date", billingPeriodStart)
          .lte("scheduled_date", billingPeriodEnd)
          .in("status", ["completed", "extra"])
          .order("scheduled_date", { ascending: true });

        if (sessionsError) {
          console.error(`[auto-invoices] Sessions query error for job ${job.id}:`, sessionsError);
          errors++;
          results.push({ jobId: job.id, status: "error", detail: sessionsError.message });
          continue;
        }

        const allSessions = sessions ?? [];
        if (allSessions.length === 0) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: "No completed sessions in period" });
          continue;
        }

        // Prevent duplicate invoices for the same billing period
        const { data: existingInvoice } = await supabase
          .from("recurring_invoices")
          .select("id, status")
          .eq("recurring_job_id", job.id)
          .eq("billing_period_start", billingPeriodStart)
          .not("status", "eq", "cancelled")
          .maybeSingle();

        if (existingInvoice) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: `Invoice already exists for ${billingPeriodStart} (${existingInvoice.status})` });
          continue;
        }

        const completedSessions = allSessions.filter((s: { status: string }) => s.status === "completed");
        const extraSessions = allSessions.filter((s: { status: string }) => s.status === "extra");

        const agreedPrice = (job.agreed_price as number) ?? 0;
        const subtotal = agreedPrice * completedSessions.length;
        const extrasTotal = extraSessions.reduce(
          (sum: number, s: { extra_cost?: number }) => sum + ((s.extra_cost as number) ?? 0),
          0,
        );
        const total = subtotal + extrasTotal;

        if (total <= 0) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: "Total is $0" });
          continue;
        }

        // Calculate due date (billing period end + 7 days)
        const dueDate = new Date(billingPeriodEnd + "T00:00:00");
        dueDate.setDate(dueDate.getDate() + 7);
        const dueDateStr = fmt(dueDate);

        // Look up tradie subscription tier
        const { data: tradieSubRecord } = await supabase
          .from("tradie_details")
          .select("subscription_tier")
          .eq("profile_id", job.tradie_id)
          .maybeSingle();

        const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);

        const platformFeeDollars = calculatePlatformFee(total, tradieSubscriptionTier);
        const platformFeeCents = Math.round(platformFeeDollars * 100);
        const totalCents = Math.round(total * 100);
        const processingFee = calculateProcessingFeeCents(totalCents);

        // Get homeowner info for Stripe
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

        // Build month label
        const periodStartDate = new Date(billingPeriodStart + "T00:00:00");
        const monthLabel = periodStartDate.toLocaleDateString("en-AU", {
          month: "long",
          year: "numeric",
        });

        const tradeLabel = (job.trade_category as string)
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

        // Build Stripe line items
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

        const siteUrl = Deno.env.get("SITE_URL") || "https://connectradie.com.au";

        // Check if client has a saved BECS payment method for this job
        const { data: savedBecs } = await supabase
          .from("saved_payment_methods")
          .select("id")
          .eq("recurring_job_id", job.id)
          .eq("mandate_status", "active")
          .maybeSingle();

        let invoice: { id: string } | null = null;
        let usedBecs = false;

        if (savedBecs) {
          // BECS path: insert invoice first, then charge
          const { data: becsInvoice, error: becsInsertErr } = await supabase
            .from("recurring_invoices")
            .insert({
              recurring_job_id: job.id,
              homeowner_id: job.client_id,
              tradie_id: job.tradie_id,
              billing_period_start: billingPeriodStart,
              billing_period_end: billingPeriodEnd,
              regular_sessions_count: completedSessions.length,
              extra_sessions_count: extraSessions.length,
              subtotal,
              extras_total: extrasTotal,
              total,
              status: "processing",
              payment_method: "au_becs_debit",
              due_date: dueDateStr,
            })
            .select("id")
            .single();

          if (becsInsertErr) {
            console.error(`[auto-invoices] BECS insert error for job ${job.id}:`, becsInsertErr);
            errors++;
            results.push({ jobId: job.id, status: "error", detail: becsInsertErr.message });
            continue;
          }

          invoice = becsInvoice;

          // Call charge-becs-invoice
          try {
            const chargeResp = await fetch(`${supabaseUrl}/functions/v1/charge-becs-invoice`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({ invoiceId: becsInvoice.id, recurringJobId: job.id }),
            });

            if (chargeResp.ok) {
              usedBecs = true;
              console.log(`[auto-invoices] BECS charge initiated for job ${job.id}`);
            } else {
              const errBody = await chargeResp.text();
              console.warn(`[auto-invoices] BECS charge failed for job ${job.id}, falling back to card:`, errBody);
              // Fall through to card checkout fallback below
            }
          } catch (becsErr) {
            console.warn(`[auto-invoices] BECS charge error for job ${job.id}, falling back to card:`, becsErr);
          }

          // If BECS failed, create card checkout fallback
          if (!usedBecs) {
            const checkoutSession = await stripe.checkout.sessions.create({
              customer: customerId,
              customer_email: customerId ? undefined : homeowner?.email,
              line_items: lineItems,
              mode: "payment",
              success_url: `${siteUrl}/payments?invoice_paid=true`,
              cancel_url: `${siteUrl}/payments?invoice_cancelled=true`,
              metadata: {
                type: "recurring_invoice",
                recurring_job_id: job.id,
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
          }
        }

        // Card path (no saved BECS or BECS not available)
        if (!savedBecs) {
          const checkoutSession = await stripe.checkout.sessions.create({
            customer: customerId,
            customer_email: customerId ? undefined : homeowner?.email,
            line_items: lineItems,
            mode: "payment",
            success_url: `${siteUrl}/payments?invoice_paid=true`,
            cancel_url: `${siteUrl}/payments?invoice_cancelled=true`,
            metadata: {
              type: "recurring_invoice",
              recurring_job_id: job.id,
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
              recurring_job_id: job.id,
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
              stripe_checkout_session_id: checkoutSession.id,
              stripe_payment_intent_id: checkoutSession.payment_intent as string | null,
              stripe_payment_url: checkoutSession.url,
              due_date: dueDateStr,
            })
            .select("id")
            .single();

          if (insertError) {
            console.error(`[auto-invoices] Insert error for job ${job.id}:`, insertError);
            errors++;
            results.push({ jobId: job.id, status: "error", detail: insertError.message });
            continue;
          }

          invoice = cardInvoice;
        }

        if (!invoice) {
          errors++;
          results.push({ jobId: job.id, status: "error", detail: "Failed to create invoice" });
          continue;
        }

        // Notify homeowner
        const totalFormatted = total.toLocaleString("en-AU", {
          style: "currency",
          currency: "AUD",
        });

        await supabase.from("notifications").insert({
          user_id: job.client_id,
          type: usedBecs ? "becs_charge_initiated" : "invoice_ready",
          message: usedBecs
            ? `Your ${tradeLabel} direct debit of ${totalFormatted} for ${monthLabel} has been initiated (${completedSessions.length} session${completedSessions.length !== 1 ? 's' : ''}). Processing takes 3-5 business days.`
            : `Your ${tradeLabel} invoice for ${monthLabel} is ready — ${totalFormatted} (${completedSessions.length} session${completedSessions.length !== 1 ? 's' : ''}${extraSessions.length > 0 ? ` + ${extraSessions.length} extra` : ''}) due by ${new Date(dueDateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
          metadata: {
            invoice_id: invoice.id,
            recurring_job_id: job.id,
            total,
            due_date: dueDateStr,
          },
          read: false,
        });

        // Update last_invoiced_at
        await supabase
          .from("recurring_jobs")
          .update({ last_invoiced_at: new Date().toISOString() })
          .eq("id", job.id);

        processed++;
        results.push({ jobId: job.id, status: "invoiced", detail: `$${total.toFixed(2)} — ${completedSessions.length} sessions` });
        console.log(`[auto-invoices] Generated invoice for job ${job.id}: $${total.toFixed(2)}`);
      } catch (err) {
        console.error(`[auto-invoices] Error processing job ${job.id}:`, err);
        errors++;
        results.push({ jobId: job.id, status: "error", detail: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    console.log(`[auto-invoices] Done. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);

    return jsonResponse({ processed, skipped, errors, results });
  } catch (err) {
    console.error("[auto-invoices] Fatal error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
