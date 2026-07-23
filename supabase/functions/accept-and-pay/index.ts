import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateGstCents, resolveTradieTier } from "../_shared/pricing.ts";
import { resolveChargeFee } from "../_shared/feeContext.ts";
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

    if (!supabaseUrl || !supabaseServiceKey) {
      return errorJson("Server configuration error", 500);
    }

    if (!stripeSecretKey) {
      return errorJson("Stripe not configured", 500);
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

    const { allowed } = checkRateLimit(`${user.id}-accept-and-pay`, 5, 60000);
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

    const { quoteId, successUrl, cancelUrl, idempotencyKey, agreedPrice } = body as {
      quoteId?: string;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
      agreedPrice?: number;
    };

    if (!quoteId || !successUrl || !cancelUrl) {
      return errorJson(
        "Missing required parameters: quoteId, successUrl, cancelUrl",
        400,
      );
    }

    // Validate redirect URLs to prevent open redirects
    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com";
    const isValidRedirectUrl = (url: string) => {
      // Allow all origins in dev mode
      if (allowedOrigin === "*") return true;
      try {
        const parsed = new URL(url);
        const allowed = new URL(allowedOrigin);
        return parsed.hostname === allowed.hostname;
      } catch {
        return false;
      }
    };
    if (!isValidRedirectUrl(successUrl as string) || !isValidRedirectUrl(cancelUrl as string)) {
      return errorJson("Invalid redirect URL", 400);
    }

    // Look up the quote with tradie details
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, job_id, tradie_id, firm_price, price_min, price_max, status, final_price, final_valid_until, call_out_fee_cents, site_visit_fee_status, labour_cents, materials_cents")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) {
      return errorJson("Quote not found", 404);
    }

    // Legacy flow_version=1 accepts pending quotes directly. 3-stage flow_version=2
    // accepts final_submitted quotes (flow_version guard below enforces which is
    // valid for this job). 'accepted' is allowed in both for checkout resumption.
    if (
      quote.status !== "pending"
      && quote.status !== "accepted"
      && quote.status !== "final_submitted"
    ) {
      return errorJson("Quote has already been processed", 409);
    }

    const alreadyAccepted = quote.status === "accepted";

    // Determine the payment amount in dollars.
    // For range quotes, the client must confirm an agreed price within the range.
    let quotePriceDollars: number;
    if (agreedPrice != null) {
      // Validate agreed price is within the quote range
      const min = quote.price_min ?? quote.firm_price ?? 0;
      const max = quote.price_max ?? quote.firm_price ?? 0;
      if (agreedPrice < min || agreedPrice > max) {
        return errorJson(
          `Agreed price must be between $${min} and $${max}`,
          400,
        );
      }
      quotePriceDollars = agreedPrice;
    } else {
      quotePriceDollars = quote.firm_price ?? quote.price_max;
    }
    if (!quotePriceDollars || quotePriceDollars <= 0) {
      return errorJson("Quote has no valid price", 400);
    }

    // Validate the job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, client_id, tradie_id, title, description, status, project_id, location_address, recurring_job_id, flow_version")
      .eq("id", quote.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson("Only the client on this job can accept a quote", 403);
    }

    // 3-stage flow guard: jobs on flow_version=2 must accept a final_submitted
    // quote (or resume an already-accepted one). Site-visit booking goes
    // through the separate book-site-visit function. Legacy flow_version=1
    // jobs continue to accept 'pending' quotes directly, as before.
    if (job.flow_version === 2 && quote.status === "pending") {
      return errorJson(
        "This quote is still an initial estimate. The tradie must submit a final quote (after their site visit, if required) before it can be accepted.",
        409,
      );
    }
    if (job.flow_version !== 2 && quote.status === "final_submitted") {
      return errorJson(
        "Final-submitted quotes are only valid on the 3-stage quote flow (flow_version 2).",
        409,
      );
    }

    // Expiry check (state machine §5.4 #1): on a fresh acceptance of a
    // final_submitted quote, the validity period must not have passed.
    // Resumption (alreadyAccepted) skips this — the client clicked Accept
    // while it was valid; they're just completing checkout.
    if (
      !alreadyAccepted
      && job.flow_version === 2
      && quote.status === "final_submitted"
      && quote.final_valid_until
    ) {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (quote.final_valid_until < todayIso) {
        return errorJson(
          `This final quote expired on ${quote.final_valid_until}. The tradie can submit a new quote on this job.`,
          410,
        );
      }
    }

    // For flow_version=2, the binding price is final_price. If price_min/max
    // are still the estimate range, use final_price as the authoritative dollars.
    if (!alreadyAccepted && job.flow_version === 2 && quote.final_price != null && quote.final_price > 0) {
      quotePriceDollars = Number(quote.final_price);
    }

    // quotePriceDollars is the FULL agreed value of the job — it's what we record on
    // the job, sync to the ongoing-service rate, and show in the acceptance notice.
    // chargeDollars is what we actually collect into escrow NOW: the agreed price minus
    // any call-out fee the client already paid at booking (that money went to the tradie
    // then). Fees are computed on chargeDollars so the visit fee isn't fee'd twice.
    let chargeDollars = quotePriceDollars;
    if (job.flow_version === 2 && quote.site_visit_fee_status === "paid" && Number(quote.call_out_fee_cents) > 0) {
      chargeDollars = Math.max(0, quotePriceDollars - Number(quote.call_out_fee_cents) / 100);
    }

    // --- Look up tradie subscription tier (used for free-tier limits + platform fee) ---
    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", quote.tradie_id)
      .maybeSingle();

    const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);

    // Also check profiles.is_premium, GST status, connect account, and get tradie name
    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("is_premium, is_gst_registered, full_name, stripe_connect_account_id, stripe_connect_onboarding_complete, platform_fee_override_bps")
      .eq("id", quote.tradie_id)
      .maybeSingle();

    // Destination charges require the tradie to have a connected Stripe account
    if (!tradieProfile?.stripe_connect_account_id || !tradieProfile?.stripe_connect_onboarding_complete) {
      return errorJson(
        "This tradie hasn't finished setting up their payout account yet. They need to complete Stripe onboarding before you can pay.",
        400,
      );
    }

    // --- Free tier limit: MAX_JOBS_PER_MONTH (5) for the tradie ---
    if (!alreadyAccepted) {
      const isTradieProUser = tradieSubscriptionTier !== "free" || tradieProfile?.is_premium === true;

      if (!isTradieProUser) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { count: monthlyJobCount } = await supabase
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("tradie_id", quote.tradie_id)
          .in("status", ["accepted", "in_progress", "completed"])
          .gte("created_at", startOfMonth);

        if ((monthlyJobCount ?? 0) >= 5) {
          return errorJson(
            "This tradie has reached their free tier limit of 5 jobs per month. They need to upgrade to Pro to accept more jobs.",
            403,
          );
        }
      }
    }

    // Check for existing payment on this job
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, status")
      .eq("profile_id", user.id)
      .eq("job_id", quote.job_id)
      .eq("payment_type", "job_funding")
      .maybeSingle();

    if (existingPayment?.status === "completed") {
      return errorJson("Payment has already been completed for this job", 409);
    }

    // Delete stale pending payment so we can create a fresh checkout session
    if (existingPayment?.status === "pending") {
      await supabase
        .from("payments")
        .delete()
        .eq("id", existingPayment.id);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    // Get user profile for Stripe customer info
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    // Check for existing Stripe customer
    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    }

    // Convert dollars to cents — charge/fees use the amount collected now (chargeDollars).
    const baseAmountCents = Math.round(chargeDollars * 100);
    const tradieIsGstRegistered = tradieProfile?.is_gst_registered === true;
    const gst = tradieIsGstRegistered ? calculateGstCents(baseAmountCents) : 0;

    // Pricing v2.1: commission on the tradie's LABOUR only; materials pass through
    // with card processing deducted at cost. The client is charged the quoted price
    // and nothing else — the old 2% "Secure Processing Fee" surcharge is gone
    // (spec §0A: "no platform fee, no surcharge — clients never pay us anything").
    // resolveChargeFee also applies the repeat-client rate (server-side lookup) and
    // any per-profile override, and pro-rates the split to the amount actually
    // collected so a deposit can never be charged commission on uncollected money.
    const fee = await resolveChargeFee(supabase, {
      amountCents: baseAmountCents,
      labourCents: quote.labour_cents,
      materialsCents: quote.materials_cents,
      tier: tradieSubscriptionTier,
      overrideBps: tradieProfile?.platform_fee_override_bps ?? null,
      tradieId: quote.tradie_id,
      clientId: job.client_id,
      jobId: quote.job_id,
    });

    // application_fee_amount is what the platform retains from the destination charge.
    const applicationFeeAmount = fee.applicationFeeAmount;

    // Capture pre-mutation state so the payment-record failure path can revert
    // both the chosen quote and any cascaded siblings cleanly. (Previously the
    // revert hard-coded 'pending', which would corrupt a v2 quote whose
    // original status was 'final_submitted'.)
    const originalQuoteStatus = quote.status as string;
    let cascadedSiblings: { id: string; previousStatus: string }[] = [];

    // Only accept the quote and assign the tradie if not already done
    if (!alreadyAccepted) {
      // Mark the call-out fee as credited (it was deducted from the charge above).
      const creditFee = quote.site_visit_fee_status === "paid" && Number(quote.call_out_fee_cents) > 0;
      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update(creditFee ? { status: "accepted", site_visit_fee_status: "credited" } : { status: "accepted" })
        .eq("id", quoteId);

      if (quoteUpdateError) {
        return errorJson("Failed to accept quote", 500);
      }

      // Update job: assign tradie and set status to accepted
      await supabase
        .from("jobs")
        .update({
          tradie_id: quote.tradie_id,
          status: "accepted",
          budget_amount: quotePriceDollars,
        })
        .eq("id", quote.job_id);

      // If this job belongs to an ongoing service, sync the assigned tradie and the
      // agreed per-visit rate so the service shows as assigned and future auto-invoices
      // bill at the accepted price. Resolve via the job back-link, falling back to the
      // recurring service's original_job_id (older jobs may lack the back-link).
      try {
        let recurringJobId = job.recurring_job_id as string | null;
        if (!recurringJobId) {
          const { data: rec } = await supabase
            .from("recurring_jobs")
            .select("id")
            .eq("original_job_id", quote.job_id)
            .maybeSingle();
          recurringJobId = (rec as { id?: string } | null)?.id ?? null;
        }
        if (recurringJobId) {
          await supabase
            .from("recurring_jobs")
            .update({
              agreed_price: quotePriceDollars,
              tradie_id: quote.tradie_id,
            })
            .eq("id", recurringJobId);
        }
      } catch {
        // Non-critical — don't fail the payment flow
      }

      // Notify tradie that their quote was accepted
      try {
        const clientName = (await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle())?.data?.full_name || "A client";
        const jobTitle = job.title || job.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, " ") || "a job";

        await supabase.from("notifications").insert({
          user_id: quote.tradie_id,
          type: "quote_accepted",
          title: "Quote Accepted!",
          message: `${clientName} accepted your $${quotePriceDollars.toFixed(2)} quote for ${jobTitle}.`,
          job_id: quote.job_id,
          metadata: { amount: quotePriceDollars, client_id: user.id },
          read: false,
        });
      } catch {
        // Non-critical — don't fail the payment flow
      }

      // Auto-rename the project so the client can identify it
      if (job.project_id) {
        try {
          const category = job.description.match(/^\[([^\]]+)\]/)?.[1] || "";
          const tradieName = tradieProfile?.full_name || "Tradie";
          const addressParts = (job.location_address || "").split(",").map((s: string) => s.trim());
          const suburb = addressParts.length >= 2
            ? addressParts[addressParts.length - 2]
            : addressParts[0] || "";
          const parts = [category, tradieName, suburb].filter(Boolean);
          const newTitle = parts.join(" — ");

          if (newTitle) {
            await supabase
              .from("projects")
              .update({ title: newTitle })
              .eq("id", job.project_id);
          }
        } catch {
          // Non-critical — don't fail the payment flow
        }
      }

      // Cascade-decline (state machine §5.1): on flow_version=2 jobs, when one
      // quote is accepted, every other non-terminal quote on the same job is
      // marked 'declined' and the affected tradies are notified. Capture the
      // sibling IDs + previous statuses so we can revert cleanly if the
      // payment-record insert below fails.
      if (job.flow_version === 2) {
        const { data: siblings } = await supabase
          .from("quotes")
          .select("id, tradie_id, status")
          .eq("job_id", quote.job_id)
          .neq("id", quoteId)
          .in("status", [
            "pending",
            "site_visit_scheduled",
            "site_visit_completed",
            "final_submitted",
          ]);

        if (siblings && siblings.length > 0) {
          cascadedSiblings = siblings.map((s) => ({
            id: s.id as string,
            previousStatus: s.status as string,
          }));
          const siblingIds = cascadedSiblings.map((s) => s.id);
          const { error: cascadeError } = await supabase
            .from("quotes")
            .update({ status: "declined" })
            .in("id", siblingIds);
          if (cascadeError) {
            console.warn("accept-and-pay: cascade-decline update failed", cascadeError);
            // Do not fail the acceptance — the cascade is a side effect.
          }

          // Notify the declined tradies — best effort
          try {
            const notifs = siblings.map((s) => ({
              user_id: s.tradie_id as string,
              type: "quote_declined_cascade",
              title: "Quote not selected",
              message: "Thanks for quoting — the client went with another tradie this time.",
              job_id: quote.job_id,
              metadata: { quote_id: s.id, reason: "cascade_decline" },
              read: false,
            }));
            await supabase.from("notifications").insert(notifs);
          } catch {
            // Non-critical
          }
        }
      }
    }

    // Create payment record
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        payment_type: "job_funding",
        job_id: quote.job_id,
        amount: baseAmountCents,
        // v2.1: no client processing surcharge is collected.
        processing_fee: 0,
        currency: "aud",
        status: "pending",
        // First-class v2.1 fee audit columns.
        ...fee.paymentColumns,
        metadata: {
          deposit_type: "escrow",
          flow: "destination",
          quote_id: quoteId,
          tradie_id: quote.tradie_id,
          tradie_name: tradieProfile?.full_name || null,
          tradie_stripe_account: tradieProfile.stripe_connect_account_id,
          job_description: job.description,
          gst: String(gst),
          // MUST stay a NUMBER — release-escrow reads this with a
          // `typeof === "number"` guard and would otherwise treat the fee as 0
          // and pay out the full amount undeducted.
          platform_fee: fee.breakdown.totalDeductionCents,
          commission: fee.breakdown.commissionCents,
          materials_processing: fee.breakdown.materialsProcessingCents,
          fee_rate_type: fee.breakdown.rateType,
          fee_model: "v2.1",
          tradie_tier: tradieSubscriptionTier,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert payment record:", insertError);
      // Only revert if we accepted the quote in this call. Use the captured
      // originalQuoteStatus rather than a hardcoded 'pending' so that v2 quotes
      // (whose original status was 'final_submitted') revert correctly.
      if (!alreadyAccepted) {
        await supabase
          .from("quotes")
          .update({ status: originalQuoteStatus })
          .eq("id", quoteId);
        await supabase
          .from("jobs")
          .update({ tradie_id: null, status: "pending", budget_amount: null })
          .eq("id", quote.job_id);
        // Revert cascaded siblings to their pre-cascade statuses (one per row;
        // statuses may differ, so we can't do a single bulk update).
        for (const sibling of cascadedSiblings) {
          try {
            await supabase
              .from("quotes")
              .update({ status: sibling.previousStatus })
              .eq("id", sibling.id);
          } catch (revertErr) {
            console.warn(
              `accept-and-pay: failed to revert cascaded sibling ${sibling.id} to ${sibling.previousStatus}`,
              revertErr,
            );
          }
        }
      }
      return errorJson("Failed to create payment record", 500);
    }

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `Job Deposit — ${(job.description || "").slice(0, 60)}`,
            description: "Secured with Stripe. Released to tradie when you approve the work.",
          },
          unit_amount: baseAmountCents,
        },
        quantity: 1,
      },
    ];

    if (gst > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "GST (10%)" },
          unit_amount: gst,
        },
        quantity: 1,
      });
    }

    // Pricing v2.1: no client-side processing surcharge. The client pays the
    // quoted price (plus GST where the tradie is registered) and nothing more.

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          capture_method: "automatic",
          transfer_data: {
            destination: tradieProfile.stripe_connect_account_id,
          },
          application_fee_amount: applicationFeeAmount,
          metadata: {
            payment_record_id: paymentRecord.id,
            flow: "destination",
            payment_type: "job_funding",
            job_id: quote.job_id,
            tradie_id: quote.tradie_id,
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user.id,
          payment_type: "job_funding",
          job_id: quote.job_id,
          quote_id: quoteId,
          payment_record_id: paymentRecord.id,
          base_amount: String(baseAmountCents),
          gst: String(gst),
          processing_fee: "0",
          tradie_tier: tradieSubscriptionTier,
          // Frozen v2.1 breakdown (includes platform_fee = total deduction, which
          // release-escrow and the webhook read).
          ...fee.metadata,
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    // Update payment record with checkout session ID
    await supabase
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", paymentRecord.id);

    return new Response(
      JSON.stringify({ url: session.url, paymentId: paymentRecord.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Error in accept-and-pay:", err);
    return errorJson("An internal error occurred", 500);
  }
});
