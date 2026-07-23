import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { resolveTradieTier } from "../_shared/pricing.ts";
import { resolveChargeFee } from "../_shared/feeContext.ts";

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

// Format date as YYYY-MM-DD using UTC components. Callers pass either real-UTC
// Dates or AEST-shifted Dates (epoch + 10h) — in both cases reading via
// getUTC* gives the calendar date the caller intends, regardless of runtime TZ.
function fmt(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
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

    // Caller has already passed Supabase JWT verification (verify_jwt=true).
    // Defence-in-depth: also require the bearer be a JWT (starts with 'ey').
    // We deliberately do NOT byte-compare against env var — the auto-injected
    // SUPABASE_SERVICE_ROLE_KEY can drift from the vault-stored secret used by
    // pg_cron after key rotations, and that mismatch silently 401'd everything.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ey")) {
      return errorJson("Unauthorized", 401);
    }

    // Current date/time in AEST (UTC+10, no DST observed by this cron).
    // We shift the epoch +10h then read it back with getUTC* methods so the values
    // are independent of whatever timezone Deno's runtime decides to use. Using
    // local getHours/getDay/getDate here is broken — if the runtime TZ is not UTC
    // the math double-shifts and every job silently skips at the hour/day check.
    const nowUtc = new Date();
    const aestOffset = 10 * 60 * 60 * 1000;
    const nowAest = new Date(nowUtc.getTime() + aestOffset);
    const todayStr = `${nowAest.getUTCFullYear()}-${String(nowAest.getUTCMonth() + 1).padStart(2, "0")}-${String(nowAest.getUTCDate()).padStart(2, "0")}`;
    const currentHour = nowAest.getUTCHours();
    const currentDayOfWeek = nowAest.getUTCDay() === 0 ? 7 : nowAest.getUTCDay(); // 1=Mon, 7=Sun
    const currentDayOfMonth = nowAest.getUTCDate();

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

    // ─── FIRST PASS: filter eligible jobs by hour/day checks and compute billing periods ───
    type EligibleJob = typeof jobs[number] & {
      billingPeriodStart: string;
      billingPeriodEnd: string;
      billingCycle: string;
    };
    const eligibleJobs: EligibleJob[] = [];

    for (const job of jobs) {
      // Parse send time hour (e.g. "10:00:00" -> 10)
      const sendTimeStr = (job.invoice_send_time as string) || "09:00:00";
      const sendHour = parseInt(sendTimeStr.split(":")[0], 10);
      const sendDay = (job.invoice_send_day as number) || 1;
      const billingCycle = (job.billing_cycle as string) || "monthly";

      // Check if this is the right hour (run within the same hour window)
      if (currentHour !== sendHour) {
        skipped++;
        results.push({ jobId: job.id, status: "skipped", detail: `Hour ${currentHour} AEST !== send hour ${sendHour}` });
        continue;
      }

      // Check if this is the right day based on billing cycle
      let skipJob = false;
      if (billingCycle === "weekly") {
        // Weekly: invoice_send_day is day of week (1=Mon, 7=Sun)
        if (currentDayOfWeek !== sendDay) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: `Weekly: dayOfWeek ${currentDayOfWeek} !== send day ${sendDay}` });
          skipJob = true;
        }
        // Check we haven't invoiced in the last 5 days (prevent duplicates)
        if (!skipJob && job.last_invoiced_at) {
          const lastInvoiced = new Date(job.last_invoiced_at);
          const daysSince = Math.floor((nowAest.getTime() - lastInvoiced.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince < 5) {
            skipped++;
            results.push({ jobId: job.id, status: "skipped", detail: `Invoiced ${daysSince} days ago (weekly)` });
            skipJob = true;
          }
        }
      } else if (billingCycle === "fortnightly") {
        // For fortnightly: invoice_send_day is day of week (1=Mon, 7=Sun)
        if (currentDayOfWeek !== sendDay) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: `Fortnightly: dayOfWeek ${currentDayOfWeek} !== send day ${sendDay}` });
          skipJob = true;
        }
        // For fortnightly, also check we haven't invoiced in the last 12 days
        if (!skipJob && job.last_invoiced_at) {
          const lastInvoiced = new Date(job.last_invoiced_at);
          const daysSince = Math.floor((nowAest.getTime() - lastInvoiced.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince < 12) {
            skipped++;
            results.push({ jobId: job.id, status: "skipped", detail: `Invoiced ${daysSince} days ago (fortnightly)` });
            skipJob = true;
          }
        }
      } else {
        // Monthly: invoice_send_day is day of month (1-28)
        if (currentDayOfMonth !== sendDay) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: `Monthly: dayOfMonth ${currentDayOfMonth} !== send day ${sendDay}` });
          skipJob = true;
        }
      }

      if (skipJob) continue;

      // Determine billing period — operate on UTC-component dates so we don't
      // get bitten by runtime TZ again. `nowAest` is the AEST-shifted epoch;
      // reading/writing via setUTCDate keeps the calendar consistent.
      const periodEnd = new Date(nowAest);
      periodEnd.setUTCDate(periodEnd.getUTCDate() - 1); // Yesterday (AEST) is the last day of the period

      let periodStart: Date;
      if (job.last_invoiced_at) {
        // Start from the day after the last invoiced date
        periodStart = new Date(job.last_invoiced_at);
        periodStart.setUTCDate(periodStart.getUTCDate() + 1);
      } else if (billingCycle === "weekly") {
        periodStart = new Date(periodEnd);
        periodStart.setUTCDate(periodStart.getUTCDate() - 6); // 7-day period
      } else if (billingCycle === "fortnightly") {
        periodStart = new Date(periodEnd);
        periodStart.setUTCDate(periodStart.getUTCDate() - 13); // 14-day period
      } else {
        // Monthly: start of current AEST month
        periodStart = new Date(Date.UTC(nowAest.getUTCFullYear(), nowAest.getUTCMonth(), 1));
      }

      eligibleJobs.push({
        ...job,
        billingPeriodStart: fmt(periodStart),
        billingPeriodEnd: fmt(periodEnd),
        billingCycle,
      });
    }

    // ─── BULK PRE-FETCHES for eligible jobs (avoid N+1 queries) ───
    if (eligibleJobs.length > 0) {
      const eligibleJobIds = eligibleJobs.map(j => j.id);
      const eligibleTradieIds = Array.from(new Set(eligibleJobs.map(j => j.tradie_id as string)));
      const eligibleClientIds = Array.from(new Set(eligibleJobs.map(j => j.client_id as string)));

      // Find the widest date range across all eligible jobs for session/invoice queries
      const allPeriodStarts = eligibleJobs.map(j => j.billingPeriodStart);
      const allPeriodEnds = eligibleJobs.map(j => j.billingPeriodEnd);
      const earliestStart = allPeriodStarts.sort()[0];
      const latestEnd = allPeriodEnds.sort().reverse()[0];

      // Pre-fetched to avoid N+1 queries — bulk-fetch all completed/extra sessions for eligible jobs
      const { data: allSessions, error: sessionsError } = await supabase
        .from("recurring_sessions")
        .select("id, recurring_job_id, status, extra_cost, supply_cost, scheduled_date")
        .in("recurring_job_id", eligibleJobIds)
        .gte("scheduled_date", earliestStart)
        .lte("scheduled_date", latestEnd)
        .in("status", ["completed", "extra"])
        .order("scheduled_date", { ascending: true });

      if (sessionsError) {
        console.error("[auto-invoices] Bulk sessions query error:", sessionsError);
      }

      // Build a map: jobId -> sessions (filtered to the job's specific billing period in the loop)
      const sessionsMap = new Map<string, typeof allSessions>();
      for (const s of allSessions ?? []) {
        const jobId = s.recurring_job_id as string;
        if (!sessionsMap.has(jobId)) sessionsMap.set(jobId, []);
        sessionsMap.get(jobId)!.push(s);
      }

      // Pre-fetched to avoid N+1 queries — bulk-fetch all non-cancelled invoices for eligible jobs
      const { data: allExistingInvoices } = await supabase
        .from("recurring_invoices")
        .select("id, status, recurring_job_id, billing_period_start")
        .in("recurring_job_id", eligibleJobIds)
        .not("status", "eq", "cancelled");

      // Build a map: "jobId:billingPeriodStart" -> invoice
      const existingInvoiceMap = new Map<string, { id: string; status: string }>(
        (allExistingInvoices ?? []).map((inv: { id: string; status: string; recurring_job_id: string; billing_period_start: string }) =>
          [`${inv.recurring_job_id}:${inv.billing_period_start}`, { id: inv.id, status: inv.status }]
        )
      );

      // Pre-fetched to avoid N+1 queries — bulk-fetch tradie subscription tiers
      const { data: allTradieDetails } = await supabase
        .from("tradie_details")
        .select("profile_id, subscription_tier")
        .in("profile_id", eligibleTradieIds);

      const tradieDetailMap = new Map<string, string | null>(
        (allTradieDetails ?? []).map((t: { profile_id: string; subscription_tier: string | null }) =>
          [t.profile_id, t.subscription_tier]
        )
      );

      // Pre-fetched to avoid N+1 queries — bulk-fetch homeowner profiles
      const { data: allHomeowners } = await supabase
        .from("profiles")
        .select("id, email, full_name, stripe_connect_onboarding_complete, platform_fee_override_bps")
        .in("id", [...new Set([...eligibleClientIds, ...eligibleTradieIds])]);

      const profileMap = new Map<string, { id: string; email: string; full_name: string; stripe_connect_onboarding_complete: boolean; platform_fee_override_bps: number | null }>(
        (allHomeowners ?? []).map((p: { id: string; email: string; full_name: string; stripe_connect_onboarding_complete: boolean; platform_fee_override_bps: number | null }) =>
          [p.id, p]
        )
      );

      // Pre-fetched to avoid N+1 queries — bulk-fetch Stripe customer IDs
      const { data: allStripeSubs } = await supabase
        .from("stripe_subscriptions")
        .select("profile_id, stripe_customer_id")
        .in("profile_id", eligibleClientIds);

      const stripeCustomerMap = new Map<string, string>(
        (allStripeSubs ?? []).filter((s: { stripe_customer_id: string | null }) => s.stripe_customer_id)
          .map((s: { profile_id: string; stripe_customer_id: string }) => [s.profile_id, s.stripe_customer_id])
      );

      // Pre-fetched to avoid N+1 queries — bulk-fetch active BECS mandates for eligible jobs
      const { data: allBecsMethods } = await supabase
        .from("saved_payment_methods")
        .select("id, recurring_job_id")
        .in("recurring_job_id", eligibleJobIds)
        .eq("mandate_status", "active");

      const becsMethodSet = new Set<string>(
        (allBecsMethods ?? []).map((m: { recurring_job_id: string }) => m.recurring_job_id)
      );

    // ─── SECOND PASS: process eligible jobs using pre-fetched data ───
    for (const job of eligibleJobs) {
      try {
        const billingPeriodStart = job.billingPeriodStart;
        const billingPeriodEnd = job.billingPeriodEnd;

        // Filter pre-fetched sessions to this job's specific billing period
        const jobSessions = (sessionsMap.get(job.id) ?? []).filter(
          (s: { scheduled_date: string }) =>
            s.scheduled_date >= billingPeriodStart && s.scheduled_date <= billingPeriodEnd
        );

        if (jobSessions.length === 0) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: "No completed sessions in period" });
          continue;
        }

        // Prevent duplicate invoices for the same billing period (O(1) lookup)
        const existingInvoice = existingInvoiceMap.get(`${job.id}:${billingPeriodStart}`);
        if (existingInvoice) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: `Invoice already exists for ${billingPeriodStart} (${existingInvoice.status})` });
          continue;
        }

        const completedSessions = jobSessions.filter((s: { status: string }) => s.status === "completed");
        const extraSessions = jobSessions.filter((s: { status: string }) => s.status === "extra");

        const agreedPrice = (job.agreed_price as number) ?? 0;
        const subtotal = agreedPrice * completedSessions.length;
        const extrasTotal = extraSessions.reduce(
          (sum: number, s: { extra_cost?: number }) => sum + ((s.extra_cost as number) ?? 0),
          0,
        );
        const suppliesTotal = jobSessions.reduce(
          (sum: number, s: { supply_cost?: number }) => sum + ((s.supply_cost as number) ?? 0),
          0,
        );
        const total = subtotal + extrasTotal + suppliesTotal;

        if (total <= 0) {
          skipped++;
          results.push({ jobId: job.id, status: "skipped", detail: "Total is $0" });
          continue;
        }

        // Calculate due date (billing period end + 7 days). Parse as UTC midnight
        // and step in UTC so the result is independent of runtime TZ.
        const dueDate = new Date(billingPeriodEnd + "T00:00:00Z");
        dueDate.setUTCDate(dueDate.getUTCDate() + 7);
        const dueDateStr = fmt(dueDate);

        // Look up tradie subscription tier (O(1) lookup)
        const tradieSubscriptionTier = resolveTradieTier(tradieDetailMap.get(job.tradie_id as string) ?? undefined);
        const tradieFeeOverrideBps = profileMap.get(job.tradie_id as string)?.platform_fee_override_bps ?? null;

        const totalCents = Math.round(total * 100);
        // Pricing v2.1: an invoice has no labour/materials split, so the whole
        // total is treated as labour. Repeat-client rate still applies to a
        // genuine pair.
        const fee = await resolveChargeFee(supabase, {
          amountCents: totalCents,
          tier: tradieSubscriptionTier,
          overrideBps: tradieFeeOverrideBps,
          tradieId: job.tradie_id as string,
          clientId: job.client_id as string,
        });
        const platformFeeCents = fee.applicationFeeAmount;
        const processingFee = 0;

        // Get homeowner info for Stripe (O(1) lookup)
        const homeowner = profileMap.get(job.client_id as string);

        // Check for existing Stripe customer (O(1) lookup)
        const customerId: string | undefined = stripeCustomerMap.get(job.client_id as string);

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

        const siteUrl = Deno.env.get("SITE_URL") || "https://connectradie.com";

        // Can this invoice be auto-debited after a notice window? Requires an active
        // BECS mandate on the job AND a fully-onboarded tradie to receive the funds.
        // If so, we schedule the debit a few days out and let the client dispute first
        // instead of forcing them to click "Approve & Pay".
        const hasBecsMandate = becsMethodSet.has(job.id);
        const tradieConnectProfile = profileMap.get(job.tradie_id as string);
        const canAutoDebit = hasBecsMandate && !!tradieConnectProfile?.stripe_connect_onboarding_complete;

        const AUTO_CHARGE_DELAY_DAYS = 3;
        const scheduledChargeAt = canAutoDebit
          ? new Date(nowUtc.getTime() + AUTO_CHARGE_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString()
          : null;

        // Create invoice as pending_approval. When scheduled_charge_at is set, the
        // auto-charge pass will debit it after the notice window unless disputed.
        const { data: newInvoice, error: insertError } = await supabase
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
            supplies_total: suppliesTotal,
            total,
            status: "pending_approval",
            approval_requested_at: new Date().toISOString(),
            scheduled_charge_at: scheduledChargeAt,
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

        const invoice = newInvoice;

        // Notify client to review and approve the invoice
        const totalFormatted = total.toLocaleString("en-AU", {
          style: "currency",
          currency: "AUD",
        });

        const cycleLabel = job.billingCycle === 'weekly' ? 'weekly' : job.billingCycle === 'fortnightly' ? 'fortnightly' : 'monthly';
        const sessionsSummary = `${completedSessions.length} session${completedSessions.length !== 1 ? 's' : ''}${extraSessions.length > 0 ? ` + ${extraSessions.length} extra` : ''}`;

        if (scheduledChargeAt) {
          // Auto-debit path: tell the client when we'll charge and that they can dispute.
          const chargeDateLabel = new Date(scheduledChargeAt).toLocaleDateString("en-AU", {
            day: "numeric", month: "long", year: "numeric",
          });
          await supabase.from("notifications").insert({
            user_id: job.client_id,
            type: "invoice_auto_charge_scheduled",
            title: "Invoice Scheduled for Direct Debit",
            message: `Your ${cycleLabel} ${tradeLabel} invoice — ${totalFormatted} for ${sessionsSummary} — will be automatically debited on ${chargeDateLabel}. No action needed. If anything looks wrong, you can dispute it before then.`,
            metadata: {
              invoice_id: invoice.id,
              recurring_job_id: job.id,
              total,
              scheduled_charge_at: scheduledChargeAt,
              due_date: dueDateStr,
            },
            read: false,
          });
        } else {
          // Manual path (card / no mandate): client must approve to pay.
          await supabase.from("notifications").insert({
            user_id: job.client_id,
            type: "invoice_approval_required",
            title: "Invoice Ready for Approval",
            message: `Your ${cycleLabel} ${tradeLabel} invoice is ready — ${totalFormatted} for ${sessionsSummary}. Please review and approve.`,
            metadata: {
              invoice_id: invoice.id,
              recurring_job_id: job.id,
              total,
              due_date: dueDateStr,
            },
            read: false,
          });
        }

        // Also notify tradie that invoice was generated
        if (job.tradie_id) {
          await supabase.from("notifications").insert({
            user_id: job.tradie_id,
            type: "invoice_generated",
            title: `${cycleLabel.charAt(0).toUpperCase() + cycleLabel.slice(1)} Invoice Generated`,
            message: `Invoice for ${totalFormatted} (${completedSessions.length} session${completedSessions.length !== 1 ? "s" : ""}) sent to client for approval.`,
            metadata: { invoice_id: invoice.id, recurring_job_id: job.id },
            read: false,
          });
        }

        // Update last_invoiced_at to the billing period end (not current time) to prevent gaps
        await supabase
          .from("recurring_jobs")
          .update({ last_invoiced_at: billingPeriodEnd })
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
    } // end if (eligibleJobs.length > 0)

    // ─── AUTO-CHARGE PASS: debit BECS invoices whose notice window has elapsed ───
    // Disputed invoices move to status 'disputed' and are excluded automatically.
    let autoCharged = 0;
    try {
      const { data: dueInvoices } = await supabase
        .from("recurring_invoices")
        .select("id, recurring_job_id, homeowner_id, total")
        .eq("status", "pending_approval")
        .not("scheduled_charge_at", "is", null)
        .lte("scheduled_charge_at", nowUtc.toISOString());

      for (const inv of dueInvoices ?? []) {
        try {
          const chargeResp = await fetch(`${supabaseUrl}/functions/v1/charge-becs-invoice`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Forward the caller's valid JWT (pg_cron's vault key) rather than this
              // function's env SUPABASE_SERVICE_ROLE_KEY, which can be stale after a key
              // rotation and gets rejected by charge-becs-invoice's verify_jwt gate.
              "Authorization": authHeader as string,
            },
            body: JSON.stringify({ invoiceId: inv.id, recurringJobId: inv.recurring_job_id }),
          });

          if (chargeResp.ok) {
            // charge-becs-invoice set status=processing + the PaymentIntent. Record the
            // implicit approval and clear the schedule so it won't be picked up again.
            await supabase
              .from("recurring_invoices")
              .update({ approved_at: new Date().toISOString(), scheduled_charge_at: null })
              .eq("id", inv.id);
            autoCharged++;
            console.log(`[auto-invoices] Auto-charged invoice ${inv.id}`);
          } else {
            // Charge failed (mandate revoked, tradie offboarded, etc.). Stop retrying and
            // fall back to manual approval so the client can still pay another way.
            const detail = await chargeResp.text().catch(() => "");
            console.warn(`[auto-invoices] Auto-charge failed for invoice ${inv.id}: ${chargeResp.status} ${detail}`);
            await supabase
              .from("recurring_invoices")
              .update({ scheduled_charge_at: null })
              .eq("id", inv.id);
            await supabase.from("notifications").insert({
              user_id: inv.homeowner_id,
              type: "invoice_approval_required",
              title: "Action Needed — Please Pay Your Invoice",
              message: `We couldn't automatically debit your ${Number(inv.total).toLocaleString("en-AU", { style: "currency", currency: "AUD" })} invoice. Please review and approve it to complete payment.`,
              metadata: { invoice_id: inv.id, recurring_job_id: inv.recurring_job_id },
              read: false,
            });
          }
        } catch (chargeErr) {
          console.error(`[auto-invoices] Auto-charge error for invoice ${inv.id}:`, chargeErr);
        }
      }
    } catch (autoErr) {
      console.error("[auto-invoices] Auto-charge pass error:", autoErr);
    }

    // ─── REMINDER PASS: re-notify clients with stale pending_approval invoices ───
    let reminders = 0;
    try {
      const fortyEightHoursAgo = new Date(nowUtc.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const { data: staleInvoices } = await supabase
        .from("recurring_invoices")
        .select("id, homeowner_id, total, recurring_job_id, approval_requested_at, approval_reminder_sent_at")
        .eq("status", "pending_approval")
        .is("scheduled_charge_at", null) // scheduled auto-debit invoices don't need approval nags
        .lt("approval_requested_at", fortyEightHoursAgo)
        .is("approval_reminder_sent_at", null);

      for (const inv of staleInvoices ?? []) {
        try {
          const totalFormatted = Number(inv.total).toLocaleString("en-AU", { style: "currency", currency: "AUD" });

          await supabase.from("notifications").insert({
            user_id: inv.homeowner_id,
            type: "invoice_approval_reminder",
            title: "Invoice Reminder",
            message: `You have an unpaid invoice for ${totalFormatted} awaiting your approval. Please review to avoid service interruption.`,
            metadata: { invoice_id: inv.id, recurring_job_id: inv.recurring_job_id },
            read: false,
          });

          await supabase
            .from("recurring_invoices")
            .update({ approval_reminder_sent_at: new Date().toISOString() })
            .eq("id", inv.id);

          reminders++;
          console.log(`[auto-invoices] Sent approval reminder for invoice ${inv.id}`);
        } catch (reminderErr) {
          console.error(`[auto-invoices] Reminder error for invoice ${inv.id}:`, reminderErr);
        }
      }
    } catch (reminderErr) {
      console.error("[auto-invoices] Reminder pass error:", reminderErr);
    }

    console.log(`[auto-invoices] Done. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}, Auto-charged: ${autoCharged}, Reminders: ${reminders}`);

    return jsonResponse({ processed, skipped, errors, autoCharged, reminders, results });
  } catch (err) {
    console.error("[auto-invoices] Fatal error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
