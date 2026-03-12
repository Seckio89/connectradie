import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, Shield, Star, Clock, ArrowRight } from 'lucide-react';
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 rounded-full text-sm font-semibold mb-6 border border-navy-700">
              <Shield className="w-4 h-4 text-warm-400" />
              Every tradie is verified before you see them
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-[-0.02em]">
              <span className="text-white">Hire Local Tradies</span><br />
              <span className="text-white">with </span><span className="text-warm-500">Total Confidence.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Every tradie on ConnecTradie is ABN-verified, license-checked, and reviewed by real clients — before they can quote you.
            </p>

            <form onSubmit={handleSearch} className="mt-10">
              <div className="flex flex-col sm:flex-row gap-3 p-3 bg-navy-800 rounded-2xl shadow-xl shadow-black/20 border border-navy-700">
                <div className="relative flex-1" ref={dropdownRef}>
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
                      <span className={`flex-1 text-left ${tradeType ? 'text-white' : 'text-gray-500'}`}>
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

                <div className="flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="Postcode (e.g., 2142)"
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
                      : 'bg-warm-500/50 text-white/70 cursor-not-allowed shadow-none'
                  }`}
                >
                  Find Tradies
                </button>
              </div>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-warm-500" />
                <span>ABN & License Checked</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span>
                  {platformStats.average_rating > 0
                    ? `${platformStats.average_rating} Avg Rating`
                    : 'Client-Reviewed Only'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-warm-500" />
                <span>$0 to Post. $0 to Quote.</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-warm-500 -rotate-45" />
                <span>Direct Chat. No Middleman.</span>
              </div>
            </div>
          </div>

          <div className="relative hidden lg:block" aria-hidden="true">
            <div className="relative pt-16 pb-28 px-4">
              {/* Main Tradie Profile Card */}
              <div className="bg-navy-800 rounded-2xl shadow-xl shadow-black/30 border border-navy-700 p-6 max-w-sm mx-auto">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center text-gray-900 font-bold text-lg shrink-0 border-2 border-warm-500">
                    ME
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white truncate">Mike's Electrical</h3>
                      <Shield className="w-4 h-4 text-warm-500 shrink-0" />
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= 4 ? 'text-yellow-400 fill-yellow-400' : 'text-yellow-400 fill-yellow-400/50'}`} />
                      ))}
                      <span className="text-sm font-semibold text-gray-300 ml-1">4.9</span>
                      <span className="text-xs text-gray-500">(127)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="px-2.5 py-0.5 bg-navy-700 text-gray-300 text-xs font-medium rounded-full">Electrician</span>
                      <span className="px-2.5 py-0.5 bg-warm-900/50 text-warm-400 text-xs font-medium rounded-full">Licensed</span>
                      <span className="px-2.5 py-0.5 bg-navy-700 text-gray-300 text-xs font-medium rounded-full">Sydney, NSW</span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex gap-3">
                  <div className="flex-1 bg-warm-500 text-white text-sm font-semibold rounded-xl py-2.5 text-center">
                    Request Quote
                  </div>
                  <div className="px-4 py-2.5 border border-navy-600 text-gray-300 text-sm font-semibold rounded-xl text-center">
                    View Profile
                  </div>
                </div>
              </div>

              {/* Floating Quote Notification */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-72 animate-float-slow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warm-500/20 flex items-center justify-center shrink-0">
                    <ArrowRight className="w-5 h-5 text-warm-400 -rotate-45" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">New Quote Received</p>
                    <p className="text-xs text-gray-400 truncate">Kitchen Rewiring — $1,250</p>
                  </div>
                  <span className="text-xs text-gray-500 font-medium shrink-0">Just now</span>
                </div>
              </div>

              {/* Floating Review Snippet */}
              <div className="absolute -bottom-8 left-0 bg-navy-800 rounded-xl shadow-lg shadow-black/30 border border-navy-700 p-4 w-64 animate-float-slow">
                <div className="flex items-center gap-1 mb-2">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-400 italic leading-snug">"Excellent work, very professional and on time."</p>
                <p className="text-xs text-gray-500 font-medium mt-2">— Sarah M. · Verified Client</p>
              </div>

              {/* Subtle background decoration */}
              <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-warm-500/5 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
