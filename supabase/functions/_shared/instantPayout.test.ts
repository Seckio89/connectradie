// Deno tests for the instant-payout quote.
//
//   deno test supabase/functions/_shared/instantPayout.test.ts
//
// The case that prompted this: a tradie with $3.50 cleared was offered an
// instant payout with a $2.00 fee — 57% — because eligibility only checked that
// the net was above zero.

// node:assert rather than jsr:@std/assert so this runs with no network access.
import { strictEqual as assertEquals } from "node:assert/strict";
import {
  availableAudCents,
  classifyInstantFailure,
  computeInstantPayout,
  instantFailureMessage,
  INSTANT_UNAVAILABLE_TTL_MS,
  isUnavailableFlagFresh,
  planReleasePayout,
  canFallBackToStandard,
} from "./instantPayout.ts";

// Standard free-tier config: pricing_tiers.instant_payout_bps / _min_cents.
const TIER = { feeBps: 150, feeMinCents: 200 };
const OK = { ...TIER, instantCapable: true, pendingCents: 0, escrowReserveCents: 0 };

Deno.test("refuses the 57% deal that was being offered", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 350 });
  assertEquals(q.eligible, false);
  assertEquals(q.reason, "below_minimum");
  assertEquals(q.minBaseCents, 2000);
  assertEquals(q.payoutBaseCents, 350);
});

Deno.test("offers exactly at the floor, where the fee is 10%", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 2000 });
  assertEquals(q.eligible, true);
  assertEquals(q.reason, null);
  assertEquals(q.feeCents, 200);
  assertEquals(q.netCents, 1800);
});

Deno.test("one cent below the floor is not offered", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 1999 });
  assertEquals(q.eligible, false);
  assertEquals(q.reason, "below_minimum");
});

Deno.test("charges the percentage once it clears the minimum fee", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 100_000 });
  assertEquals(q.feeCents, 1500); // 1.5%
  assertEquals(q.netCents, 98_500);
  assertEquals(q.eligible, true);
});

Deno.test("the minimum fee applies until 1.5% overtakes it", () => {
  // $133.33 × 1.5% = $2.00. Below that the flat minimum wins.
  assertEquals(computeInstantPayout({ ...OK, availableCents: 13_000 }).feeCents, 200);
  assertEquals(computeInstantPayout({ ...OK, availableCents: 14_000 }).feeCents, 210);
});

Deno.test("escrow is subtracted before anything else", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 50_000, escrowReserveCents: 40_000 });
  assertEquals(q.payoutBaseCents, 10_000);
  assertEquals(q.feeCents, 200); // 1.5% of $100 = $1.50, floor applies
  assertEquals(q.netCents, 9_800);
});

Deno.test("a balance entirely held in escrow says so", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 9_000, escrowReserveCents: 9_000 });
  assertEquals(q.eligible, false);
  assertEquals(q.reason, "escrow_held");
  assertEquals(q.payoutBaseCents, 0);
});

Deno.test("escrow larger than the balance never produces a negative base", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 1_000, escrowReserveCents: 9_000 });
  assertEquals(q.payoutBaseCents, 0);
  assertEquals(q.feeCents, 0);
  assertEquals(q.netCents, 0);
});

Deno.test("distinguishes funds still clearing from no funds at all", () => {
  assertEquals(computeInstantPayout({ ...OK, availableCents: 0, pendingCents: 5_000 }).reason, "funds_pending");
  assertEquals(computeInstantPayout({ ...OK, availableCents: 0 }).reason, "no_funds");
});

Deno.test("no instant-capable account outranks every other reason", () => {
  const q = computeInstantPayout({ ...OK, availableCents: 100_000, instantCapable: false });
  assertEquals(q.eligible, false);
  assertEquals(q.reason, "no_instant_method");
});

Deno.test("a tier with no minimum fee still refuses a payout the fee would consume", () => {
  const q = computeInstantPayout({
    feeBps: 10_000,
    feeMinCents: 0,
    instantCapable: true,
    availableCents: 500,
    pendingCents: 0,
    escrowReserveCents: 0,
  });
  assertEquals(q.reason, "below_fee");
  assertEquals(q.eligible, false);
});

