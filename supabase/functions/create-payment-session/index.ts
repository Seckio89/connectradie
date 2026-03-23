import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { calculateProcessingFeeCents } from "../_shared/pricing.ts";
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(
  key: string, maxRequests: number, windowMs: number,
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  if (entry.count >= maxRequests) return { allowed: false, remaining: 0 };
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com.au",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRICES: Record<string, { amount: number; label: string }> = {
  lead_unlock: { amount: 1500, label: "Lead Unlock - Contact Details" },
  job_access: { amount: 299, label: "Job Access Fee" },
};

function isAllowedRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const allowedOrigins = [new URL(supabaseUrl).origin];
    const siteUrl = Deno.env.get("SITE_URL");
    if (siteUrl) allowedOrigins.push(new URL(siteUrl).origin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return allowedOrigins.some((o) => parsed.origin === o) || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function errorJson(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorJson("Method not allowed", 405);
  }

  try {
    const requiredEnvVars = ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        return new Response(JSON.stringify({ error: `Missing required configuration: ${envVar}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorJson("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return errorJson(authError?.message || "Unauthorized", 401);
    }

    // Rate limit: 5 requests per minute per user
    const { allowed } = checkRateLimit(`${user.id}-create-payment-session`, 5, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Remaining": "0" },
        },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorJson("Invalid JSON body", 400);
    }

    const { paymentType, jobId, successUrl, cancelUrl, idempotencyKey } = body as {
      paymentType?: string;
      jobId?: string;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    };

    if (!paymentType || !jobId || !successUrl || !cancelUrl) {
      return errorJson("Missing required parameters", 400);
    }

    if (!isAllowedRedirectUrl(successUrl) || !isAllowedRedirectUrl(cancelUrl)) {
      return errorJson("Invalid redirect URL", 400);
    }

    const priceConfig = PRICES[paymentType];
    if (!priceConfig) {
      return errorJson("Invalid payment type", 400);
    }

    // --- Free tier limit: MAX_LEAD_UNLOCKS_PER_MONTH (3) ---
    if (paymentType === "lead_unlock") {
      const { data: userSub } = await supabase
        .from("tradie_details")
        .select("subscription_tier")
        .eq("profile_id", user.id)
        .maybeSingle();

      // Also check profiles.is_premium as fallback (in case tradie_details is out of sync)
      const { data: userPremiumCheck } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();

      const isProUser =
        userSub?.subscription_tier === "pro" ||
        userSub?.subscription_tier === "pro_plus" ||
        userSub?.subscription_tier === "business" ||
        userPremiumCheck?.is_premium === true;

      if (!isProUser) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        const { count: monthlyUnlocks } = await supabase
          .from("job_unlocks")
          .select("*", { count: "exact", head: true })
          .eq("tradie_id", user.id)
          .gte("created_at", startOfMonth);

        if ((monthlyUnlocks ?? 0) >= 3) {
          return errorJson(
            "You've reached your free tier limit of 3 lead unlocks per month. Upgrade to Pro for unlimited unlocks.",
            403,
          );
        }
      }
    }

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("profile_id", user.id)
      .eq("job_id", jobId)
      .eq("payment_type", paymentType)
      .eq("status", "completed")
      .maybeSingle();

    if (existingPayment) {
      return errorJson("Payment already completed for this item", 409);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined;
    const { data: existingSub } = await supabase
      .from("stripe_subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existingSub?.stripe_customer_id) {
      customerId = existingSub.stripe_customer_id;
    }

    const baseAmount = priceConfig.amount;
    const processingFee = calculateProcessingFeeCents(baseAmount);

    const { data: paymentRecord, error: insertError } = await supabase.from("payments").insert({
      profile_id: user.id,
      payment_type: paymentType,
      job_id: jobId,
      amount: baseAmount,
      processing_fee: processingFee,
      currency: "aud",
      status: "pending",
    }).select("id").single();

    if (insertError) {
      console.error("Failed to insert payment record:", insertError);
      return errorJson("Failed to create payment record", 500);
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "aud",
          product_data: { name: priceConfig.label },
          unit_amount: baseAmount,
        },
        quantity: 1,
      },
    ];

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

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: lineItems,
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          user_id: user.id,
          payment_type: paymentType,
          job_id: jobId,
          base_amount: String(baseAmount),
          processing_fee: String(processingFee),
        },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    await supabase.from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", paymentRecord.id);

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error creating payment session:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorJson(message, 500);
  }
});
