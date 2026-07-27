// Deno tests for split-release arithmetic.
//
//   deno test supabase/functions/_shared/disputeSplit.test.ts
//
// The property that matters: the two legs of a split must never together exceed
// what the client actually paid, and the tradie's payout must never exceed the
// balance Stripe will have left them after its own proportional reversal. Both
// failures move real money, and neither is visible by reading the code.
//
// These drive the REAL computeSplit rather than restating its arithmetic, so a
// regression in the production path fails here instead of being mirrored.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { computeSplit, SplitAmountError } from "./disputeSplit.ts";

/** A $500 job, 10% platform fee, GST-registered, with card processing. */
const JOB = {
  amountCents: 50_000,
  gstCents: 5_000,
  processingFeeCents: 1_100,
  platformFeeCents: 5_000,
  commissionCents: 5_000,
  materialsProcessingCents: 0,
};

Deno.test("half-and-half splits the tradie's balance in half", () => {
  const r = computeSplit({ ...JOB, refundCents: 28_050 }); // exactly C/2
  assertEquals(r.chargeTotalCents, 56_100);
  assertEquals(r.applicationFeeCents, 6_100);
  // tradie balance = 56100 - 6100 = 50000; half of it
  assertEquals(r.tradiePayoutCents, 25_000);
  assertEquals(r.retainedCommissionCents, 2_500);
});

Deno.test("the tradie's payout never exceeds the balance Stripe leaves", () => {
  // Sweep every refund amount; the invariant must hold at every point, not just
  // at the tidy ones.
  const C = JOB.amountCents + JOB.gstCents + JOB.processingFeeCents;
  const balance = C - (JOB.platformFeeCents + JOB.processingFeeCents);
  for (let refund = 1; refund < C; refund += 137) {
    const r = computeSplit({ ...JOB, refundCents: refund });
    const stripeReversal = Math.floor((balance * refund) / C); // Stripe's own share
    assert(
      r.tradiePayoutCents <= balance - stripeReversal + 1,
      `payout ${r.tradiePayoutCents} exceeds remaining balance at refund ${refund}`,
    );
    assert(r.tradiePayoutCents >= 0, `negative payout at refund ${refund}`);
  }
});

Deno.test("client refund + tradie payout never exceed what was charged", () => {
  const C = JOB.amountCents + JOB.gstCents + JOB.processingFeeCents;
  for (let refund = 1; refund < C; refund += 97) {
    const r = computeSplit({ ...JOB, refundCents: refund });
    assert(
      r.refundCents + r.tradiePayoutCents <= C,
      `over-disbursed at refund ${refund}`,
    );
  }
});

Deno.test("rounds DOWN, so a payout is never a cent too large", () => {
  // 3333 total, fee 1000 → balance 2333. Refund 1 → kept 3332.
  // exact = 2333 * 3332 / 3333 = 2332.30…  → must be 2332, not 2333.
  const r = computeSplit({
    amountCents: 3_333, gstCents: 0, processingFeeCents: 0,
    platformFeeCents: 1_000, refundCents: 1,
  });
  assertEquals(r.tradiePayoutCents, 2_332);
});

Deno.test("a one-cent split to the client is valid", () => {
  const r = computeSplit({ ...JOB, refundCents: 1 });
  assertEquals(r.refundCents, 1);
  assert(r.tradiePayoutCents > 0);
  assert(r.releasedFraction < 1);
});

Deno.test("a one-cent split to the tradie is valid", () => {
  const C = JOB.amountCents + JOB.gstCents + JOB.processingFeeCents;
  const r = computeSplit({ ...JOB, refundCents: C - 1 });
  assert(r.tradiePayoutCents >= 0);
  assert(r.releasedFraction > 0);
});

Deno.test("commission scales to the released portion only", () => {
  // Refund 90% → the platform should keep ~10% of the commission, not all of it.
  const C = 56_100;
  const r = computeSplit({ ...JOB, refundCents: Math.floor(C * 0.9) });
  assert(
    r.retainedCommissionCents < JOB.commissionCents * 0.11,
    `kept too much commission: ${r.retainedCommissionCents}`,
  );
});

Deno.test("a non-GST job still balances", () => {
  const r = computeSplit({
    amountCents: 20_000, gstCents: 0, processingFeeCents: 400,
    platformFeeCents: 2_000, refundCents: 10_000,
  });
  assertEquals(r.chargeTotalCents, 20_400);
  assertEquals(r.applicationFeeCents, 2_400);
  assert(r.refundCents + r.tradiePayoutCents <= r.chargeTotalCents);
});

Deno.test("refusals: zero, whole, negative, non-integer, corrupt fees", () => {
  assertThrows(() => computeSplit({ ...JOB, refundCents: 0 }), SplitAmountError);
  assertThrows(() => computeSplit({ ...JOB, refundCents: 56_100 }), SplitAmountError);
  assertThrows(() => computeSplit({ ...JOB, refundCents: 99_999 }), SplitAmountError);
  assertThrows(() => computeSplit({ ...JOB, refundCents: -5 }), SplitAmountError);
  assertThrows(() => computeSplit({ ...JOB, refundCents: 10.5 }), SplitAmountError);
  // fees larger than the charge would mean a negative payment to the tradie
  assertThrows(
    () => computeSplit({
      amountCents: 1_000, gstCents: 0, processingFeeCents: 0,
      platformFeeCents: 9_000, refundCents: 100,
    }),
    SplitAmountError,
  );
});
