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

import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { clearPayoutFailure, markPayoutFailed } from "./payoutFailure.ts";

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
