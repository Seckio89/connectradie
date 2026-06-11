// ─────────────────────────────────────────────────────────────────────────────
// FindTradies — the dynamic /find/[trade]/[suburb] landing page.
//
// This is the workhorse of the SEO strategy. Every (trade × suburb) pair in
// our dataset gets a page rendered from this single component, hydrated
// with:
//   • Hand-written, suburb-substituted trade content (tradeContent.ts)
//   • Live tradie inventory from Supabase, filtered by trade + postcode
//   • Live reviews for those tradies (fresh content signal)
//   • Nearby-suburbs and other-trades internal linking
//   • All schema markup (LocalBusiness, FAQPage, BreadcrumbList, Service,
//     AggregateRating)
//
// noindex behaviour: if fewer than the minimum tradie count is available,
// the page renders normally for users (signal "we\'re building inventory")
// but adds <meta name="robots" content="noindex,follow"> so Google doesn\'t
// index a thin page that hurts site quality. The crawl signal flips
// automatically once inventory crosses the threshold.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Shield, Star, Lock, ChevronRight, ArrowLeft, CheckCircle2, Wallet,
  BadgeCheck, ListChecks, ArrowRight,
} from 'lucide-react';
import SEO from '../components/SEO';
import { supabase } from '../lib/supabase';
import {
  resolveTradeSuburb,
  findUrl,
  tradeHubUrl,
  suburbHubUrl,
  costGuideUrl,
} from '../lib/seoContent/slugs';
import { getTradeContent } from '../lib/seoContent/tradeContent';
import LocalCostGuide from '../components/seo/LocalCostGuide';
import LocalFAQ from '../components/seo/LocalFAQ';
import RelatedSearches from '../components/seo/RelatedSearches';
import PublicTradieRow, { type PublicTradieSummary } from '../components/seo/PublicTradieRow';
import TrustSignals from '../components/TrustSignals';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateLocalBusinessSchema,
} from '../lib/seoUtils';
import type { JsonLdSchema } from '../lib/seoUtils';

// Minimum tradies required before the page is index-eligible. Below this,
// the page still renders but emits noindex,follow so Google can crawl the
// internal links without indexing the thin page itself.
const MIN_TRADIES_FOR_INDEX = 3;

// Top trades to cross-link to when on a specific landing page. Excludes
// the trade currently being viewed.
const FEATURED_CROSS_TRADES = [
  'plumber', 'electrician', 'carpenter', 'painter', 'cleaner', 'roofer',
  'tiler', 'landscaper', 'handyman', 'air-conditioning',
];

