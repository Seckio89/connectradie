// ─────────────────────────────────────────────────────────────────────────────
// WorkerDetail — one worker's credentials, documents and assignment history.
//
// Documents go to the PRIVATE worker-credentials bucket and only the storage PATH
// is persisted. Viewing mints a short-TTL signed URL at click time — there is no
// public path and no long-lived link stored anywhere.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, CalendarDays, FileText, Loader2, Plus, RotateCcw, ShieldCheck, Trash2, Upload,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { getSignedUrl } from '../lib/storage';
import {
  assessCredential, assessWorker, COMPLIANCE_META, EMPLOYMENT_TYPE_LABELS, expiryHint,
  requiredCredentialTypes, ROSTER_STATUS_META, VERIFICATION_META,
  type CredentialType, type WorkerCredential,
} from '../lib/compliance';

interface ExemptionRow {
  credential_type_id: string;
  reason: string | null;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf';

interface WorkerRow {
  id: string;
  business_owner_id: string;
  invite_name: string;
  invite_email: string | null;
  invite_phone: string | null;
  employment_type: string;
  role: string;
  status: string;
  started_at: string | null;
  member_profile_id: string | null;
  trade_specialty: string | null;
}

interface AssignmentRow {
  id: string;
  job_id: string;
  role_on_job: string | null;
  scheduled_date: string | null;
  status: string;
  unassigned_at: string | null;
  jobs: { title: string | null } | { title: string | null }[] | null;
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default function WorkerDetail() {
  const { workerId } = useParams<{ workerId: string }>();
  const { user, profile } = useAuth();
  const { showToast, toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [worker, setWorker] = useState<WorkerRow | null>(null);
  const [types, setTypes] = useState<CredentialType[]>([]);
  const [credentials, setCredentials] = useState<WorkerCredential[]>([]);
  const [exemptions, setExemptions] = useState<ExemptionRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [trade, setTrade] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WorkerCredential | null>(null);

  const [form, setForm] = useState({ credentialTypeId: '', referenceNumber: '', issuedAt: '', expiresAt: '' });

  const load = useCallback(async () => {
    if (!user || !workerId) return;
    setLoading(true);
    setError('');
    try {
      const [workerRes, typesRes, credRes, assignRes, tradeRes, exemptRes] = await Promise.all([
        supabase
          .from('business_team_members')
          .select('id, business_owner_id, invite_name, invite_email, invite_phone, employment_type, role, status, started_at, member_profile_id, trade_specialty')
          .eq('id', workerId)
          .maybeSingle(),
        supabase
          .from('credential_types')
          .select('id, code, label, category, applies_to_trades, state, requires_expiry, requires_document')
          .order('category'),
        supabase
          .from('worker_credentials')
          .select('id, credential_type_id, reference_number, issued_at, expires_at, document_path, verification_status, verified_at')
          .eq('team_member_id', workerId),
        supabase
          .from('job_team_assignments')
          .select('id, job_id, role_on_job, scheduled_date, status, unassigned_at, jobs ( title )')
          .eq('team_member_id', workerId)
          .order('scheduled_date', { ascending: false })
          .limit(25),
        supabase.from('tradie_details').select('trade_category').eq('profile_id', user.id).maybeSingle(),
        supabase
          .from('worker_credential_exemptions')
          .select('credential_type_id, reason')
          .eq('team_member_id', workerId),
      ]);

      if (workerRes.error) throw workerRes.error;
      if (!workerRes.data) { setError('This worker could not be found.'); return; }
      if (typesRes.error) throw typesRes.error;
      if (credRes.error) throw credRes.error;

      setWorker(workerRes.data as WorkerRow);
      setTypes((typesRes.data ?? []) as CredentialType[]);
      setCredentials((credRes.data ?? []) as WorkerCredential[]);
      setAssignments((assignRes.data ?? []) as AssignmentRow[]);
      setTrade(tradeRes.data?.trade_category ?? null);
      setExemptions((exemptRes.data ?? []) as ExemptionRow[]);
    } catch (e) {
      console.error('WorkerDetail: load failed', e);
      setError('We could not load this worker. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user, workerId]);

  useEffect(() => { void load(); }, [load]);

  const state = (profile as { license_state?: string | null } | null)?.license_state ?? null;
  const required = useMemo(() => requiredCredentialTypes(types, trade, state), [types, trade, state]);
  const exemptIds = useMemo(
    () => new Set(exemptions.map((e) => e.credential_type_id)),
    [exemptions],
  );
  const compliance = useMemo(
    () => assessWorker(required, credentials, new Date(), exemptIds),
    [required, credentials, exemptIds],
  );

  // Required credentials first (that is the compliance picture), then any extras
  // the business has recorded voluntarily.
  const rows = useMemo(() => {
    const requiredIds = new Set(required.map((t) => t.id));
    const extras = credentials
      .filter((c) => !requiredIds.has(c.credential_type_id))
      .map((c) => {
        const type = types.find((t) => t.id === c.credential_type_id);
        return type ? assessCredential(type, c, new Date(), exemptIds.has(type.id)) : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return [...compliance.assessments, ...extras];
  }, [compliance.assessments, credentials, required, types, exemptIds]);

  const handleAdd = async () => {
    if (!worker || !form.credentialTypeId) return;
    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('worker_credentials').insert({
        team_member_id: worker.id,
        credential_type_id: form.credentialTypeId,
        reference_number: form.referenceNumber.trim() || null,
        issued_at: form.issuedAt || null,
        expires_at: form.expiresAt || null,
      });
      if (insertError) throw insertError;
      setAddOpen(false);
      setForm({ credentialTypeId: '', referenceNumber: '', issuedAt: '', expiresAt: '' });
      showToast('Credential added');
      await load();
    } catch (e) {
      console.error('WorkerDetail: add credential failed', e);
      showToast('Could not add that credential', true);
    } finally {
      setSaving(false);
    }
  };

  // The seeded credential set is a trade-level default, not a determination — we
  // cannot know whether this worker goes on construction sites or near children.
  // Waiving drops the credential out of the rollup; deleting the row restores it.
  const handleSetRequired = async (typeId: string, requiredNow: boolean) => {
    if (!worker) return;
    try {
      if (requiredNow) {
        const { error: delError } = await supabase
          .from('worker_credential_exemptions')
          .delete()
          .eq('team_member_id', worker.id)
          .eq('credential_type_id', typeId);
        if (delError) throw delError;
        showToast('Tracking this credential again');
      } else {
        const { error: insError } = await supabase
          .from('worker_credential_exemptions')
          .insert({ team_member_id: worker.id, credential_type_id: typeId, created_by: user?.id ?? null });
        if (insError) throw insError;
        showToast('Marked as not required');
      }
      await load();
    } catch (e) {
      console.error('WorkerDetail: exemption change failed', e);
      showToast('Could not update that credential', true);
    }
  };

  const handleUpload = async (credential: WorkerCredential, file: File) => {
    if (!worker) return;
    if (file.size > MAX_UPLOAD_BYTES) { showToast('That file is larger than 10MB', true); return; }
    setUploadingId(credential.id);
    try {
      // Path convention is load-bearing — the storage policy resolves
      // segment 2 (team_member_id) against segment 1 (business_owner_id).
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
      const path = `${worker.business_owner_id}/${worker.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('worker-credentials')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      // Store the PATH, never a URL.
      const { error: updateError } = await supabase
        .from('worker_credentials')
        .update({ document_path: path })
        .eq('id', credential.id);
      if (updateError) throw updateError;

      showToast('Document uploaded');
      await load();
    } catch (e) {
      console.error('WorkerDetail: upload failed', e);
      showToast('Could not upload that document', true);
    } finally {
      setUploadingId(null);
    }
  };

  const handleView = async (credential: WorkerCredential) => {
    const url = await getSignedUrl('worker-credentials', credential.document_path, 300);
    if (!url) { showToast('Could not open that document', true); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      const { error: delError } = await supabase.from('worker_credentials').delete().eq('id', toDelete.id);
      if (delError) throw delError;
      showToast('Credential removed');
      setToDelete(null);
      await load();
    } catch (e) {
      console.error('WorkerDetail: delete failed', e);
      showToast('Could not remove that credential', true);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-ct-surface rounded-ct-md shadow-sm p-6 flex items-center justify-center py-16 text-ct-mute">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading worker…</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !worker) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <Link to="/workforce" className="inline-flex items-center gap-2 text-sm text-ct-mute-2 hover:text-ct-paper">
            <ArrowLeft className="w-4 h-4" /> Back to workforce
          </Link>
          <div className="bg-ct-surface rounded-ct-md shadow-sm p-6 max-w-md">
            <p className="text-sm text-ct-rose">{error || 'This worker could not be found.'}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SectionErrorBoundary fallbackTitle="Worker">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <Link to="/workforce" className="inline-flex items-center gap-2 text-sm text-ct-mute-2 hover:text-ct-paper">
            <ArrowLeft className="w-4 h-4" /> Back to workforce
          </Link>

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ct-paper">{worker.invite_name || 'Unnamed worker'}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${ROSTER_STATUS_META[worker.status]?.badgeClass ?? 'bg-ct-surface-2 text-ct-mute-2'}`}>
                  {ROSTER_STATUS_META[worker.status]?.label ?? worker.status}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${COMPLIANCE_META[compliance.state].badgeClass}`}>
                  {COMPLIANCE_META[compliance.state].label}
                </span>
              </div>
              <p className="text-sm text-ct-mute-2 mt-2">
                {EMPLOYMENT_TYPE_LABELS[worker.employment_type] ?? worker.employment_type}
                {worker.started_at ? ` · Started ${worker.started_at}` : ''}
              </p>
              {(worker.invite_email || worker.invite_phone) && (
                <p className="text-sm text-ct-mute-2 mt-1">
                  {[worker.invite_email, worker.invite_phone].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal hover:brightness-110 text-ct-ink rounded-ct-sm text-sm font-medium min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> Add credential
            </button>
          </div>

          {/* Credentials */}
          <div className="bg-ct-surface rounded-ct-md shadow-sm">
            <div className="px-6 py-4 border-b border-ct-line">
              <h2 className="text-lg font-semibold text-ct-paper">Credentials</h2>
              <p className="text-sm text-ct-mute-2 mt-0.5">
                Tickets, checks, licences and insurances. We record the outcome and expiry only.
              </p>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No credentials required"
                description="Set your trade and state in your profile so we know which tickets and licences to track, or add one manually."
                actionLabel="Add credential"
                onAction={() => setAddOpen(true)}
              />
            ) : (
              <ul className="divide-y divide-ct-line">
                {rows.map(({ type, credential, state: credState, daysUntilExpiry }) => (
                  <li key={type.id} className={`px-6 py-4 ${credState === 'not_required' ? 'opacity-60' : ''}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ct-paper">{type.label}</p>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${COMPLIANCE_META[credState].badgeClass}`}>
                            {COMPLIANCE_META[credState].label}
                          </span>
                          {credential && credState !== 'not_required' && (
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${VERIFICATION_META[credential.verification_status].badgeClass}`}>
                              {VERIFICATION_META[credential.verification_status].label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ct-mute mt-1">
                          {credState === 'not_required'
                            ? "You've marked this as not needed for this worker"
                            : credential
                              ? [
                                  credential.reference_number ? `Ref ${credential.reference_number}` : null,
                                  type.requires_expiry ? expiryHint(daysUntilExpiry) : 'No expiry',
                                ].filter(Boolean).join(' · ')
                              : 'Not recorded yet'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {credState === 'not_required' ? (
                          <button
                            onClick={() => void handleSetRequired(type.id, true)}
                            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
                          >
                            <RotateCcw className="w-4 h-4" /> Track again
                          </button>
                        ) : (
                          <>
                        {credential?.document_path && (
                          <button
                            onClick={() => void handleView(credential)}
                            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
                          >
                            <FileText className="w-4 h-4" /> View
                          </button>
                        )}
                        {credential && type.requires_document && (
                          <label className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 cursor-pointer">
                            {uploadingId === credential.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Upload className="w-4 h-4" />}
                            {credential.document_path ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept={ACCEPTED}
                              className="hidden"
                              disabled={uploadingId === credential.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) void handleUpload(credential, file);
                              }}
                            />
                          </label>
                        )}
                        {credential ? (
                          <button
                            onClick={() => setToDelete(credential)}
                            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-ct-rose hover:text-ct-rose text-sm font-medium"
                          >
                            <Trash2 className="w-4 h-4" /> Remove
                          </button>
                        ) : (
                          <button
                            onClick={() => { setForm({ ...form, credentialTypeId: type.id }); setAddOpen(true); }}
                            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
                          >
                            <Plus className="w-4 h-4" /> Record
                          </button>
                        )}
                        {/* Only offered where nothing has been recorded — waiving a
                            credential you already hold would just hide it. */}
                        {!credential && (
                          <button
                            onClick={() => void handleSetRequired(type.id, false)}
                            className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-ct-mute hover:text-ct-mute-2 text-sm font-medium"
                          >
                            <Ban className="w-4 h-4" /> Not required
                          </button>
                        )}
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Assignment history */}
          <div className="bg-ct-surface rounded-ct-md shadow-sm">
            <div className="px-6 py-4 border-b border-ct-line">
              <h2 className="text-lg font-semibold text-ct-paper">Assignment history</h2>
            </div>
            {assignments.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No job assignments yet"
                description="Jobs this worker is put on will show here, with the date and their role on site."
              />
            ) : (
              <ul className="divide-y divide-ct-line">
                {assignments.map((a) => (
                  <li key={a.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ct-paper truncate">
                        {one(a.jobs)?.title || 'Untitled job'}
                      </p>
                      <p className="text-xs text-ct-mute mt-0.5">
                        {[a.role_on_job, a.scheduled_date].filter(Boolean).join(' · ') || 'No date recorded'}
                        {a.unassigned_at ? ' · Unassigned' : ''}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-surface-2 text-ct-mute-2">
                      {a.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="flex items-start gap-2 text-xs text-ct-mute max-w-2xl">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-ct-mute" />
            <span>
              We store whether a check passed and when it expires — never a date of birth,
              visa details, health information or government ID number. Documents are held
              privately and opened through a short-lived link.
            </span>
          </p>
        </div>

        {/* Add credential */}
        <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} maxWidth="md">
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-ct-paper">Add credential</h3>
              <p className="text-sm text-ct-mute-2 mt-0.5">Record the outcome and expiry — not the underlying ID document.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Credential</label>
              <select
                value={form.credentialTypeId}
                onChange={(e) => setForm({ ...form, credentialTypeId: e.target.value })}
                className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              >
                <option value="">Select a credential…</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Reference number</label>
              <input
                type="text"
                value={form.referenceNumber}
                onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Issued</label>
                <input
                  type="date"
                  value={form.issuedAt}
                  onChange={(e) => setForm({ ...form, issuedAt: e.target.value })}
                  className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ct-mute uppercase tracking-wide mb-1">Expires</label>
                <input
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                  className="w-full px-3 py-2 min-h-[44px] border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
              <button
                onClick={() => setAddOpen(false)}
                className="px-4 py-2 min-h-[44px] border border-ct-line text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={!form.credentialTypeId || saving}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 min-h-[44px] bg-ct-teal hover:brightness-110 disabled:opacity-50 text-ct-ink rounded-ct-sm text-sm font-medium"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Add credential
              </button>
            </div>
          </div>
        </Modal>

        {toDelete && (
          <ConfirmModal
            title="Remove this credential?"
            message="The record and its expiry tracking will be removed from this worker. This cannot be undone."
            confirmText="Remove"
            type="danger"
            onCancel={() => setToDelete(null)}
            onConfirm={() => void handleDelete()}
          />
        )}

        {toast.show && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-ct-sm text-sm text-ct-paper shadow-sm z-50 ${toast.isError ? 'bg-ct-rose' : 'bg-ct-surface'}`}>
            {toast.message}
          </div>
        )}
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}
