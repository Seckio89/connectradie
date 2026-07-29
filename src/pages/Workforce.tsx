// ─────────────────────────────────────────────────────────────────────────────
// Workforce — the roster, with compliance at a glance.
//
// Sorted by urgency (expired/missing first, then soonest expiry) because that is
// the column that costs money. Table at md+, cards below — tradies read this on a
// phone in a ute, and a horizontally scrolling table is unusable there.
//
// Backed by business_team_members, the incumbent roster table, NOT a parallel
// `workers` table. See supabase/migrations/20260728205103_workforce_extend_business_team_members.sql.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HardHat, Loader2, Plus, Search, ShieldCheck } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import EmptyState from '../components/EmptyState';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  assessWorker,
  compareByUrgency,
  COMPLIANCE_META,
  EMPLOYMENT_TYPE_LABELS,
  expiryHint,
  requiredCredentialTypes,
  ROSTER_STATUS_META,
  daysUntil,
  type CredentialType,
  type WorkerCompliance,
  type WorkerComplianceState,
  type WorkerCredential,
} from '../lib/compliance';

interface RosterRow {
  id: string;
  invite_name: string;
  invite_email: string | null;
  invite_phone: string | null;
  employment_type: string;
  status: string;
  started_at: string | null;
  member_profile_id: string | null;
}

interface RosterEntry {
  worker: RosterRow;
  compliance: WorkerCompliance;
}

const STATUS_FILTERS = ['all', 'active', 'invited', 'inactive'] as const;

/**
 * "Nothing recorded" is a prompt, not an alarm. Saying "No expiry recorded" for a
 * worker nobody has filled in yet is technically true and useless — tell them how
 * much is left to do instead.
 */
function nextExpiryLabel(c: WorkerCompliance): string {
  if (c.state === 'not_tracked') {
    return c.notRecordedCount > 0 ? `${c.notRecordedCount} to record` : 'Nothing to track';
  }
  return expiryHint(daysUntil(c.soonestExpiry));
}

