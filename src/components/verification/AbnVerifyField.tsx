import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, FileText, Loader2, XCircle } from 'lucide-react';
import {
  formatAbn,
  isValidAbnChecksum,
  normaliseAbn,
  verifyAbn,
  type VerifyAbnResponse,
} from '../../lib/verification';

export type AbnFieldOutcome = Pick<VerifyAbnResponse, 'status' | 'entity_name' | 'business_names' | 'gst_registered' | 'abn_status'>;

interface AbnVerifyFieldProps {
  /** The business name the tradie typed — matched against the register. */
  claimedBusinessName: string;
  initialAbn?: string | null;
  /** A previous outcome to show on mount (e.g. from business_verifications). */
  initialOutcome?: AbnFieldOutcome | null;
  onVerified?: (outcome: AbnFieldOutcome, abn: string) => void;
  disabled?: boolean;
  /** Onboarding uses the larger input; Settings the compact one. */
  size?: 'md' | 'lg';
}

/**
 * ABN input with live checksum validation and a Verify button that calls
 * verify-abn. Three outcomes, three colours by meaning: teal = verified, amber =
 * the register is active but the name didn't match (a person will look), rose =
 * cancelled or not found.
 */
export default function AbnVerifyField({
  claimedBusinessName,
  initialAbn,
  initialOutcome,
  onVerified,
  disabled,
  size = 'md',
}: AbnVerifyFieldProps) {
  const [value, setValue] = useState(initialAbn ? formatAbn(initialAbn) : '');
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<AbnFieldOutcome | null>(initialOutcome ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialOutcome) setOutcome(initialOutcome);
  }, [initialOutcome]);

  const digits = normaliseAbn(value);
  const complete = digits.length === 11;
  const checksumOk = complete && isValidAbnChecksum(digits);
  const nameMissing = !claimedBusinessName.trim();

  const handleChange = (raw: string) => {
    const d = normaliseAbn(raw).slice(0, 11);
    setValue(d.length === 11 ? formatAbn(d) : d.replace(/(\d{2})(\d{3})?(\d{3})?(\d{0,3})?/, (_m, a, b, c, e) => [a, b, c, e].filter(Boolean).join(' ')));
    setOutcome(null);
    setError('');
  };

  const handleVerify = async () => {
    if (!checksumOk || checking) return;
    setChecking(true);
    setError('');
    try {
      const res = await verifyAbn(digits, claimedBusinessName.trim());
      const next: AbnFieldOutcome = {
        status: res.status,
        entity_name: res.entity_name,
        business_names: res.business_names,
        gst_registered: res.gst_registered,
        abn_status: res.abn_status,
      };
      setOutcome(next);
      onVerified?.(next, digits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The ABN check didn't run. Try again.");
    } finally {
      setChecking(false);
    }
  };

  const inputPad = size === 'lg' ? 'py-3' : 'py-2.5';
  const registeredAs = outcome?.entity_name || outcome?.business_names?.[0] || null;

  return (
    <div>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" aria-hidden="true" />
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="e.g. 51 824 753 556"
            aria-label="ABN"
            aria-invalid={complete && !checksumOk}
            disabled={disabled || checking}
            className={`w-full pl-10 pr-4 ${inputPad} border rounded-ct-md font-ct-mono text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal transition-all ${
              complete && !checksumOk ? 'border-ct-rose' : 'border-ct-line'
            }`}
          />
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={disabled || !checksumOk || checking || nameMissing || outcome?.status === 'verified'}
          className="inline-flex items-center gap-2 px-5 py-2 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {checking ? (
            <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking</>
          ) : outcome?.status === 'verified' ? (
            <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Verified</>
          ) : (
            'Verify ABN'
          )}
        </button>
      </div>

      {complete && !checksumOk && (
        <p className="mt-2 text-sm text-ct-rose" role="alert">That isn't a valid ABN. Check the digits against your ABN certificate.</p>
      )}
      {!complete && digits.length > 0 && (
        <p className="mt-2 text-xs text-ct-mute">{11 - digits.length} more digit{11 - digits.length === 1 ? '' : 's'}</p>
      )}
      {checksumOk && nameMissing && !outcome && (
        <p className="mt-2 text-sm text-ct-mute-2">Enter your business name first so it can be matched against the register.</p>
      )}

      {error && (
        <div className="mt-3 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-center gap-2" role="alert">
          <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-ct-rose">{error}</p>
        </div>
      )}

      {outcome?.status === 'verified' && (
        <div className="mt-3 p-3 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm flex items-start gap-2" role="status">
          <CheckCircle2 className="w-4 h-4 text-ct-teal flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ct-teal">ABN verified</p>
            <p className="text-sm text-ct-mute-2">
              Active on the Australian Business Register as <span className="text-ct-paper">{registeredAs}</span>
              {outcome.gst_registered ? ' · registered for GST' : ''}
            </p>
          </div>
        </div>
      )}
      {outcome?.status === 'review' && (
        <div className="mt-3 p-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm flex items-start gap-2" role="status">
          <Clock className="w-4 h-4 text-ct-amber flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ct-amber">We'll review this</p>
            <p className="text-sm text-ct-mute-2">
              The ABN is active but registered as <span className="text-ct-paper">{registeredAs}</span>, which doesn't match the business name you entered. An admin will check it, usually within a business day. You can keep going.
            </p>
          </div>
        </div>
      )}
      {outcome?.status === 'failed' && (
        <div className="mt-3 p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm flex items-start gap-2" role="alert">
          <XCircle className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ct-rose">
              {outcome.abn_status === 'NotFound' ? 'ABN not found' : `ABN is ${outcome.abn_status.toLowerCase()}`}
            </p>
            <p className="text-sm text-ct-mute-2">
              {outcome.abn_status === 'NotFound'
                ? 'The register has no record of this ABN. Check the number on your ABN certificate or at abr.business.gov.au.'
                : 'Only an active ABN can be verified. Reactivate it with the ABR, then check again.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
