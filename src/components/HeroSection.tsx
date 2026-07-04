import { useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ArrowRight, AlertTriangle, ShieldCheck, FileText, Users, Wallet } from 'lucide-react';

/**
 * Main landing hero — tradie-first ("run your business in one app").
 * Deliberately NOT a trade-search box: leading with the product (calendar,
 * invoicing, escrow) reads as software, not a directory, which is how we avoid
 * being pattern-matched to lead-gen marketplaces. The homeowner/trust hero
 * lives on /hire (HireHeroSection).
 */
export default function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-navy-900" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-warm-500/10 text-warm-400 rounded-full text-sm font-semibold mb-6 border border-warm-500/20">
              <Wallet className="w-4 h-4" />
              For Australian tradies · Free to start · No per-lead fees
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-[-0.02em]">
              <span className="text-white">Run your whole trade business in one app</span>
              <span className="text-white"> — and </span>
              <span className="text-warm-500">get paid, safely.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Jobs, site calendar, team scheduling and GST invoicing in one place — with payments secured by Stripe. No bidding wars. Keep more of every job.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 active:scale-95"
              >
                Start free — no credit card
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#platform"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-navy-800 text-white font-semibold rounded-xl border border-navy-700 hover:bg-navy-700 transition-colors"
              >
                See the tools
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-sky-400" />
                <span>Calendar stops double-bookings</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-warm-500" />
                <span>One-tap GST invoices</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Paid via Stripe escrow</span>
              </div>
            </div>

            {/* Homeowner entry — keeps the buyer side one tap away */}
            <p className="mt-8 text-sm text-gray-500">
              Looking to hire a tradie instead?{' '}
              <button onClick={() => navigate('/hire')} className="text-warm-400 font-semibold hover:text-warm-300 underline underline-offset-2">
                See how hiring works
              </button>
            </p>
          </div>

          {/* Right side — Site Calendar product visual (shows "software", not "directory") */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative pt-8 pb-8 px-4">
              <div className="bg-navy-800 rounded-2xl shadow-xl shadow-black/30 border border-navy-700 overflow-hidden max-w-md mx-auto">
                <div className="px-5 py-4 bg-[#1a2740] border-b border-white/10">
                  <p className="text-sm font-semibold text-[#f1f5f9] flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-warm-400" /> Site Calendar — this week
                  </p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">Mon 12 – Sun 18 May</p>
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                    <span className="text-[10px] font-bold text-gray-500 uppercase w-8 shrink-0">Mon</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">Bathroom reno — Parramatta</p>
                      <p className="text-[10px] text-gray-500">Morning</p>
                    </div>
                    <Users className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] font-bold text-gray-500 uppercase w-8 shrink-0">Tue</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">Switchboard — Penrith</p>
                      <p className="text-[10px] text-gray-500">Afternoon</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-warm-500/10 border border-warm-500/20">
                    <span className="text-[10px] font-bold text-gray-500 uppercase w-8 shrink-0">Wed</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">Roof inspection — Blacktown</p>
                      <p className="text-[10px] text-gray-500">Morning</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                    <span className="text-[10px] font-bold text-gray-500 uppercase w-8 shrink-0">Fri</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">Tile install — 14 Smith St, Bondi</p>
                      <p className="text-[10px] text-gray-500 tabular-nums">9:00 – 1:00 PM</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[11px] font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Clash — same address, overlapping time. Reschedule one to clear.
                  </div>
                </div>
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-3xl" />
            </div>

            <div className="flex items-stretch justify-center gap-4 mt-4 px-4">
              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-warm-500/15 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-warm-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">Keep more of every job</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">No per-lead fees. No bidding wars.</p>
                  </div>
                </div>
              </div>
              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/15 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-sky-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">GST invoicing built in</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">Line-item invoices in one tap</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
