// The paid site-visit call-out fee a final quote must clear.
//
// The fee (quotes.call_out_fee_cents) is collected at booking, routed straight
// to the tradie, and credited against the final price at accept-and-pay:
// chargeDollars = final − fee. A final quote at or below a PAID fee therefore
// leaves nothing (or a negative amount) to collect — accept-and-pay clamps that
// to a $0 Stripe line item, which Stripe rejects AFTER the quote and job have
// already flipped to accepted, stranding the job accepted-but-unpaid. Seen
// live: a $20 fee followed by a $1 final quote.
//
// Pure function over the quote row — no Supabase client — so it can be tested
// without the runtime, and so submit-final-quote (the gate) and accept-and-pay
// (the defence-in-depth guard) can never disagree about what counts as a paid
// fee. Same extraction rationale as payoutFailure.ts.

export interface SiteVisitFeeFields {
  /** quotes.site_visit_fee_status: 'paid' | 'credited' | null. */
  site_visit_fee_status?: string | null;
  call_out_fee_cents?: number | string | null;
}

/**
 * The call-out fee the client has ALREADY PAID for this quote, in cents.
 * 0 when there is nothing to credit:
 *   - no fee set, or fee <= 0 (free visit)
 *   - fee never paid (status null — visit not booked, or booked free)
 *   - fee already credited (status 'credited' — acceptance already consumed it)
 * A malformed stored fee reads as 0 rather than NaN: a corrupt row must fail
 * open to "nothing paid" (blocking every final quote) — accept-and-pay's
 * zero-charge guard still catches any genuinely unpayable acceptance.
 */
export function paidVisitFeeCents(quote: SiteVisitFeeFields | null | undefined): number {
  if (quote?.site_visit_fee_status !== "paid") return 0;
  const fee = Number(quote.call_out_fee_cents);
  return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
}
