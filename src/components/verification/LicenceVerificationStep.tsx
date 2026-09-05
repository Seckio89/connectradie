import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ScanLine,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getTradeCategoryLabel } from '../../lib/tradeCategories';
import { AUSTRALIAN_STATES } from '../../lib/licensingRequirements';
import {
  extractLicence,
  fetchLicenceRegister,
  fetchOwnLicenceVerifications,
  hasLicenceOcrConsent,
  LICENCE_STATUS_LABEL,
  startManualLicence,
  submitLicence,
  uploadLicencePhoto,
  type LicenceRegister,
  type LicenceVerification,
  type LicenceVerificationDraft,
} from '../../lib/verification';
import LicenceConsentScreen from './LicenceConsentScreen';

type Phase =
  | 'loading'
  | 'status'      // an existing awaiting_review / verified row — show it
  | 'consent'
  | 'capture'
  | 'reading'
  | 'edit'
  | 'submitting'
  | 'done';

interface LicenceVerificationStepProps {
  tradeCategory: string;
  /** Pre-select the state (from the tradie's address) when known. */
  defaultState?: string | null;
  /** Called when the licence is submitted for review, or when the tradie skips. */
  onFinished?: (outcome: 'submitted' | 'skipped') => void;
  /** Show a "Do this later" link (onboarding) — Settings hides it. */
  allowSkip?: boolean;
}

interface Fields {
  licence_number: string;
  licence_holder_name: string;
  licence_class: string;
  expiry_date: string;
}

const EMPTY_FIELDS: Fields = { licence_number: '', licence_holder_name: '', licence_class: '', expiry_date: '' };

/**
 * The tradie's licence step: consent → photo → "Reading your licence…" →
 * editable, pre-filled fields → submit. Also the "type it myself" path, which
 * skips consent and OCR entirely. Reused by onboarding and Settings → Get verified.
 */
