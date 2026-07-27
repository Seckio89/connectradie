// Deno tests for the instant-payout quote.
//
//   deno test supabase/functions/_shared/instantPayout.test.ts
//
// The case that prompted this: a tradie with $3.50 cleared was offered an
// instant payout with a $2.00 fee — 57% — because eligibility only checked that
// the net was above zero.

// node:assert rather than jsr:@std/assert so this runs with no network access.
import { strictEqual as assertEquals } from "node:assert/strict";
import { computeInstantPayout } from "./instantPayout.ts";

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
