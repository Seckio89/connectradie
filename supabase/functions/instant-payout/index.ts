import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import Stripe from "npm:stripe@14.21.0";
import { sumEscrowReserveCents } from "../_shared/escrowReserve.ts";
import type { EscrowRow } from "../_shared/escrowReserve.ts";
import { computeInstantPayout } from "../_shared/instantPayout.ts";

/*
  instant-payout — opt-in Stripe Instant Payout of the tradie's AVAILABLE
  Connect balance to their eligible debit card, minus the platform's instant
  fee (pricing_tiers.instant_payout_bps, min instant_payout_min_cents).

  Standard payouts stay free and default — this only ever runs when the tradie
  explicitly asks (per-payout button or "always instant" preference).

  Actions (POST { action }):
    status  -> { eligible, reason, instantAvailable, feeCents, netCents, minBaseCents,
                 cardLast4, feeBps, feeMinCents }
              instantAvailable is the CLEARED balance less escrow; it is only
              offered once it reaches minBaseCents, so the flat minimum fee can
              never dominate the payout.
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

    // ── Balance: cleared (available) vs still settling (pending) ──────────────
    // Instant payouts run against AVAILABLE (cleared) funds. `instant_available`
    // can transiently reflect funds that are still pending for standard payouts, so
    // gating on it produced a button that then failed at payout time with an
    // "insufficient funds" Stripe error. Gate on the real AVAILABLE balance instead.
    const balance = await stripe.balance.retrieve({ stripeAccount: acct });
    const audAmount = (arr?: { amount: number; currency: string }[]) =>
      arr?.find((b) => b.currency === "aud")?.amount ?? 0;
    const availableCents = audAmount((balance as { available?: { amount: number; currency: string }[] }).available);
    const pendingCents = audAmount((balance as { pending?: { amount: number; currency: string }[] }).pending);
    const instantAvailableCents = audAmount((balance as { instant_available?: { amount: number; currency: string }[] }).instant_available);

    // ── Escrow reserve (CRITICAL) ────────────────────────────────────────────
    // See _shared/escrowReserve.ts for why this number exists at all.
    //
    // TWO anchor queries, because payment rows anchor differently depending on
    // who paid. accept-and-pay and pay-price-increase stamp metadata.tradie_id;
    // public-quote and invoice-contact serve off-app clients who have no profile
    // at all, so those rows carry NO tradie_id and route via metadata.routing
    // instead of metadata.flow. The old single metadata-anchored, flow-only
    // query matched neither condition, so a job funded through a public quote
    // left the client's escrow completely unreserved — and therefore offered up
    // as instantly payable balance. The job-anchored query is what catches them;
    // the metadata-anchored one is kept so nothing previously reserved is lost.
    //
    // Status: only "completed" is ever written to payments.status for held
    // escrow — the previous ["completed","funded","paid"] list also carried a
    // jobs status and a recurring_invoices status, neither of which can match.
    const [jobAnchored, metaAnchored] = await Promise.all([
      supabase
        .from("payments")
        .select("id, amount, metadata, jobs!inner(tradie_id)")
        .eq("jobs.tradie_id", user.id)
        .eq("status", "completed"),
      supabase
        .from("payments")
        .select("id, amount, metadata")
        .eq("metadata->>tradie_id", user.id)
        .eq("status", "completed"),
    ]);
    // A failed reserve query must never read as "no escrow" — that would pay out
    // client funds. Refuse instead.
    if (jobAnchored.error || metaAnchored.error) {
      console.error("instant-payout escrow reserve query failed:", jobAnchored.error ?? metaAnchored.error);
      return json({ error: "Could not confirm your available balance. Please try again shortly." }, 503);
    }
    const escrowReserveCents = sumEscrowReserveCents([
      ...((jobAnchored.data ?? []) as EscrowRow[]),
      ...((metaAnchored.data ?? []) as EscrowRow[]),
    ]);

    // Resolve the external account the instant payout lands on. In AU an
    // instant-capable BANK account is valid (real-time payouts) — a debit card is
    // NOT required. Pick the AUD account that is default-for-currency and lists
    // "instant" in available_payout_methods; else the first instant-capable one.
    // Targeting it explicitly avoids defaulting to a non-instant external account.
    let destinationId: string | null = null;
    let destinationLabel: string | null = null;
    let cardLast4: string | null = null;
    let instantCapable = false;
    try {
      const [cards, banks] = await Promise.all([
        stripe.accounts.listExternalAccounts(acct, { object: "card", limit: 20 }).catch(() => ({ data: [] as unknown[] })),
        stripe.accounts.listExternalAccounts(acct, { object: "bank_account", limit: 20 }).catch(() => ({ data: [] as unknown[] })),
      ]);
      type Ext = { id: string; object: string; last4?: string; bank_name?: string; currency?: string; default_for_currency?: boolean; available_payout_methods?: string[] };
      const all = [...(cards.data as Ext[]), ...(banks.data as Ext[])].filter((a) => (a.currency ?? "aud") === "aud");
      const instantOnes = all.filter((a) => a.available_payout_methods?.includes("instant"));
      const chosen = instantOnes.find((a) => a.default_for_currency) ?? instantOnes[0] ?? null;
      if (chosen) {
        instantCapable = true;
        destinationId = chosen.id;
        cardLast4 = chosen.object === "card" ? (chosen.last4 ?? null) : null;
        destinationLabel = chosen.object === "card"
          ? `card ••••${chosen.last4 ?? ""}`
          : `${chosen.bank_name ?? "bank"} ••••${chosen.last4 ?? ""}`;
      }
    } catch { /* leave instantCapable=false → not eligible */ }

    // The instant payout is drawn from cleared AVAILABLE funds, LESS anything
    // still held in escrow for jobs the homeowner hasn't released. See
    // _shared/instantPayout.ts for the fee floor and why it exists.
    const { payoutBaseCents, feeCents, netCents, minBaseCents, eligible, reason } = computeInstantPayout({
      availableCents,
      pendingCents,
      escrowReserveCents,
      feeBps,
      feeMinCents,
      instantCapable,
    });

    if (body.action === "status") {
      return json({
        eligible,
        reason,
        instantAvailable: payoutBaseCents, // amount offered for instant payout (cleared funds)
        availableCents,
        pendingCents,
        instantAvailableCents,
        escrowReserveCents,
        feeCents,
        netCents,
        minBaseCents,
        feeBps,
        feeMinCents,
        cardLast4,
        destinationLabel,
      });
    }

    if (body.action === "payout") {
      if (!eligible) {
        const msg =
          reason === "escrow_held"
            ? "Your available balance is held in escrow for jobs the client hasn't released yet. It becomes payable once the job is approved."
            : reason === "funds_pending"
            ? "Your funds are still clearing. Instant payout will be available once they land — usually the next business day."
            : reason === "no_instant_method"
            ? "This payout account can't receive instant payouts. Add an instant-eligible debit card or bank account in Bank Settings."
            : reason === "below_minimum"
            ? `Instant payout is available from $${(minBaseCents / 100).toFixed(2)}. Below that the $${(feeMinCents / 100).toFixed(2)} minimum fee takes too much of it — your balance is on its way free of charge.`
            : reason === "below_fee"
            ? "Your available balance is too small to cover the instant payout fee."
            : "You have no available funds to pay out right now.";
        return json({ error: msg, reason }, 400);
      }

      // Pay out the NET amount instantly to the instant-capable external account.
      // The fee remainder stays in the Stripe balance and follows the normal (free)
      // payout schedule — the tradie is never short-changed; the disclosed net is
      // exactly what arrives now.
      const payout = await stripe.payouts.create(
        {
          amount: netCents,
          currency: "aud",
          method: "instant",
          ...(destinationId ? { destination: destinationId } : {}),
          metadata: {
            tradie_id: user.id,
            instant_fee_cents: String(feeCents),
            fee_bps: String(feeBps),
          },
        },
        {
          stripeAccount: acct,
          // Idempotency guards the concurrent-request race (two taps before the
          // first settles): both would see instant_available > 0 and could each
          // create a payout. A per-user+amount+minute key makes Stripe return the
          // first payout instead of paying twice. (Retry-after-success is already
          // blocked separately — the balance drops to 0 and eligibility fails.)
          idempotencyKey: `instant-payout:${user.id}:${netCents}:${Math.floor(Date.now() / 60000)}`,
        },
      );

      // Notify: money on its way in minutes.
      const dollars = (netCents / 100).toFixed(2);
      try {
        await supabase.from("notifications").insert({
          user_id: user.id,
          type: "payout_sent",
          title: "Instant payout sent",
          message: `💰 $${dollars} sent to your ${destinationLabel ?? "account"} — should arrive within minutes.`,
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
        destinationLabel,
        status: payout.status,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("instant-payout error:", err);
    // Surface the real Stripe reason (insufficient funds, method not supported,
    // etc.) instead of a generic message — Stripe error messages are written to be
    // shown to the account holder, and hiding them made this impossible to debug.
    const stripeMsg =
      (err as { raw?: { message?: string } })?.raw?.message ??
      (err instanceof Error ? err.message : null);
    return json({ error: stripeMsg || "Could not process the payout. Please try again." }, 500);
  }
});
