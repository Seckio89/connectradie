import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  approveVariation,
  declineVariation,
  payPriceIncrease,
  humanizePaymentError,
} from '../lib/stripePayments';
import { cx, Pill, VariationBlock, VariationAction, VariationAmount, formatAud } from './ui';
import type { JobVariation } from '../types/database';

const RequestVariationModal = lazy(() => import('./RequestVariationModal'));

/** The two columns 20260222114419 added, which the shared type predates. */
type Variation = JobVariation & {
  reason_category: string | null;
  photo_urls: string[] | null;
};

interface JobVariationsSectionProps {
  jobId: string;
  jobBudget: number | null;
  /** `jobs.status` — raising a variation is only legal at 'in_progress'. */
  jobStatus: string | null;
  /** Which side of the job the viewer is on. Drives who gets which control. */
  role: 'tradie' | 'client';
  /** Fired after a variation is raised or declined, for hosts that cache jobs. */
  onChange?: () => void;
  /** Applied to the root, so a host can supply its own padding and divider. */
  className?: string;
}

/**
 * Pending variations, plus the tradie's control to raise one.
 *
 * This exists because the flow used to live only inside `JobDetailsCard`, which
 * is reachable from exactly two places — the booking-request modal in Messages
 * and a project drill-down. A tradie who won the job through the ordinary
 * lead → quote → accept pipeline had no way to raise a variation at all, and a
 * client whose job was not attached to a project had no way to approve one.
 * Hosting the same block in the modals each side actually opens is what makes
 * the feature reachable; keeping it in one component is what stops the two
 * copies drifting.
 *
 * Renders nothing when there is neither a variation to show nor a button to
 * offer, so hosts can mount it unconditionally.
 */
export default function JobVariationsSection({
  jobId,
  jobBudget,
  jobStatus,
  role,
  onChange,
  className,
}: JobVariationsSectionProps) {
  const [variations, setVariations] = useState<Variation[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  // Keyed by variation id — a single string rendered the same failure under
  // every pending block at once.
  const [error, setError] = useState<{ id: string; message: string } | null>(null);

  const fetchVariations = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('job_variations')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setVariations((data || []) as Variation[]);
    } catch {
      // Silent, matching JobDetailsCard: a failed read here must not take the
      // host modal down with it.
    }
  }, [jobId]);

  useEffect(() => {
    fetchVariations();
  }, [fetchVariations]);

  const approvedTotal = variations
    .filter(v => v.status === 'approved')
    .reduce((sum, v) => sum + Number(v.additional_amount || 0), 0);

  /**
   * Approving means paying. The server prices it, Stripe collects it, and the
   * webhook is the only thing that flips the variation to approved.
   */
  const handleApprove = async (variationId: string) => {
    setBusy(true);
    try {
      const { paymentId } = await approveVariation(variationId);
      const { url } = await payPriceIncrease(paymentId, jobId);
      window.location.href = url;
    } catch (err) {
      // humanizePaymentError passes server messages through, so the specific
      // refusals ("This job hasn't been funded yet…") reach the client.
      setError({
        id: variationId,
        message: humanizePaymentError(err instanceof Error ? err.message : null),
      });
      setBusy(false);
    }
  };

  const handleDecline = async (variationId: string) => {
    setBusy(true);
    try {
      await declineVariation(variationId);
      await fetchVariations();
      onChange?.();
    } catch (err) {
      setError({
        id: variationId,
        message: humanizePaymentError(err instanceof Error ? err.message : null),
      });
    } finally {
      setBusy(false);
    }
  };

  const pending = variations.filter(v => v.status === 'pending');
  const canRaise = role === 'tradie' && jobStatus === 'in_progress';

  if (pending.length === 0 && !canRaise) return null;

  return (
    // Approve and Decline are real decisions about money, and this block is
    // mounted inside clickable job cards on the client dashboard. Without the
    // stop, a mis-aimed tap navigates away instead — or worse, navigates and
    // approves. Harmless in the modal hosts, which are not clickable.
    <div className={cx('space-y-3', className)} onClick={e => e.stopPropagation()}>
      {pending.map(variation => (
        <VariationBlock
          key={variation.id}
          actions={role === 'client' ? (
            <>
              <VariationAction primary onClick={() => !busy && handleApprove(variation.id)}>
                Approve &amp; fund
              </VariationAction>
              <VariationAction onClick={() => !busy && handleDecline(variation.id)}>
                Decline
              </VariationAction>
            </>
          ) : undefined}
        >
          {variation.reason_category && (
            <Pill tone="amber" className="mb-2">
              {variation.reason_category.replace('_', ' ')}
            </Pill>
          )}
          <p>{variation.description}</p>

          {variation.photo_urls && variation.photo_urls.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 mt-2">
              {variation.photo_urls.map((url, idx) => (
                <div
                  key={idx}
                  className="w-16 h-16 rounded-ct-xs overflow-hidden bg-ct-surface-2 border border-ct-line flex-shrink-0"
                >
                  <img
                    src={url}
                    alt={`Evidence ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                    onClick={() => window.open(url, '_blank')}
                  />
                </div>
              ))}
            </div>
          )}

          <p className="mt-2">
            <VariationAmount amountCents={Math.round(Number(variation.additional_amount) * 100)} />
            {jobBudget != null && jobBudget > 0 && (
              <span className="text-ct-mute">
                {' · new total '}
                <span className="font-ct-mono">
                  {formatAud(
                    Math.round(
                      (jobBudget + approvedTotal + Number(variation.additional_amount)) * 100,
                    ),
                  )}
                </span>
              </span>
            )}
          </p>

          {/* Rose, not amber: amber is "waiting on a person", and a failed
              approval is a different state needing a different response. */}
          {error?.id === variation.id && (
            <p className="mt-2 text-sm text-ct-rose">{error.message}</p>
          )}
          {role === 'tradie' && (
            <Pill tone="amber" className="mt-3">Awaiting client approval</Pill>
          )}
        </VariationBlock>
      ))}

      {canRaise && (
        <button
          onClick={() => setShowModal(true)}
          className="w-full px-4 py-3 border border-dashed border-ct-line text-ct-mute-2 rounded-ct-md hover:border-ct-teal hover:text-ct-teal flex items-center justify-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Additional cost
        </button>
      )}

      {canRaise && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          }
        >
          <RequestVariationModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            jobId={jobId}
            onSuccess={() => { fetchVariations(); onChange?.(); }}
            jobBudget={jobBudget}
            approvedVariationsTotal={approvedTotal}
          />
        </Suspense>
      )}
    </div>
  );
}
