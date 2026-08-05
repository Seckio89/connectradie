// Recording WHY a payout failed, on the payment row itself.
//
// release-escrow already stamps `payout_pending` and `payout_last_error` when a
// payout throws, and leaves the row 'completed' so the cron retries.
// auto-release-payments — the thing doing the retrying — did not. It appended
// the reason to an in-memory `errors[]` array returned in an HTTP response
// nobody reads, wrote a console line, and moved on.
//
// The cost of that is not theoretical. Two live payments sat unpaid from
// 4 August while the cron retried every six hours, roughly a dozen times, and
// the rows still showed the ORIGINAL error from release-escrow — written once,
// by a different function, on the first attempt. Whether the cron was failing,
// succeeding, or never selecting those rows at all was indistinguishable from
// the database. Money silently not reaching a tradie was invisible until
// someone thought to ask.
//
// So a stored error needs two things it did not have: WHEN it was last tried,
// and HOW MANY times. An error with no timestamp cannot be told apart from a
// stale one, which is exactly the ambiguity that made the live case unreadable.
//
// Pure functions over a metadata object — no Supabase client — so they can be
// tested without the Deno/Supabase runtime. Same reason selectFundingPayment.ts
// was extracted.

export type PaymentMetadata = Record<string, unknown>;

/** The keys this module owns. Everything else on the row is left untouched. */
const FAILURE_KEYS = [
  "payout_pending",
  "payout_last_error",
  "payout_last_attempt_at",
  "payout_attempts",
] as const;

/**
 * Metadata for a payout attempt that failed.
 *
 * `payout_attempts` counts attempts that FAILED, not attempts made — a payout
 * that succeeds clears the key entirely. So a row reading 12 means twelve
 * consecutive failures, which is the number worth alerting on.
 *
 * Anything non-numeric already sitting in `payout_attempts` restarts at 1
 * rather than propagating NaN: a corrupt counter should not make the count
 * unreadable forever after.
 */
export function markPayoutFailed(
  metadata: PaymentMetadata | null | undefined,
  message: string,
  nowIso: string,
): PaymentMetadata {
  const existing = metadata ?? {};
  const prior = Number(existing.payout_attempts);

  return {
    ...existing,
    payout_pending: true,
    payout_last_error: message,
    payout_last_attempt_at: nowIso,
    payout_attempts: Number.isFinite(prior) && prior > 0 ? prior + 1 : 1,
  };
}

/**
 * Metadata with every trace of a past failure removed.
 *
 * Must be applied on the SUCCESS path. The success writes spread the existing
 * metadata, so without this a payment that failed and later succeeded ends up
 * `status: 'released'` still carrying `payout_pending: true` — and nothing ever
 * clears it, because payout-reconciliation only counts pending on rows still at
 * status 'completed'. A permanently wrong row that no sweep can see.
 */
export function clearPayoutFailure(
  metadata: PaymentMetadata | null | undefined,
): PaymentMetadata {
  const next = { ...(metadata ?? {}) };
  for (const key of FAILURE_KEYS) delete next[key];
  return next;
}
