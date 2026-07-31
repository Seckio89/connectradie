// ─────────────────────────────────────────────────────────────────────────────
// FindByLocation — /find-in/[suburb] hub page.
//
// Lists every trade ConnecTradie covers, presented as "{Trade} in {Suburb}".
// Acts as the geographic topic-cluster root for the suburb and a high-level
// entry point for general "tradies in {suburb}" searches.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowRight, Lock, Shield, Wallet, MapPin } from 'lucide-react';
import SEO from '../components/SEO';
import { getSuburb } from '../lib/seoContent/suburbs';
import { TRADE_CATEGORIES } from '../lib/tradeCategories';
import { findUrl, suburbHubUrl, tradePluralLabel } from '../lib/seoContent/slugs';
import { generateBreadcrumbSchema } from '../lib/seoUtils';
import type { JsonLdSchema } from '../lib/seoUtils';

export default function FindByLocation() {
  const { locationSlug } = useParams<{ locationSlug: string }>();
  const navigate = useNavigate();

  const suburb = locationSlug ? getSuburb(locationSlug) : undefined;

  useEffect(() => {
    if (!suburb) navigate('/', { replace: true });
  }, [suburb, navigate]);

  if (!suburb) return null;

  const allTrades = TRADE_CATEGORIES.filter((t) => t.value !== 'other');
  const neighbours = suburb.neighbours
    .map((s) => getSuburb(s))
    .filter((s): s is NonNullable<ReturnType<typeof getSuburb>> => !!s);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: 'https://connectradie.com/' },
    { name: suburb.city, url: `https://connectradie.com${suburbHubUrl(suburb.slug)}` },
    { name: suburb.name, url: `https://connectradie.com${suburbHubUrl(suburb.slug)}` },
  ]);
  const jsonLd: JsonLdSchema[] = [breadcrumbSchema];

  return (
    <div className="min-h-screen bg-ct-surface-2">
      <SEO
        title={`Tradies in ${suburb.name} ${suburb.state} ${suburb.postcode} — Verified, Insured, Stripe-Secured`}
        description={`Find verified, licensed tradies in ${suburb.name} ${suburb.state}. Plumbers, electricians, builders, painters, cleaners and more — every tradie ABN-checked and escrow-paid through Stripe.`}
        canonical={suburbHubUrl(suburb.slug)}
        jsonLd={jsonLd}
      />

      {/* Header */}
      <header className="bg-ct-surface border-b border-ct-line-soft sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-xl font-extrabold tracking-tight text-ct-paper">
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
            <li><span className="text-ct-mute-2">{suburb.city}</span></li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="text-ct-paper font-medium">{suburb.name}</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-ct-teal/[0.14] text-ct-teal rounded-full text-xs font-semibold mb-4 border border-ct-teal/30">
            <Lock className="w-3.5 h-3.5" />
            Stripe-secured · Licence verified · {suburb.state}-based
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ct-paper max-w-3xl">
            Tradies in {suburb.name}
          </h1>
          <p className="mt-2 text-sm text-ct-mute">{suburb.name} {suburb.state} {suburb.postcode}</p>

          <p className="mt-6 text-base text-ct-mute-2 leading-relaxed max-w-3xl">
            Find verified plumbers, electricians, builders, painters, cleaners and every other trade in {suburb.name} {suburb.state}. Every tradie is ABN-verified and (where their trade legally requires it) state licence-checked before they can quote. Your payment sits in Stripe-held escrow until you approve the work — no upfront deposits, no lead fees, no auctions.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={`/post-lead?postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal hover:brightness-110 text-ct-ink text-sm font-semibold rounded-ct-sm transition-colors"
            >
              Post your {suburb.name} job — free
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to={`/search?postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-ct-line text-ct-mute-2 hover:bg-ct-surface-2 text-sm font-semibold rounded-ct-sm transition-colors"
            >
              Browse all {suburb.name} tradies
            </Link>
          </div>
        </section>

        {/* Trust strip */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <Shield className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">Licence verified</h3>
            <p className="text-xs text-ct-mute-2">Plumbers, electricians, builders and other licensed trades have their {suburb.state} contractor licence checked before quoting.</p>
          </div>
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <Wallet className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">Stripe-secured</h3>
            <p className="text-xs text-ct-mute-2">Stripe holds the money until you approve the work. ConnecTradie never touches your funds.</p>
          </div>
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <MapPin className="w-6 h-6 text-ct-teal mb-3" />
            <h3 className="text-sm font-semibold text-ct-paper mb-1">{suburb.name}-based</h3>
            <p className="text-xs text-ct-mute-2">Tradies servicing the {suburb.postcode} postcode area and surrounding suburbs.</p>
          </div>
        </section>

        {/* Trade directory */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-ct-paper mb-2">
            Trades available in {suburb.name}
          </h2>
          <p className="text-sm text-ct-mute-2 mb-6">
            Choose a trade to see verified {suburb.name} tradies, local cost data, and recent reviews.
          </p>

          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-6">
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5">
              {allTrades.map((trade) => (
                <li key={trade.value}>
                  <Link
                    to={findUrl(trade.value, suburb.slug)}
                    className="flex items-center justify-between text-sm text-ct-mute-2 hover:text-ct-teal hover:bg-ct-surface-2 rounded-ct-xs px-2 py-1.5 transition-colors group"
                  >
                    <span>
                      {tradePluralLabel(trade.value)} in <span className="font-medium">{suburb.name}</span>
                    </span>
                    <ArrowRight className="w-3 h-3 text-ct-mute group-hover:text-ct-teal group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Nearby suburbs */}
        {neighbours.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-ct-paper mb-4">
              Tradies in nearby suburbs
            </h2>
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-6">
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {neighbours.map((n) => (
                  <li key={n.slug}>
                    <Link
                      to={suburbHubUrl(n.slug)}
                      className="block text-sm text-ct-mute-2 hover:text-ct-teal hover:bg-ct-surface-2 rounded-ct-xs px-2 py-1.5 transition-colors"
                    >
                      Tradies in {n.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Footer CTA */}
        <section className="bg-ct-ink rounded-ct-lg px-6 py-10 sm:px-10 sm:py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ct-paper">
            Post your {suburb.name} job free
          </h2>
          <p className="mt-3 text-base text-ct-mute max-w-xl mx-auto">
            Verified tradies in {suburb.name} get notified and can quote within hours. No lead fees, no auctions, escrow-protected payment.
          </p>
          <div className="mt-6">
            <Link
              to={`/post-lead?postcode=${suburb.postcode}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-teal hover:brightness-110 text-ct-ink font-semibold rounded-ct-md transition-colors"
            >
              Post a job
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
