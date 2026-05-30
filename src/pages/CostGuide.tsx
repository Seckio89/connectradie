// ─────────────────────────────────────────────────────────────────────────────
// CostGuide — /costs/[trade] page.
//
// Targets high-volume head terms like "how much does a plumber cost in
// Australia". hipages currently ranks #1–3 on these with generic advice;
// our edge is real, suburb-level pricing data linked from this hub.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ArrowRight, DollarSign, Shield, Lock, BadgeCheck } from 'lucide-react';
import SEO from '../components/SEO';
import { isValidTradeSlug, tradeLabel, tradePluralLabel, findUrl, costGuideUrl } from '../lib/seoContent/slugs';
import { SUBURBS } from '../lib/seoContent/suburbs';
import { getTradeContent } from '../lib/seoContent/tradeContent';
import LocalCostGuide from '../components/seo/LocalCostGuide';
import LocalFAQ from '../components/seo/LocalFAQ';
import { generateBreadcrumbSchema, generateFAQSchema } from '../lib/seoUtils';
import type { JsonLdSchema } from '../lib/seoUtils';

export default function CostGuide() {
  const { trade: tradeSlug } = useParams<{ trade: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isValidTradeSlug(tradeSlug)) navigate('/', { replace: true });
  }, [tradeSlug, navigate]);

  if (!isValidTradeSlug(tradeSlug)) return null;

  const trade = tradeSlug;
  const label = tradeLabel(trade);
  const plural = tradePluralLabel(trade);

  const ctx = {
    suburb: 'Australia',
    state: 'Australia',
    tradeLabel: label,
    tradeLabelPlural: plural,
  };
  const content = getTradeContent(trade, ctx);

  const featuredSuburbs = SUBURBS.slice(0, 16);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: 'https://connectradie.com.au/' },
    { name: `${label} Costs`, url: `https://connectradie.com.au${costGuideUrl(trade)}` },
  ]);
  const faqSchema = generateFAQSchema(content.faqs.map((f) => ({ question: f.q, answer: f.a })));
  const jsonLd: JsonLdSchema[] = [breadcrumbSchema, faqSchema];

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={`How Much Does a ${label} Cost in Australia? ${new Date().getFullYear()} Price Guide`}
        description={`${label} prices in Australia, broken down by job type and suburb. Hourly rates, fixed-price jobs, and typical job ranges — sourced from real ConnecTradie quotes. Updated for ${new Date().getFullYear()}.`}
        canonical={costGuideUrl(trade)}
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
            <Link
              to="/login"
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5 text-gray-500">
            <li><Link to="/" className="hover:text-gray-900">Home</Link></li>
            <li><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="text-gray-900 font-medium">{label} costs</li>
          </ol>
        </nav>

        {/* Hero */}
        <section className="mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-warm-50 text-warm-700 rounded-full text-xs font-semibold mb-4 border border-warm-100">
            <DollarSign className="w-3.5 h-3.5" />
            Updated {new Date().getFullYear()} · Sourced from real Australian quotes
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900">
            How much does a {label.toLowerCase()} cost in Australia?
          </h1>

          <p className="mt-6 text-base text-gray-700 leading-relaxed">
            {content.intro}
          </p>
        </section>

        {/* Cost table */}
        <section className="mb-10">
          <LocalCostGuide
            rows={content.costGuide}
            tradeLabel={label}
            suburbName="Australia"
          />
        </section>

        {/* License note */}
        <section className="bg-secondary-50 rounded-2xl border border-secondary-100 p-6 sm:p-8 mb-10">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-secondary-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-1.5">
                Licensing requirements
              </h2>
              <p className="text-sm text-gray-700 leading-relaxed">
                {content.licenseNote}
              </p>
            </div>
          </div>
        </section>

        {/* Trust block */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <Lock className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Quotes are fixed</h3>
            <p className="text-xs text-gray-600">Every {label.toLowerCase()} quote on ConnecTradie is fixed-price before you accept it. No surprise add-ons mid-job.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <BadgeCheck className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Held in escrow</h3>
            <p className="text-xs text-gray-600">Your payment sits with Stripe until you approve the work. No upfront deposits, no chasing.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <DollarSign className="w-6 h-6 text-emerald-600 mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">No lead fees</h3>
            <p className="text-xs text-gray-600">Tradies don&apos;t pay to read your job, so that cost isn&apos;t baked into your quote.</p>
          </div>
        </section>

        {/* FAQs */}
        <section className="mb-10">
          <LocalFAQ
            faqs={content.faqs}
            heading={`${label} cost FAQs`}
          />
        </section>

        {/* Suburb-specific cost links */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {label} pricing by suburb
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Pricing varies by location. Tap your suburb for local rates, recent quotes, and verified {label.toLowerCase()}s near you.
          </p>
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
              {featuredSuburbs.map((s) => (
                <li key={s.slug}>
                  <Link
                    to={findUrl(trade, s.slug)}
                    className="block text-sm text-gray-700 hover:text-emerald-600 hover:bg-gray-50 rounded-md px-2 py-1.5 transition-colors"
                  >
                    {label} in {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Footer CTA */}
        <section className="bg-navy-900 rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Get fixed-price quotes from verified {plural.toLowerCase()}
          </h2>
          <p className="mt-3 text-base text-gray-300 max-w-xl mx-auto">
            Post your job in 60 seconds. Free, no lead fees, escrow-protected.
          </p>
          <div className="mt-6">
            <Link
              to={`/post-lead?trade=${trade}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 hover:bg-warm-600 text-white font-semibold rounded-xl transition-colors"
            >
              Post a {label.toLowerCase()} job
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
