import { useState, useEffect, useMemo } from 'react';
import { Plus, GraduationCap, Award, Briefcase, Search, Loader2, HardHat, SlidersHorizontal, Laptop } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import VacancyCard from '../components/VacancyCard';
import PostVacancyModal, { type VacancyFormData } from '../components/PostVacancyModal';
import ApplicationModal from '../components/ApplicationModal';
import VacancyManageModal from '../components/VacancyManageModal';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { TradeVacancyWithEmployer } from '../types/database';

type RoleFilter = 'all' | 'apprentice' | 'qualified' | 'senior_advisory' | 'non_trade';
type ViewTab = 'browse' | 'my_listings';

const ROLE_FILTERS: { value: RoleFilter; label: string; shortLabel?: string; icon: typeof Briefcase }[] = [
  { value: 'all', label: 'All Roles', icon: Briefcase },
  { value: 'apprentice', label: 'Apprenticeships', shortLabel: 'Apprentice', icon: GraduationCap },
  { value: 'qualified', label: 'Qualified', icon: Briefcase },
  { value: 'senior_advisory', label: 'Senior Roles', shortLabel: 'Senior', icon: Award },
  { value: 'non_trade', label: 'Office / Support', shortLabel: 'Office', icon: Laptop },
];

export default function TradeCareers({ embedded = false }: { embedded?: boolean }) {
  const { user, profile, tradieDetails } = useAuth();
  const [vacancies, setVacancies] = useState<TradeVacancyWithEmployer[]>([]);
  const [myApplicationIds, setMyApplicationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewTab, setViewTab] = useState<ViewTab>('browse');

  const [showPostModal, setShowPostModal] = useState(false);
  const [editVacancy, setEditVacancy] = useState<TradeVacancyWithEmployer | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<TradeVacancyWithEmployer | null>(null);
  const [applyVacancy, setApplyVacancy] = useState<TradeVacancyWithEmployer | null>(null);
  const [manageVacancy, setManageVacancy] = useState<TradeVacancyWithEmployer | null>(null);

  const isVerifiedBusiness = profile?.verification_status === 'verified'
    || tradieDetails?.is_verified === true;

  useEffect(() => {
    if (user) {
      fetchVacancies();
      fetchMyApplications();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchVacancies = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trade_vacancies')
      .select(`
        *,
        employer:profiles!trade_vacancies_employer_id_fkey(full_name, avatar_url, verification_status),
        employer_details:profiles!trade_vacancies_employer_id_fkey(tradie_details(business_name, trade_category, is_verified))
      `)
      .order('created_at', { ascending: false });

    const mapped = (data || []).map((row: Record<string, unknown>) => {
      const details = row.employer_details as Record<string, unknown> | null;
      return {
        ...row,
        employer_details: details?.tradie_details || null,
      };
    }) as TradeVacancyWithEmployer[];

    if (user) {
      const myVacancyIds = mapped.filter(v => v.employer_id === user.id).map(v => v.id);
      if (myVacancyIds.length > 0) {
        const { data: counts } = await supabase
          .from('vacancy_applications')
          .select('vacancy_id')
          .in('vacancy_id', myVacancyIds);

        const countMap: Record<string, number> = {};
        (counts || []).forEach((c: { vacancy_id: string }) => {
          countMap[c.vacancy_id] = (countMap[c.vacancy_id] || 0) + 1;
        });

        mapped.forEach(v => {
          if (v.employer_id === user!.id) {
            v.application_count = countMap[v.id] || 0;
          }
        });
      }
    }

    setVacancies(mapped);
    setLoading(false);
  };

  const fetchMyApplications = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('vacancy_applications')
      .select('vacancy_id')
      .eq('applicant_id', user.id);

    setMyApplicationIds(new Set((data || []).map((a: { vacancy_id: string }) => a.vacancy_id)));
  };

  const handlePostVacancy = async (formData: VacancyFormData) => {
    if (!user) return;

    if (editVacancy) {
      const { error } = await supabase
        .from('trade_vacancies')
        .update({ ...formData, updated_at: new Date().toISOString() })
        .eq('id', editVacancy.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('trade_vacancies')
        .insert({ ...formData, employer_id: user.id });
      if (error) throw new Error(error.message);
    }

    setEditVacancy(null);
    await fetchVacancies();
  };

  const handleApply = async (coverLetter: string) => {
    if (!user || !applyVacancy) return;

    const { error } = await supabase
      .from('vacancy_applications')
      .insert({
        vacancy_id: applyVacancy.id,
        applicant_id: user.id,
        cover_letter: coverLetter,
      });

    if (error) {
      if (error.code === '23505') {
        throw new Error('You have already applied for this position.');
      }
      throw new Error(error.message);
    }

    setMyApplicationIds(prev => new Set([...prev, applyVacancy.id]));
    await fetchVacancies();
  };

  // open -> closed; closed -> open (reopen); draft -> open (publish — fires
  // the matching-tradie notification via the draft->open DB trigger).
  const handleToggleStatus = async (vacancy: TradeVacancyWithEmployer) => {
    const newStatus = vacancy.status === 'open' ? 'closed' : 'open';
    await supabase
      .from('trade_vacancies')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', vacancy.id);

    setVacancies(prev => prev.map(v =>
      v.id === vacancy.id ? { ...v, status: newStatus } : v
    ));

    if (manageVacancy?.id === vacancy.id) {
      setManageVacancy({ ...manageVacancy, status: newStatus });
    }
  };

  const handleDeleteVacancy = async (vacancy: TradeVacancyWithEmployer) => {
    const { error } = await supabase
      .from('trade_vacancies')
      .delete()
      .eq('id', vacancy.id);
    if (error) throw new Error(error.message);

    setVacancies(prev => prev.filter(v => v.id !== vacancy.id));
    setManageVacancy(null);
  };

  const myListings = useMemo(
    () => vacancies.filter(v => v.employer_id === user?.id),
    [vacancies, user]
  );

  const browseVacancies = useMemo(() => {
    let filtered = vacancies.filter(v => v.status === 'open' && v.employer_id !== user?.id);

    if (roleFilter !== 'all') {
      filtered = filtered.filter(v => v.role_type === roleFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.title.toLowerCase().includes(q)
        || v.description.toLowerCase().includes(q)
        || v.trade_category.toLowerCase().includes(q)
        || v.location.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [vacancies, roleFilter, searchQuery, user]);

  const displayVacancies = viewTab === 'browse' ? browseVacancies : myListings;

  const content = (
    <>
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recruitment</h1>
            <p className="text-gray-500 mt-1">
              Find apprenticeships, qualified roles, and senior positions in the trades
            </p>
          </div>
          {isVerifiedBusiness && (
            <button
              onClick={() => { setEditVacancy(null); setShowPostModal(true); }}
              className="flex items-center gap-2 px-5 py-2.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 active:scale-[0.98] transition-all shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              Post a Vacancy
            </button>
          )}
        </div>

        {/* gap-3 (not gap-2/gap-4): the mobile CSS force-stacks
            .grid-cols-3.gap-2 (supplies form) and .grid-cols-3.gap-4 (old
            stats rule) to one column — gap-3 keeps this a 3-across row. */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            { label: 'Open Positions', value: vacancies.filter(v => v.status === 'open').length, color: 'bg-secondary-50', iconColor: 'text-secondary-600', Icon: Briefcase },
            { label: 'Apprenticeships', value: vacancies.filter(v => v.status === 'open' && v.role_type === 'apprentice').length, color: 'bg-secondary-50', iconColor: 'text-secondary-600', Icon: GraduationCap },
            { label: 'Senior Roles', value: vacancies.filter(v => v.status === 'open' && v.role_type === 'senior_advisory').length, color: 'bg-warm-50', iconColor: 'text-warm-600', Icon: Award },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm">
              <div className="flex flex-col items-center text-center gap-1 sm:flex-row sm:items-center sm:text-left sm:gap-3">
                <div className={`w-10 h-10 ${stat.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <stat.Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {isVerifiedBusiness && myListings.length > 0 && (
          <div className="flex border-b border-gray-200">
            {([
              { key: 'browse' as ViewTab, label: 'Browse Vacancies' },
              { key: 'my_listings' as ViewTab, label: `My Listings (${myListings.length})` },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setViewTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  viewTab === tab.key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {viewTab === 'browse' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by title, trade, or location..."
                className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            {/* Outer scrolls, inner is the flex row — kept as two elements so the
                mobile CSS rule targeting `.overflow-x-auto.flex > button`
                (flex:1 + overflow:hidden) doesn't squeeze and clip the labels. */}
            <div className="overflow-x-auto pb-1 sm:pb-0 scrollbar-hide scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="flex items-center gap-2 w-max">
                <SlidersHorizontal className="w-4 h-4 text-gray-400 flex-shrink-0" />
                {ROLE_FILTERS.map(f => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.value}
                      onClick={() => setRoleFilter(f.value)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                        roleFilter === f.value
                          ? 'bg-warm-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{f.label}</span>
                      <span className="sm:hidden">{f.shortLabel || f.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-gray-400 animate-spin" />
          </div>
        ) : displayVacancies.length === 0 ? (
          viewTab === 'my_listings' ? (
            <EmptyState
              icon={HardHat}
              title="No listings yet"
              description="Post your first vacancy to start finding skilled workers for your team."
              actionLabel="Post a Vacancy"
              onAction={() => { setEditVacancy(null); setShowPostModal(true); }}
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No vacancies found"
              description={
                roleFilter !== 'all' || searchQuery
                  ? 'Try adjusting your filters or search to find more results.'
                  : 'There are no open positions right now. Check back soon!'
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayVacancies.map(vacancy => (
              <VacancyCard
                key={vacancy.id}
                vacancy={vacancy}
                onApply={setApplyVacancy}
                hasApplied={myApplicationIds.has(vacancy.id)}
                isOwner={vacancy.employer_id === user?.id}
                onManage={setManageVacancy}
              />
            ))}
          </div>
        )}
      </div>

      {showPostModal && (
        <PostVacancyModal
          isOpen={showPostModal}
          onClose={() => { setShowPostModal(false); setEditVacancy(null); setDuplicateFrom(null); }}
          onSave={handlePostVacancy}
          editVacancy={editVacancy}
          duplicateFrom={duplicateFrom}
        />
      )}

      {applyVacancy && (
        <ApplicationModal
          isOpen={!!applyVacancy}
          onClose={() => setApplyVacancy(null)}
          vacancy={applyVacancy}
          onSubmit={handleApply}
        />
      )}

      {manageVacancy && (
        <VacancyManageModal
          isOpen={!!manageVacancy}
          onClose={() => setManageVacancy(null)}
          vacancy={manageVacancy}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDeleteVacancy}
          onEdit={(v) => { setManageVacancy(null); setEditVacancy(v); setShowPostModal(true); }}
          onRepost={(v) => { setManageVacancy(null); setDuplicateFrom(v); setShowPostModal(true); }}
        />
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
