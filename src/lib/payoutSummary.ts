// ─────────────────────────────────────────────────────────────────────────────
// Payout summary maths for the tradie Payouts card.
//
// The card reads as a breakdown — one headline followed by three rows — so the
// rows MUST add up to the headline. They didn't: a $70.40 account showed rows
// summing to $130.80 because the same money was counted in more than one place.
//
//   • "In your account" summed EVERY Stripe payout object regardless of status,
//     so a payout still in transit was reported as already received (and a
//     failed payout, whose funds bounce back into `available`, counted twice).
//   • The transit row hid the Connect balance entirely whenever a payout was in
//     flight, so that money appeared in the headline and in no row at all.
//   • Destination-charge escrow the client hasn't approved yet sits in the
//     Stripe balance AND in the escrow rows, so it landed in two rows at once.
//
// `earned` is DEFINED as the sum of the three rows here, so the headline can
// never drift from the breakdown again.
// ─────────────────────────────────────────────────────────────────────────────

import { creditedToBalanceCents, isDestinationRouted, isReleaseActioned } from './paymentRelease';

export interface PayoutSummaryPayout {
  amount: number;
  status: string;
  arrival_date: number;
}

/** An unreleased escrow payment row (payments.amount + metadata). */
export interface EscrowPayment {
  amount?: number | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PayoutSummaryInput {
  /** Stripe Connect balance, cents. */
  availableCents: number;
  pendingCents: number;
  /** Every payout object Stripe returned for the account. */
  payouts: PayoutSummaryPayout[];
  /** Unreleased escrow rows for this tradie (already filtered to "not released"). */
  escrow: EscrowPayment[];
  /** Off-platform invoice payments the tradie was paid directly, cents. */
  externalTotalCents: number;
  /** True when the account is on Stripe's manual payout schedule. */
  isManualSchedule: boolean;
}

export interface PayoutSummaryRow {
  amount: number;
  title: string;
  detail: string;
}

export interface PayoutSummary {
  /** Escrow still waiting on the client to approve. */
  awaitingClient: number;
  /** Money in motion: in-flight payouts + balance that isn't reserved escrow. */
  transit: PayoutSummaryRow;
  /** Money that has actually landed. */
  received: number;
  /** awaitingClient + transit.amount + received. */
  earned: number;
  /** Soonest arrival Stripe has committed to, unix seconds, or null. */
  inFlightArrival: number | null;
}

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatArrivalDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function buildPayoutSummary(input: PayoutSummaryInput): PayoutSummary {
  const { availableCents, pendingCents, payouts, escrow, externalTotalCents, isManualSchedule } = input;

  // ── Row 1: still waiting on the client ────────────────────────────────────
  // Escrow the client has already actioned isn't waiting on anyone — it's just
  // settling — so it belongs to the transit row, not here.
  //
  // Counted NET of the platform fee, like every other row on this card. Held
  // escrow is the only figure that was ever shown gross, so a released job used
  // to drop from $70.00 "secured" to $64.90 "heading to your bank" with no
  // explanation for the missing $5.10.
  const awaitingEscrow = escrow.filter((p) => !isReleaseActioned(p));
  const awaitingClient = awaitingEscrow.reduce((s, p) => s + creditedToBalanceCents(p), 0);

  // The destination-routed slice of that is sitting in the Stripe balance right
  // now. It is already shown in row 1, so it must come OUT of row 2.
  const awaitingInBalance = awaitingEscrow
    .filter(isDestinationRouted)
    .reduce((s, p) => s + creditedToBalanceCents(p), 0);

  // ── Row 3: actually landed ────────────────────────────────────────────────
  // 'paid' only. pending/in_transit belong to row 2; failed/canceled returned
  // their funds to the balance and are counted there instead.
  const receivedPayouts = payouts.filter((p) => p.status === 'paid');
  const received = receivedPayouts.reduce((s, p) => s + p.amount, 0) + externalTotalCents;

  // ── Row 2: in motion ──────────────────────────────────────────────────────
  // Stripe deducts a payout from the balance the moment it's created, so
  // in-flight payouts never overlap with available/pending.
  const inFlightPayouts = payouts.filter((p) => p.status === 'pending' || p.status === 'in_transit');
  const inFlightTotal = inFlightPayouts.reduce((s, p) => s + p.amount, 0);
  const inFlightArrival = inFlightPayouts.length
    ? Math.min(...inFlightPayouts.map((p) => p.arrival_date).filter(Boolean))
    : null;

  const balanceTotal = availableCents + pendingCents;
  const freeBalance = Math.max(0, balanceTotal - awaitingInBalance);
  const freeAvailable = Math.min(freeBalance, Math.max(0, availableCents - awaitingInBalance));
  const freeClearing = freeBalance - freeAvailable;

  const transit: PayoutSummaryRow = {
    amount: inFlightTotal + freeBalance,
    ...transitCopy({ inFlightTotal, inFlightArrival, freeAvailable, freeClearing, isManualSchedule }),
  };

  return {
    awaitingClient,
    transit,
    received,
    earned: awaitingClient + transit.amount + received,
    inFlightArrival,
  };
}

// These are genuinely different states and the copy has to say which one you're
// in. The title names the dominant one; anything left over is appended with the
// same `·` separator the card already uses, rather than being silently dropped.
function transitCopy(args: {
  inFlightTotal: number;
  inFlightArrival: number | null;
  freeAvailable: number;
  freeClearing: number;
  isManualSchedule: boolean;
}): { title: string; detail: string } {
  const { inFlightTotal, inFlightArrival, freeAvailable, freeClearing, isManualSchedule } = args;

  if (inFlightTotal > 0) {
    const parts = [
      inFlightArrival
        ? `${fmt(inFlightTotal)} should arrive by ${formatArrivalDate(inFlightArrival)}`
        : `${fmt(inFlightTotal)} on its way — arrival date pending from Stripe`,
    ];
    if (freeAvailable > 0) parts.push(`${fmt(freeAvailable)} cleared, not sent yet`);
    if (freeClearing > 0) parts.push(`${fmt(freeClearing)} still clearing`);
    return { title: 'Heading to your bank', detail: parts.join(' · ') };
  }

  if (freeAvailable > 0) {
    const detail = isManualSchedule
      ? 'Cleared and waiting — not sent to your bank yet'
      : 'Will be sent on your next scheduled payout';
    return {
      title: isManualSchedule ? 'Ready to pay out' : 'Scheduled for your next payout',
      detail: freeClearing > 0 ? `${detail} · ${fmt(freeClearing)} still clearing` : detail,
    };
  }

  if (freeClearing > 0) {
    return { title: 'Clearing with Stripe', detail: 'Still settling — no bank date yet' };
  }

  return { title: 'Heading to your bank', detail: 'Nothing in transit' };
}
