// ─────────────────────────────────────────────────────────────────────────────
// Pricing — public, no gating, no email wall.
//
// The model: ONE fee, one side, one moment — the tradie, on completion, capped.
//   • Clients never pay a platform fee.  • Quoting is always free.
//   • Subscriptions buy a LOWER RATE, never access.
// Tiers load from pricing_tiers (public read) with a static fallback that
// mirrors the seed. The calculator runs the real V2 fee engine and is honest:
// it recommends Free whenever Free is cheaper.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, Crown, Shield, Percent, Calculator, Building2,
} from 'lucide-react';
import SEO from '../components/SEO';
import { supabase } from '../lib/supabase';
import {
  calculatePlatformFeeCentsV2,
  type TierFeeSchedule,
} from '../../supabase/functions/_shared/pricing';
import type { PricingTier } from '../types/database';

// Static mirror of the pricing_tiers seed — used until/if the fetch resolves.
const FALLBACK_TIERS: PricingTier[] = [
  { id: 'free', name: 'Free', monthly_price_cents: 0, annual_monthly_price_cents: null, rate_bps: 1000, reduced_rate_bps: 500, reduced_threshold_cents: 300_000, fee_cap_cents: 90_000, direct_pay_allowed: false, stripe_price_id_monthly: null, stripe_price_id_annual: null, is_active: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'pro', name: 'Pro', monthly_price_cents: 4900, annual_monthly_price_cents: null, rate_bps: 700, reduced_rate_bps: 350, reduced_threshold_cents: 300_000, fee_cap_cents: 63_000, direct_pay_allowed: false, stripe_price_id_monthly: null, stripe_price_id_annual: null, is_active: true, sort_order: 2, created_at: '', updated_at: '' },
  { id: 'pm', name: 'Property Manager', monthly_price_cents: 14900, annual_monthly_price_cents: 11900, rate_bps: 300, reduced_rate_bps: 150, reduced_threshold_cents: 300_000, fee_cap_cents: 27_000, direct_pay_allowed: true, stripe_price_id_monthly: null, stripe_price_id_annual: null, is_active: true, sort_order: 3, created_at: '', updated_at: '' },
];

const scheduleOf = (t: PricingTier): TierFeeSchedule => ({
  rateBps: t.rate_bps,
  reducedRateBps: t.reduced_rate_bps,
  reducedThresholdCents: t.reduced_threshold_cents,
  feeCapCents: t.fee_cap_cents,
});

const dollars = (cents: number, dp = 0) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-AU', { maximumFractionDigits: 1 })}%`;

const TIER_BLURB: Record<string, string> = {
  free: 'Everything you need to run jobs — pay only when you earn.',
  pro: 'A lower rate for busy tradies. The subscription pays for itself.',
  pm: 'For property managers running volume — lowest rate + direct payment.',
};

const TIER_FEATURES: Record<string, string[]> = {
  free: [
    'Unlimited quoting — always free',
    'Full job, team & schedule tools',
    'Escrow payment protection',
    'Invoicing & payment tracking',
    'Fee capped at $900 per job',
  ],
  pro: [
    'Everything in Free',
    'Unlimited AI quote estimates',
    'Recurring services & auto-invoicing',
    '7% platform fee (3.5% above $3k)',
    'Fee capped at $630 per job',
    'Priority in search results',
    'Pro badge on your profile',
  ],
  pm: [
    'Everything in Pro',
    '3% platform fee (1.5% above $3k)',
    'Fee capped at $270 per job',
    'Direct payment allowed (no escrow requirement)',
    'Volume reporting',
  ],
};

// Publicly listed competitor pricing (checked July 2026 — see footnote).
const COMPETITORS = [
  { name: 'ConnecTradie Free', model: '$0/month · 10% only when a job completes, capped at $900', quoting: 'Free', escrow: 'Yes', highlight: true },
  { name: 'hipages', model: 'From ~$129/month on a 12-month contract + lead credits', quoting: 'Costs credits per lead', escrow: 'No', highlight: false },
  { name: 'Airtasker', model: '~15–20% service fee on each task', quoting: 'Free to offer', escrow: 'Payment held', highlight: false },
  { name: 'Oneflare', model: 'Pay-per-lead credits (roughly $5–$60 a lead), win or lose', quoting: 'Costs credits per quote', escrow: 'No', highlight: false },
  { name: 'ServiceSeeking', model: 'Membership or per-lead fees, paid whether you win or not', quoting: 'Paid', escrow: 'No', highlight: false },
];

