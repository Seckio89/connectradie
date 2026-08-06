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
  message: string | null | undefined,
  nowIso: string,
  options?: PayoutFailureOptions,
): PaymentMetadata {
  return { ...(metadata ?? {}), ...payoutFailureFields(metadata, message, nowIso, options) };
}

export interface PayoutFailureOptions {
  /**
   * Whether this failure should advance `payout_attempts` — and therefore the
   * idempotency key the next attempt uses (releasePayoutIdempotencyKey).
   *
   * MUST be false for AMBIGUOUS failures: a network drop or timeout may mean
   * Stripe actually CREATED the payout and only the response was lost. Retrying
   * under a new key would then create a second payout and pay the tradie twice.
   * Keeping the counter — and so the key — lets Stripe's replay resolve it: if
   * the payout exists the replay returns it and the release completes; if the
   * request never executed the retry is effectively fresh.
   *
   * True (the default) is correct only for DETERMINISTIC rejections — Stripe
   * received the request and refused it, creating nothing — which are exactly
   * the responses Stripe caches for 24h and that wedge a fixed key.
   * canFallBackToStandard in instantPayout.ts is the discriminator.
   *
   * Caught in review before it shipped: the first version of this module
   * counted every failure, which would have traded the 24h wedge for a
   * double payout on ambiguous errors.
   */
  countAttempt?: boolean;
}

/**
 * Just the four failure keys, for callers that assemble the metadata object
 * inline rather than transforming a whole one — release-escrow builds its
 * update with a conditional spread and would otherwise re-spread the metadata
 * twice.
 *
 * `payout_attempts` MUST be derived from the metadata as it was READ, not from
 * an already-cleared copy: the counter is what advances the idempotency key
 * (see releasePayoutIdempotencyKey), so losing it would pin the key and
 * reinstate the 24h-cached-failure wedge this exists to break.
 */
export function payoutFailureFields(
  metadata: PaymentMetadata | null | undefined,
  message: string | null | undefined,
  nowIso: string,
  options?: PayoutFailureOptions,
): PaymentMetadata {
  const prior = Number((metadata ?? {}).payout_attempts);
  const priorCount = Number.isFinite(prior) && prior > 0 ? Math.floor(prior) : 0;
  const countAttempt = options?.countAttempt ?? true;
  return {
    payout_pending: true,
    // Stored as given. release-escrow's payoutError is `string | null` and a
    // null there is honest — it means no message was captured — so it is not
    // dressed up as one. The timestamp still advances either way; the COUNTER
    // only advances for deterministic rejections (see PayoutFailureOptions),
    // because the counter is what moves the idempotency key.
    payout_last_error: message ?? null,
    payout_last_attempt_at: nowIso,
    payout_attempts: countAttempt ? priorCount + 1 : priorCount,
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
