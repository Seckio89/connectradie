// ─────────────────────────────────────────────────────────────────────────────
// Shared "has the client already released this payment?" predicate.
//
// This deliberately answers "is the CLIENT'S action done?", NOT "has the money
// finished moving". Those are different questions and conflating them is what
// caused clients to be nagged forever to release a job they had already released:
//
//   • transfer_id / payout_id / released_at → funds have actually moved.
//   • release_approved_at / client_approved_at (+ payout_pending) → the client
//     approved, but the Stripe payout is still settling (a destination charge
//     isn't available in the tradie's Connect balance until it clears). The
//     payout-reconciliation cron completes it later — the client must not be
//     asked again in the meantime.
//
// Every surface that decides whether to show a "Release & Review" prompt (the
// dashboard's attention panel, job badges, the sidebar dot) MUST use this, or
// they drift apart and one of them keeps nagging.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleasablePayment {
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function isReleaseActioned(payment: ReleasablePayment): boolean {
  const meta = payment.metadata ?? null;
  return (
    payment.status === 'released' ||
    !!meta?.transfer_id ||
    !!meta?.payout_id ||
    !!meta?.released_at ||
    !!meta?.release_approved_at ||
    !!meta?.client_approved_at ||
    !!meta?.payout_pending
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Destination-charge helpers.
//
// A destination charge routes the client's money into the TRADIE'S Connect
// balance at charge time, so it is simultaneously "held in escrow" and sitting
// in their Stripe balance. Anything that reads both sources has to know which
// rows those are, or it double-counts them.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two writers, two key names, one meaning. accept-and-pay / pay-price-increase
 * stamp `metadata.flow`; invoice-contact / public-quote / the BECS + recurring
 * invoice paths stamp `metadata.routing`. auto-release-payments already treats
 * them as equivalent — everything else must too, or off-app funded jobs get
 * misread as legacy custodial escrow and counted twice.
 */
export function isDestinationRouted(payment: ReleasablePayment): boolean {
  const meta = payment.metadata ?? null;
  return meta?.flow === 'destination' || meta?.routing === 'destination';
}

export interface CreditedPayment extends ReleasablePayment {
  amount?: number | null;
}

/**
 * What a destination charge actually put in the tradie's Connect balance.
 *
 * `payments.amount` is the GST-EXCLUSIVE base, but Stripe credits
 * `base + gst - application_fee`. Treating the gross amount as the balance
 * credit over-states escrow by the platform fee on every held job.
 *
 * `gst` is stored as a string by accept-and-pay and as a number by
 * pay-price-increase, so both are parsed. When either field is missing or
 * unparseable we fall back to the gross amount: callers use this to RESERVE
 * money, and over-reserving is the safe direction.
 */
export function creditedToBalanceCents(payment: CreditedPayment): number {
  const gross = payment.amount ?? 0;
  const meta = payment.metadata ?? null;
  if (!meta) return gross;

  const fee = meta.platform_fee;
  const feeCents = typeof fee === 'number' ? fee : Number.NaN;
  if (!Number.isFinite(feeCents)) return gross;

  const gstRaw = meta.gst;
  const gstCents =
    typeof gstRaw === 'number' ? gstRaw : typeof gstRaw === 'string' ? Number(gstRaw) : Number.NaN;
  if (!Number.isFinite(gstCents)) return gross;

  return Math.max(0, gross + gstCents - feeCents);
}
