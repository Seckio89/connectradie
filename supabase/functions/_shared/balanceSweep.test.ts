// Deno tests for the Connect balance sweep decision.
//
//   npx deno@2 test --allow-env --allow-net --allow-read supabase/functions/_shared/balanceSweep.test.ts
//
// This is the number that decides how much of a tradie's Connect balance we are
// willing to send to their bank unattended, so the cases that matter are the
// ones where the balance is NOT all theirs: held client escrow, and an
// unsettled refund.

import { strictEqual as assertEquals } from "node:assert/strict";
import {
  audCents,
  MIN_SWEEP_CENTS,
  planBalanceSweep,
  SWEEP_TICK_MS,
  sweepIdempotencyKey,
} from "./balanceSweep.ts";

const aud = (amount: number) => ({ currency: "aud", amount });

Deno.test("sends the free balance when nothing is held", () => {
  const plan = planBalanceSweep({ balance: { available: [aud(2_019)] }, reserveCents: 0 });
  assertEquals(plan.send, true);
  assertEquals(plan.amountCents, 2_019);
  assertEquals(plan.reason, "ok");
});

Deno.test("never sends held client escrow", () => {
  // The live shape: $20.19 of call-out fee and residue sitting alongside a
  // $64.90 funded job the client has not approved yet.
  const plan = planBalanceSweep({
    balance: { available: [aud(8_509)] },
    reserveCents: 6_490,
  });
  assertEquals(plan.amountCents, 2_019);
});

Deno.test("sends nothing when the whole balance is escrow", () => {
  const plan = planBalanceSweep({ balance: { available: [aud(6_490)] }, reserveCents: 6_490 });
  assertEquals(plan.send, false);
  assertEquals(plan.amountCents, 0);
  assertEquals(plan.reason, "nothing_free");
});

Deno.test("sends nothing when escrow exceeds the balance", () => {
  // Over-reserving is the safe direction and creditedToBalanceCents can do it
  // (missing fee metadata falls back to the gross amount). It must read as
  // "send nothing", never as a negative payout.
  const plan = planBalanceSweep({ balance: { available: [aud(1_000)] }, reserveCents: 7_000 });
  assertEquals(plan.send, false);
  assertEquals(plan.amountCents, 0);
});

Deno.test("holds back an unsettled refund so the account cannot go into debit", () => {
  // Stripe would pay out the full $50 available and let the -$10 land after.
  const plan = planBalanceSweep({
    balance: { available: [aud(5_000)], pending: [aud(-1_000)] },
    reserveCents: 0,
  });
  assertEquals(plan.amountCents, 4_000);
});

Deno.test("positive pending does not inflate the payout", () => {
  // Money still clearing is not payable; Stripe rejects a payout drawing on it.
  const plan = planBalanceSweep({
    balance: { available: [aud(2_019)], pending: [aud(9_999)] },
    reserveCents: 0,
  });
  assertEquals(plan.amountCents, 2_019);
});

Deno.test("skips residue below the minimum rather than churning a payout", () => {
  const plan = planBalanceSweep({ balance: { available: [aud(19)] }, reserveCents: 0 });
  assertEquals(plan.send, false);
  assertEquals(plan.reason, "below_minimum");
  // Still reported, so a residue that never clears stays visible in the log.
  assertEquals(plan.freeCents, 19);
});

Deno.test("the minimum is inclusive at the boundary", () => {
  assertEquals(planBalanceSweep({ balance: { available: [aud(MIN_SWEEP_CENTS)] }, reserveCents: 0 }).send, true);
  assertEquals(planBalanceSweep({ balance: { available: [aud(MIN_SWEEP_CENTS - 1)] }, reserveCents: 0 }).send, false);
});

Deno.test("ignores non-AUD buckets", () => {
  const plan = planBalanceSweep({
    balance: { available: [{ currency: "usd", amount: 50_000 }, aud(500)] },
    reserveCents: 0,
  });
  assertEquals(plan.amountCents, 500);
});

Deno.test("a missing or empty balance reads as nothing to send", () => {
  assertEquals(planBalanceSweep({ balance: null, reserveCents: 0 }).send, false);
  assertEquals(planBalanceSweep({ balance: {}, reserveCents: 0 }).send, false);
  assertEquals(audCents(undefined), 0);
  assertEquals(audCents([null]), 0);
});

// ── Idempotency ──────────────────────────────────────────────────────────────

Deno.test("two invocations in one tick collapse onto one payout", () => {
  const t = 1_000 * SWEEP_TICK_MS;
  assertEquals(
    sweepIdempotencyKey("acct_1", 2_019, t),
    sweepIdempotencyKey("acct_1", 2_019, t + SWEEP_TICK_MS - 1),
  );
});

Deno.test("the next tick is free to sweep again", () => {
  // The property that stops a transient failure wedging the sweep for 24h on
  // Stripe's cached response — the defect #243 fixed on release payouts.
  const t = 1_000 * SWEEP_TICK_MS;
  const a = sweepIdempotencyKey("acct_1", 2_019, t);
  const b = sweepIdempotencyKey("acct_1", 2_019, t + SWEEP_TICK_MS);
  assertEquals(a === b, false);
});

Deno.test("a changed balance within one tick is a different payout", () => {
  const t = 1_000 * SWEEP_TICK_MS;
  assertEquals(sweepIdempotencyKey("acct_1", 2_019, t) === sweepIdempotencyKey("acct_1", 3_000, t), false);
});

Deno.test("accounts never share a key", () => {
  const t = 1_000 * SWEEP_TICK_MS;
  assertEquals(sweepIdempotencyKey("acct_1", 2_019, t) === sweepIdempotencyKey("acct_2", 2_019, t), false);
});