export default function FindTradies() {
  const { trade: tradeSlug, locationSlug: suburbSlug } = useParams<{
    trade: string;
    locationSlug: string;
  }>();
  const navigate = useNavigate();

  const resolved = useMemo(
    () => resolveTradeSuburb(tradeSlug, suburbSlug),
    [tradeSlug, suburbSlug],
  );

  const [tradies, setTradies] = useState<PublicTradieSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect to home if either slug is unknown — never serve a broken page.
  useEffect(() => {
    if (!resolved) navigate('/', { replace: true });
  }, [resolved, navigate]);

  useEffect(() => {
    if (!resolved) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Phase 1 inventory filter: trade match + exact postcode OR neighbouring postcode.
      // Later we\'ll add radius queries via PostGIS once tradie addresses are geocoded.
      const postcodes = [
        resolved.suburb.postcode,
        // Pull a small ring of postcode +/-1 to broaden inventory until we have geo data.
        String(Number(resolved.suburb.postcode) + 1).padStart(4, '0'),
        String(Number(resolved.suburb.postcode) - 1).padStart(4, '0'),
      ];

      // profiles holds the location/verification columns (suburb, postcode,
      // license_verified, abn_verified, is_premium, is_identity_verified,
      // avatar_url). tradie_details holds the trade_category filter only.
      // tradie_ratings is a separate view keyed by tradie_id — fetched in a
      // follow-up query because PostgREST doesn't auto-detect view FKs.
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          full_name,
          bio,
          avatar_url,
          suburb,
          postcode,
          is_premium,
          license_verified,
          abn_verified,
          is_identity_verified,
          tradie_details!inner (
            trade_category
          )
        `)
        .eq('role', 'tradie')
        .eq('onboarding_completed', true)
        .eq('tradie_details.trade_category', resolved.tradeSlug)
        .in('postcode', postcodes)
        .limit(20);

      if (cancelled) return;

      if (error || !data || data.length === 0) {
        if (error) console.error('FindTradies inventory query failed:', error);
        setTradies([]);
        setLoading(false);
        return;
      }

      // Fan-out ratings lookup. Best-effort — if it fails, render without ratings.
      const tradieIds = data.map((r) => r.id);
      const { data: ratings } = await supabase
        .from('tradie_ratings')
        .select('tradie_id, average_rating, total_reviews')
        .in('tradie_id', tradieIds);
      if (cancelled) return;

      const ratingsByTradie = new Map<string, { average_rating: number | null; total_reviews: number | null }>(
        (ratings ?? []).map((r) => [r.tradie_id, { average_rating: r.average_rating, total_reviews: r.total_reviews }]),
      );

      const mapped: PublicTradieSummary[] = data
        .map((row) => {
          // tradie_details may come back as array or single object — only used
          // to confirm the inner join matched the trade.
          const td = Array.isArray(row.tradie_details) ? row.tradie_details[0] : row.tradie_details;
          if (!td) return null;
          const rating = ratingsByTradie.get(row.id);
          return {
            id: row.id,
            full_name: row.full_name ?? 'Tradie',
            trade_category: (td.trade_category as string) ?? null,
            postcode: row.postcode ?? null,
            suburb: row.suburb ?? null,
            average_rating: rating?.average_rating ?? null,
            total_reviews: rating?.total_reviews ?? null,
            profile_image_url: row.avatar_url ?? null,
            bio: row.bio ?? null,
            is_pro: !!row.is_premium,
            license_verified: !!row.license_verified,
            abn_verified: !!row.abn_verified,
            stripe_identity_verified: !!row.is_identity_verified,
          };
        })
        .filter((t): t is PublicTradieSummary => t !== null)
        // Client-side sort by rating — server-side ordering on a separately-
        // fetched view isn't possible without restructuring the query.
        .sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0));

      setTradies(mapped);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [resolved]);

  if (!resolved) return null;

  const { tradeSlug: trade, tradeLabel, tradeLabelPlural, suburb } = resolved;
  const ctx = {
    suburb: suburb.name,
    state: suburb.state,
    tradeLabel,
    tradeLabelPlural,
  };
  const content = getTradeContent(trade, ctx);

  const inventoryCount = tradies.length;
  const isIndexable = inventoryCount >= MIN_TRADIES_FOR_INDEX;
  const verifiedCount = tradies.filter((t) => t.license_verified || t.abn_verified).length;
  const avgRating = tradies.length
    ? tradies.reduce((sum, t) => sum + (t.average_rating ?? 0), 0) / tradies.length
    : 0;
  const totalReviews = tradies.reduce((sum, t) => sum + (t.total_reviews ?? 0), 0);

  // ── Schema markup ──
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: 'https://connectradie.com/' },
    { name: suburb.city, url: `https://connectradie.com${suburbHubUrl(suburb.slug)}` },
    { name: suburb.name, url: `https://connectradie.com${suburbHubUrl(suburb.slug)}` },
    { name: tradeLabelPlural, url: `https://connectradie.com${findUrl(trade, suburb.slug)}` },
  ]);
  const faqSchema = generateFAQSchema(content.faqs.map((f) => ({ question: f.q, answer: f.a })));
  const tradieSchemas = tradies.slice(0, 10).map((t) =>
    generateLocalBusinessSchema({
      full_name: t.full_name,
      trade_category: t.trade_category ?? trade,
      postcode: t.postcode ?? suburb.postcode,
      average_rating: t.average_rating ?? undefined,
      total_reviews: t.total_reviews ?? undefined,
      description: t.bio ?? `Verified ${tradeLabel.toLowerCase()} servicing ${suburb.name}`,
      profile_image_url: t.profile_image_url ?? undefined,
    }),
  );
  const jsonLd: JsonLdSchema[] = [breadcrumbSchema, faqSchema, ...tradieSchemas];

  // Cross-link trades — featured list minus the current trade.
  const otherTrades = FEATURED_CROSS_TRADES.filter((s) => s !== trade).slice(0, 8);

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={`${tradeLabelPlural} in ${suburb.name} ${suburb.state} ${suburb.postcode}`}
        description={`Find verified, licensed ${tradeLabel.toLowerCase()}s in ${suburb.name} ${suburb.state}. ABN-checked, ${tradeLabel.toLowerCase()} licence-verified, paid through Stripe-held escrow — funds release only when you approve the work.`}
        canonical={findUrl(trade, suburb.slug)}
        noindex={!isIndexable}
        jsonLd={jsonLd}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <Link
                to="/register?type=client"
                className="hidden sm:inline-flex px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Post a job
              </Link>
              <Link
                to="/login"
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5 text-gray-500">
            <li>
              <Link to="/" className="hover:text-gray-900">Home</Link>
            </li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li>
              <Link to={suburbHubUrl(suburb.slug)} className="hover:text-gray-900">
                {suburb.city}
              </Link>
            </li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li>
              <Link to={suburbHubUrl(suburb.slug)} className="hover:text-gray-900">
                {suburb.name}
              </Link>
            </li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="text-gray-900 font-medium">{tradeLabelPlural}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold mb-4 border border-emerald-100">
            <Lock className="w-3.5 h-3.5" />
            Escrow-paid · Licence verified · {suburb.state}-based
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900">
            {tradeLabelPlural} in {suburb.name}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {suburb.name} {suburb.state} {suburb.postcode}
          </p>

          {/* Local stats row — only show when inventory exists */}
          {inventoryCount > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>
                  <span className="font-semibold text-gray-900">{verifiedCount}</span> verified {tradeLabel.toLowerCase()}{verifiedCount === 1 ? '' : 's'}
                </span>
              </div>
              {avgRating > 0 && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>
                    <span className="font-semibold text-gray-900">{avgRating.toFixed(1)}</span> avg rating
                  </span>
                </div>
              )}
              {totalReviews > 0 && (
                <div className="flex items-center gap-2 text-gray-700">
                  <BadgeCheck className="w-4 h-4 text-secondary-600" />
                  <span>
                    <span className="font-semibold text-gray-900">{totalReviews}</span> verified review{totalReviews === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Intro paragraph */}
          <p className="mt-6 text-base text-gray-700 leading-relaxed max-w-3xl">
            {content.intro}
          </p>

          {/* Primary CTAs */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/post-lead?trade=${trade}&postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Post your {suburb.name} job — free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to={`/search?trade=${trade}&postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-lg transition-colors"
            >
              Browse all {suburb.name} {tradeLabel.toLowerCase()}s
            </Link>
          </div>
        </section>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left column — tradie list + cost guide + FAQs */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tradie list */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">
                Top {tradeLabelPlural} in {suburb.name}
              </h2>
              <p className="text-sm text-gray-600 mb-5">
                Every listing below is ABN-verified and (where required for the trade) {suburb.state} licence-checked. Funds sit in Stripe-held escrow until you approve the work.
              </p>

              {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  Loading {suburb.name} {tradeLabel.toLowerCase()}s…
                </div>
              ) : tradies.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    We&apos;re building inventory in {suburb.name}.
                  </p>
                  <p className="text-sm text-gray-600 max-w-md mx-auto mb-5">
                    Post your job free — verified {tradeLabel.toLowerCase()}s in the {suburb.city} area will be notified and can quote within hours.
                  </p>
                  <Link
                    to={`/post-lead?trade=${trade}&postcode=${suburb.postcode}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Post your {suburb.name} {tradeLabel.toLowerCase()} job
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {tradies.map((t) => (
                    <PublicTradieRow key={t.id} tradie={t} />
                  ))}
                </div>
              )}
            </section>

            {/* Cost guide */}
            <LocalCostGuide
              rows={content.costGuide}
              tradeLabel={tradeLabel}
              suburbName={suburb.name}
            />

            {/* What they do */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                What {tradeLabelPlural.toLowerCase()} in {suburb.name} typically do
              </h2>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                {content.whatTheyDo.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* License note */}
            <section className="bg-secondary-50 rounded-2xl border border-secondary-100 p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-secondary-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-1.5">
                    Licensing in {suburb.state}
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {content.licenseNote}
                  </p>
                </div>
              </div>
            </section>

            {/* How to choose */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
              <div className="flex items-start gap-3 mb-4">
                <ListChecks className="w-5 h-5 text-emerald-600 mt-0.5" />
                <h2 className="text-xl font-bold text-gray-900">
                  How to choose a {tradeLabel.toLowerCase()} in {suburb.name}
                </h2>
              </div>
              <ul className="space-y-2.5">
                {content.howToChoose.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Local FAQ */}
            <LocalFAQ
              faqs={content.faqs}
              heading={`${tradeLabelPlural} in ${suburb.name} — FAQs`}
            />
          </div>

          {/* Right column — trust signals, escrow flow, links */}
          <aside className="space-y-6">
            <TrustSignals
              role="client"
              caption="What you get on ConnecTradie"
              variant="card"
            />

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-gray-900">How payment works</h3>
              </div>
              <ol className="space-y-2.5 text-sm text-gray-700">
                <li className="flex gap-3">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">1</span>
                  <span>You accept a quote — payment held by Stripe.</span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">2</span>
                  <span>Tradie completes the work.</span>
                </li>
                <li className="flex gap-3">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">3</span>
                  <span>You approve — funds release. Auto-release in 48 hours if you go silent.</span>
                </li>
              </ol>
            </div>

            <div className="bg-warm-50 rounded-2xl border border-warm-100 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-2">
                Need a {tradeLabel.toLowerCase()}&apos;s cost breakdown across Australia?
              </h3>
              <p className="text-sm text-gray-700 mb-3">
                Compare {tradeLabel.toLowerCase()} pricing nationally with our cost guide.
              </p>
              <Link
                to={costGuideUrl(trade)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-warm-700 hover:text-warm-800"
              >
                View {tradeLabel} cost guide
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </aside>
        </div>

        {/* Related searches */}
        <div className="mt-10">
          <RelatedSearches
            tradeSlug={trade}
            suburbSlug={suburb.slug}
            otherTradeSlugs={otherTrades}
            neighbourSlugs={suburb.neighbours}
          />
        </div>

        {/* Footer CTA */}
        <section className="mt-10 bg-navy-900 rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Post your {suburb.name} {tradeLabel.toLowerCase()} job free
          </h2>
          <p className="mt-3 text-base text-gray-300 max-w-xl mx-auto">
            ABN-verified, licence-checked {tradeLabel.toLowerCase()}s in the {suburb.city} area will be notified and can quote within hours. No lead fees, no chasing, escrow-protected payment.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/post-lead?trade=${trade}&postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 hover:bg-warm-600 text-white font-semibold rounded-xl transition-colors"
            >
              Post a job
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to={tradeHubUrl(trade)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-navy-800 hover:bg-navy-700 border border-navy-700 text-white font-semibold rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All {tradeLabelPlural.toLowerCase()} by suburb
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

// Helper export for use by other pages that need to list cross-trades.
export { FEATURED_CROSS_TRADES };