// ── Failure classification ───────────────────────────────────────────────────
// The reported production failure: "daily volume limit of $0.00 aud ... across
// your connected accounts" — a platform entitlement, not this tradie's problem.

Deno.test("treats the platform volume limit as platform-wide", () => {
  assertEquals(classifyInstantFailure("instant_payouts_limit_exceeded"), "platform");
  assertEquals(classifyInstantFailure("instant_payouts_config_disabled"), "platform");
  assertEquals(classifyInstantFailure("instant_payouts_currency_disabled"), "platform");
});

Deno.test("treats an ineligible card as this account only", () => {
  assertEquals(classifyInstantFailure("instant_payouts_unsupported"), "account");
});

Deno.test("does not guess at unrecognised failures", () => {
  assertEquals(classifyInstantFailure("balance_insufficient"), "unknown");
  assertEquals(classifyInstantFailure(null), "unknown");
  assertEquals(classifyInstantFailure(undefined), "unknown");
});

Deno.test("never sends the tradie to Stripe support, and says nothing was charged", () => {
  for (const scope of ["platform", "account", "unknown"] as const) {
    const msg = instantFailureMessage(scope);
    assertEquals(msg.includes("stripe.com"), false);
    assertEquals(msg.toLowerCase().includes("charged"), true);
  }
});

// ── Suppression window ───────────────────────────────────────────────────────
// The flag MUST expire: Stripe's limits reset daily and can be raised at any
// time, so a permanent flag would keep the feature off until someone deployed.

Deno.test("suppresses the offer while a recent failure is on record", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  assertEquals(isUnavailableFlagFresh("2026-07-27T11:00:00Z", now), true);
  assertEquals(isUnavailableFlagFresh(new Date(now - INSTANT_UNAVAILABLE_TTL_MS + 1000).toISOString(), now), true);
});

Deno.test("re-probes once the record goes stale", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  assertEquals(isUnavailableFlagFresh(new Date(now - INSTANT_UNAVAILABLE_TTL_MS - 1000).toISOString(), now), false);
  assertEquals(isUnavailableFlagFresh("2026-07-25T12:00:00Z", now), false);
});

Deno.test("a missing or unparseable timestamp never suppresses the offer", () => {
  const now = Date.parse("2026-07-27T12:00:00Z");
  assertEquals(isUnavailableFlagFresh(undefined, now), false);
  assertEquals(isUnavailableFlagFresh(null, now), false);
  assertEquals(isUnavailableFlagFresh("not a date", now), false);
  assertEquals(isUnavailableFlagFresh(12345, now), false);
});

// ── planReleasePayout ────────────────────────────────────────────────────────
// release-escrow and auto-release-payments share one idempotency key and MUST
// agree on method and amount, so this has to be a pure function of stable
// inputs — never of the live balance.

const REL = { feeBps: 150, feeMinCents: 200, platformInstantDown: false };

Deno.test("standard preference pays the full amount, no fee, plain key", () => {
  const p = planReleasePayout({ ...REL, preference: "standard", amountCents: 50_000 });
  assertEquals(p.method, "standard");
  assertEquals(p.payoutCents, 50_000);
  assertEquals(p.feeCents, 0);
  assertEquals(p.idempotencySuffix, "");
  assertEquals(p.declineReason, "not_requested");
});

Deno.test("'ask' stays standard — an unattended release has nobody to ask", () => {
  const p = planReleasePayout({ ...REL, preference: "ask", amountCents: 50_000 });
  assertEquals(p.method, "standard");
  assertEquals(p.declineReason, "not_requested");
});

Deno.test("a missing preference stays standard", () => {
  assertEquals(planReleasePayout({ ...REL, preference: null, amountCents: 50_000 }).method, "standard");
  assertEquals(planReleasePayout({ ...REL, preference: undefined, amountCents: 50_000 }).method, "standard");
});

Deno.test("instant reduces the request by exactly the fee", () => {
  // Stripe takes the fee from the balance, so the request must leave room.
  const p = planReleasePayout({ ...REL, preference: "instant", amountCents: 50_000 });
  assertEquals(p.method, "instant");
  assertEquals(p.feeCents, 750); // 1.5%
  assertEquals(p.payoutCents, 49_250);
  assertEquals(p.payoutCents + p.feeCents, 50_000);
  assertEquals(p.idempotencySuffix, ":instant");
  assertEquals(p.declineReason, null);
});

