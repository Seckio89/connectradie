// ─────────────────────────────────────────────────────────────────────────────
// What a tradie's Connect balance sweep may pay out.
//
// WHY A SWEEP EXISTS AT ALL
// Escrow in this system IS the manual payout schedule: every Express account is
// created with settings.payouts.schedule.interval = "manual"
// (stripe-connect-onboarding), and stripe-payout-settings refuses any other
// value. Stripe therefore NEVER moves a tradie's money to their bank on its own
// — every dollar that lands in a bank account does so because this codebase
// called stripe.payouts.create.
//
// Only the escrow release path does that, and only for
// payment_type = 'job_funding'. Anything else credited to the Connect balance
// by a destination charge had no owner and stayed there forever:
//
//   • site-visit call-out fees   (book-site-visit — routed straight to the
//                                 tradie, no payments row is even written)
//   • bonus payments             (create-bonus-payment, payment_type 'bonus' —
//                                 never selected by any release sweep, while
//                                 the webhook tells the tradie the funds are
//                                 "on the way to your payout account")
//   • residue                    (what a destination charge credited minus what
//                                 the release paid out)
//
// Found live: $20.00 of call-out fee plus $0.19 of residue sitting in a
// tradie's balance with no payout object against it, on a screen that said
// "Ready to pay out — cleared and waiting", offering no action that could move
// it. Standard payouts are free, so there was no reason for it to be there.
//
// The decision is a pure function so it can be tested without Stripe, and so
// the one number that matters — what we are willing to send — is readable in
// one place.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Below this, a sweep is churn: a payout object, a webhook, a ledger row and a
 * line on the tradie's statement for a few cents. Residue under the threshold
 * is logged by the caller rather than sent, so a balance that never clears is
 * still visible.
 */
export const MIN_SWEEP_CENTS = 100;

/** Length of one sweep cron tick, in ms. Anchors the idempotency key. */
export const SWEEP_TICK_MS = 6 * 60 * 60 * 1000;

/** The two buckets of Stripe's balance response this reads. */
export interface SweepBalanceLike {
  available?: Array<{ currency?: string; amount?: number } | null> | null;
  pending?: Array<{ currency?: string; amount?: number } | null> | null;
}

/** Sum one bucket's AUD entries, in cents. A missing bucket reads as $0. */
export function audCents(
  entries: Array<{ currency?: string; amount?: number } | null> | null | undefined,
): number {
  return (entries ?? [])
    .filter((b) => b?.currency === "aud")
    .reduce((s, b) => s + (Number(b?.amount) || 0), 0);
}

export interface SweepPlanInput {
  balance: SweepBalanceLike | null | undefined;
  /** Client escrow still held in this balance — fetchEscrowReserveCents. */
  reserveCents: number;
  minCents?: number;
}

export interface SweepPlan {
  /** Whether to create a payout. */
  send: boolean;
  /** What to pay out, in cents. 0 whenever send is false. */
  amountCents: number;
  /** Free balance before the minimum was applied — for the log line. */
  freeCents: number;
  availableCents: number;
  pendingCents: number;
  reason: "ok" | "nothing_free" | "below_minimum";
}

/**
 * How much of a Connect balance is the tradie's to take right now.
 *
 *   free = available − escrow reserve + any NEGATIVE pending
 *
 * Three deductions, each load-bearing:
 *
 * 1. The escrow reserve. Destination charges put the CLIENT'S money in the
 *    tradie's balance at charge time, where it looks exactly like earned money.
 *    Paying that out hands over funds before the work is approved, and a later
 *    refund then reverses against an empty balance and pushes the account
 *    negative. fetchEscrowReserveCents is the same number instant-payout uses
 *    to stop precisely that — this must never compute its own.
 *
 *    It also covers a release whose payout has FAILED: both release paths
 *    deliberately leave that row at status 'completed' with no payout_id, which
 *    is exactly the shape the reserve counts. So a sweep cannot take the funds
 *    a pending release is about to claim.
 *
 *    And it covers a dispute-split remainder awaiting its payout, which sits at
 *    status 'released' and so is invisible to the two 'completed' anchors — the
 *    reserve runs a third query for exactly that shape. Sweeping it would
 *    pre-empt a payout that already has its own idempotency key, and the split
 *    sweep in auto-release-payments would then find an empty balance and skip
 *    forever.
 *
 * 2. A negative pending balance — a refund or reversal that has not settled
 *    yet. Stripe will happily pay out the full available amount and let the
 *    negative land afterwards, leaving the tradie's account in debit. Netting
 *    it off here means we only ever send what survives settlement.
 *
 * 3. The minimum. See MIN_SWEEP_CENTS.
 */
export function planBalanceSweep(input: SweepPlanInput): SweepPlan {
  const { balance, reserveCents, minCents = MIN_SWEEP_CENTS } = input;

  const availableCents = audCents(balance?.available);
  const pendingCents = audCents(balance?.pending);

  // Only a NEGATIVE pending is netted off. Positive pending is money still
  // clearing — it is not payable yet and Stripe would reject a payout drawing
  // on it, so it must not inflate the amount either.
  const pendingDebit = Math.min(0, pendingCents);
  const freeCents = availableCents - Math.max(0, reserveCents) + pendingDebit;

  if (freeCents <= 0) {
    return { send: false, amountCents: 0, freeCents, availableCents, pendingCents, reason: "nothing_free" };
  }
  if (freeCents < minCents) {
    return { send: false, amountCents: 0, freeCents, availableCents, pendingCents, reason: "below_minimum" };
  }
  return { send: true, amountCents: freeCents, freeCents, availableCents, pendingCents, reason: "ok" };
}

/**
 * Idempotency key for a sweep payout.
 *
 * Scoped to (account, cron tick, amount) so two invocations inside one tick —
 * a cron fire racing a manual ops invoke — collapse onto ONE payout instead of
 * paying the balance out twice.
 *
 * Deliberately NOT a fixed per-account key. Stripe caches a response for an
 * idempotency key for 24 hours, INCLUDING a failure, and replays it without
 * touching the payment rails. A fixed key would therefore wedge the sweep for a
 * full day after any transient error, replaying the stored failure at every
 * tick — which is exactly the defect that kept two live payouts stuck for days
 * on `release_payout_<id>` (#243). The tick advances; the wedge cannot form.
 *
 * The amount is in the key for the same reason it is in instant-payout's: a
 * balance that CHANGED within one tick is a different payout, and replaying the
 * earlier key would silently send the earlier, smaller amount.
 */
export function sweepIdempotencyKey(
  accountId: string,
  amountCents: number,
  nowMs: number,
): string {
  return `sweep:${accountId}:${Math.floor(nowMs / SWEEP_TICK_MS)}:${amountCents}`;
}
