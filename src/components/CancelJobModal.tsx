import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { proseInputProps } from '../lib/proseInput';
import CancellationTerms from './CancellationTerms';

interface CancelJobModalProps {
  jobId: string;
  jobTitle: string | null;
  /** True once escrow holds money for this job — changes what we promise. */
  isFunded: boolean;
  /** Receives the reason. Resolves when the cancellation is done. */
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Cancel a job that has a tradie on it.
 *
 * Distinct from the trash-can action on an unquoted job in ClientDashboard,
 * which just deletes a posting nobody has responded to. By this point someone
 * has committed to the work and there may be money in escrow, so the terms both
 * sides agreed to are on screen before the button is pressed.
 *
 * Styled v1 — the design rollout has not reached this screen. See the "which
 * system applies" table in CLAUDE.md.
 */
export default function CancelJobModal({
  jobId,
  jobTitle,
  isFunded,
  onConfirm,
  onClose,
}: CancelJobModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const title = (jobTitle || 'this job').replace(/_/g, ' ');
  const canSubmit = reason.trim().length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the job. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancel job"
      className="fixed inset-0 bg-black bg-opacity-40 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4 animate-fade-in modal-sheet-overlay"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-ct-surface rounded-t-2xl sm:rounded-ct-lg max-w-md w-full shadow-2xl animate-scale-in modal-sheet pb-[env(safe-area-inset-bottom)] sm:pb-0 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-ct-rose/[0.13] rounded-full flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-ct-rose" />
            </div>
            <div className="flex-1 pt-1 min-w-0">
              <h3 className="text-lg font-semibold text-ct-paper mb-2 capitalize">
                Cancel {title}?
              </h3>
              <p className="text-ct-mute-2 leading-relaxed text-sm">
                {isFunded
                  ? 'The tradie will be told, and money held in escrow will be returned to you in full. Payments already released for finished stages stay released.'
                  : 'The tradie will be told this job is no longer going ahead. No money has been taken, so there is nothing to refund.'}
              </p>
            </div>
          </div>

          {/* The terms this job was actually agreed under — the frozen
              snapshot, not the current catalogue. */}
          <CancellationTerms jobId={jobId} className="mt-4" />

          <div className="mt-4">
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-ct-mute-2 mb-1.5">
              Why are you cancelling?
            </label>
            <p className="text-xs text-ct-mute mb-2">
              The tradie sees this. If we can't refund automatically, it's also what
              our team reviews.
            </p>
            <textarea
              id="cancel-reason"
              {...proseInputProps}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Our plans changed and we no longer need the work done."
              className="w-full px-3 py-2.5 border border-ct-line rounded-ct-md text-sm focus:outline-none focus:ring-2 focus:ring-ct-teal focus:border-ct-teal"
            />
          </div>

          {error && <p className="mt-3 text-sm text-ct-rose">{error}</p>}
        </div>

        <div
          className="px-6 flex gap-3"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3 bg-ct-surface-2 text-ct-mute-2 rounded-ct-md font-medium hover:bg-ct-line transition-colors disabled:opacity-50 min-h-[44px]"
          >
            Keep job
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="flex-1 px-4 py-3 bg-ct-rose hover:brightness-110 text-ct-ink rounded-ct-md font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-h-[44px]"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? 'Cancelling…' : 'Cancel job'}
          </button>
        </div>
      </div>
    </div>
  );
}