export default function Workforce() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [complianceFilter, setComplianceFilter] = useState<WorkerComplianceState | 'all'>('all');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [membersRes, typesRes, tradeRes] = await Promise.all([
          supabase
            .from('business_team_members')
            .select('id, invite_name, invite_email, invite_phone, employment_type, status, started_at, member_profile_id')
            .eq('business_owner_id', user.id)
            .is('archived_at', null),
          supabase
            .from('credential_types')
            .select('id, code, label, category, applies_to_trades, state, requires_expiry, requires_document'),
          supabase
            .from('tradie_details')
            .select('trade_category')
            .eq('profile_id', user.id)
            .maybeSingle(),
        ]);

        if (membersRes.error) throw membersRes.error;
        if (typesRes.error) throw typesRes.error;

        const members = (membersRes.data ?? []) as RosterRow[];
        const types = (typesRes.data ?? []) as CredentialType[];
        const trade = tradeRes.data?.trade_category ?? null;
        const state = (profile as { license_state?: string | null } | null)?.license_state ?? null;
        const required = requiredCredentialTypes(types, trade, state);

        let credentials: (WorkerCredential & { team_member_id: string })[] = [];
        let exemptions: { team_member_id: string; credential_type_id: string }[] = [];
        if (members.length > 0) {
          const memberIds = members.map((m) => m.id);
          const [credRes, exemptRes] = await Promise.all([
            supabase
              .from('worker_credentials')
              .select('id, team_member_id, credential_type_id, reference_number, issued_at, expires_at, document_path, verification_status, verified_at')
              .in('team_member_id', memberIds),
            supabase
              .from('worker_credential_exemptions')
              .select('team_member_id, credential_type_id')
              .in('team_member_id', memberIds),
          ]);
          if (credRes.error) throw credRes.error;
          if (exemptRes.error) throw exemptRes.error;
          credentials = (credRes.data ?? []) as (WorkerCredential & { team_member_id: string })[];
          exemptions = exemptRes.data ?? [];
        }

        const byMember = new Map<string, WorkerCredential[]>();
        for (const c of credentials) {
          const list = byMember.get(c.team_member_id) ?? [];
          list.push(c);
          byMember.set(c.team_member_id, list);
        }

        const exemptByMember = new Map<string, Set<string>>();
        for (const e of exemptions) {
          const set = exemptByMember.get(e.team_member_id) ?? new Set<string>();
          set.add(e.credential_type_id);
          exemptByMember.set(e.team_member_id, set);
        }

        const built = members.map((worker) => ({
          worker,
          compliance: assessWorker(
            required,
            byMember.get(worker.id) ?? [],
            new Date(),
            exemptByMember.get(worker.id) ?? new Set<string>(),
          ),
        }));

        if (!cancelled) setEntries(built);
      } catch (e) {
        console.error('Workforce: load failed', e);
        if (!cancelled) setError('We could not load your workforce. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, profile]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries
      .filter((e) => (statusFilter === 'all' ? true : e.worker.status === statusFilter))
      .filter((e) => (complianceFilter === 'all' ? true : e.compliance.state === complianceFilter))
      .filter((e) =>
        !term ||
        e.worker.invite_name.toLowerCase().includes(term) ||
        (e.worker.invite_email ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => compareByUrgency(a.compliance, b.compliance));
  }, [entries, search, statusFilter, complianceFilter]);

  const counts = useMemo(() => ({
    expired: entries.filter((e) => e.compliance.state === 'expired').length,
    expiring_soon: entries.filter((e) => e.compliance.state === 'expiring_soon').length,
    compliant: entries.filter((e) => e.compliance.state === 'compliant').length,
    not_tracked: entries.filter((e) => e.compliance.state === 'not_tracked').length,
  }), [entries]);

  return (
    <DashboardLayout>
      <SectionErrorBoundary fallbackTitle="Workforce">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Workforce</h1>
              <p className="text-sm text-gray-600 mt-1">
                Your team and the tickets, licences and checks that keep them job-ready.
              </p>
            </div>
            <Link
              to="/workforce/invite"
              className="inline-flex items-center gap-2 px-5 py-2 bg-warm-500 hover:bg-warm-600 text-white rounded-lg text-sm font-medium min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              Add worker
            </Link>
          </div>

          {/* Compliance summary — constrained, never full width */}
          {!loading && entries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['expired', 'expiring_soon', 'compliant', 'not_tracked'] as WorkerComplianceState[]).map((state) => (
                <button
                  key={state}
                  onClick={() => setComplianceFilter(complianceFilter === state ? 'all' : state)}
                  className={`max-w-sm w-full text-left bg-white rounded-xl shadow-sm p-6 border transition-colors ${
                    complianceFilter === state ? 'border-warm-500' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${COMPLIANCE_META[state].dotClass}`} />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {COMPLIANCE_META[state].label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{counts[state]}</p>
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          {!loading && entries.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="w-full pl-9 pr-3 py-2 min-h-[44px] border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${
                      statusFilter === s
                        ? 'border-warm-500 text-warm-600 bg-warm-50'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s === 'all' ? 'All' : ROSTER_STATUS_META[s]?.label ?? s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading your workforce…</span>
              </div>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm p-6 max-w-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm">
              <EmptyState
                icon={HardHat}
                title="No workers yet"
                description="Add your first worker to track their tickets, licences and checks — and get told before anything expires."
                actionLabel="Add worker"
                onAction={() => navigate('/workforce/invite')}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm">
              <EmptyState
                icon={Search}
                title="No workers match those filters"
                description="Try clearing the search box or switching the status and compliance filters back to All."
              />
            </div>
          ) : (
            <>
              {/* Cards — mobile. Below the md breakpoint the table is unusable. */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {visible.map(({ worker, compliance }) => (
                  <Link
                    key={worker.id}
                    to={`/workforce/${worker.id}`}
                    className="block bg-white rounded-xl shadow-sm p-6 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{worker.invite_name || 'Unnamed worker'}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {EMPLOYMENT_TYPE_LABELS[worker.employment_type] ?? worker.employment_type}
                        </p>
                      </div>
                      <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${COMPLIANCE_META[compliance.state].badgeClass}`}>
                        {COMPLIANCE_META[compliance.state].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROSTER_STATUS_META[worker.status]?.badgeClass ?? 'bg-gray-100 text-gray-600'}`}>
                        {ROSTER_STATUS_META[worker.status]?.label ?? worker.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {nextExpiryLabel(compliance)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Table — md and up */}
              <div className="hidden md:block bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Worker</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Employment type</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Compliance</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Next expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(({ worker, compliance }) => (
                        <tr
                          key={worker.id}
                          onClick={() => navigate(`/workforce/${worker.id}`)}
                          className="border-b border-gray-200 last:border-0 hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-gray-900">{worker.invite_name || 'Unnamed worker'}</p>
                            {worker.invite_email && (
                              <p className="text-xs text-gray-500 mt-0.5">{worker.invite_email}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {EMPLOYMENT_TYPE_LABELS[worker.employment_type] ?? worker.employment_type}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROSTER_STATUS_META[worker.status]?.badgeClass ?? 'bg-gray-100 text-gray-600'}`}>
                              {ROSTER_STATUS_META[worker.status]?.label ?? worker.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${COMPLIANCE_META[compliance.state].badgeClass}`}>
                              {COMPLIANCE_META[compliance.state].label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {nextExpiryLabel(compliance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {!loading && entries.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-gray-500 max-w-2xl">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-gray-400" />
              <span>
                Employment type is recorded as you enter it. ConnecTradie does not determine
                whether a worker is an employee or a contractor.
              </span>
            </p>
          )}
        </div>
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}
