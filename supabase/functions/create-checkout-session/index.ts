import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.21.0";
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
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function errorResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const requiredEnvVars = ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
    for (const envVar of requiredEnvVars) {
      if (!Deno.env.get(envVar)) {
        return new Response(JSON.stringify({ error: `Missing required configuration: ${envVar}` }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return errorResponse(authError?.message || "Unauthorized", 401);
    }

    // Rate limit: 5 requests per minute per user
    const { allowed } = checkRateLimit(`${user.id}-create-checkout-session`, 5, 60000);
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
      return errorResponse("Invalid JSON body", 400);
    }

    const { priceId, successUrl, cancelUrl, idempotencyKey } = body as {
      priceId?: string;
      successUrl?: string;
      cancelUrl?: string;
      idempotencyKey?: string;
    };

    if (!priceId || !successUrl || !cancelUrl) {
      return errorResponse("Missing required parameters", 400);
    }

    if (!isValidRedirectUrl(successUrl) || !isValidRedirectUrl(cancelUrl)) {
      return errorResponse("Invalid redirect URL", 400);
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId: string | undefined;
    const { data: existingSubscription } = await adminClient
      .from("stripe_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (existingSubscription?.stripe_customer_id) {
      customerId = existingSubscription.stripe_customer_id;
    }

    // ── Free trial eligibility ────────────────────────────────────────────────
    // A 14-day free trial is offered to FIRST-TIME subscribers only. Anyone who
    // has ever held a real subscription (a genuine subscription id, past the
    // "not_started" placeholder) is not eligible again — this prevents a tradie
    // cancelling and re-subscribing on a fresh free trial each month.
    const TRIAL_DAYS = 14;
    const priorSubId = existingSubscription?.stripe_subscription_id ?? "";
    const hasSubscribedBefore =
      !!priorSubId &&
      !priorSubId.startsWith("none_") &&
      existingSubscription?.status !== "not_started";
    const trialEligible = !hasSubscribedBefore;

    // subscription_data carries the trial. payment_method_collection: "always"
    // forces the card to be captured up front so the plan auto-converts to paid
    // Pro when the trial ends (unless the tradie cancels first). Stripe also
    // fires `customer.subscription.trial_will_end` ~3 days out, which the webhook
    // turns into a reminder email — the compliant "no surprise charge" pattern.
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: { user_id: user.id },
    };
    if (trialEligible) {
      subscriptionData.trial_period_days = TRIAL_DAYS;
      subscriptionData.trial_settings = {
        end_behavior: { missing_payment_method: "cancel" },
      };
    }

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : profile?.email,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Always capture a card, even for a $0-today trial, so the trial can
        // auto-convert to paid Pro at the end of the trial period.
        payment_method_collection: "always",
        metadata: { user_id: user.id },
        subscription_data: subscriptionData,
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    return new Response(JSON.stringify({ url: session.url, trial: trialEligible, trialDays: TRIAL_DAYS }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
