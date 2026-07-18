import { useState, useEffect, useCallback } from 'react';
import { Loader2, Lightbulb, Check, X, TrendingUp } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { TRADE_CATEGORIES } from '../lib/tradeCategories';
import { listCustomTaskSuggestions, approveCustomTask, rejectCustomTask } from '../lib/pricingHelper';
import type { CustomTaskSuggestion } from '../types/database';

// ─────────────────────────────────────────────────────────────────────────────
// AdminCustomTasks — the review pipeline for the "Other" trade feedback loop.
// Tradies describe missing task types; submissions are deduped + counted here so
// admins can fold popular requests into an existing category (or ignore them).
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'approved' | 'rejected';

export default function AdminCustomTasks() {
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [rows, setRows] = useState<CustomTaskSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-row chosen category (defaults to a sensible existing one).
  const [category, setCategory] = useState<Record<string, string>>({});

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    const data = await listCustomTaskSuggestions(t);
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  const approve = async (row: CustomTaskSuggestion) => {
    if (!user) return;
    const cat = (category[row.id] ?? '').trim();
    if (!cat) { showToast('Pick or type a category first', true); return; }
    setBusyId(row.id);
    const r = await approveCustomTask(row.id, user.id, cat);
    setBusyId(null);
    if (r.ok) { showToast(`Approved "${row.task_name}" → ${cat}`); setRows((prev) => prev.filter((x) => x.id !== row.id)); }
    else showToast('Could not approve — try again', true);
  };

  const reject = async (row: CustomTaskSuggestion) => {
    if (!user) return;
    setBusyId(row.id);
    const r = await rejectCustomTask(row.id, user.id);
    setBusyId(null);
    if (r.ok) { showToast('Dismissed'); setRows((prev) => prev.filter((x) => x.id !== row.id)); }
    else showToast('Could not update — try again', true);
  };

  return (
    <DashboardLayout>
      <Breadcrumbs />
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-secondary-50 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-secondary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Task Requests</h1>
            <p className="text-gray-600 mt-1 text-sm">Tradies suggested these from the “Other” trade. Approve popular ones into a category so they appear as quick-add tasks.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(['pending', 'approved', 'rejected'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-warm-500 text-warm-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <Lightbulb className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nothing {tab} right now.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div key={row.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-semibold text-gray-900">{row.task_name}</span>
                      {row.times_submitted > 1 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          <TrendingUp className="w-3 h-3" /> {row.times_submitted}× requested
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {row.trade_context ? `From "${row.trade_context}" · ` : ''}first seen {new Date(row.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {row.status === 'approved' && row.approved_as_category ? ` · added to ${row.approved_as_category}` : ''}
                    </p>
                  </div>
                </div>

                {tab === 'pending' && (
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <input
                      list="trade-categories"
                      value={category[row.id] ?? ''}
                      onChange={(e) => setCategory((c) => ({ ...c, [row.id]: e.target.value }))}
                      placeholder="Add to category… (or type a new one)"
                      className="flex-1 min-w-[200px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-500"
                    />
                    <button onClick={() => approve(row)} disabled={busyId === row.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                      {busyId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                    </button>
                    <button onClick={() => reject(row)} disabled={busyId === row.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                      <X className="w-4 h-4" /> Ignore
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Existing categories for the datalist autocomplete */}
        <datalist id="trade-categories">
          {TRADE_CATEGORIES.map((c) => <option key={c.value} value={c.label} />)}
        </datalist>
      </div>
      {toast.show && <Toast message={toast.message} type={toast.isError ? 'error' : 'success'} onClose={hideToast} />}
    </DashboardLayout>
  );
}
