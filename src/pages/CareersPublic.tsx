import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, DollarSign, Briefcase, Clock, BadgeCheck, GraduationCap, Award, Search, Loader2, HardHat, Laptop } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { supabase } from '../lib/supabase';
import type { PublicVacancy, VacancyRoleType } from '../types/database';
import { formatPay, employmentLabel, ROLE_LABELS, VACANCY_TRADE_OPTIONS, vacancyTradeLabel } from '../lib/vacancyOptions';

const ROLE_FILTERS: { value: 'all' | VacancyRoleType; label: string }[] = [
  { value: 'all', label: 'All roles' },
  { value: 'apprentice', label: 'Apprenticeships' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'senior_advisory', label: 'Senior' },
  { value: 'non_trade', label: 'Office' },
];

const ROLE_ICON: Record<VacancyRoleType, typeof GraduationCap> = {
  apprentice: GraduationCap,
  qualified: Briefcase,
  senior_advisory: Award,
  non_trade: Laptop,
};

const tradeLabel = vacancyTradeLabel;

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? 'Today' : d === 1 ? '1 day ago' : `${d} days ago`;
}

export default function CareersPublic() {
  const [vacancies, setVacancies] = useState<PublicVacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'all' | VacancyRoleType>('all');
  const [trade, setTrade] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('public_vacancies')
        .select('*')
        .order('created_at', { ascending: false });
      setVacancies((data as PublicVacancy[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vacancies.filter(v => {
      if (role !== 'all' && v.role_type !== role) return false;
      if (trade !== 'all' && v.trade_category !== trade) return false;
      if (q && !`${v.title} ${v.description} ${v.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vacancies, role, trade, query]);

  return (
    <div className="min-h-screen bg-navy-900 font-sans antialiased theme-aware flex flex-col">
      <SEO
        title="Trade Jobs & Apprenticeships in Australia"
        description="Browse apprenticeships, qualified tradesperson roles and senior trade jobs across Australia. Free to apply — post your details and get hired by verified trade businesses."
        canonical="/careers"
      />
      <Navbar />
      <main id="main-content" className="flex-1">
        {/* Header */}
        <section className="bg-navy-900 border-b border-navy-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-10 lg:pt-28">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-navy-800 text-gray-300 border border-navy-700 rounded-full text-sm font-semibold mb-5">
                <HardHat className="w-4 h-4 text-warm-400" />
                Trade careers
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-[-0.02em] leading-tight">
                Trade jobs &amp; <span className="text-warm-500">apprenticeships</span>
              </h1>
              <p className="mt-4 text-lg text-gray-400">
                Apprenticeships, qualified roles and senior positions from verified Australian trade businesses. Free to apply.
              </p>
            </div>

            {/* Filters */}
            <div className="mt-8 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search jobs, suburbs…"
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-warm-500 focus:border-transparent outline-none"
                />
              </div>
              <select
                value={trade}
                onChange={e => setTrade(e.target.value)}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-warm-500 focus:border-transparent outline-none"
              >
                <option value="all">All trades</option>
                {VACANCY_TRADE_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <div className="flex gap-2 flex-wrap">
                {ROLE_FILTERS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRole(r.value)}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      role === r.value
                        ? 'bg-warm-500 border-warm-500 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Results */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Briefcase className="w-7 h-7 text-gray-300" />
              </div>
              <h2 className="font-semibold text-gray-700">No open roles right now</h2>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                {vacancies.length === 0
                  ? 'Check back soon — new trade jobs are posted regularly.'
                  : 'No jobs match your filters. Try clearing them.'}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-5">{filtered.length} open {filtered.length === 1 ? 'role' : 'roles'}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map(v => {
                  const RoleIcon = ROLE_ICON[v.role_type] || Briefcase;
                  const pay = formatPay(v);
                  const employer = v.employer_business_name || v.employer_name || 'A ConnecTradie business';
                  return (
                    <Link
                      key={v.id}
                      to={`/careers/${v.id}`}
                      className="block bg-white border border-gray-200 rounded-2xl p-5 hover:shadow-md hover:border-gray-300 transition-all group"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-200">
                          <RoleIcon className="w-3.5 h-3.5" />
                          {ROLE_LABELS[v.role_type]}
                        </span>
                        {v.employment_type && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                            {employmentLabel(v.employment_type)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-gray-900 leading-snug group-hover:text-primary-700 transition-colors">
                        {v.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5 text-sm text-gray-600">
                        <span className="truncate">{employer}</span>
                        {v.employer_verified && <BadgeCheck className="w-4 h-4 text-primary-500 flex-shrink-0" />}
                      </div>
                      {pay && (
                        <div className="flex items-center gap-1.5 mt-3 text-sm font-semibold text-emerald-600">
                          <DollarSign className="w-4 h-4" />
                          {pay}
                        </div>
                      )}
                      <div className="flex items-center gap-4 flex-wrap mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{tradeLabel(v.trade_category)}</span>
                        {v.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{v.location}</span>}
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{timeAgo(v.created_at)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
