// ---------------------------------------------------------------------------
// Split-release arithmetic.
//
// Pure and dependency-free ON PURPOSE: this is the part of a partial release
// that is easy to get subtly wrong and impossible to check by reading, so it
// lives away from the Stripe calls where a test can drive it directly.
// `disputeSplit.test.ts` is the check.
//
// ── The model ──────────────────────────────────────────────────────────────
// These are Stripe DESTINATION charges. At payment time the client is charged
//
//     C = base + GST + processing_fee
//
// and Stripe immediately splits it: the platform keeps an application fee
//
//     appFee = platform_fee + processing_fee
//
// and the remainder lands in the TRADIE's connected balance
//
//     tradieBalance = C - appFee = base + GST - platform_fee
//
// (which is exactly `transferAmount + totalGst` in release-escrow:246).
//
// A partial refund of R with `reverse_transfer` + `refund_application_fee`
// makes Stripe reverse BOTH sides PROPORTIONALLY — it pulls R·(C-appFee)/C back
// out of the tradie's balance and returns R·appFee/C of the platform's fee. So
// the platform keeps commission on the released portion only, without us
// computing a single fee ourselves. What is left for the tradie is
//
//     payout = (C - appFee) · (C - R) / C
//
// ── Why floor, not round ───────────────────────────────────────────────────
// Stripe does its own rounding on the reversal, and we cannot see the result
// before deciding the payout. Rounding UP by a cent risks
// `balance_insufficient`, which fails the payout AFTER the client has already
// been refunded — the worst place to fail. Rounding down can strand at most one
// cent in the tradie's balance, where it stays theirs and joins the next
// payout. Cheap failure beats expensive failure.
// ---------------------------------------------------------------------------

export interface SplitInput {
  /** payments.amount — the base, in cents. */
  amountCents: number;
  /** metadata.gst, in cents. 0 when not GST-registered. */
  gstCents: number;
  /** payments.processing_fee, in cents. */
  processingFeeCents: number;
  /** metadata.platform_fee — total the platform retained, in cents. */
  platformFeeCents: number;
  /** What the client gets back, in cents. Must be > 0 and < the charge total. */
  refundCents: number;
  /** metadata.commission, in cents. Used to scale the fee-ledger entry. */
  commissionCents?: number;
  /** metadata.materials_processing, in cents. */
  materialsProcessingCents?: number;
}

export interface SplitResult {
  /** C — what the client actually paid, and the ceiling on a refund. */
  chargeTotalCents: number;
  /** What Stripe took as the application fee at payment time. */
  applicationFeeCents: number;
  /** What the client is refunded. Echoed back for the metadata record. */
  refundCents: number;
  /** What to pay out to the tradie's bank, after Stripe's proportional reversal. */
  tradiePayoutCents: number;
  /** (C - R) / C — the share of the job the tradie is keeping. */
  releasedFraction: number;
  /** Commission the platform keeps, scaled to the released portion. */
  retainedCommissionCents: number;
  /** Materials processing kept, scaled the same way. */
  retainedMaterialsProcessingCents: number;
}

export class SplitAmountError extends Error {}

/**
 * Work out both legs of a split.
 *
 * Throws `SplitAmountError` rather than returning a partial result: every
 * caller is about to move real money, so an unusable answer must not be
 * something you can forget to check.
 */
export function computeSplit(input: SplitInput): SplitResult {
  const {
    amountCents,
    gstCents,
    processingFeeCents,
    platformFeeCents,
    refundCents,
    commissionCents = 0,
    materialsProcessingCents = 0,
  } = input;

  for (const [name, v] of Object.entries({
    amountCents, gstCents, processingFeeCents, platformFeeCents, refundCents,
  })) {
    if (!Number.isInteger(v)) {
      throw new SplitAmountError(`${name} must be an integer number of cents, got ${v}`);
    }
    if (v < 0) throw new SplitAmountError(`${name} cannot be negative`);
  }

  const chargeTotalCents = amountCents + gstCents + processingFeeCents;
  const applicationFeeCents = platformFeeCents + processingFeeCents;

  if (chargeTotalCents <= 0) {
    throw new SplitAmountError("This payment has no charge total to split");
  }
  if (applicationFeeCents > chargeTotalCents) {
    // Would imply the tradie received a negative amount at payment time. Refuse
    // rather than compute a nonsense payout from corrupt fee metadata.
    throw new SplitAmountError("Recorded fees exceed the charge total");
  }
  if (refundCents <= 0) {
    throw new SplitAmountError("A split must return something to the client");
  }
  if (refundCents >= chargeTotalCents) {
    throw new SplitAmountError(
      "That is the whole payment, not a split — use a full refund instead",
    );
  }

  const tradieBalanceCents = chargeTotalCents - applicationFeeCents;
  const keptCents = chargeTotalCents - refundCents;

  // floor — see the note at the top of this file.
  const tradiePayoutCents = Math.floor((tradieBalanceCents * keptCents) / chargeTotalCents);
  const releasedFraction = keptCents / chargeTotalCents;

  return {
    chargeTotalCents,
    applicationFeeCents,
    refundCents,
    tradiePayoutCents,
    releasedFraction,
    retainedCommissionCents: Math.floor((commissionCents * keptCents) / chargeTotalCents),
    retainedMaterialsProcessingCents: Math.floor(
      (materialsProcessingCents * keptCents) / chargeTotalCents,
    ),
  };
}