Deno.test("instant honours the $20 floor", () => {
  assertEquals(planReleasePayout({ ...REL, preference: "instant", amountCents: 1_999 }).method, "standard");
  assertEquals(planReleasePayout({ ...REL, preference: "instant", amountCents: 1_999 }).declineReason, "below_minimum");
  assertEquals(planReleasePayout({ ...REL, preference: "instant", amountCents: 2_000 }).method, "instant");
});

Deno.test("a known platform outage keeps the release standard", () => {
  const p = planReleasePayout({ ...REL, preference: "instant", amountCents: 50_000, platformInstantDown: true });
  assertEquals(p.method, "standard");
  assertEquals(p.payoutCents, 50_000);
  assertEquals(p.declineReason, "platform_down");
});

Deno.test("a declined instant always pays the FULL amount, never a reduced one", () => {
  // A tradie must never be short-changed by a fee that was not charged.
  for (const input of [
    { preference: "standard", amountCents: 50_000, platformInstantDown: false },
    { preference: "instant", amountCents: 1_000, platformInstantDown: false },
    { preference: "instant", amountCents: 50_000, platformInstantDown: true },
  ]) {
    const p = planReleasePayout({ feeBps: 150, feeMinCents: 200, ...input });
    assertEquals(p.method, "standard");
    assertEquals(p.payoutCents, input.amountCents);
    assertEquals(p.feeCents, 0);
  }
});

Deno.test("the two idempotency suffixes never collide", () => {
  const std = planReleasePayout({ ...REL, preference: "standard", amountCents: 50_000 });
  const ins = planReleasePayout({ ...REL, preference: "instant", amountCents: 50_000 });
  assertEquals(std.idempotencySuffix === ins.idempotencySuffix, false);
});

// ── canFallBackToStandard ────────────────────────────────────────────────────
// Falling back after a network error could pay the tradie twice.

Deno.test("falls back on a deterministic Stripe rejection", () => {
  assertEquals(canFallBackToStandard({ raw: { code: "instant_payouts_limit_exceeded" } }), true);
  assertEquals(canFallBackToStandard({ code: "instant_payouts_unsupported" }), true);
  assertEquals(canFallBackToStandard({ raw: { type: "invalid_request_error" } }), true);
});

Deno.test("never falls back on a network or unknown error", () => {
  assertEquals(canFallBackToStandard(new Error("socket hang up")), false);
  assertEquals(canFallBackToStandard({ type: "api_connection_error" }), false);
  assertEquals(canFallBackToStandard({ raw: { type: "api_error" } }), false);
  assertEquals(canFallBackToStandard(null), false);
  assertEquals(canFallBackToStandard(undefined), false);
});

// ── availableAudCents ────────────────────────────────────────────────────────
// The release pre-flight: a wrong extraction here either skips a payable payout
// forever or fires blindly — the exact behaviour the guard exists to stop.

Deno.test("sums only the AUD buckets", () => {
  assertEquals(
    availableAudCents({
      available: [
        { currency: "aud", amount: 5000 },
        { currency: "usd", amount: 9999 },
        { currency: "aud", amount: 1250 },
      ],
    }),
    6250,
  );
});

Deno.test("no AUD bucket, empty or missing available all read as $0", () => {
  assertEquals(availableAudCents({ available: [{ currency: "usd", amount: 9999 }] }), 0);
  assertEquals(availableAudCents({ available: [] }), 0);
  assertEquals(availableAudCents({}), 0);
  assertEquals(availableAudCents(null), 0);
  assertEquals(availableAudCents(undefined), 0);
});

Deno.test("a malformed bucket cannot poison the sum", () => {
  assertEquals(
    availableAudCents({
      available: [
        { currency: "aud", amount: 5000 },
        { currency: "aud" }, // no amount
        null,
        { currency: "aud", amount: Number.NaN },
      ],
    }),
    5000,
  );
});
