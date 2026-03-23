import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, User, Clock, MapPin, Loader2, Pause, Shield, AlertTriangle, X, Briefcase, MoreVertical, Plus, CheckCircle2, FileText as FileTextIcon, Handshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TRADE_OPTIONS } from '../lib/tradeCategories';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getRecurringJobs,
  getUpcomingSessions,
  pauseRecurringJob,
  cancelRecurringJob,
  createRecurringJob,
  suggestRecurringJob,
  getKeywordSuggestions,
  RECURRING_SERVICE_SUBCATEGORIES,
  RECURRING_SERVICE_DESCRIPTIONS,
} from '../lib/recurringJobs';
import type { RecurringJob, RecurringSession, KeywordSuggestion } from '../lib/recurringJobs';
import { getActiveAgreements } from '../lib/ongoingServices';
import type { ServiceAgreement } from '../types/database';
import RecurringSessionCard from './RecurringSessionCard';
import RecurringInvoiceCard from './RecurringInvoiceCard';
import type { RecurringInvoice } from './RecurringInvoiceCard';
import AddressAutocomplete from './AddressAutocomplete';
import { useToast } from '../hooks/useToast';

interface ActiveOneOffJob {
  id: string;
  title: string;
  description: string;
  status: string;
  location_address: string | null;
  budget_amount: number | null;
  created_at: string;
  tradie?: { full_name: string } | null;
}

const TRADE_TO_PROFESSION: Record<string, string> = {
  cleaning: 'Cleaner', cleaner: 'Cleaner',
  plumbing: 'Plumber', plumber: 'Plumber',
  electrician: 'Electrician', electrical: 'Electrician',
  builder: 'Builder', building: 'Builder',
  painter: 'Painter', painting: 'Painter',
  landscaper: 'Landscaper', landscaping: 'Landscaper', gardener: 'Landscaper', gardening: 'Landscaper',
  carpenter: 'Carpenter', carpentry: 'Carpenter',
  roofer: 'Roofer', roofing: 'Roofer',
  concreter: 'Concreter', concreting: 'Concreter',
  bricklayer: 'Bricklayer', bricklaying: 'Bricklayer',
  fencer: 'Fencer', fencing: 'Fencer',
  tiler: 'Tiler', tiling: 'Tiler',
  locksmith: 'Locksmith',
  hvac: 'HVAC', 'air conditioning': 'HVAC',
  'pest control': 'Pest Control', pest: 'Pest Control',
};

function tradeProfession(category: string): string {
  const lower = category.toLowerCase().replace(/_/g, ' ');
  if (TRADE_TO_PROFESSION[lower]) return TRADE_TO_PROFESSION[lower];
  for (const [key, value] of Object.entries(TRADE_TO_PROFESSION)) {
    if (lower.includes(key)) return value;
  }
  // Fallback: capitalize as-is
  return lower.replace(/\b\w/g, c => c.toUpperCase());
}

const HOLD_REASONS = [
  'Going on holiday',
  'Budget reasons',
  'Seasonal — not needed right now',
  'Trying a different provider',
  'Other',
];

// ── Inline Schedule Service Form ──────────────────────────────

