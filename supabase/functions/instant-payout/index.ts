import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14.21.0";

/*
  instant-payout — opt-in Stripe Instant Payout of the tradie's AVAILABLE
  Connect balance to their eligible debit card, minus the platform's instant
  fee (pricing_tiers.instant_payout_bps, min instant_payout_min_cents).

  Standard payouts stay free and default — this only ever runs when the tradie
  explicitly asks (per-payout button or "always instant" preference).

  Actions (POST { action }):
    status  -> { eligible, instantAvailable, feeCents, netCents, cardLast4, feeBps, feeMinCents }
    payout  -> executes the instant payout of the full instant-available balance
    preference { value } -> saves tradie_details.payout_speed_preference

  Deploy WITH gateway JWT (caller = the logged-in tradie):
    supabase functions deploy instant-payout
*/

const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    let body: { action?: string; value?: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    if (body.action === "preference") {
      const value = body.value;
      if (value !== "standard" && value !== "instant" && value !== "ask") {
        return json({ error: "Invalid preference" }, 400);
      }
      const { error } = await supabase
        .from("tradie_details")
        .update({ payout_speed_preference: value })
        .eq("profile_id", user.id);
      if (error) return json({ error: "Could not save your preference" }, 500);
      return json({ ok: true, preference: value });
    }

    // status / payout both need the connect account + fee config.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_account_id, stripe_connect_onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.stripe_connect_account_id || !profile.stripe_connect_onboarding_complete) {
      return json({ eligible: false, reason: "no_connect_account" });
    }
    const acct = profile.stripe_connect_account_id as string;
    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Fee config from the tradie's charged tier (falls back to free-tier row).
    const { data: sub } = await supabase
      .from("tradie_subscriptions")
      .select("tier_id, status, grace_until")
      .eq("profile_id", user.id)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let tierId = "free";
    if (sub && (sub.tier_id === "pro" || sub.tier_id === "pm")) {
      if (sub.status === "active") tierId = sub.tier_id;
      else if (sub.status === "past_due" && sub.grace_until && new Date(sub.grace_until) > new Date()) tierId = sub.tier_id;
    }
    const { data: tier } = await supabase
      .from("pricing_tiers")
      .select("instant_payout_bps, instant_payout_min_cents")
      .eq("id", tierId)
      .maybeSingle();
    const feeBps = tier?.instant_payout_bps ?? 150;
    const feeMinCents = tier?.instant_payout_min_cents ?? 200;

    // Instant eligibility + amount come straight from Stripe: balance.instant_available
    // exists only when the account has an instant-eligible debit card.
    const balance = await stripe.balance.retrieve({ stripeAccount: acct });
    const instantAvailable = (balance as unknown as { instant_available?: { amount: number; currency: string }[] })
      .instant_available?.find((b) => b.currency === "aud")?.amount ?? 0;
    const eligible = instantAvailable > 0;

    // The debit card the payout would land on (for the ••••1234 disclosure).
    let cardLast4: string | null = null;
    try {
      const ext = await stripe.accounts.listExternalAccounts(acct, { object: "card", limit: 1 });
      cardLast4 = (ext.data[0] as { last4?: string } | undefined)?.last4 ?? null;
    } catch { /* bank-only account */ }

    const feeCents = eligible ? Math.max(feeMinCents, Math.round(instantAvailable * feeBps / 10000)) : 0;
    const netCents = Math.max(0, instantAvailable - feeCents);

    if (body.action === "status") {
      return json({
        eligible,
        reason: eligible ? null : (cardLast4 ? "no_instant_balance" : "no_debit_card"),
        instantAvailable,
        feeCents,
        netCents,
        feeBps,
        feeMinCents,
        cardLast4,
      });
    }

    if (body.action === "payout") {
      if (!eligible) {
        return json({
          error: cardLast4
            ? "No funds are available for instant payout right now."
            : "Instant payouts require a Visa or Mastercard debit card. Add one in your bank settings to enable instant payouts.",
        }, 400);
      }
      if (netCents <= 0) return json({ error: "Balance is too small to cover the instant payout fee." }, 400);

      // Pay out the NET amount instantly. The fee remainder stays in the Stripe
      // balance and follows the normal (free) payout schedule — the tradie is
      // never short-changed; the disclosed net is exactly what arrives now.
      const payout = await stripe.payouts.create(
        {
          amount: netCents,
          currency: "aud",
          method: "instant",
          metadata: {
            tradie_id: user.id,
            instant_fee_cents: String(feeCents),
            fee_bps: String(feeBps),
          },
        },
        { stripeAccount: acct },
      );

      // Notify: money on its way in minutes.
      const dollars = (netCents / 100).toFixed(2);
      try {
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "payout_sent",
          title: "Instant payout sent",
          message: `💰 $${dollars} sent to your card${cardLast4 ? ` ending ••••${cardLast4}` : ""} — should arrive within minutes.`,
          read: false,
          metadata: { payout_id: payout.id, amount_cents: netCents, fee_cents: feeCents, instant: true },
        });
      } catch { /* non-critical */ }

      return json({
        ok: true,
        payoutId: payout.id,
        amountCents: netCents,
        feeCents,
        cardLast4,
        status: payout.status,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("instant-payout error:", err);
    const msg = err instanceof Error ? err.message : "Internal error";
    // Stripe's instant-payout rejections (e.g. card not eligible) are user-actionable.
    return json({ error: msg.includes("instant") ? msg : "Could not process the payout. Please try again." }, 500);
  }
});
