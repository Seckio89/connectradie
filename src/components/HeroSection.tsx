import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, ChevronDown, Shield, Star, Clock, ArrowRight, Wrench } from 'lucide-react';
import { getPlatformStats, type PlatformStats } from '../lib/reviews';

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

  const tradeOptions = [
    { value: 'plumber', label: 'Plumber' },
    { value: 'electrician', label: 'Electrician' },
    { value: 'carpenter', label: 'Carpenter' },
    { value: 'painter', label: 'Painter' },
    { value: 'handyman', label: 'Handyman' },
    { value: 'builder', label: 'Builder' },
    { value: 'roofer', label: 'Roofer' },
    { value: 'tiler', label: 'Tiler' },
    { value: 'bricklayer', label: 'Bricklayer' },
    { value: 'plasterer', label: 'Plasterer' },
    { value: 'landscaper', label: 'Landscaper' },
    { value: 'air-conditioning', label: 'Air Conditioning' },
    { value: 'locksmith', label: 'Locksmith' },
    { value: 'glazier', label: 'Glazier' },
    { value: 'concreter', label: 'Concreter' },
    { value: 'fencer', label: 'Fencer' },
    { value: 'pest-control', label: 'Pest Control' },
    { value: 'solar', label: 'Solar Installer' },
    { value: 'pool', label: 'Pool Builder/Technician' },
    { value: 'demolition', label: 'Demolition' },
    { value: 'excavation', label: 'Excavation' },
    { value: 'waterproofing', label: 'Waterproofing' },
    { value: 'flooring', label: 'Flooring Specialist' },
    { value: 'cabinet-maker', label: 'Cabinet Maker' },
    { value: 'renderer', label: 'Rendering Specialist' },
    { value: 'garage-doors', label: 'Garage Doors' },
    { value: 'security', label: 'Security Systems' },
    { value: 'antenna', label: 'Antenna & TV' },
    { value: 'appliance-repair', label: 'Appliance Repair' },
    { value: 'curtains-blinds', label: 'Curtains & Blinds' },
    { value: 'cleaner', label: 'Cleaner' },
    { value: 'private-chef', label: 'Private Chef' },
    { value: 'catering', label: 'Event Catering' },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (tradeType) params.set('trade', tradeType);
    if (postcode) params.set('postcode', postcode);
    navigate(`/search?${params.toString()}`);
  };

  return (
    <section className="relative pt-24 pb-16 lg:pt-32 lg:pb-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-gray-50" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-100/40 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-full text-sm font-medium mb-6">
              <Shield className="w-4 h-4" />
              Australia's Trusted Trade Marketplace
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
              Find Trusted Tradies.<br />
              <span className="text-primary-600">Get Quotes Fast.</span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Post your job, receive quotes from verified and licensed professionals, compare reviews side by side, and hire with confidence -- all in one place.
            </p>

            <form onSubmit={handleSearch} className="mt-10">
              <div className="flex flex-col sm:flex-row gap-3 p-3 bg-white rounded-2xl shadow-xl shadow-gray-200/60 border border-gray-100">
                <div className="relative flex-1" ref={dropdownRef}>
                  <div
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    aria-haspopup="listbox"
                    aria-label="Select a trade"
                    tabIndex={0}
                    className="flex items-center gap-3 px-4 py-3.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
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
                    <Search className="w-5 h-5 text-gray-400" />
                    {dropdownOpen ? (
                      <input
                        type="text"
                        value={tradeQuery}
                        onChange={(e) => setTradeQuery(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Type to search trades..."
                        autoFocus
                        aria-label="Search trades"
                        className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
                      />
                    ) : (
                      <span className={`flex-1 text-left ${tradeType ? 'text-gray-900' : 'text-gray-500'}`}>
                        {tradeType ? tradeOptions.find(t => t.value === tradeType)?.label : 'What trade do you need?'}
                      </span>
                    )}
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {dropdownOpen && (
                    <div role="listbox" aria-label="Trade options" className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-10 max-h-64 overflow-y-auto">
                      {tradeOptions
                        .filter((o) => !tradeQuery.trim() || o.label.toLowerCase().includes(tradeQuery.toLowerCase()))
                        .map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={tradeType === option.value}
                          className="w-full px-4 py-3 text-left hover:bg-primary-50 text-gray-700 hover:text-primary-700 transition-colors min-h-[44px] flex items-center"
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
                    className="w-full px-4 py-3.5 bg-gray-50 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
                  />
                </div>

                <button
                  type="submit"
                  className="px-6 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-all shadow-md shadow-primary-500/20 hover:shadow-lg hover:shadow-primary-500/25 active:scale-95"
                >
                  Search
                </button>
              </div>
            </form>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5 active:scale-95"
              >
                Post a Job Free
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#for-tradies"
                className="inline-flex items-center gap-2 px-6 py-3 text-gray-700 font-semibold rounded-xl border-2 border-gray-200 hover:border-primary-300 hover:text-primary-700 transition-all hover:-translate-y-0.5"
              >
                <Wrench className="w-4 h-4" />
                I'm a Tradie
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                <span>Verified Tradies</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                <span>
                  {platformStats.average_rating > 0
                    ? `${platformStats.average_rating} Average Rating`
                    : 'Be the first to review'}
                </span>
              </div>
              {platformStats.total_reviews > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-primary-600">
                    {platformStats.total_reviews.toLocaleString()} {platformStats.total_reviews === 1 ? 'Review' : 'Reviews'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-500" />
                <span>Real-time Booking</span>
              </div>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative">
              <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-sky-100 to-blue-50 shadow-sm">
                <img
                  src="/hero-group.png"
                  alt="A diverse team of Australian professionals including a builder, plumber, cleaner, and chef."
                  className="w-full h-full object-contain aspect-[4/3] opacity-85 mix-blend-multiply"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
