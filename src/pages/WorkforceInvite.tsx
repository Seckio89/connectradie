// ─────────────────────────────────────────────────────────────────────────────
// WorkforceInvite — add a worker and send them a claim invite.
//
// The required-credentials list is pre-filled from credential_types against the
// business's own trade and state, reusing requiredCredentialTypes() so the roster
// and this form can never disagree about what a role needs.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, ShieldCheck } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import {
  EMPLOYMENT_TYPE_LABELS, requiredCredentialTypes, type CredentialType,
} from '../lib/compliance';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const EMPLOYMENT_TYPES = ['employee_full_time', 'employee_part_time', 'employee_casual', 'subcontractor'];
const ROSTER_ROLES: { value: string; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'apprentice', label: 'Apprentice' },
];

export default function WorkforceInvite() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { showToast, toast } = useToast();

  const [types, setTypes] = useState<CredentialType[]>([]);
  const [trade, setTrade] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    employmentType: 'employee_full_time',
    role: 'employee',
    startedAt: '',
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [typesRes, tradeRes] = await Promise.all([
        supabase
          .from('credential_types')
          .select('id, code, label, category, applies_to_trades, state, requires_expiry, requires_document'),
        supabase.from('tradie_details').select('trade_category').eq('profile_id', user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setTypes((typesRes.data ?? []) as CredentialType[]);
      setTrade(tradeRes.data?.trade_category ?? null);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const state = (profile as { license_state?: string | null } | null)?.license_state ?? null;
  const required = useMemo(() => requiredCredentialTypes(types, trade, state), [types, trade, state]);

  const canSubmit = form.fullName.trim().length > 0 && (form.email.trim() || form.mobile.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Your session has expired. Please sign in again.'); return; }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/worker-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim() || undefined,
          mobile: form.mobile.trim() || undefined,
          employmentType: form.employmentType,
          role: form.role,
          startedAt: form.startedAt || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || 'We could not send that invite.');
        return;
      }

      showToast('Invite sent');
      navigate(`/workforce/${payload.teamMemberId}`);
    } catch (e) {
      console.error('WorkforceInvite: submit failed', e);
      setError('We could not send that invite. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <SectionErrorBoundary fallbackTitle="Add a worker">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <Link to="/workforce" className="inline-flex items-center gap-2 text-sm text-ct-mute-2 hover:text-ct-paper">
            <ArrowLeft className="w-4 h-4" /> Back to workforce
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-ct-paper">Add a worker</h1>
            <p className="text-sm text-ct-mute-2 mt-1">
              They will get a link to accept and manage their own tickets and licences.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Form */}
            <div className="lg:col-span-2">
              <div className="bg-ct-surface rounded-ct-md shadow-sm p-6 space-y-4 max-w-lg">
                <div>
                  <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Full name</label>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="e.g. Sam Taylor"
                    className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="sam@example.com"
                      className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Mobile</label>
                    <input
                      type="tel"
                      value={form.mobile}
                      onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                      placeholder="04xx xxx xxx"
                      className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                    />
                  </div>
                </div>
                <p className="text-xs text-ct-mute">Give at least one of email or mobile so we can send the invite.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Employment type</label>
                    <select
                      value={form.employmentType}
                      onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                      className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                    >
                      {EMPLOYMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Role</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                    >
                      {ROSTER_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Start date</label>
                  <input
                    type="date"
                    value={form.startedAt}
                    onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
                    className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                  />
                </div>

                {error && <p className="text-sm text-ct-rose">{error}</p>}

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                  <Link
                    to="/workforce"
                    className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
                  >
                    Cancel
                  </Link>
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={!canSubmit || submitting}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2 min-h-[44px] bg-ct-teal hover:brightness-110 disabled:opacity-50 text-ct-ink rounded-ct-sm text-sm font-medium"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send invite
                  </button>
                </div>
              </div>
            </div>

            {/* Required credentials for this role */}
            <div className="bg-ct-surface rounded-ct-md shadow-sm p-6 max-w-md h-fit">
              <h2 className="text-lg font-semibold text-ct-paper">What this role needs</h2>
              <p className="text-sm text-ct-mute-2 mt-1">
                {trade
                  ? 'Based on your trade and state. You can record extra credentials any time.'
                  : 'Set your trade and state in your profile for a tailored list.'}
              </p>
              {required.length === 0 ? (
                <p className="text-sm text-ct-mute mt-4">No credentials are tracked for this trade yet.</p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {required.map((t) => (
                    <li key={t.id} className="flex items-start gap-2 text-sm text-ct-mute-2">
                      <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-ct-mute" />
                      <span>{t.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ct-mute mt-4">
                Employment type is recorded as you enter it. ConnecTradie does not determine
                whether a worker is an employee or a contractor.
              </p>
            </div>
          </div>
        </div>

        {toast.show && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-ct-sm text-sm text-ct-ink shadow-sm z-50 ${toast.isError ? 'bg-ct-rose' : 'bg-ct-surface'}`}>
            {toast.message}
          </div>
        )}
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}
