// ─────────────────────────────────────────────────────────────────────────────
// FindByTrade — /find/[trade] hub page.
//
// Lists every suburb where this trade is available, grouped by city. Acts
// as the topic-cluster root for the trade and a high-level entry point for
// nationwide searches like "plumber Australia".
//
// SEO role: catches head terms ("plumber sydney") that don\'t carry a
// suburb-level qualifier, and funnels traffic into the more specific
// /find/[trade]/[suburb] pages.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, ArrowRight, Lock, Shield, BadgeCheck, Wallet } from 'lucide-react';
import SEO from '../components/SEO';
import { isValidTradeSlug, tradeLabel, tradePluralLabel, findUrl, suburbHubUrl, costGuideUrl } from '../lib/seoContent/slugs';
import { SUBURBS, getAllCities } from '../lib/seoContent/suburbs';
import { getTradeContent } from '../lib/seoContent/tradeContent';
import LocalCostGuide from '../components/seo/LocalCostGuide';
import { generateBreadcrumbSchema } from '../lib/seoUtils';
import type { JsonLdSchema } from '../lib/seoUtils';

export default function FindByTrade() {
  const { trade: tradeSlug } = useParams<{ trade: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isValidTradeSlug(tradeSlug)) navigate('/', { replace: true });
  }, [tradeSlug, navigate]);

  if (!isValidTradeSlug(tradeSlug)) return null;

  const trade = tradeSlug;
  const label = tradeLabel(trade);
  const plural = tradePluralLabel(trade);

  // Use a generic Australia-level context for trade-hub content.
  const ctx = {
    suburb: 'Australia',
    state: 'Australia',
    tradeLabel: label,
    tradeLabelPlural: plural,
  };
  const content = getTradeContent(trade, ctx);

  const cities = getAllCities();
  const suburbsByCity = cities.map((city) => ({
    city,
    suburbs: SUBURBS.filter((s) => s.city === city).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: 'https://connectradie.com/' },
    { name: `${plural} in Australia`, url: `https://connectradie.com/find/${trade}` },
  ]);
  const jsonLd: JsonLdSchema[] = [breadcrumbSchema];

  return (
    <div className="min-h-screen bg-ct-surface-2">
      <SEO
        title={`${plural} in Australia — Verified, Licensed, Stripe-Secured`}
        description={`Find verified ${label.toLowerCase()}s across Australia. ABN-checked, licence-verified, paid through Stripe-held escrow. Browse ${plural.toLowerCase()} by suburb across every major Australian city.`}
        canonical={`/find/${trade}`}
        jsonLd={jsonLd}
      />

      {/* Header */}
      <header className="bg-ct-surface border-b border-ct-line-soft sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-xl font-extrabold tracking-tight text-black">
                Connec<span className="text-ct-teal">Tradie</span>
              </span>
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-ct-mute-2 hover:text-ct-paper font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5 text-ct-mute">
            <li><Link to="/" className="hover:text-ct-paper">Home</Link></li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="text-ct-paper font-medium">{plural}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ct-teal/[0.14] text-ct-teal rounded-full text-xs font-semibold mb-4 border border-ct-teal/30">
            <Lock className="w-3.5 h-3.5" />
            Stripe-secured · Licence verified · Australia-wide
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ct-paper max-w-3xl">
            {plural} in Australia
          </h1>

          <p className="mt-6 text-base text-ct-mute-2 leading-relaxed max-w-3xl">
            Find verified {label.toLowerCase()}s in every major Australian city. Every tradie on ConnecTradie is ABN-verified and (where the law requires it) state licence-checked before they can quote on your job. Your payment sits in Stripe-held escrow until you approve the work — funds release only when you sign off, with a 5-hour auto-release so the tradie isn&apos;t left chasing.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/post-lead?trade=${trade}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal hover:brightness-110 text-ct-ink text-sm font-semibold rounded-ct-sm transition-colors"
            >
              Post a {label.toLowerCase()} job — free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to={costGuideUrl(trade)}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-ct-line text-ct-mute-2 hover:bg-ct-surface-2 text-sm font-semibold rounded-ct-sm transition-colors"
            >
              {label} cost guide
            </Link>
          </div>
        </section>

        {/* Trust strip */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <Shield className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">Licence verified</h3>
            <p className="text-xs text-ct-mute-2">Every {label.toLowerCase()} on a licensed trade has their state contractor licence checked before they can quote.</p>
          </div>
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <Wallet className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">Stripe-secured</h3>
            <p className="text-xs text-ct-mute-2">Your money sits in Stripe-held escrow until the work is approved. We never hold your funds.</p>
          </div>
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <BadgeCheck className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">No lead fees</h3>
            <p className="text-xs text-ct-mute-2">Tradies don&apos;t pay to read your job, so the cost doesn&apos;t get priced back into your quote.</p>
          </div>
        </section>

        {/* Cost guide */}
        <section className="mb-10">
          <LocalCostGuide
            rows={content.costGuide}
            tradeLabel={label}
            suburbName="Australia"
          />
        </section>

        {/* Suburb directory grouped by city */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-ct-paper mb-2">
            {plural} by suburb
          </h2>
          <p className="text-sm text-ct-mute-2 mb-6">
            Choose your suburb to see verified {label.toLowerCase()}s near you, local cost data, and recent reviews.
          </p>

          <div className="space-y-6">
            {suburbsByCity.map(({ city, suburbs }) => (
              <div key={city} className="bg-ct-surface rounded-ct-lg border border-ct-line p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-ct-teal" />
                  <h3 className="text-base font-semibold text-ct-paper">{city}</h3>
                  <span className="text-xs text-ct-mute">({suburbs.length} suburbs)</span>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                  {suburbs.map((s) => (
                    <li key={s.slug}>
                      <Link
                        to={findUrl(trade, s.slug)}
                        className="block text-sm text-ct-mute-2 hover:text-ct-teal hover:bg-ct-surface-2 rounded-md px-2 py-1.5 transition-colors"
                      >
                        {plural} in {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <section className="bg-ct-ink rounded-ct-lg px-6 py-10 sm:px-10 sm:py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ct-ink">
            Post your {label.toLowerCase()} job free
          </h2>
          <p className="mt-3 text-base text-ct-mute max-w-xl mx-auto">
            Verified {label.toLowerCase()}s in your area get notified and quote within hours. No lead fees, no auctions, escrow-protected payment.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/post-lead?trade=${trade}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-teal hover:brightness-110 text-ct-ink font-semibold rounded-ct-md transition-colors"
            >
              Post a job
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/help"
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-surface hover:bg-ct-surface-2 border border-ct-line text-ct-ink font-semibold rounded-ct-md transition-colors"
            >
              How it works
            </Link>
          </div>
        </section>

        {/* Suburb hubs for clients — link to /find-in/[suburb] */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold text-ct-paper mb-4">
            All tradies by suburb
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
            {SUBURBS.slice(0, 32).map((s) => (
              <li key={s.slug}>
                <Link
                  to={suburbHubUrl(s.slug)}
                  className="block text-sm text-ct-mute-2 hover:text-ct-teal hover:bg-ct-surface-2 rounded-md px-2 py-1.5 transition-colors"
                >
                  Tradies in {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