export default function LicenceVerificationStep({ tradeCategory, defaultState, onFinished, allowSkip = false }: LicenceVerificationStepProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [stateCode, setStateCode] = useState<string>(defaultState && AUSTRALIAN_STATES.some((s) => s.value === defaultState) ? defaultState : 'NSW');
  const [existing, setExisting] = useState<LicenceVerification | null>(null);
  const [draft, setDraft] = useState<LicenceVerificationDraft | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [register, setRegister] = useState<LicenceRegister | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const tradeLabel = getTradeCategoryLabel(tradeCategory);

  // On mount: is there already a live row for this trade?
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const rows = await fetchOwnLicenceVerifications(user.id);
      if (cancelled) return;
      const forTrade = rows.filter((r) => r.trade_category === tradeCategory);
      const live = forTrade.find((r) => r.status === 'awaiting_review' || r.status === 'verified');
      if (live) {
        setExisting(live);
        setPhase('status');
        return;
      }
      const draftRow = forTrade.find((r) => r.status === 'extracted');
      if (draftRow) {
        setDraft(draftRow);
        setStateCode(draftRow.state_code);
        setFields({
          licence_number: draftRow.licence_number ?? '',
          licence_holder_name: draftRow.licence_holder_name ?? '',
          licence_class: draftRow.licence_class ?? '',
          expiry_date: draftRow.expiry_date ?? '',
        });
        setRegister(await fetchLicenceRegister(draftRow.register_id));
        setPhase('edit');
        return;
      }
      // Consent already on file → straight to the camera.
      const consented = await hasLicenceOcrConsent(user.id);
      if (cancelled) return;
      setPhase(consented ? 'capture' : 'consent');
    })();
    return () => { cancelled = true; };
  }, [user?.id, tradeCategory]);

  const applyDraft = async (d: LicenceVerificationDraft, n: string | null) => {
    setDraft(d);
    setNote(n);
    setFields({
      licence_number: d.licence_number ?? '',
      licence_holder_name: d.licence_holder_name ?? '',
      licence_class: d.licence_class ?? '',
      expiry_date: d.expiry_date ?? '',
    });
    setRegister(await fetchLicenceRegister(d.register_id));
    setPhase('edit');
  };

  const handleFile = async (file: File | null) => {
    if (!file || !user?.id) return;
    setError('');
    setPhase('reading');
    try {
      const path = await uploadLicencePhoto(user.id, file);
      const res = await extractLicence({ storage_path: path, trade_category: tradeCategory, state_code: stateCode });
      await applyDraft(res.verification, res.note);
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === 'consent_required') {
        setPhase('consent');
        return;
      }
      setError(err instanceof Error ? err.message : "The photo couldn't be read. Try again or type the details.");
      setPhase('capture');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleManual = async () => {
    setError('');
    setPhase('reading');
    try {
      const res = await startManualLicence({ trade_category: tradeCategory, state_code: stateCode });
      await applyDraft(res.verification, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start. Try again.");
      setPhase('capture');
    }
  };

  const handleSubmit = async () => {
    if (!draft) return;
    setError('');
    setPhase('submitting');
    try {
      await submitLicence({ verification_id: draft.id, ...fields });
      setPhase('done');
      onFinished?.('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit. Check the fields and try again.");
      setPhase('edit');
    }
  };

  const canSubmit = fields.licence_number.trim().length >= 3 && fields.licence_holder_name.trim().length >= 2 && !!fields.expiry_date;

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <div className="flex items-center gap-2 text-sm text-ct-mute py-6"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading your licence status</div>;
  }

  if (phase === 'status' && existing) {
    const verified = existing.status === 'verified';
    return (
      <div className={`p-4 rounded-ct-md border flex items-start gap-3 ${verified ? 'bg-ct-teal/[0.14] border-ct-teal/30' : 'bg-ct-amber/[0.13] border-ct-amber/[0.34]'}`} role="status">
        {verified ? <BadgeCheck className="w-5 h-5 text-ct-teal flex-shrink-0 mt-0.5" aria-hidden="true" /> : <Clock className="w-5 h-5 text-ct-amber flex-shrink-0 mt-0.5" aria-hidden="true" />}
        <div>
          <p className={`text-sm font-medium ${verified ? 'text-ct-teal' : 'text-ct-amber'}`}>
            {verified ? `${tradeLabel} licence verified` : `${tradeLabel} licence awaiting review`}
          </p>
          <p className="text-sm text-ct-mute-2 mt-1">
            {verified
              ? `${existing.state_code} licence${existing.expiry_date ? `, valid to ${new Date(existing.expiry_date + 'T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}` : ''}. The photo you uploaded has been deleted.`
              : 'An admin checks it against the state register, usually within a business day. You\'ll get a notification either way, and the photo is deleted as soon as they decide.'}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="p-4 rounded-ct-md border bg-ct-amber/[0.13] border-ct-amber/[0.34] flex items-start gap-3" role="status">
        <Clock className="w-5 h-5 text-ct-amber flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-ct-amber">Licence submitted for review</p>
          <p className="text-sm text-ct-mute-2 mt-1">An admin checks it against the {stateCode} register, usually within a business day. You'll get a notification either way.</p>
        </div>
      </div>
    );
  }

  if (phase === 'consent') {
    return (
      <LicenceConsentScreen
        onAgree={() => setPhase('capture')}
        onTypeInstead={handleManual}
      />
    );
  }

  if (phase === 'reading' || phase === 'submitting') {
    return (
      <div className="py-8 text-center" role="status" aria-live="polite">
        <div className="w-12 h-12 rounded-full bg-ct-teal/[0.14] flex items-center justify-center mx-auto mb-3">
          {phase === 'reading' ? <ScanLine className="w-6 h-6 text-ct-teal animate-pulse" aria-hidden="true" /> : <Loader2 className="w-6 h-6 text-ct-teal animate-spin" aria-hidden="true" />}
        </div>
        <p className="text-sm font-medium text-ct-paper">{phase === 'reading' ? 'Reading your licence…' : 'Submitting…'}</p>
        {phase === 'reading' && <p className="text-xs text-ct-mute mt-1">This takes up to 20 seconds. If it can't read the card you can type the details.</p>}
      </div>
    );
  }

  if (phase === 'capture') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="licence-state" className="block text-sm font-medium text-ct-mute-2 mb-1.5">Which state issued your {tradeLabel.toLowerCase()} licence?</label>
          <select
            id="licence-state"
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
            className="w-full sm:w-64 px-4 py-2.5 border border-ct-line rounded-ct-md focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm"
          >
            {AUSTRALIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {error && (
          <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-center gap-2" role="alert">
            <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-ct-rose">{error}</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          aria-label="Photograph your licence"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-ct-line rounded-ct-md p-6 text-center hover:border-ct-teal/30 hover:bg-ct-surface-2/30 transition-colors"
        >
          <Camera className="w-7 h-7 text-ct-mute mx-auto mb-2" aria-hidden="true" />
          <span className="block text-sm font-medium text-ct-paper">Photograph your licence card</span>
          <span className="block text-xs text-ct-mute mt-1">Or choose a photo · JPEG, PNG or HEIC up to 5 MB · the whole card, flat, in good light</span>
        </button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <button type="button" onClick={handleManual} className="inline-flex items-center gap-1.5 text-ct-teal hover:underline font-medium">
            <Upload className="w-4 h-4" aria-hidden="true" /> Type the details instead
          </button>
          {allowSkip && (
            <button type="button" onClick={() => onFinished?.('skipped')} className="text-ct-mute hover:text-ct-paper">
              Do this later from Settings
            </button>
          )}
        </div>
      </div>
    );
  }

  // phase === 'edit'
  return (
    <div className="space-y-4">
      {note && (
        <div className="p-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm flex items-start gap-2" role="status">
          <AlertTriangle className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-ct-mute-2">{note}</p>
        </div>
      )}
      {!note && draft?.ocr_provider && draft.ocr_provider !== 'manual' && (
        <p className="text-sm text-ct-mute-2 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-ct-teal" aria-hidden="true" />
          We read these from your photo. Check each one against the card and fix anything that's wrong.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="lic-number" className="block text-sm font-medium text-ct-mute-2 mb-1.5">Licence number</label>
          <input id="lic-number" type="text" value={fields.licence_number} onChange={(e) => setFields({ ...fields, licence_number: e.target.value })}
            className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md font-ct-mono text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="lic-holder" className="block text-sm font-medium text-ct-mute-2 mb-1.5">Name on the licence</label>
          <input id="lic-holder" type="text" value={fields.licence_holder_name} onChange={(e) => setFields({ ...fields, licence_holder_name: e.target.value })}
            className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="lic-class" className="block text-sm font-medium text-ct-mute-2 mb-1.5">Licence class or categories</label>
          <input id="lic-class" type="text" value={fields.licence_class} onChange={(e) => setFields({ ...fields, licence_class: e.target.value })}
            placeholder="e.g. Plumber, Drainer, Gasfitter"
            className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="lic-expiry" className="block text-sm font-medium text-ct-mute-2 mb-1.5">Expiry date</label>
          <input id="lic-expiry" type="date" value={fields.expiry_date} onChange={(e) => setFields({ ...fields, expiry_date: e.target.value })}
            className="w-full px-4 py-2.5 border border-ct-line rounded-ct-md font-ct-mono text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal" />
        </div>
      </div>

      {register && (
        <p className="text-xs text-ct-mute flex items-center gap-1.5">
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          An admin will check this against {register.register_name}.
        </p>
      )}

      {error && (
        <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-center gap-2" role="alert">
          <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-ct-rose">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          Submit licence for review
        </button>
        {draft?.storage_path && (
          <button type="button" onClick={() => { setDraft(null); setPhase('capture'); }} className="text-sm text-ct-mute hover:text-ct-paper">
            Retake the photo
          </button>
        )}
        {allowSkip && (
          <button type="button" onClick={() => onFinished?.('skipped')} className="text-sm text-ct-mute hover:text-ct-paper">
            Do this later
          </button>
        )}
      </div>
      <p className="text-xs text-ct-mute">Status: {LICENCE_STATUS_LABEL[(draft?.status ?? 'extracted') as keyof typeof LICENCE_STATUS_LABEL] ?? draft?.status}</p>
    </div>
  );
}
