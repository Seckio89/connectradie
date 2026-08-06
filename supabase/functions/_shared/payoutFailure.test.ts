// Deno tests for recording a failed payout on the payment row.
//
//   deno test supabase/functions/_shared/payoutFailure.test.ts
//
// The bug these lock down is not a wrong number — it is an ABSENT one. A cron
// that retries a payout every six hours and records nothing leaves a row that
// reads identically whether it failed twelve times or was never selected. The
// pair of functions must therefore be exact inverses: anything mark adds, clear
// removes. A key that only one of them knows about is how a released payment
// ends up permanently flagged as pending.

import { deepStrictEqual, notStrictEqual, strictEqual } from "node:assert/strict";
import { clearPayoutFailure, markPayoutFailed, payoutFailureFields } from "./payoutFailure.ts";
import { releasePayoutIdempotencyKey } from "./instantPayout.ts";

const NOW = "2026-08-05T18:00:00.000Z";
const LATER = "2026-08-06T00:00:00.000Z";

Deno.test("first failure starts the counter at 1", () => {
  const out = markPayoutFailed({ flow: "destination" }, "balance_insufficient", NOW);

  strictEqual(out.payout_pending, true);
  strictEqual(out.payout_last_error, "balance_insufficient");
  strictEqual(out.payout_last_attempt_at, NOW);
  strictEqual(out.payout_attempts, 1);
  // Unrelated keys survive — this metadata carries the fee breakdown.
  strictEqual(out.flow, "destination");
});

Deno.test("a repeat failure increments rather than resetting", () => {
  const first = markPayoutFailed({}, "balance_insufficient", NOW);
  const second = markPayoutFailed(first, "balance_insufficient", LATER);

  strictEqual(second.payout_attempts, 2);
});

Deno.test("the message and timestamp are replaced, not accumulated", () => {
  const first = markPayoutFailed({}, "balance_insufficient", NOW);
  const second = markPayoutFailed(first, "account_deactivated", LATER);

  strictEqual(second.payout_last_error, "account_deactivated");
  strictEqual(second.payout_last_attempt_at, LATER);
});

Deno.test("a corrupt counter restarts at 1 instead of propagating NaN", () => {
  // A NaN here would render the count unreadable on every future attempt, which
  // is the failure mode this whole module exists to prevent.
  for (const junk of ["not-a-number", null, undefined, {}, -3, 0]) {
    const out = markPayoutFailed({ payout_attempts: junk }, "err", NOW);
    strictEqual(out.payout_attempts, 1, `payout_attempts was ${JSON.stringify(junk)}`);
  }
});

Deno.test("null or undefined metadata is treated as empty", () => {
  strictEqual(markPayoutFailed(null, "err", NOW).payout_attempts, 1);
  strictEqual(markPayoutFailed(undefined, "err", NOW).payout_pending, true);
  deepStrictEqual(clearPayoutFailure(null), {});
});

Deno.test("clear removes every failure key and keeps the rest", () => {
  const marked = markPayoutFailed(
    { flow: "destination", platform_fee: 19 },
    "balance_insufficient",
    NOW,
  );
  const cleared = clearPayoutFailure(marked);

  deepStrictEqual(cleared, { flow: "destination", platform_fee: 19 });
});

Deno.test("mark then clear round-trips to the original metadata", () => {
  // The regression that matters. This fails the moment markPayoutFailed grows a
  // key clearPayoutFailure does not know to delete — which is exactly how a
  // 'released' row keeps payout_pending: true forever, invisible to
  // payout-reconciliation because that only scans rows still at 'completed'.
  const original = {
    flow: "destination",
    platform_fee: 19,
    tradie_id: "cee4e052",
    gst: "0",
  };

  deepStrictEqual(
    clearPayoutFailure(markPayoutFailed(original, "balance_insufficient", NOW)),
    original,
  );
});

// ── The idempotency key ─────────────────────────────────────────────────────
// Two properties are in tension and BOTH must hold. Losing the first pays a
// tradie twice; losing the second wedges a payout behind Stripe's 24h cached
// failure, which is what stranded two live payments for days.

Deno.test("racing callers on the same row state compute the SAME key", () => {
  // release-escrow (homeowner clicks release) and auto-release-payments (cron)
  // can run at once. Identical keys are what stops two payouts for one payment.
  const row = { flow: "destination", payout_attempts: 3 };

  strictEqual(
    releasePayoutIdempotencyKey("pay_1", row),
    releasePayoutIdempotencyKey("pay_1", { ...row }),
  );
});

Deno.test("a retry after a recorded failure computes a DIFFERENT key", () => {
  // The fix. Same payment, one more recorded failure → a key Stripe has never
  // seen, so the request actually reaches it instead of replaying a cached error.
  const before = { flow: "destination" };
  const after = markPayoutFailed(before, "balance_insufficient", "2026-08-06T00:00:00.000Z");

  notStrictEqual(
    releasePayoutIdempotencyKey("pay_1", before),
    releasePayoutIdempotencyKey("pay_1", after),
  );
});

