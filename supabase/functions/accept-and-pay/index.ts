import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { PRICING_CONFIG, calculatePlatformFee, calculateProcessingFeeCents, resolveTradieTier, TradieTier } from "../_shared/pricing.ts";

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
    const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au";
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
      .select("id, job_id, tradie_id, firm_price, price_min, price_max, status")
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quote) {
      return errorJson("Quote not found", 404);
    }

    if (quote.status !== "pending" && quote.status !== "accepted") {
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
      .select("id, client_id, tradie_id, title, description, status, project_id, location_address")
      .eq("id", quote.job_id)
      .maybeSingle();

    if (jobError || !job) {
      return errorJson("Job not found", 404);
    }

    if (job.client_id !== user.id) {
      return errorJson("Only the client on this job can accept a quote", 403);
    }

    // --- Look up tradie subscription tier (used for free-tier limits + platform fee) ---
    const { data: tradieSubRecord } = await supabase
      .from("tradie_details")
      .select("subscription_tier")
      .eq("profile_id", quote.tradie_id)
      .maybeSingle();

    const tradieSubscriptionTier = resolveTradieTier(tradieSubRecord?.subscription_tier);

    // Also check profiles.is_premium as fallback (in case tradie_details is out of sync)
    const { data: tradiePremiumCheck } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", quote.tradie_id)
      .maybeSingle();

    // --- Free tier limit: MAX_JOBS_PER_MONTH (5) for the tradie ---
    if (!alreadyAccepted) {
      const isTradieProUser = tradieSubscriptionTier !== "free" || tradiePremiumCheck?.is_premium === true;

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

    // Convert dollars to cents
    const baseAmountCents = Math.round(quotePriceDollars * 100);
    const processingFee = calculateProcessingFeeCents(baseAmountCents);

    // Calculate platform fee based on tradie's subscription tier
    const platformFeeDollars = calculatePlatformFee(quotePriceDollars, tradieSubscriptionTier);
    const platformFeeCents = Math.round(platformFeeDollars * 100);

    // Get tradie name for metadata
    const { data: tradieProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", quote.tradie_id)
      .maybeSingle();

    // Only accept the quote and assign the tradie if not already done
    if (!alreadyAccepted) {
      const { error: quoteUpdateError } = await supabase
        .from("quotes")
        .update({ status: "accepted" })
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
    }

    // Create payment record
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        profile_id: user.id,
        payment_type: "job_funding",
        job_id: quote.job_id,
        amount: baseAmountCents,
        processing_fee: processingFee,
        currency: "aud",
        status: "pending",
        metadata: {
          deposit_type: "escrow",
          quote_id: quoteId,
          tradie_id: quote.tradie_id,
          tradie_name: tradieProfile?.full_name || null,
          job_description: job.description,
          platform_fee: platformFeeCents,
          tradie_tier: tradieSubscriptionTier,
        },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert payment record:", insertError);
      // Only revert if we accepted the quote in this call
      if (!alreadyAccepted) {
        await supabase
          .from("quotes")
          .update({ status: "pending" })
          .eq("id", quoteId);
        await supabase
          .from("jobs")
          .update({ tradie_id: null, status: "pending", budget_amount: null })
          .eq("id", quote.job_id);
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
            description: "Held in escrow. Released to tradie on job completion.",
          },
          unit_amount: baseAmountCents,
        },
        quantity: 1,
      },
    ];

    if (processingFee > 0) {
      lineItems.push({
        price_data: {
          currency: "aud",
          product_data: { name: "Secure Processing Fee (2%)" },
          unit_amount: processingFee,
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: lineItems,
        mode: "payment",
        payment_intent_data: {
          capture_method: "automatic",
          metadata: {
            payment_record_id: paymentRecord.id,
            escrow: "true",
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
          processing_fee: String(processingFee),
          platform_fee: String(platformFeeCents),
          tradie_tier: tradieSubscriptionTier,
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