function InlineScheduleForm({ userId, onDone, onCancel }: {
  userId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState('');
  const [serviceSubtype, setServiceSubtype] = useState('');
  const [customSubtype, setCustomSubtype] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [budgetType, setBudgetType] = useState<'quote' | 'set'>('quote');
  const [frequency, setFrequency] = useState(12);
  const [preferredTime, setPreferredTime] = useState('');
  const [nextDate, setNextDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [keywords, setKeywords] = useState<KeywordSuggestion[]>([]);
  const [success, setSuccess] = useState(false);

  const tradeKeys = Object.keys(RECURRING_SERVICE_SUBCATEGORIES);
  const subcategories = category ? (RECURRING_SERVICE_SUBCATEGORIES[category] ?? null) : null;
  const hasSubcategories = subcategories !== null && subcategories.length > 0;
  const suggestion = category ? suggestRecurringJob(category) : null;
  const resolvedSubtype = hasSubcategories ? serviceSubtype : customSubtype.trim();

  useEffect(() => {
    if (suggestion) setFrequency(suggestion.frequencyMonths);
    setServiceSubtype('');
    setCustomSubtype('');
    setDescription('');
  }, [category]);

  useEffect(() => {
    if (serviceSubtype && RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]) {
      setDescription(RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]);
    } else if (serviceSubtype) {
      setDescription('');
    }
  }, [serviceSubtype]);

  useEffect(() => {
    if (!serviceSubtype) { setKeywords([]); return; }
    let cancelled = false;
    getKeywordSuggestions(serviceSubtype).then(r => { if (!cancelled) setKeywords(r); });
    return () => { cancelled = true; };
  }, [serviceSubtype]);

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    if (hasSubcategories && !serviceSubtype) return;
    if (!hasSubcategories && !customSubtype.trim()) return;
    setSaving(true);
    try {
      const serviceLabel = resolvedSubtype || category.replace(/_/g, ' ');

      // 1. Create a job record so it enters the quote pipeline (same as one-off)
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          client_id: userId,
          title: serviceLabel,
          description: `[${category}] ${description.trim()}`,
          status: 'pending',
          location_address: location.trim() || null,
          budget_type: budget ? 'fixed_budget' : 'request_quote',
          budget_amount: budget ? Number(budget) : null,
          is_emergency: false,
          priority: 'normal',
          max_quotes: 3,
          scheduled_date: nextDate,
          preferred_time_slot: preferredTime || null,
        })
        .select('id')
        .single();

      if (jobErr) throw new Error(jobErr.message);

      // 2. Create the recurring job linked to the job record
      await createRecurringJob({
        client_id: userId,
        tradie_id: null,
        trade_category: category,
        service_subtype: resolvedSubtype || undefined,
        description: description.trim(),
        frequency_months: frequency,
        next_due_date: nextDate,
        reminder_days_before: 14,
        location: location.trim(),
        agreed_price: budget ? Number(budget) : undefined,
        preferred_time: preferredTime || undefined,
        original_job_id: job.id,
      });

      setSuccess(true);
    } catch (err) {
      console.error('createRecurringJob error:', err);
    }
    setSaving(false);
  };

  if (success) {
    const tradeLabel = resolvedSubtype || category.replace(/_/g, ' ');
    return (
      <div className="bg-white rounded-xl border border-emerald-200 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 capitalize">{tradeLabel} scheduled</h3>
        <p className="text-sm text-gray-500 mt-1">Your ongoing service has been set up. Tradies will be notified.</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <Link
            to={`/search?trade=${encodeURIComponent(
              TRADE_OPTIONS.find(t => t.label.toLowerCase() === category.toLowerCase())?.value || category
            )}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Find a Tradie
          </Link>
          <button
            onClick={onDone}
            className="px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Schedule a Service</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Trade</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">Select a trade...</option>
          {tradeKeys.map(trade => (
            <option key={trade} value={trade}>{trade}</option>
          ))}
        </select>
      </div>

      {category && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
          {hasSubcategories ? (
            <select
              value={serviceSubtype}
              onChange={e => setServiceSubtype(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
            >
              <option value="">Select a service type...</option>
              {subcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customSubtype}
              onChange={e => setCustomSubtype(e.target.value)}
              placeholder="e.g., Annual roof inspection"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
        </div>
      )}

      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-xs text-gray-400 mr-0.5 self-center">Popular:</span>
                {keywords.map(kw => {
                  const included = description.toLowerCase().includes(kw.keyword.toLowerCase());
                  return (
                    <button
                      key={kw.keyword}
                      type="button"
                      onClick={() => {
                        if (!included) setDescription(p => p.trim() ? `${p.trim()}\n• ${kw.keyword}` : `• ${kw.keyword}`);
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        included
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 cursor-default'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-700 cursor-pointer'
                      }`}
                    >
                      {kw.keyword}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => { setBudgetType('quote'); setBudget(''); }}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  budgetType === 'quote'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Require a Quote
              </button>
              <button
                type="button"
                onClick={() => setBudgetType('set')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  budgetType === 'set'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Set a Budget
              </button>
            </div>
            {budgetType === 'set' && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder={suggestion?.priceRange ? `${suggestion.priceRange.min} – ${suggestion.priceRange.max}` : 'Enter budget'}
                  className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location / Address</label>
            <AddressAutocomplete
              value={location}
              onChange={setLocation}
              placeholder="Start typing an address..."
              className="!py-2 !text-sm !rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">How often?</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { value: -3, label: 'Daily' },
                { value: -1, label: 'Weekly' },
                { value: -2, label: 'Fortnightly' },
                { value: 1, label: 'Monthly' },
                { value: 3, label: 'Quarterly' },
                { value: 6, label: '6 Monthly' },
                { value: 12, label: 'Annually' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    frequency === opt.value
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First date</label>
              <input
                type="date"
                value={nextDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setNextDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preferred time</label>
              <select
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="">Flexible</option>
                <option value="07:00">7:00 AM</option>
                <option value="08:00">8:00 AM</option>
                <option value="09:00">9:00 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="13:00">1:00 PM</option>
                <option value="14:00">2:00 PM</option>
                <option value="15:00">3:00 PM</option>
                <option value="16:00">4:00 PM</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !description.trim() || (hasSubcategories ? !serviceSubtype : !customSubtype.trim())}
              className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Schedule Service
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ClientServicesTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([]);
  const [sessionsByJob, setSessionsByJob] = useState<Map<string, RecurringSession[]>>(new Map());
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [oneOffJobs, setOneOffJobs] = useState<ActiveOneOffJob[]>([]);
  const [agreements, setAgreements] = useState<(ServiceAgreement & { tradie?: { full_name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdTarget, setHoldTarget] = useState<string | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    try {
      const jobs = await getRecurringJobs(user.id);
      setRecurringJobs(jobs);
      const sessMap = new Map<string, RecurringSession[]>();
      await Promise.all(
        jobs.filter(j => j.is_active).map(async (job) => {
          try {
            const sessions = await getUpcomingSessions(job.id);
            if (sessions.length > 0) sessMap.set(job.id, sessions);
          } catch { /* ignore */ }
        })
      );
      setSessionsByJob(sessMap);
    } catch { /* ignore */ }
  }, [user]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, agreed_price)')
        .eq('homeowner_id', user.id)
        .in('status', ['sent', 'overdue'])
        .order('created_at', { ascending: false });
      setInvoices((data as RecurringInvoice[]) || []);
    } catch { /* ignore */ }
  }, [user]);

  const fetchAgreements = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getActiveAgreements(user.id, 'client');
      setAgreements(data as (ServiceAgreement & { tradie?: { full_name: string } })[]);
    } catch { /* ignore */ }
  }, [user]);

  const fetchOneOffJobs = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('jobs')
        .select('id, title, description, status, location_address, budget_amount, created_at, tradie:profiles!jobs_tradie_id_fkey(full_name)')
        .eq('client_id', user.id)
        .in('status', ['funded', 'in_progress'])
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      setOneOffJobs((data as unknown as ActiveOneOffJob[]) || []);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchJobs(), fetchInvoices(), fetchOneOffJobs(), fetchAgreements()]);
      setLoading(false);
    };
    load();
  }, [fetchJobs, fetchInvoices, fetchOneOffJobs, fetchAgreements]);

  const handlePause = async (jobId: string) => {
    try {
      await pauseRecurringJob(jobId, 'client');
      showToast('Service put on hold — you can resume anytime');
      setHoldTarget(null);
      setHoldReason('');
      fetchJobs();
    } catch {
      showToast('Something went wrong', true);
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await cancelRecurringJob(jobId, 'client');
      showToast('Service ended');
      setCancelTarget(null);
      fetchJobs();
    } catch {
      showToast('Something went wrong', true);
    }
  };

  const activeJobs = recurringJobs.filter(j => j.is_active);
  const pausedJobs = recurringJobs.filter(j => !j.is_active);

  const freqLabel = (months?: number) => {
    if (!months) return null;
    const map: Record<number, string> = {
      [-3]: 'Daily', [-1]: 'Weekly', [-2]: 'Fortnightly',
      1: 'Monthly', 3: 'Quarterly', 6: 'Every 6 months', 12: 'Annually',
    };
    return map[months] || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (recurringJobs.length === 0 && oneOffJobs.length === 0) {
    return (
      <div className="space-y-6">
        {showForm ? (
          <InlineScheduleForm
            userId={user?.id || ''}
            onDone={() => { setShowForm(false); fetchJobs(); }}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <div className="text-center py-16">
            <RefreshCw className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900">No Ongoing Services</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Schedule regular cleaning, lawn mowing, pool maintenance and more — all managed in one place.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Schedule a Service
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Add new service ── */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Schedule a Service'}
        </button>
      </div>

      {/* ── Inline Schedule Form ── */}
      {showForm && (
        <InlineScheduleForm
          userId={user?.id || ''}
          onDone={() => { setShowForm(false); fetchJobs(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Active Services ── */}
      {activeJobs.length > 0 && (
        <div className="space-y-4">
          {activeJobs.map((job) => {
            const sessions = sessionsByJob.get(job.id) || [];
            const upcoming = sessions.filter(s => s.status === 'scheduled' || s.status === 'pending_confirmation');
            const label = job.service_subtype || job.trade_category.replace(/_/g, ' ');
            const tradeType = tradeProfession(job.trade_category);
            const freq = freqLabel(job.frequency_months);
            const tradieName = (job as Record<string, unknown> & { tradie?: { full_name?: string } }).tradie?.full_name || 'Tradie';
            const taskLines = (job.description || '')
              .split('\n')
              .map(l => l.replace(/^\d+\.\s*/, '').trim())
              .filter(Boolean);

            return (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Service header */}
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 capitalize">{label}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {tradieName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium capitalize">
                          <Shield className="w-3 h-3" />
                          {tradeType}
                        </span>
                        {freq && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {freq}
                          </span>
                        )}
                        {job.location && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {job.location}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {job.agreed_price != null && job.agreed_price > 0 && (
                        <span className="text-sm font-semibold text-emerald-600">
                          ${job.agreed_price.toFixed(2)}
                          <span className="text-xs font-normal text-gray-400 ml-0.5">per visit</span>
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                        Active
                      </span>
                      <div className="relative">
                        <button
                          onClick={() => setMenuOpen(menuOpen === job.id ? null : job.id)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuOpen === job.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
                              <button
                                onClick={() => { setMenuOpen(null); setCancelTarget(null); setHoldTarget(job.id); setHoldReason(''); }}
                                className="w-full px-3 py-2 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2 transition-colors"
                              >
                                <Pause className="w-3.5 h-3.5" />
                                Put on Hold
                              </button>
                              <button
                                onClick={() => { setMenuOpen(null); setHoldTarget(null); setCancelTarget(job.id); }}
                                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                                End Service
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Task requirements */}
                {taskLines.length > 0 && (
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      Task Requirements ({taskLines.length})
                    </p>
                    <ol className="space-y-1.5">
                      {taskLines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="pt-0.5">{line}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Upcoming sessions */}
                {upcoming.length > 0 ? (
                  <div className="p-4 space-y-3">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Upcoming Visits</p>
                    {upcoming.slice(0, 3).map((s) => (
                      <RecurringSessionCard
                        key={s.id}
                        session={s}
                        recurringJobId={job.id}
                        userRole="client"
                        clientId={user?.id}
                        tradieId={job.tradie_id || undefined}
                        preferredTime={job.preferred_time || undefined}
                        onUpdate={() => { fetchJobs(); fetchInvoices(); }}
                      />
                    ))}
                    {upcoming.length > 3 && (
                      <p className="text-xs text-gray-400 text-center">
                        + {upcoming.length - 3} more scheduled
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-gray-400">No upcoming sessions scheduled</p>
                  </div>
                )}

                {/* Hold confirmation panel */}
                {holdTarget === job.id && (
                  <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                        <Pause className="w-3.5 h-3.5" />
                        Why are you putting this on hold?
                      </p>
                      <button onClick={() => { setHoldTarget(null); setHoldReason(''); }} className="text-amber-400 hover:text-amber-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {HOLD_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => setHoldReason(r)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            holdReason === r
                              ? 'bg-amber-200 border-amber-300 text-amber-800'
                              : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handlePause(job.id)}
                      disabled={!holdReason}
                      className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Confirm Hold
                    </button>
                  </div>
                )}

                {/* Cancel confirmation panel */}
                {cancelTarget === job.id && (
                  <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-red-800">Are you sure you want to end this service?</p>
                        <p className="text-xs text-red-600 mt-0.5">
                          This will cancel all upcoming sessions. This action cannot be undone.
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          <button
                            onClick={() => handleCancel(job.id)}
                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            Yes, End Service
                          </button>
                          <button
                            onClick={() => setCancelTarget(null)}
                            className="px-4 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Keep Service
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active One-Off Jobs ── */}
      {oneOffJobs.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Active Jobs</h3>
            <span className="text-xs text-gray-400">{oneOffJobs.length}</span>
          </div>
          <div className="space-y-2">
            {oneOffJobs.map((job) => {
              const tradieName = job.tradie?.full_name || 'Tradie';
              const statusLabel = job.status === 'funded' ? 'Funded' : 'In Progress';
              const statusClasses = job.status === 'funded'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-emerald-100 text-emerald-700';

              return (
                <div key={job.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{job.title}</p>
                      <div className="flex items-center gap-x-3 mt-1">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {tradieName}
                        </span>
                        {job.location_address && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {job.location_address}
                          </span>
                        )}
                        {job.budget_amount != null && (
                          <span className="text-xs text-gray-500">${job.budget_amount.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${statusClasses}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Past Services ── */}
      {pausedJobs.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          {pausedJobs.length} past service{pausedJobs.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* ── Service Agreements ── */}
      {agreements.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Handshake className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Service Agreements</h3>
            <span className="text-xs text-gray-400">{agreements.length}</span>
          </div>
          <div className="space-y-2">
            {agreements.map((ag) => {
              const freq = ag.typical_frequency
                ? ({ daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', as_needed: 'As needed' }[ag.typical_frequency] || ag.typical_frequency)
                : null;
              return (
                <div key={ag.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{ag.title}</p>
                      <div className="flex items-center gap-x-3 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          {ag.tradie?.full_name || 'Tradie'}
                        </span>
                        {freq && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            {freq}
                          </span>
                        )}
                        {ag.address && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {ag.address}
                          </span>
                        )}
                        {ag.rate_per_visit != null && (
                          <span className="text-xs font-medium text-emerald-600">${Number(ag.rate_per_visit).toFixed(2)}/visit</span>
                        )}
                      </div>
                      {ag.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ag.description}</p>
                      )}
                    </div>
                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full flex-shrink-0 capitalize">
                      {ag.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Outstanding Invoices ── */}
      {invoices.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">Outstanding Invoices</h3>
            <span className="text-xs text-gray-400">{invoices.length}</span>
          </div>
          <div className="space-y-3">
            {invoices.map((inv) => (
              <RecurringInvoiceCard key={inv.id} invoice={inv} userRole="client" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
