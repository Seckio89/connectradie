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
