// ─────────────────────────────────────────────────────────────────────────────
// RelatedSearches — internal linking block that surfaces:
//   • Nearby suburbs for the same trade (geographic cluster)
//   • Other trades in the same suburb (cross-trade cluster)
//
// Internal linking is the single most underused SEO lever for marketplace
// sites. Each landing page should have 8–15 outbound internal links to
// related pages — this creates the topic cluster Google rewards.
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom';
import { MapPin, Wrench, ArrowRight } from 'lucide-react';
import { findUrl } from '../../lib/seoContent/slugs';
import { getSuburb } from '../../lib/seoContent/suburbs';
import { tradePluralLabel, tradeLabel } from '../../lib/seoContent/slugs';

interface RelatedSearchesProps {
  /** Slug of the trade currently being viewed. */
  tradeSlug: string;
  /** Slug of the suburb currently being viewed. */
  suburbSlug: string;
  /** Slugs of trades to cross-link to in the same suburb. */
  otherTradeSlugs: string[];
  /** Slugs of neighbouring suburbs to link to for the same trade. */
  neighbourSlugs: string[];
}

export default function RelatedSearches({
  tradeSlug,
  suburbSlug,
  otherTradeSlugs,
  neighbourSlugs,
}: RelatedSearchesProps) {
  const currentSuburb = getSuburb(suburbSlug);
  const currentTradeLabel = tradeLabel(tradeSlug);
  const currentTradePlural = tradePluralLabel(tradeSlug);

  if (!currentSuburb) return null;

  // Filter neighbours to ones we actually have data for.
  const neighbours = neighbourSlugs
    .map((s) => ({ slug: s, suburb: getSuburb(s) }))
    .filter((n): n is { slug: string; suburb: NonNullable<ReturnType<typeof getSuburb>> } => !!n.suburb);

  return (
    <section className="grid md:grid-cols-2 gap-6">
      {/* Same trade, nearby suburbs */}
      {neighbours.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-gray-900">
              {currentTradePlural} in nearby suburbs
            </h3>
          </div>
          <ul className="space-y-1.5">
            {neighbours.map(({ slug, suburb }) => (
              <li key={slug}>
                <Link
                  to={findUrl(tradeSlug, slug)}
                  className="flex items-center justify-between text-sm text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors group"
                >
                  <span>
                    {currentTradePlural} in <span className="font-medium">{suburb.name}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Other trades, same suburb */}
      {otherTradeSlugs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-emerald-600" />
            <h3 className="text-base font-semibold text-gray-900">
              Other tradies in {currentSuburb.name}
            </h3>
          </div>
          <ul className="space-y-1.5">
            {otherTradeSlugs.map((slug) => (
              <li key={slug}>
                <Link
                  to={findUrl(slug, suburbSlug)}
                  className="flex items-center justify-between text-sm text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors group"
                >
                  <span>
                    {tradePluralLabel(slug)} in{' '}
                    <span className="font-medium">{currentSuburb.name}</span>
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Hidden — keep currentTradeLabel referenced for future use without TS warning */}
      <span className="hidden" aria-hidden="true">{currentTradeLabel}</span>
    </section>
  );
}