Deno.test("attempt 0 keeps the bare legacy key", () => {
  // A payment already in flight under the old scheme must keep the key it
  // started with, or this change orphans it mid-release.
  strictEqual(releasePayoutIdempotencyKey("pay_1", {}), "release_payout_pay_1");
  strictEqual(releasePayoutIdempotencyKey("pay_1", null), "release_payout_pay_1");
  strictEqual(
    releasePayoutIdempotencyKey("pay_1", { payout_attempts: 0 }),
    "release_payout_pay_1",
  );
});

Deno.test("the key advances monotonically and never repeats a used one", () => {
  const seen = new Set<string>();
  let meta: Record<string, unknown> = {};
  for (let i = 0; i < 6; i++) {
    const key = releasePayoutIdempotencyKey("pay_1", meta);
    strictEqual(seen.has(key), false, `key repeated on attempt ${i}: ${key}`);
    seen.add(key);
    meta = markPayoutFailed(meta, "balance_insufficient", `2026-08-0${i + 1}T00:00:00.000Z`);
  }
  strictEqual(seen.size, 6);
});

Deno.test("a junk counter cannot collapse two attempts onto one key", () => {
  // Number("abc") is NaN; if that reached the key it would render as the same
  // string every time and silently restore the wedge.
  const junk = releasePayoutIdempotencyKey("pay_1", { payout_attempts: "abc" });
  const next = releasePayoutIdempotencyKey(
    "pay_1",
    markPayoutFailed({ payout_attempts: "abc" }, "err", "2026-08-06T00:00:00.000Z"),
  );
  strictEqual(junk, "release_payout_pay_1");
  notStrictEqual(junk, next);
});

Deno.test("an AMBIGUOUS failure records the error but does NOT advance the key", () => {
  // The double-payout guard, caught in review. A timeout may mean Stripe
  // actually created the payout; a new key on the retry would create a second
  // one. The failure is still visible — message and timestamp update — but the
  // counter, and therefore the key, holds still so the retry REPLAYS.
  const before = markPayoutFailed({}, "balance_insufficient", "2026-08-06T00:00:00.000Z");
  strictEqual(before.payout_attempts, 1);

  const afterAmbiguous = markPayoutFailed(before, "connection reset", "2026-08-06T06:00:00.000Z", {
    countAttempt: false,
  });
  strictEqual(afterAmbiguous.payout_attempts, 1, "counter must not advance");
  strictEqual(afterAmbiguous.payout_last_error, "connection reset", "error still recorded");
  strictEqual(afterAmbiguous.payout_last_attempt_at, "2026-08-06T06:00:00.000Z");

  strictEqual(
    releasePayoutIdempotencyKey("pay_1", before),
    releasePayoutIdempotencyKey("pay_1", afterAmbiguous),
    "same key → Stripe replays the original outcome instead of paying twice",
  );
});

Deno.test("an ambiguous failure with no prior counter leaves the bare key", () => {
  // First-ever attempt times out: counter stays 0, key stays the legacy bare
  // form — the retry replays whatever that first request actually did.
  const after = markPayoutFailed({}, "timeout", "2026-08-06T00:00:00.000Z", {
    countAttempt: false,
  });
  strictEqual(after.payout_attempts, 0);
  strictEqual(releasePayoutIdempotencyKey("pay_1", after), "release_payout_pay_1");
});

Deno.test("deterministic after ambiguous advances exactly once", () => {
  // timeout (hold) → replayed 400 (advance): the sequence our two live
  // payments would follow. The key must move exactly one step.
  let meta = markPayoutFailed({}, "timeout", "2026-08-06T00:00:00.000Z", { countAttempt: false });
  const heldKey = releasePayoutIdempotencyKey("pay_1", meta);
  meta = markPayoutFailed(meta, "balance_insufficient", "2026-08-06T06:00:00.000Z");
  const movedKey = releasePayoutIdempotencyKey("pay_1", meta);

  strictEqual(heldKey, "release_payout_pay_1");
  strictEqual(movedKey, "release_payout_pay_1:r1");
});

Deno.test("payoutFailureFields carries the counter forward for release-escrow", () => {
  // release-escrow assembles its metadata inline. If it dropped the counter the
  // key would never advance on the client-initiated path.
  const fields = payoutFailureFields({ payout_attempts: 2 }, "err", "2026-08-06T00:00:00.000Z");
  strictEqual(fields.payout_attempts, 3);
  strictEqual(fields.payout_pending, true);
});

Deno.test("neither function mutates its input", () => {
  // The callers spread this metadata into an update payload while still holding
  // the original; in-place mutation would corrupt the row they compare against.
  const original: Record<string, unknown> = { flow: "destination" };

  markPayoutFailed(original, "err", NOW);
  deepStrictEqual(original, { flow: "destination" });

  const marked = markPayoutFailed(original, "err", NOW);
  clearPayoutFailure(marked);
  strictEqual(marked.payout_pending, true);
});
