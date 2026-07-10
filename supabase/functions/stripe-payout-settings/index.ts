import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.21.0";
import { checkRateLimit } from "../_shared/rateLimiter.ts";

/*
  stripe-payout-settings — tradie self-service for their Stripe Connect payout
  setup, so they don't have to open the Stripe dashboard:
    • action "update-bank"     → Stripe Account Link (type: account_update),
                                  the hosted form to change bank details.
    • action "update-schedule" → set settings.payouts.schedule (manual vs
                                  automatic daily/weekly).
  All Stripe calls run server-side with the secret key.
*/

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function errorResponse(message: string, status: number) {
  return json({ error: message }, status);
}

interface Body {
  action?: "update-bank" | "update-schedule";
  refreshUrl?: string;
  returnUrl?: string;
  interval?: "manual" | "daily" | "weekly";
  weeklyAnchor?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

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
    if (!authHeader?.startsWith("Bearer ")) return errorResponse("Missing Authorization header", 401);
    const token = authHeader.slice(7);

    const authClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return errorResponse(authError?.message || "Unauthorized", 401);

    const { allowed } = checkRateLimit(`${user.id}-stripe-payout-settings`, 10, 60000);
    if (!allowed) return errorResponse("Rate limit exceeded. Please try again later.", 429);

    const { data: profile } = await authClient
      .from("profiles")
      .select("stripe_connect_account_id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.role !== "tradie") {
      return errorResponse("Only tradies can manage payout settings", 403);
    }
    const accountId = profile.stripe_connect_account_id;
    if (!accountId) return errorResponse("No connected payout account. Complete payout setup first.", 400);

    const body = (await req.json().catch(() => ({}))) as Body;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    if (body.action === "update-bank") {
      // Custom accounts: a focused hosted "account_update" form. Express accounts
      // reject that link type ("Valid types are [account_onboarding]"), so fall
      // back to the Express dashboard, which is where those tradies manage their
      // bank details. Either way the tradie stays out of raw Stripe setup.
      try {
        const accountLink = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: body.refreshUrl || "https://connectradie.com/settings?tab=payments&bank=refresh",
          return_url: body.returnUrl || "https://connectradie.com/settings?tab=payments&bank=updated",
          type: "account_update",
        });
        return json({ url: accountLink.url, via: "account_link" });
      } catch (linkErr) {
        try {
          const login = await stripe.accounts.createLoginLink(accountId);
          return json({ url: login.url, via: "dashboard" });
        } catch {
          throw linkErr; // surface the original error if the fallback also fails
        }
      }
    }

    if (body.action === "update-schedule") {
      // Payout schedule MUST stay 'manual'. It is the escrow mechanism: destination
      // charges land job/invoice funds in the tradie's Stripe balance immediately,
      // and manual payouts let the platform control WHEN money reaches the bank (per
      // job when the client approves, per recurring invoice via the payout crons).
      // Automatic daily/weekly payouts would auto-pay escrowed funds before the
      // client approves the work, breaking the hold — so we only accept 'manual'.
      if (body.interval !== "manual") {
        return errorResponse(
          "Payouts are managed by ConnecTradie — your money is released to your bank per job (when the client approves) and per recurring invoice, so the payout schedule stays on manual. Switching to automatic daily/weekly payouts isn't available.",
          400,
        );
      }

      const updated = await stripe.accounts.update(accountId, {
        settings: { payouts: { schedule: { interval: "manual" } } },
      });
      const s = updated.settings?.payouts?.schedule;
      return json({
        ok: true,
        payoutSchedule: s
          ? { interval: s.interval, weeklyAnchor: s.weekly_anchor ?? null, delayDays: s.delay_days ?? null }
          : null,
      });
    }

    return errorResponse("Unknown action", 400);
  } catch (err) {
    console.error("stripe-payout-settings error:", err);
    // Surface Stripe's message (e.g. "manual payouts required for this account")
    // so the UI can explain why a schedule change was rejected.
    const message = err instanceof Error ? err.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
