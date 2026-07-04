import { useNavigate } from 'react-router-dom';
import { Lock, Shield, CheckCircle2, ShieldCheck, Wallet, ArrowRight } from 'lucide-react';

/**
 * Homeowner-facing hero for /hire. Trust/escrow-led, job-first CTA — no trade
 * search box (a "post your job, get matched" flow captures demand even where
 * live supply is thin, and keeps the page from reading as a search directory).
 */
export default function HireHeroSection() {
  const navigate = useNavigate();

  return (
    <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-navy-900" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-warm-500/10 text-warm-400 rounded-full text-sm font-semibold mb-6 border border-warm-500/20">
              <Lock className="w-4 h-4" />
              Payment held safely until you approve the work
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-[-0.02em]">
              <span className="text-white">Your money stays yours until the job's </span>
              <span className="text-warm-500">done right.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Hire a licensed tradie, get one fair quote, and let Stripe hold your payment safely — released only when you approve the finished work. $0 to post. $0 to quote.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button
                onClick={() => navigate('/post-lead')}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-all shadow-lg shadow-warm-500/25 active:scale-95"
              >
                Post your job — free
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#protected"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-navy-800 text-white font-semibold rounded-xl border border-navy-700 hover:bg-navy-700 transition-colors"
              >
                See how it's protected
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Held in escrow, not by us</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-400" />
                <span>ABN &amp; licence verified</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-warm-500" />
                <span>You approve before anyone's paid</span>
              </div>
            </div>

            <p className="mt-8 text-sm text-gray-500">
              Are you a tradie?{' '}
              <button onClick={() => navigate('/')} className="text-warm-400 font-semibold hover:text-warm-300 underline underline-offset-2">
                Run your business with ConnecTradie
              </button>
            </p>
          </div>

          {/* Right side — Escrow Flow Visual */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative pt-8 pb-8 px-4">
              <div className="bg-navy-800 rounded-2xl shadow-xl shadow-black/30 border border-navy-700 p-6 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">How your money's protected</p>
                    <p className="text-xs text-gray-500">You're in control at every step</p>
                  </div>
                </div>

                <div className="space-y-0">
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-xs font-bold">1</div>
                      <div className="w-0.5 h-8 bg-white/10" />
                    </div>
                    <div className="pt-1 pb-4">
                      <p className="text-sm font-semibold text-white">You accept a quote</p>
                      <p className="text-xs text-gray-500 tabular-nums">Kitchen rewiring — $1,250</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-xs font-bold">2</div>
                      <div className="w-0.5 h-8 bg-white/10" />
                    </div>
                    <div className="pt-1 pb-4">
                      <p className="text-sm font-semibold text-white">Payment secured with Stripe</p>
                      <p className="text-xs text-gray-500">Held safely — never touched by us</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-xs font-bold">3</div>
                      <div className="w-0.5 h-8 bg-white/10" />
                    </div>
                    <div className="pt-1 pb-4">
                      <p className="text-sm font-semibold text-white">Tradie completes the work</p>
                      <p className="text-xs text-gray-500">You track progress in real time</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-warm-500 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                      </div>
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-semibold text-white">You approve — tradie gets paid</p>
                      <p className="text-xs text-gray-500">Not before. No auto-charge surprises.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-3xl" />
            </div>

            <div className="flex items-stretch justify-center gap-4 mt-4 px-4">
              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">Payment Protected</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">Held securely until you approve the work</p>
                  </div>
                </div>
              </div>
              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-warm-500/15 flex items-center justify-center shrink-0">
                    <Wallet className="w-4 h-4 text-warm-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">$0 to post, $0 to quote</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">Compare quotes with no obligation</p>
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
