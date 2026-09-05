import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSignedUrl } from '../../lib/storage';
import { getTradeCategoryLabel } from '../../lib/tradeCategories';
import {
  buildRegisterUrl,
  LICENCE_PHOTO_SIGNED_URL_SECONDS,
  LICENCE_UPLOADS_BUCKET,
  reviewLicence,
  templateHasDeepLink,
  type LicenceVerification,
} from '../../lib/verification';

export const REJECTION_REASONS = [
  'Licence number not found on the state register',
  'Licence has expired',
  'Name on licence does not match the account',
  'Licence class does not cover this trade',
  'Photo unreadable — please upload a clearer photo',
  'Other',
] as const;

type RegisterEmbed = { register_name: string; lookup_url_template: string; notes: string | null } | null;

export type QueueRow = LicenceVerification & {
  licence_registers: RegisterEmbed;
  tradie_name: string | null;
  tradie_email: string | null;
};

interface LicenceReviewQueueProps {
  /** Injectable for tests. Defaults to the real Supabase-backed loader. */
  loadQueue?: () => Promise<QueueRow[]>;
  /** Injectable for tests. Defaults to the review-licence edge function. */
  decide?: typeof reviewLicence;
  /** Injectable for tests. Defaults to a 10-minute signed URL from the private bucket. */
  signPhoto?: (path: string) => Promise<string | null>;
}

async function defaultLoadQueue(): Promise<QueueRow[]> {
  const { data, error } = await supabase
    .from('licence_verifications')
    .select('*, licence_registers(register_name, lookup_url_template, notes)')
    .eq('status', 'awaiting_review')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<LicenceVerification & { licence_registers: RegisterEmbed | RegisterEmbed[] }>;
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const names = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.length > 0) {
    // user_id references auth.users, so there is no PostgREST embed to profiles;
    // one extra query for the names the card shows.
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
    for (const p of profiles ?? []) names.set(p.id, { full_name: p.full_name, email: p.email });
  }
  return rows.map((r) => ({
    ...r,
    licence_registers: Array.isArray(r.licence_registers) ? (r.licence_registers[0] ?? null) : r.licence_registers,
    tradie_name: names.get(r.user_id)?.full_name ?? null,
    tradie_email: names.get(r.user_id)?.email ?? null,
  }));
}

const defaultSignPhoto = (path: string) => getSignedUrl(LICENCE_UPLOADS_BUCKET, path, LICENCE_PHOTO_SIGNED_URL_SECONDS);

