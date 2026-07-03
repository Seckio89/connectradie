import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    let supabaseUrl: string, supabaseServiceKey: string, stripeSecretKey: string;
    try {
      supabaseUrl = requireEnv("SUPABASE_URL");
      supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      stripeSecretKey = requireEnv("STRIPE_SECRET_KEY");
    } catch (e) {
      console.error(e);
      return errorResponse("Server configuration error", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing Authorization header", 401);
    }

    const token = authHeader.slice(7);

    const authClient = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth failed:", authError?.message, "| token prefix:", token.slice(0, 20), "| supabaseUrl:", supabaseUrl);
      return errorResponse(authError?.message || "Unauthorized", 401);
    }

    const { allowed } = checkRateLimit(`${user.id}-stripe-connect-account`, 15, 60000);
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await authClient
      .from("profiles")
      .select("stripe_connect_account_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "tradie") {
      return errorResponse("Only tradies can view payout details", 403);
    }

    const accountId = profile.stripe_connect_account_id;

    if (!accountId) {
      return new Response(
        JSON.stringify({ connected: false }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const [account, balance, payouts, externalAccounts] = await Promise.all([
      stripe.accounts.retrieve(accountId),
      stripe.balance.retrieve({ stripeAccount: accountId }),
      stripe.payouts.list({ stripeAccount: accountId, limit: 20 }),
      stripe.accounts
        .listExternalAccounts(accountId, { object: "bank_account", limit: 1 })
        .catch(() => null),
    ]);

    // Sync onboarding status from Stripe → DB (covers cases where webhook is delayed/missing)
    const onboardingComplete = !!(account.charges_enabled && account.payouts_enabled);
    const detailsSubmitted = !!account.details_submitted;
    if (onboardingComplete || detailsSubmitted) {
      await authClient
        .from("profiles")
        .update({ stripe_connect_onboarding_complete: onboardingComplete || detailsSubmitted })
        .eq("id", user.id);
    }

    let dashboardUrl: string | null = null;
    try {
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      dashboardUrl = loginLink.url;
    } catch {
      // Login link fails if account is not fully onboarded
    }

    const audAvailable = balance.available
      .filter((b) => b.currency === "aud")
      .reduce((sum, b) => sum + b.amount, 0);

    const audPending = balance.pending
      .filter((b) => b.currency === "aud")
      .reduce((sum, b) => sum + b.amount, 0);

    // Default external bank account (masked) for in-app display.
    const bank = externalAccounts?.data?.[0] as Stripe.BankAccount | undefined;
    const bankAccount = bank
      ? {
          last4: bank.last4 ?? null,
          bankName: bank.bank_name ?? null,
          currency: bank.currency ?? null,
          routingNumber: bank.routing_number ?? null,
        }
      : null;

    // Payout schedule (manual vs automatic + interval) for in-app display/toggle.
    const sched = account.settings?.payouts?.schedule;
    const payoutSchedule = sched
      ? {
          interval: sched.interval, // 'manual' | 'daily' | 'weekly' | 'monthly'
          weeklyAnchor: sched.weekly_anchor ?? null,
          monthlyAnchor: sched.monthly_anchor ?? null,
          delayDays: sched.delay_days ?? null,
        }
      : null;

    return new Response(
      JSON.stringify({
        connected: true,
        account: {
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements: {
            currentlyDue: account.requirements?.currently_due || [],
            pastDue: account.requirements?.past_due || [],
          },
        },
        bankAccount,
        payoutSchedule,
        balance: {
          available: audAvailable,
          pending: audPending,
        },
        payouts: payouts.data.map((p) => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          arrival_date: p.arrival_date,
          created: p.created,
        })),
        dashboardUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error fetching Connect account details:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
