// ─────────────────────────────────────────────────────────────────────────────
// URL slug helpers for SEO landing pages.
//
// Slug shapes:
//   trade slug  = TRADE_CATEGORIES.value verbatim, e.g. "plumber"
//   suburb slug = "{name-lowercase-hyphenated}-{state-lower}-{postcode}"
//                 e.g. "harris-park-nsw-2150"
//
// We never construct dynamic slugs at request time — every page is rendered
// from the static lookup tables in suburbs.ts + tradeCategories.ts. That
// keeps URLs canonical and prevents Google from indexing typo variants.
// ─────────────────────────────────────────────────────────────────────────────

import { TRADE_CATEGORIES, TRADE_CATEGORY_MAP } from '../tradeCategories';
import { SUBURBS, getSuburb, type Suburb } from './suburbs';

/** Convert any string to a URL-safe kebab-case slug. */
export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Validate that a trade slug exists in our catalogue. */
export function isValidTradeSlug(slug: string | undefined): slug is string {
  if (!slug) return false;
  return TRADE_CATEGORIES.some((t) => t.value === slug);
}

/** Human-readable label for a trade slug, falling back to titlecased slug. */
export function tradeLabel(slug: string): string {
  return TRADE_CATEGORY_MAP[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Human-readable plural label for a trade ("Plumber" -> "Plumbers"). */
export function tradePluralLabel(slug: string): string {
  const label = tradeLabel(slug);
  // Crude pluralisation suitable for trade nouns — no irregulars in our list.
  if (/(?:s|x|z|ch|sh)$/i.test(label)) return `${label}es`;
  if (/y$/i.test(label) && !/[aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

/** Build the landing page URL for a trade × suburb pair. */
export function findUrl(tradeSlug: string, suburbSlug: string): string {
  return `/find/${tradeSlug}/${suburbSlug}`;
}

/** Build the trade hub URL (lists all suburbs for a trade). */
export function tradeHubUrl(tradeSlug: string): string {
  return `/find/${tradeSlug}`;
}

/** Build the suburb hub URL (lists all trades in a suburb). */
export function suburbHubUrl(suburbSlug: string): string {
  return `/find-in/${suburbSlug}`;
}

/** Build the cost guide URL for a trade. */
export function costGuideUrl(tradeSlug: string): string {
  return `/costs/${tradeSlug}`;
}

/** A trade + suburb combination — used everywhere a page composes both. */
export interface TradeSuburb {
  tradeSlug: string;
  tradeLabel: string;
  tradeLabelPlural: string;
  suburb: Suburb;
}

/** Resolve a (tradeSlug, suburbSlug) tuple to a hydrated object, or null. */
export function resolveTradeSuburb(
  tradeSlug: string | undefined,
  suburbSlug: string | undefined,
): TradeSuburb | null {
  if (!isValidTradeSlug(tradeSlug)) return null;
  if (!suburbSlug) return null;
  const suburb = getSuburb(suburbSlug);
  if (!suburb) return null;
  return {
    tradeSlug,
    tradeLabel: tradeLabel(tradeSlug),
    tradeLabelPlural: tradePluralLabel(tradeSlug),
    suburb,
  };
}

/** All (trade, suburb) pairs in the dataset — used by the sitemap script. */
export function allTradeSuburbPairs(): { tradeSlug: string; suburbSlug: string }[] {
  const pairs: { tradeSlug: string; suburbSlug: string }[] = [];
  for (const trade of TRADE_CATEGORIES) {
    if (trade.value === 'other') continue;
    for (const suburb of SUBURBS) {
      pairs.push({ tradeSlug: trade.value, suburbSlug: suburb.slug });
    }
  }
  return pairs;
}
