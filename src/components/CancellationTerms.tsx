import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import {
  fetchCurrentCancellationPolicy,
  fetchJobCancellationAgreement,
  type CancellationPolicy,
} from '../lib/cancellationPolicy';

interface CancellationTermsProps {
  /**
   * Show the terms this job was actually agreed under rather than the current
   * catalogue policy. Pass it whenever the job already exists — editing the
   * policy later must not change what a live job was agreed under.
   */
  jobId?: string;
  /**
   * Renders the acceptance line. The parent records acceptance as part of its
   * own submit, so this is a statement of what submitting means, not a
   * separate checkbox to forget to tick.
   */
  acceptanceLabel?: string;
  className?: string;
}

/**
 * The cancellation terms, shown before the job starts and again if it's
 * cancelled.
 *
 * Styled v1 — this ships with the marketplace gaps, before the design rollout
 * reaches these screens.
 */
export default function CancellationTerms({
  jobId,
  acceptanceLabel,
  className = '',
}: CancellationTermsProps) {
  const [summary, setSummary] = useState('');
  const [terms, setTerms] = useState('');
  const [version, setVersion] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // An existing job shows its own snapshot; a new one shows what it would
      // be agreed under.
      const agreement = jobId ? await fetchJobCancellationAgreement(jobId) : null;
      if (cancelled) return;

      if (agreement) {
        setTerms(agreement.terms_snapshot);
        setVersion(agreement.policy_version);
        setSummary('');
        setLoaded(true);
        return;
      }

      const policy: CancellationPolicy | null = await fetchCurrentCancellationPolicy();
      if (cancelled) return;

      if (policy) {
        setSummary(policy.summary);
        setTerms(policy.terms);
        setVersion(policy.version);
      }
      setLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  // Nothing to show rather than an empty shell — if no policy is configured
  // this must not block the flow it's embedded in.
  if (!loaded || !terms) return null;

  return (
    <div className={`rounded-ct-md border border-ct-line bg-ct-surface-2 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-ct-mute-2 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ct-paper">If the job is cancelled</h3>
          {summary && <p className="mt-1 text-sm text-ct-mute-2 leading-relaxed">{summary}</p>}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-ct-mute-2 hover:text-ct-mute-2 transition-colors min-h-[44px]"
          >
            {expanded ? 'Hide full terms' : 'Read the full terms'}
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
            <div className="mt-2 whitespace-pre-line text-sm text-ct-mute-2 leading-relaxed">
              {terms}
            </div>
          )}

          {acceptanceLabel && (
            <p className="mt-3 text-xs text-ct-mute">{acceptanceLabel}</p>
          )}
          {version !== null && (
            <p className="mt-1 text-xs text-ct-mute">Cancellation terms v{version}</p>
          )}
        </div>
      </div>
    </div>
  );
}
