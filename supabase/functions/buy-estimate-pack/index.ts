import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import Stripe from "npm:stripe@14.21.0";

/*
  buy-estimate-pack — one-time Stripe Checkout for an "AI Estimate Pack"
  (20 bonus AI-estimate credits for $4.99, no subscription).

  The credits are NOT granted here — they're granted by the stripe-webhook on
  checkout.session.completed (metadata.type = 'estimate_pack'), so a pack only
  exists once payment actually succeeds. This function just mints the session.

  Deploy WITH gateway JWT (user-initiated, authenticated):
    supabase functions deploy buy-estimate-pack
*/

// Overridable via env so a price change doesn't require a redeploy — set
// ESTIMATE_PACK_CREDITS / ESTIMATE_PACK_AMOUNT_CENTS as function secrets.
// Defaults preserve the launch offer: 20 credits for $4.99.
const PACK_CREDITS = Number(Deno.env.get("ESTIMATE_PACK_CREDITS")) || 20;
const PACK_AMOUNT_CENTS = Number(Deno.env.get("ESTIMATE_PACK_AMOUNT_CENTS")) || 499;

// CORS allow-list — echo the caller's origin when it's prod or a localhost dev
// server, else fall back to prod. Matches the estimate-quote fleet pattern.
const ALLOWED_ORIGINS = [
  Deno.env.get("ALLOWED_ORIGIN") || "https://connectradie.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
];

function corsFor(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Supabase-Api-Version",
    "Vary": "Origin",
  };
}

function isValidRedirectUrl(url: string): boolean {
  try {
    const p = new URL(url);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!supabaseUrl || !serviceKey || !stripeSecretKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing Authorization" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    let body: { successUrl?: string; cancelUrl?: string };
    try { body = await req.json(); } catch { body = {}; }

    const origin = req.headers.get("Origin") || ALLOWED_ORIGINS[0];
    const successUrl = body.successUrl || `${origin}/clients?pack=success`;
    const cancelUrl = body.cancelUrl || `${origin}/clients?pack=cancelled`;
    if (!isValidRedirectUrl(successUrl) || !isValidRedirectUrl(cancelUrl)) {
      return json({ error: "Invalid redirect URL" }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .maybeSingle();

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2023-10-16" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: profile?.email ?? undefined,
      line_items: [{
        price_data: {
          currency: "aud",
          unit_amount: PACK_AMOUNT_CENTS,
          product_data: {
            name: "AI Estimate Pack",
            description: `${PACK_CREDITS} bonus AI job estimates — non-expiring, stacks on your monthly allowance.`,
          },
        },
        quantity: 1,
      }],
      // The webhook grants credits off this metadata. Mirror it onto the
      // payment_intent so the credit-granting handler works from either object.
      metadata: { type: "estimate_pack", profile_id: user.id, credits: String(PACK_CREDITS) },
      payment_intent_data: {
        metadata: { type: "estimate_pack", profile_id: user.id, credits: String(PACK_CREDITS) },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("buy-estimate-pack error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return json({ error: message }, 500);
  }
});
