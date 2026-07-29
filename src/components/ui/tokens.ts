/**
 * Design system v2 — shared primitives.
 *
 * Values every primitive agrees on. Phase 0 found eight different focus
 * rings and 149 distinct field shapes; these exist so that can't happen
 * again inside `ui/`.
 */

/**
 * The focus treatment, one definition.
 *
 * Uses `outline` rather than `ring` deliberately: a ring needs its offset
 * colour to match whatever is behind it, and these primitives sit on
 * --ink, --surface and --surface-2. An outline doesn't care.
 */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-ct-teal focus:outline-none';

/** The uppercase mono meta label — pills, table headers, states, refs. */
export const META = 'font-ct-mono text-ct-meta uppercase';

/**
 * Australian dollars from cents.
 *
 * Money lives in the database as integer cents. Formatting it is a
 * presentation concern, and Phase 0 found it duplicated across pages with
 * inconsistent results — so it happens here, once.
 *
 * Whole amounts drop the decimals: $14,200 reads better than $14,200.00 in
 * a milestone list. Pass `cents: true` for invoice-style output.
 */
export function formatAud(amountCents: number, opts?: { cents?: boolean }): string {
  const showCents = opts?.cents ?? amountCents % 100 !== 0;
  return (amountCents / 100).toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  });
}

/** Signed variant, for variations: `+$1,200`. */
export function formatAudDelta(amountCents: number, opts?: { cents?: boolean }): string {
  const sign = amountCents < 0 ? '−' : '+';
  return `${sign}${formatAud(Math.abs(amountCents), opts)}`;
}

/** Joins class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
