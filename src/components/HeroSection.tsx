import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Shield, ShieldCheck, Lock, Star, ArrowRight, CheckCircle2, Wallet, Clock } from 'lucide-react';
import { getPlatformStats, type PlatformStats } from '../lib/reviews';
import { TRADE_OPTIONS } from '../lib/tradeCategories';

export default function HeroSection() {
  const [tradeType, setTradeType] = useState('');
  const [postcode, setPostcode] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tradeQuery, setTradeQuery] = useState('');
  const [platformStats, setPlatformStats] = useState<PlatformStats>({
    total_reviews: 0,
    average_rating: 0,
    total_tradies_with_reviews: 0
  });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlatformStats();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const loadPlatformStats = async () => {
    const stats = await getPlatformStats();
    setPlatformStats(stats);
  };

  const tradeOptions = TRADE_OPTIONS;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (tradeType) params.set('trade', tradeType);
    if (postcode) params.set('postcode', postcode);
    navigate(`/search?${params.toString()}`);
  };

  return (
    <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-navy-900" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-warm-500/10 text-warm-400 rounded-full text-sm font-semibold mb-6 border border-warm-500/20">
              <Lock className="w-4 h-4" />
              Stripe-secured payments · 48-hour auto-release · AU-licensed tradies
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-[-0.02em]">
              <span className="text-white">The Platform That Puts</span><br />
              <span className="text-white">You in </span><span className="text-warm-500">Control.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Australian-owned. Stripe holds the money — we don&apos;t. Funds auto-release to your tradie 48 hours after you mark the job done, so nobody has to chase a payment.
            </p>

            <form onSubmit={handleSearch} className="mt-10">
              <div className="flex flex-col sm:flex-row gap-3 p-3 bg-navy-800 rounded-2xl shadow-xl shadow-black/20 border border-navy-700">
                <div className="relative sm:flex-[2] min-w-0" ref={dropdownRef}>
                  <div
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-haspopup="listbox"
                    aria-label="Select a trade"
                    tabIndex={0}
                    className="flex items-center gap-3 px-4 py-3.5 bg-navy-700 rounded-xl cursor-pointer hover:bg-navy-600 transition-colors"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDropdownOpen(!dropdownOpen);
                      } else if (e.key === 'Escape') {
                        setDropdownOpen(false);
                      }
                    }}
                  >
                    <Search className="w-5 h-5 text-gray-500" />
                    {dropdownOpen ? (
                      <input
                        type="text"
                        value={tradeQuery}
                        onChange={(e) => setTradeQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Type to search trades..."
                        autoFocus
                        aria-label="Search trades"
                        className="flex-1 bg-transparent outline-none text-white placeholder-gray-500"
                      />
                    ) : (
                      <span className={`flex-1 text-left truncate ${tradeType ? 'text-white' : 'text-gray-500'}`}>
                        {tradeType ? tradeOptions.find(t => t.value === tradeType)?.label : 'What trade do you need?'}
                      </span>
                    )}
                    <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {dropdownOpen && (
                    <div role="listbox" aria-label="Trade options" className="absolute top-full left-0 right-0 mt-2 bg-navy-800 rounded-xl shadow-lg border border-navy-700 py-2 z-10 max-h-64 overflow-y-auto">
                      {tradeOptions
                        .filter((o) => !tradeQuery.trim() || o.label.toLowerCase().includes(tradeQuery.toLowerCase()))
                        .map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={tradeType === option.value}
                          className="w-full px-4 py-3 text-left hover:bg-navy-700 text-gray-300 hover:text-white transition-colors min-h-[44px] flex items-center"
                          onClick={() => {
                            setTradeType(option.value);
                            setDropdownOpen(false);
                            setTradeQuery('');
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                      {tradeOptions.filter((o) => !tradeQuery.trim() || o.label.toLowerCase().includes(tradeQuery.toLowerCase())).length === 0 && (
                        <div className="px-4 py-3 text-sm text-gray-500">No trades found</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="sm:flex-[1] min-w-0">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="Postcode"
                    aria-label="Australian postcode"
                    value={postcode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPostcode(val);
                    }}
                    className="w-full px-4 py-3.5 bg-navy-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-warm-500 focus:bg-navy-600 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!tradeType}
                  className={`px-6 py-3 font-medium rounded-xl transition-all shadow-md active:scale-95 ${
                    tradeType
                      ? 'bg-warm-500 text-white hover:bg-warm-600 shadow-warm-500/20 hover:shadow-lg hover:shadow-warm-500/25'
                      : 'bg-warm-500 text-white opacity-50 shadow-none'
                  }`}
                >
                  Find Tradies
                </button>
              </div>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Payment Protected</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-400" />
                <span>ABN & License Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                <span>
                  {platformStats.average_rating > 0
                    ? `${platformStats.average_rating} Avg Rating`
                    : 'Client-Reviewed Only'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-warm-500" />
                <span>$0 to Post. $0 to Quote.</span>
              </div>
            </div>

            {/* Mobile escrow trust banner — simplified version of the desktop card */}
            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-gray-500 lg:hidden">
              <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-emerald-500" /> Payment Protected</span>
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-emerald-500" /> 48hr Auto-Release</span>
            </div>
          </div>

          {/* Right side — Escrow Flow Visual */}
          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative pt-8 pb-8 px-4">
              {/* Escrow Flow Card */}
              <div className="bg-navy-800 rounded-2xl shadow-xl shadow-black/30 border border-navy-700 p-6 max-w-md mx-auto">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Secure Payment Flow</p>
                    <p className="text-xs text-gray-500">How your money stays safe</p>
                  </div>
                </div>

                <div className="space-y-0">
                  {/* Step 1 */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-xs font-bold">1</div>
                      <div className="w-0.5 h-8 bg-white/10" />
                    </div>
                    <div className="pt-1 pb-4">
                      <p className="text-sm font-semibold text-white">You accept a quote</p>
                      <p className="text-xs text-gray-500">Kitchen Rewiring — $1,250</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white text-xs font-bold">2</div>
                      <div className="w-0.5 h-8 bg-white/10" />
                    </div>
                    <div className="pt-1 pb-4">
                      <p className="text-sm font-semibold text-white">Payment secured with Stripe</p>
                      <p className="text-xs text-gray-500">Secured by Stripe — not held by us</p>
                    </div>
                  </div>

                  {/* Step 3 */}
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

                  {/* Step 4 */}
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-warm-500 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-white" strokeWidth={2.5} />
                      </div>
                    </div>
                    <div className="pt-1">
                      <p className="text-sm font-semibold text-white">You approve — tradie gets paid</p>
                      <p className="text-xs text-gray-500">You're always in control</p>
                    </div>
                  </div>
                </div>

              </div>

              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-white/[0.02] rounded-full blur-3xl" />
            </div>

            {/* Escrow trust badges below the card */}
            <div className="flex items-stretch justify-center gap-4 mt-4 px-4">
              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56 animate-float-slow">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">Payment Protected</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">Held securely until you approve the work</p>
                  </div>
                </div>
              </div>

              <div className="bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-56 animate-float-slow">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-warm-500/15 flex items-center justify-center shrink-0">
                    <Wallet className="w-4.5 h-4.5 text-warm-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">48-hour Auto-Release</p>
                    <p className="text-[10px] text-gray-400 leading-snug mt-0.5">Tradies get paid without chasing the client</p>
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
