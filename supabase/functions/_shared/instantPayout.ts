// ─────────────────────────────────────────────────────────────────────────────
// Instant-payout quote: how much of the Connect balance can be sent instantly,
// what the instant fee is, and whether it should be offered at all.
//
// Split out of instant-payout/index.ts so the arithmetic can be tested. It had
// no coverage, and it was offering deals like "$3.50 available, $2.00 fee, you
// receive $1.50" — a 57% effective rate — because eligibility only asked
// whether the net was above zero.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The instant fee may never exceed 1/MAX_FEE_SHARE_DIVISOR of the payout.
 * With the standard $2 minimum fee this puts the floor at $20.
 *
 * The percentage fee can't breach this on its own (1.5% ≪ 10%); the flat
 * minimum can, and on small balances it dominates completely.
 */
export const MAX_FEE_SHARE_DIVISOR = 10;

export interface InstantPayoutInput {
  /** Cleared AUD balance in the tradie's Connect account. */
  availableCents: number;
  /** Still settling inside Stripe — not payable yet, but explains "no funds". */
  pendingCents: number;
  /** Client money in the balance that is still held in escrow. */
  escrowReserveCents: number;
  feeBps: number;
  feeMinCents: number;
  /** Whether an instant-capable external account is attached. */
  instantCapable: boolean;
}

export type InstantPayoutReason =
  | "no_instant_method"
  | "escrow_held"
  | "funds_pending"
  | "no_funds"
  | "below_minimum"
  | "below_fee";

export interface InstantPayoutQuote {
  /** Cleared funds that are genuinely the tradie's, i.e. available less escrow. */
  payoutBaseCents: number;
  feeCents: number;
  netCents: number;
  /** Smallest base we will offer an instant payout on. */
  minBaseCents: number;
  eligible: boolean;
  reason: InstantPayoutReason | null;
}

export function computeInstantPayout(input: InstantPayoutInput): InstantPayoutQuote {
  const { availableCents, pendingCents, escrowReserveCents, feeBps, feeMinCents, instantCapable } = input;

  const payoutBaseCents = Math.max(0, availableCents - escrowReserveCents);
  const feeCents = payoutBaseCents > 0
    ? Math.max(feeMinCents, Math.round((payoutBaseCents * feeBps) / 10000))
    : 0;
  const netCents = Math.max(0, payoutBaseCents - feeCents);
  const minBaseCents = feeMinCents * MAX_FEE_SHARE_DIVISOR;

  let reason: InstantPayoutReason | null = null;
  if (!instantCapable) {
    reason = "no_instant_method";
  } else if (payoutBaseCents <= 0) {
    // Distinguish "held in escrow" from "no money": telling a tradie who can
    // see a funded job that they have "no available funds" reads as a bug.
    if (escrowReserveCents > 0) reason = "escrow_held";
    else if (pendingCents > 0) reason = "funds_pending";
    else reason = "no_funds";
  } else if (payoutBaseCents < minBaseCents) {
    reason = "below_minimum";
  } else if (netCents <= 0) {
    // Only reachable if a tier is configured with no minimum fee at all.
    reason = "below_fee";
  }

  return { payoutBaseCents, feeCents, netCents, minBaseCents, eligible: reason === null, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe instant-payout failures
//
// A tradie hit this in production:
//
//   "You have exceeded your daily volume limit of $0.00 aud for Instant Payouts
//    across your connected accounts. Please contact us at
//    https://support.stripe.com/contact/email for assistance."
//
// The $0.00 is the tell — the PLATFORM has no AUD instant-payout allowance.
// That limit is a Stripe entitlement across all connected accounts, there is no
// API to read it, and no tradie can do anything about it. Showing them Stripe's
// message sends them to Stripe support for a problem that is ours.
// ─────────────────────────────────────────────────────────────────────────────

export type InstantFailureScope = "platform" | "account" | "unknown";

/**
 * Which instant-payout failures are platform-wide (nobody can use the feature)
 * versus specific to this tradie's payout method.
 */
export function classifyInstantFailure(code: string | null | undefined): InstantFailureScope {
  switch (code) {
    // Volume or count limit across all our connected accounts.
    case "instant_payouts_limit_exceeded":
    case "instant_payouts_config_disabled":
    case "instant_payouts_currency_disabled":
      return "platform";
    // This particular card/bank can't receive an instant payout.
    case "instant_payouts_unsupported":
      return "account";
    default:
      return "unknown";
  }
}

/**
 * Our own words for a failed instant payout. Never Stripe's: the disclosed net
 * was never charged, the money is still on its way on the free schedule, and
 * the tradie must not be pointed at Stripe support for a platform entitlement.
 */
export function instantFailureMessage(scope: InstantFailureScope): string {
  if (scope === "platform") {
    return "Instant payouts aren't available on ConnecTradie right now. Nothing has been charged — " +
      "your balance is still on its way to your bank on the standard schedule, free of charge.";
  }
  if (scope === "account") {
    return "This payout account can't receive instant payouts. Add an instant-eligible debit card or " +
      "bank account in Bank Settings — nothing has been charged.";
  }
  return "Could not send the instant payout. Nothing has been charged and your balance is unaffected.";
}

/** How long a known platform failure suppresses the offer before we re-probe. */
export const INSTANT_UNAVAILABLE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Stripe's daily limits reset each day, and the limit may be raised at any time,
 * so a recorded failure has to expire — otherwise the feature stays switched off
 * forever after one bad day and needs a deploy to come back.
 */
export function isUnavailableFlagFresh(checkedAt: unknown, nowMs: number): boolean {
  if (typeof checkedAt !== "string") return false;
  const ts = Date.parse(checkedAt);
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts < INSTANT_UNAVAILABLE_TTL_MS;
}