function Precheck({ ok, label }: { ok: boolean | null; label: string }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : Clock;
  const colour = ok === true ? 'text-ct-teal' : ok === false ? 'text-ct-rose' : 'text-ct-mute';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${colour}`} title={ok === null ? 'Not checked — field was empty' : undefined}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label}{ok === null ? ' (unchecked)' : ''}
    </span>
  );
}

/**
 * Admin review queue for licence photos: awaiting_review rows, oldest first.
 * Each card shows the extracted fields, the three pre-checks, the photo (10-min
 * signed URL) and an "Open state register" link. V = verified, R = rejected on
 * the top card. Buttons disable while a decision is in flight.
 */
export default function LicenceReviewQueue({ loadQueue = defaultLoadQueue, decide = reviewLicence, signPhoto = defaultSignPhoto }: LicenceReviewQueueProps) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string | null>>({});
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const next = await loadQueue();
      setRows(next);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'The queue did not load.');
    } finally {
      setLoading(false);
    }
  }, [loadQueue]);

  useEffect(() => { refresh(); }, [refresh]);

  // Sign photos lazily, once per row.
  useEffect(() => {
    let cancelled = false;
    rows.forEach(async (r) => {
      if (!r.storage_path || r.id in photoUrls) return;
      const url = await signPhoto(r.storage_path);
      if (!cancelled) setPhotoUrls((prev) => ({ ...prev, [r.id]: url }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const effectiveReason = reason === 'Other' ? otherReason.trim() : reason;

  const handleDecision = useCallback(async (row: QueueRow, decision: 'verified' | 'rejected') => {
    if (inFlight) return;
    if (decision === 'rejected' && !effectiveReason) return;
    setInFlight(row.id);
    setActionError((prev) => ({ ...prev, [row.id]: '' }));
    try {
      await decide({ verification_id: row.id, decision, rejection_reason: decision === 'rejected' ? effectiveReason : undefined });
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setRejecting(null);
      setOtherReason('');
    } catch (err) {
      setActionError((prev) => ({ ...prev, [row.id]: err instanceof Error ? err.message : 'The decision was not saved.' }));
    } finally {
      setInFlight(null);
    }
  }, [decide, effectiveReason, inFlight]);

  // Keyboard shortcuts act on the TOP card (oldest), never while typing.
  const top = rows[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (!top || inFlight) return;
      if (e.key === 'v' || e.key === 'V') { e.preventDefault(); handleDecision(top, 'verified'); }
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); setRejecting(top.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, inFlight, handleDecision]);

  const count = useMemo(() => rows.length, [rows]);

  if (fetchError) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-10 h-10 text-ct-rose mx-auto mb-3" aria-hidden="true" />
        <p className="text-ct-paper font-medium">The licence queue didn't load</p>
        <p className="text-sm text-ct-mute-2 mt-1">{fetchError}</p>
        <button onClick={refresh} className="mt-4 inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-medium hover:brightness-110">
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16" role="status"><Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" aria-label="Loading" /></div>;
  }

  if (count === 0) {
    return (
      <div className="text-center py-12">
        <ShieldCheck className="w-12 h-12 text-ct-teal mx-auto mb-3" aria-hidden="true" />
        <p className="text-ct-paper font-medium">No licences waiting for review</p>
        <p className="text-sm text-ct-mute-2 mt-1 max-w-md mx-auto">When a tradie submits a licence photo, it lands here with the extracted details, the pre-checks and a link to the state register.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-ct-line-soft">
      <div className="px-5 py-3 flex items-center justify-between text-xs text-ct-mute">
        <span className="font-ct-mono uppercase tracking-[0.1em]">{count} awaiting review · oldest first</span>
        <span>Shortcuts on the top card: <kbd className="px-1.5 py-0.5 rounded-ct-xs bg-ct-surface-2 border border-ct-line font-ct-mono">V</kbd> verified · <kbd className="px-1.5 py-0.5 rounded-ct-xs bg-ct-surface-2 border border-ct-line font-ct-mono">R</kbd> rejected</span>
      </div>
      {rows.map((row, index) => {
        const busy = inFlight === row.id;
        const anyBusy = inFlight !== null;
        const reg = row.licence_registers;
        const registerUrl = reg ? buildRegisterUrl(reg.lookup_url_template, row.licence_number) : null;
        const deepLink = reg ? templateHasDeepLink(reg.lookup_url_template) : false;
        const photo = photoUrls[row.id];
        const submitted = new Date(row.updated_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
        return (
          <article key={row.id} className="p-5" aria-label={`Licence review for ${row.tradie_name ?? 'tradie'}`} data-testid="licence-review-card">
            <div className="flex flex-col lg:flex-row gap-5">
              {/* Photo */}
              <div className="lg:w-72 flex-shrink-0">
                {row.storage_path ? (
                  photo ? (
                    <a href={photo} target="_blank" rel="noopener noreferrer" className="block rounded-ct-md overflow-hidden border border-ct-line bg-ct-ink">
                      <img src={photo} alt={`Licence card uploaded by ${row.tradie_name ?? 'tradie'}`} className="w-full max-h-64 object-contain" />
                    </a>
                  ) : (
                    <div className="h-40 rounded-ct-md border border-ct-line bg-ct-surface-2 flex items-center justify-center text-ct-mute text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" /> Loading photo</div>
                  )
                ) : (
                  <div className="h-40 rounded-ct-md border border-ct-line bg-ct-surface-2 flex flex-col items-center justify-center text-ct-mute text-sm">
                    <ImageOff className="w-6 h-6 mb-1" aria-hidden="true" />
                    Typed in — no photo
                  </div>
                )}
                <p className="text-xs text-ct-mute mt-2">Photo link expires in 10 min and is deleted the moment you decide.</p>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-ct-display font-semibold text-ct-paper">{row.tradie_name ?? 'Unnamed tradie'}</h3>
                    <p className="text-sm text-ct-mute truncate">{row.tradie_email}</p>
                  </div>
                  <span className="font-ct-mono text-[0.6875rem] uppercase tracking-[0.1em] text-ct-mute">#{index + 1} · submitted {submitted}</span>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-ct-surface-2 rounded-ct-sm p-3 border border-ct-line">
                    <dt className="font-ct-mono text-[0.625rem] uppercase tracking-[0.12em] text-ct-mute">Licence no.</dt>
                    <dd className="font-ct-mono text-sm text-ct-paper mt-1 break-all">{row.licence_number ?? '—'}</dd>
                  </div>
                  <div className="bg-ct-surface-2 rounded-ct-sm p-3 border border-ct-line">
                    <dt className="font-ct-mono text-[0.625rem] uppercase tracking-[0.12em] text-ct-mute">Holder</dt>
                    <dd className="text-sm text-ct-paper mt-1">{row.licence_holder_name ?? '—'}</dd>
                  </div>
                  <div className="bg-ct-surface-2 rounded-ct-sm p-3 border border-ct-line">
                    <dt className="font-ct-mono text-[0.625rem] uppercase tracking-[0.12em] text-ct-mute">Class</dt>
                    <dd className="text-sm text-ct-paper mt-1">{row.licence_class ?? '—'}</dd>
                  </div>
                  <div className="bg-ct-surface-2 rounded-ct-sm p-3 border border-ct-line">
                    <dt className="font-ct-mono text-[0.625rem] uppercase tracking-[0.12em] text-ct-mute">Expiry</dt>
                    <dd className="font-ct-mono text-sm text-ct-paper mt-1">{row.expiry_date ? new Date(row.expiry_date + 'T00:00:00').toLocaleDateString('en-AU') : '—'}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <span className="text-xs text-ct-mute-2">{row.state_code} · {getTradeCategoryLabel(row.trade_category)}</span>
                  <Precheck ok={row.precheck_expiry_ok} label="Not expired" />
                  <Precheck ok={row.precheck_name_match} label="Name matches account" />
                  <Precheck ok={row.precheck_class_match} label="Class covers trade" />
                  {row.ocr_provider && row.ocr_provider !== 'manual' && (
                    <span className="text-xs text-ct-mute">OCR {row.ocr_confidence !== null ? `${Math.round(Number(row.ocr_confidence) * 100)}%` : ''}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {registerUrl ? (
                    <a
                      href={registerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2 border border-ct-line text-ct-paper text-sm font-medium rounded-ct-sm hover:bg-ct-surface-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      Open state register
                    </a>
                  ) : (
                    <span className="text-xs text-ct-mute">No register on file for {row.state_code} · {getTradeCategoryLabel(row.trade_category)}</span>
                  )}
                  {reg && !deepLink && (
                    <span className="text-xs text-ct-mute">{reg.register_name} — search by number: <span className="font-ct-mono text-ct-mute-2 select-all">{row.licence_number}</span></span>
                  )}
                </div>

                {actionError[row.id] && (
                  <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-center gap-2" role="alert">
                    <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0" aria-hidden="true" />
                    <p className="text-sm text-ct-rose">{actionError[row.id]}</p>
                  </div>
                )}

                {rejecting === row.id ? (
                  <div className="space-y-2 max-w-lg">
                    <label htmlFor={`reason-${row.id}`} className="block text-sm font-medium text-ct-mute-2">Reason the tradie will see</label>
                    <select
                      id={`reason-${row.id}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-rose"
                    >
                      {REJECTION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {reason === 'Other' && (
                      <input
                        type="text"
                        value={otherReason}
                        onChange={(e) => setOtherReason(e.target.value)}
                        placeholder="Say what was wrong and what to fix"
                        aria-label="Other rejection reason"
                        className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:outline-none focus:ring-2 focus:ring-ct-rose"
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(row, 'rejected')}
                        disabled={anyBusy || !effectiveReason}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-ct-rose text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
                        Confirm rejected
                      </button>
                      <button type="button" onClick={() => setRejecting(null)} disabled={anyBusy} className="px-5 py-2 border border-ct-line text-ct-mute-2 text-sm font-medium rounded-ct-sm hover:bg-ct-surface-2 disabled:opacity-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleDecision(row, 'verified')}
                      disabled={anyBusy}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />}
                      Verified
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejecting(row.id)}
                      disabled={anyBusy}
                      className="inline-flex items-center gap-2 px-5 py-2 border border-ct-rose/[0.34] text-ct-rose text-sm font-medium rounded-ct-sm hover:bg-ct-rose/[0.13] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      Rejected
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
