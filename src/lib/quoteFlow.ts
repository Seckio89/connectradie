// ─────────────────────────────────────────────────────────────────────────────
// Three-stage quote flow — pure helpers
//
// Maps QuoteStatus values to labels, badge styling, and which actions are
// available to each role at each state. Pure functions, no UI deps, no
// network. Used by QuoteStatusBadge and (later) the larger UI surfaces
// (QuoteComparisonView, JobDetailsCard, tradie-side modals).
//
// Spec: docs/three-stage-quote-flow.md
// ─────────────────────────────────────────────────────────────────────────────

import type { Quote, QuoteStatus, Job } from '../types/database';

export type Role = 'client' | 'tradie';

/** Tailwind classes for the status badge in the design-system palette. */
export interface BadgeStyle {
  bg: string;
  text: string;
  border: string;
}

const BADGE_AMBER: BadgeStyle = { bg: 'bg-warm-50', text: 'text-warm-700', border: 'border-warm-200' };
const BADGE_SECONDARY: BadgeStyle = { bg: 'bg-secondary-50', text: 'text-secondary-700', border: 'border-secondary-200' };
const BADGE_EMERALD: BadgeStyle = { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
const BADGE_GRAY: BadgeStyle = { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' };
const BADGE_RED: BadgeStyle = { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };

/**
 * Visual badge style per status. Role-independent — the same status looks the
 * same to both sides; only the label text changes (see getQuoteStatusLabel).
 */
export function getQuoteStatusBadgeStyle(status: QuoteStatus): BadgeStyle {
  switch (status) {
    case 'pending':              return BADGE_AMBER;     // awaiting action by the other party
    case 'site_visit_scheduled': return BADGE_SECONDARY; // in-flight workflow state
    case 'site_visit_completed': return BADGE_SECONDARY; // in-flight workflow state
    case 'final_submitted':      return BADGE_AMBER;     // client decision time
    case 'accepted':             return BADGE_EMERALD;   // chosen / contract formed
    case 'declined':             return BADGE_GRAY;      // terminal, neutral
    case 'withdrawn':            return BADGE_GRAY;      // terminal, neutral
    case 'expired':              return BADGE_RED;       // terminal, time issue
    default:                     return BADGE_GRAY;
  }
}

/**
 * Human-readable status label, optionally tailored to viewer role. For
 * action-required states (e.g. final_submitted), the client sees an
 * action-oriented label and the tradie sees the waiting state.
 */
export function getQuoteStatusLabel(status: QuoteStatus, role: Role = 'client'): string {
  switch (status) {
    case 'pending':
      return role === 'tradie' ? 'Estimate sent' : 'Estimate received';
    case 'site_visit_scheduled':
      return role === 'tradie' ? 'Site visit booked — visit pending' : 'Site visit booked';
    case 'site_visit_completed':
      return role === 'tradie' ? 'Visit done — submit your final quote' : 'Awaiting final quote';
    case 'final_submitted':
      return role === 'tradie' ? 'Final quote sent — awaiting client' : 'Final quote — your decision';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'withdrawn':
      return role === 'tradie' ? 'Withdrawn by you' : 'Tradie withdrew';
    case 'expired':
      return 'Expired';
    default:
      return status;
  }
}

/**
 * One-line description for tooltips / help text.
 */
export function getQuoteStatusDescription(status: QuoteStatus, role: Role = 'client'): string {
  switch (status) {
    case 'pending':
      return role === 'tradie'
        ? 'Your initial estimate is with the client.'
        : 'The tradie has submitted an initial estimate. Subject to site visit if marked.';
    case 'site_visit_scheduled':
      return role === 'tradie'
        ? 'The client has booked the site visit. Mark it complete after you go on site.'
        : 'You\'ve booked a site visit with this tradie. They\'ll inspect and submit a binding final quote afterwards.';
    case 'site_visit_completed':
      return role === 'tradie'
        ? 'The site visit is recorded. Submit your binding final quote now.'
        : 'The tradie has completed the site visit. Their final quote will follow.';
    case 'final_submitted':
      return role === 'tradie'
        ? 'Your final quote is with the client, valid until the date shown.'
        : 'The tradie has submitted their binding final quote. Compare it with others, then accept and pay to engage them.';
    case 'accepted':
      return 'This quote was accepted and the deposit is secured with Stripe.';
    case 'declined':
      return role === 'tradie'
        ? 'The client went with a different tradie this time.'
        : 'This quote was declined — either by you or because you accepted another quote on the same job.';
    case 'withdrawn':
      return role === 'tradie'
        ? 'You withdrew this quote.'
        : 'The tradie withdrew this quote.';
    case 'expired':
      return 'The validity period passed without acceptance. The tradie can submit a new quote.';
    default:
      return '';
  }
}

/** Whether a status is terminal (no further transitions). */
export function isTerminalQuoteStatus(status: QuoteStatus): boolean {
  return status === 'accepted' || status === 'declined' || status === 'withdrawn' || status === 'expired';
}

/** Whether the quote is "in flight" — neither initial pending nor terminal. */
export function isQuoteInFlight(status: QuoteStatus): boolean {
  return status === 'site_visit_scheduled' || status === 'site_visit_completed' || status === 'final_submitted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Available actions per state
//
// Returns the set of actions a given role can take on a quote given its
// status, the job's flow_version, and whether a site visit is required. UI
// surfaces consume this to decide which CTAs to render.
// ─────────────────────────────────────────────────────────────────────────────

export type ClientAction =
  | 'book_site_visit'   // T1: pending → site_visit_scheduled
  | 'accept_and_pay'    // T11 (v2) or v1 acceptance
  | 'decline';          // T4 / T8: terminal decline

export type TradieAction =
  | 'mark_visit_complete' // T5: site_visit_scheduled → site_visit_completed
  | 'submit_final'        // T2 / T9: → final_submitted
  | 'withdraw';           // T3 / T7 / T10 / T12: any non-terminal → withdrawn

/**
 * What the client can do with this quote right now. Takes the parent job so
 * it can branch on flow_version and the quote's own requires_site_inspection.
 */
export function getClientActions(quote: Quote, job: Pick<Job, 'flow_version'>): ClientAction[] {
  const v2 = job.flow_version === 2;

  switch (quote.status) {
    case 'pending':
      if (v2) {
        // v2: site-visit-required estimates → book; otherwise wait for tradie's final.
        return quote.requires_site_inspection ? ['book_site_visit', 'decline'] : ['decline'];
      }
      // v1: legacy single-step — pending is acceptable.
      return ['accept_and_pay', 'decline'];

    case 'site_visit_scheduled':
    case 'site_visit_completed':
      // Visit in flight or done; awaiting tradie's final. Client can still decline.
      return ['decline'];

    case 'final_submitted':
      return ['accept_and_pay', 'decline'];

    case 'accepted':
      // Quote already accepted — checkout resumption handled by accept-and-pay.
      // No new client action surfaces here; the job has moved on.
      return [];

    case 'declined':
    case 'withdrawn':
    case 'expired':
      return [];

    default:
      return [];
  }
}

/**
 * What the tradie can do with this quote right now.
 */
export function getTradieActions(quote: Quote, job: Pick<Job, 'flow_version'>): TradieAction[] {
  const v2 = job.flow_version === 2;

  switch (quote.status) {
    case 'pending':
      // v2 fast-path: if no site visit is needed, the tradie can submit a final.
      if (v2 && !quote.requires_site_inspection) return ['submit_final', 'withdraw'];
      // Otherwise: just withdraw (or wait for the client to book a site visit).
      return ['withdraw'];

    case 'site_visit_scheduled':
      return ['mark_visit_complete', 'withdraw'];

    case 'site_visit_completed':
      return ['submit_final', 'withdraw'];

    case 'final_submitted':
      // Awaiting client decision; tradie can still withdraw their final.
      return ['withdraw'];

    case 'accepted':
    case 'declined':
    case 'withdrawn':
    case 'expired':
      return [];

    default:
      return [];
  }
}

/**
 * Whether the address should be visible to the tradie holding this quote.
 * Spec §5.2: suburb-only until a site visit is booked.
 */
export function isAddressVisibleToTradie(status: QuoteStatus): boolean {
  return status === 'site_visit_scheduled'
    || status === 'site_visit_completed'
    || status === 'final_submitted'
    || status === 'accepted';
}

/**
 * Whether a `final_submitted` quote has passed its validity window. Used by
 * the UI to render an "Expired" overlay before the server-side sweep flips
 * the status (spec §5.4 #2).
 */
export function isFinalQuoteExpired(quote: Pick<Quote, 'status' | 'final_valid_until'>): boolean {
  if (quote.status !== 'final_submitted') return false;
  if (!quote.final_valid_until) return false;
  const todayIso = new Date().toISOString().slice(0, 10);
  return quote.final_valid_until < todayIso;
}

/**
 * Whether the tradie's final price triggers the ACL anti-misleading advisory.
 * Spec §5.5: final > 125% of original price_max gets a yellow warning.
 */
export const PRICE_ADVISORY_FACTOR = 1.25;

export function finalPriceExceedsAdvisory(quote: Pick<Quote, 'final_price' | 'price_max'>): boolean {
  if (quote.final_price == null) return false;
  if (!quote.price_max || quote.price_max <= 0) return false;
  return quote.final_price > Number(quote.price_max) * PRICE_ADVISORY_FACTOR;
}
