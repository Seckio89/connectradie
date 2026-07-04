import { Link } from 'react-router-dom';
import { MapPin, ShieldCheck, Handshake, Ban, ArrowRight, Clock } from 'lucide-react';

/**
 * Secondary landing beat (below the software sections): reveals that
 * ConnecTradie is *also* a two-sided marketplace — homeowners post jobs and
 * matched work comes to the tradie. Deliberately framed from the tradie's side
 * (leads come to you, no per-lead fees, escrow) so it reads as an extension of
 * the product, not a lead-gen directory. The homeowner side lives on /hire.
 */
const benefits = [
  {
    icon: MapPin,
    title: 'Matched local jobs',
    text: 'Homeowners post work across Australia — you get the ones that fit your trade and area.',
  },
  {
    icon: Ban,
    title: 'No per-lead fees',
    text: 'Never pay to see a job or send a quote. No bidding wars to the bottom.',
  },
  {
    icon: ShieldCheck,
    title: 'Paid via escrow',
    text: 'Every job is funded through Stripe before you start — released when the work’s approved.',
  },
];

export default function MarketplaceSection() {
  return (
    <section id="marketplace" className="py-20 lg:py-28 bg-navy-900 border-t border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-6">
              <Handshake className="w-4 h-4 text-warm-400" />
              It’s also a marketplace
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-[-0.02em] leading-tight">
              When you want more work,<br />
              <span className="text-warm-500">it comes to you.</span>
            </h2>

            <p className="mt-6 text-lg text-gray-400 leading-relaxed">
              ConnecTradie isn’t just your back office. Homeowners post jobs every day — you get matched to local ones that suit your trade, quote in a tap, and get paid safely. No per-lead fees. No race to the bottom.
            </p>

            <div className="mt-8 space-y-4">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.title} className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-navy-800 border border-navy-700 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-warm-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{b.title}</p>
                      <p className="text-sm text-gray-400 leading-relaxed mt-0.5">{b.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link
                to="/register?type=tradie"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 active:scale-95"
              >
                Start free — get matched
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/hire"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-navy-800 text-white font-semibold rounded-xl border border-navy-700 hover:bg-navy-700 transition-colors"
              >
                See the homeowner side
              </Link>
            </div>
          </div>

          {/* Right side — incoming job / lead card */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative pt-8 pb-8 px-4">
              <div className="bg-navy-800 rounded-2xl shadow-xl shadow-black/30 border border-navy-700 p-6 max-w-md mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warm-500/10 text-warm-400 text-xs font-semibold border border-warm-500/20">
                    New job near you
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                    <Clock className="w-3 h-3" /> 12 min ago
                  </span>
                </div>

                <p className="text-lg font-bold text-white">Bathroom renovation</p>
                <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-gray-500" /> Parramatta, NSW · 6 km away
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-navy-900/60 border border-navy-700 text-xs text-gray-300">Full reno</span>
                  <span className="px-2.5 py-1 rounded-lg bg-navy-900/60 border border-navy-700 text-xs text-gray-300">Tiling + waterproofing</span>
                  <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-xs text-sky-300">Matches your trade</span>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-navy-700 pt-4">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold">Budget</p>
                    <p className="text-xl font-bold text-white tabular-nums">$4,500</p>
                  </div>
                  <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-warm-500 text-white text-sm font-semibold rounded-lg">
                    Send quote
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-900/60 border border-navy-700">
                  <ShieldCheck className="w-4 h-4 text-warm-400 flex-shrink-0" />
                  <p className="text-[11px] text-gray-400 leading-snug">
                    Funded in Stripe escrow before you start — released when the homeowner approves the work.
                  </p>
                </div>
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