export default function Pricing() {
  const [tiers, setTiers] = useState<PricingTier[]>(FALLBACK_TIERS);

  // Load the live fee schedule (public read; falls back silently to the mirror).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('pricing_tiers')
          .select('*')
          .eq('is_active', true)
          .order('sort_order');
        if (data && data.length > 0) setTiers(data as PricingTier[]);
      } catch { /* fallback stays */ }
    })();
  }, []);

  // ── Calculator state ──
  const [avgJob, setAvgJob] = useState('400');
  const [jobsPerMonth, setJobsPerMonth] = useState('8');

  const calc = useMemo(() => {
    const jobCents = Math.max(0, Math.round((parseFloat(avgJob) || 0) * 100));
    const jobs = Math.max(0, Math.min(200, Math.round(parseFloat(jobsPerMonth) || 0)));
    if (jobCents === 0 || jobs === 0) return null;
    const rows = tiers.map((t) => {
      const feePerJob = calculatePlatformFeeCentsV2(jobCents, scheduleOf(t)).feeCents;
      const monthlyFees = feePerJob * jobs;
      const total = monthlyFees + t.monthly_price_cents;
      return { tier: t, feePerJob, monthlyFees, total };
    });
    const cheapest = rows.reduce((a, b) => (b.total < a.total ? b : a), rows[0]);
    return { rows, cheapest, jobs };
  }, [tiers, avgJob, jobsPerMonth]);

  return (
    <div className="min-h-screen bg-white">
      <SEO
        title="Pricing"
        description="One fee, one side, one moment: tradies pay a capped platform fee only when a job completes. Quoting is free, clients never pay a fee, and subscriptions just lower your rate."
        canonical="/pricing"
      />
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight text-black">
                Connec<span className="text-warm-500">Tradie</span>
              </span>
            </Link>
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to home
            </Link>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            One fee. Only when you get paid.
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Quoting is always free. Clients never pay a platform fee. A subscription doesn&rsquo;t
            buy access — it just lowers your rate.
          </p>
        </div>
        <p className="text-center text-sm text-gray-500 mb-12">
          Every fee is capped, deducted only when a job completes, and protected by escrow.
        </p>

        {/* Tier cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {tiers.map((t) => {
            const popular = t.id === 'pro';
            return (
              <div
                key={t.id}
                className={`bg-white rounded-2xl p-7 relative ${popular ? 'border-2 border-warm-400' : 'border border-gray-200'}`}
              >
                {popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1 bg-warm-500 text-white text-xs font-bold rounded-full">
                    <Crown className="w-3.5 h-3.5" /> MOST POPULAR
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  {t.id === 'pm' && <Building2 className="w-5 h-5 text-gray-400" />}
                  <h2 className="text-xl font-bold text-gray-900">{t.name}</h2>
                </div>
                <p className="text-sm text-gray-500 mb-4 min-h-[40px]">{TIER_BLURB[t.id] ?? ''}</p>
                <div className="mb-1">
                  <span className="text-4xl font-bold text-gray-900">{dollars(t.monthly_price_cents)}</span>
                  <span className="text-gray-500 text-sm ml-1">/ month</span>
                </div>
                <p className="text-xs text-gray-500 mb-5 min-h-[16px]">
                  {t.annual_monthly_price_cents != null
                    ? `or ${dollars(t.annual_monthly_price_cents)}/mo billed annually`
                    : ' '}
                </p>
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 mb-5">
                  <p className="text-sm font-semibold text-gray-900">
                    {pct(t.rate_bps)} per completed job
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pct(t.reduced_rate_bps)} on the part above {dollars(t.reduced_threshold_cents)} · capped at {dollars(t.fee_cap_cents)}
                  </p>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {(TIER_FEATURES[t.id] ?? []).map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${popular ? 'text-warm-500' : 'text-gray-400'}`} />
                      <span className="text-sm text-gray-700">{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/register?type=tradie"
                  className={`block w-full text-center px-6 py-3 font-semibold rounded-xl transition-colors ${
                    popular
                      ? 'bg-warm-500 text-white hover:bg-warm-600'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t.id === 'free' ? 'Get Started Free' : `Start ${t.name}`}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Calculator */}
        <div className="max-w-3xl mx-auto mb-16">
          <div className="flex items-center gap-2 justify-center mb-2">
            <Calculator className="w-5 h-5 text-warm-500" />
            <h2 className="text-2xl font-bold text-gray-900 text-center">What would you actually pay?</h2>
          </div>
          <p className="text-sm text-gray-500 text-center mb-6">
            Honest answer — including when Free is your best deal.
          </p>
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-6">
            <div className="grid grid-cols-2 gap-4 mb-6 max-w-md mx-auto">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Average job value ($)</label>
                <input
                  type="number" min="0" step="50" value={avgJob}
                  onChange={(e) => setAvgJob(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-warm-400 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Jobs per month</label>
                <input
                  type="number" min="0" max="200" step="1" value={jobsPerMonth}
                  onChange={(e) => setJobsPerMonth(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-warm-400 tabular-nums"
                />
              </div>
            </div>

            {calc ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                        <th className="py-2 pr-4 font-medium">Plan</th>
                        <th className="py-2 pr-4 font-medium">Fee / job</th>
                        <th className="py-2 pr-4 font-medium">Fees / month</th>
                        <th className="py-2 pr-4 font-medium">Subscription</th>
                        <th className="py-2 font-medium">Total / month</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {calc.rows.map(({ tier: t, feePerJob, monthlyFees, total }) => {
                        const best = calc.cheapest.tier.id === t.id;
                        return (
                          <tr key={t.id} className={best ? 'bg-emerald-50/60' : ''}>
                            <td className="py-2.5 pr-4 font-medium text-gray-900">
                              {t.name}
                              {best && (
                                <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                                  Cheapest for you
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-4 tabular-nums text-gray-700">{dollars(feePerJob, 2)}</td>
                            <td className="py-2.5 pr-4 tabular-nums text-gray-700">{dollars(monthlyFees, 2)}</td>
                            <td className="py-2.5 pr-4 tabular-nums text-gray-700">{dollars(t.monthly_price_cents, 2)}</td>
                            <td className="py-2.5 tabular-nums font-semibold text-gray-900">{dollars(total, 2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm text-gray-700 text-center">
                  {calc.cheapest.tier.id === 'free' ? (
                    <>
                      At this volume, <span className="font-semibold">Free is your cheapest option</span> — a
                      subscription wouldn&rsquo;t pay for itself yet. Upgrade later if your volume grows.
                    </>
                  ) : (
                    <>
                      At this volume, <span className="font-semibold">{calc.cheapest.tier.name}</span> saves you{' '}
                      <span className="font-semibold">
                        {dollars(calc.rows.find((r) => r.tier.id === 'free')!.total - calc.cheapest.total, 0)}
                      </span>{' '}
                      a month compared with Free.
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center">Enter a job value and monthly volume to compare plans.</p>
            )}
          </div>
        </div>

        {/* Competitor comparison */}
        <div className="max-w-3xl mx-auto mb-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-6">How that compares</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">What you pay</th>
                  <th className="px-4 py-3 font-medium">Quoting</th>
                  <th className="px-4 py-3 font-medium">Payment protection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMPETITORS.map((c) => (
                  <tr key={c.name} className={c.highlight ? 'bg-emerald-50/60' : 'bg-white'}>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-3 text-gray-700">{c.model}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.quoting}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{c.escrow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400 text-center">
            Competitor pricing as publicly listed, July 2026 — check each provider for current rates. No lead fees,
            no contracts and no pay-to-quote on ConnecTradie, on any plan.
          </p>
        </div>

        {/* The promise */}
        <div className="max-w-3xl mx-auto grid sm:grid-cols-3 gap-4 mb-14">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
            <Percent className="w-6 h-6 text-warm-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">One fee, capped</h3>
            <p className="text-xs text-gray-600">Charged once, on completion, never more than the cap.</p>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
            <Shield className="w-6 h-6 text-warm-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Escrow protected</h3>
            <p className="text-xs text-gray-600">Funds held securely until the work is approved.</p>
          </div>
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
            <Check className="w-6 h-6 text-warm-500 mx-auto mb-2" />
            <h3 className="font-semibold text-gray-900 mb-1 text-sm">Clients pay nothing</h3>
            <p className="text-xs text-gray-600">No client-side platform fees, ever.</p>
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/register?type=tradie"
            className="inline-flex items-center gap-2 px-8 py-4 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 hover:shadow-xl hover:shadow-warm-500/30 hover:-translate-y-0.5"
          >
            Get Started Now <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="mt-3 text-sm text-gray-500">No credit card required. Upgrade or downgrade anytime.</p>
        </div>
      </main>
    </div>
  );
}
