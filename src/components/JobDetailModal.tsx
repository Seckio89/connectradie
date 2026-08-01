import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Image as ImageIcon,
  CheckCircle2,
  Play,
  Flag,
  Loader2,
  Repeat,
  ClipboardList,
  DollarSign,
  AlertCircle,
  Car,
  Send,
} from 'lucide-react';
import { formatDate } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { sendJobPaymentLink } from '../lib/jobPaymentLink';
import { useAuth } from '../contexts/AuthContext';
import { isPro as checkIsPro } from '../lib/subscription';
import { adjustQuotePrice } from '../lib/stripePayments';
import type { Job, JobMilestone, Quote } from '../types/database';
import { insertNotification, type RecurringJob } from '../lib/recurringJobs';
import { useSignedUrls } from '../hooks/useSignedUrl';
import MilestoneEditor from './MilestoneEditor';
import FormattedNotes from './FormattedNotes';
import AccessInstructions from './AccessInstructions';
import ViewTrackingButton from './ViewTrackingButton';
import Modal from './Modal';
import AvailabilityMiniCalendar from './AvailabilityMiniCalendar';

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: (Job & { profiles?: { full_name: string; email: string; phone?: string | null } | null }) | null;
  onQuote?: (proposedStartDate?: string | null) => void;
  onStatusChange?: () => void;
  onComplete?: () => void;
}

// Progress steps in order
const STEPS = [
  { key: 'pending', label: 'Quoted', description: 'Quote sent to client' },
  { key: 'accepted', label: 'Accepted', description: 'Client accepted your quote' },
  { key: 'funded', label: 'Funded', description: 'Client payment secured via Stripe' },
  { key: 'in_progress', label: 'In Progress', description: 'Work has started' },
  { key: 'completed', label: 'Completed', description: 'Job finished' },
] as const;

function getStepIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function getNextAction(status: string, isTradie: boolean): { label: string; hint: string } | null {
  if (!isTradie) return null;
  switch (status) {
    case 'pending':
      return { label: 'Waiting for client', hint: 'The client is reviewing your quote. You\'ll be notified when they respond.' };
    case 'accepted':
      return { label: 'Awaiting payment', hint: 'The client has accepted your quote and is completing payment. You\'ll be notified when funds are secured.' };
    case 'funded':
      return { label: 'Payment secured', hint: 'Payment is secured via Stripe.' };
    case 'in_progress':
      return { label: 'Mark as complete', hint: 'Once you\'ve finished the work, mark this job as complete to request payment.' };
    case 'completed':
      return { label: 'All done!', hint: 'This job is complete. The client can now leave a review.' };
    default:
      return null;
  }
}

export default function JobDetailModal({ isOpen, onClose, job, onQuote, onStatusChange, onComplete }: JobDetailModalProps) {
  const { user, profile, tradieDetails } = useAuth();
  const photoSignedUrls = useSignedUrls('job-attachments', job?.images_url || []);
  const [milestones, setMilestones] = useState<JobMilestone[]>([]);
  const [, setStatusLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>(job?.status || 'pending');

  // On mobile the progress stepper scrolls horizontally; auto-scroll it so the
  // current step (e.g. "Completed") is in view on open instead of clipped off
  // the right edge. No-op on desktop where the stepper isn't overflowing.
  const stepperScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const scroller = stepperScrollRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const active = scroller.querySelector('[data-active-step="true"]');
    if (!active) return;
    const aRect = active.getBoundingClientRect();
    const sRect = scroller.getBoundingClientRect();
    scroller.scrollLeft += (aRect.left - sRect.left) - (scroller.clientWidth - aRect.width) / 2;
  }, [isOpen, localStatus]);
  const [recurringJob, setRecurringJob] = useState<RecurringJob | null>(null);
  const [selectedAvailDate, setSelectedAvailDate] = useState<string | null>(null);

  // Final price adjustment state
  const [acceptedQuote, setAcceptedQuote] = useState<Quote | null>(null);
  // True when a completed/released job_funding payment exists for this job.
  const [jobPaid, setJobPaid] = useState(false);
  // Off-app client (billed via a CRM contact, no ConnecTradie account): there's
  // no in-app escrow to "request", so payment happens by an emailed link AFTER
  // the work is done, not a mid-job request. (payLinkState is declared above and
  // shared with the accepted-state link — the two states never render together.)
  const isOffApp = !!job?.client_contact_id && !job?.client_id;
  const [quoteLoaded, setQuoteLoaded] = useState(false);
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [finalPriceLoading, setFinalPriceLoading] = useState(false);
  const [finalPriceError, setFinalPriceError] = useState<string | null>(null);
  const [finalPriceSuccess, setFinalPriceSuccess] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const [parkingValue, setParkingValue] = useState<boolean | null>(job?.parking_available ?? null);
  const [parkingSaving, setParkingSaving] = useState(false);

  const isTradie = profile?.role === 'tradie';
  const isJobOwner = !!user && !!job && user.id === job.client_id;

  const handleParkingChange = async (next: boolean) => {
    if (!job || parkingSaving || next === parkingValue) return;
    setParkingSaving(true);
    const previous = parkingValue;
    setParkingValue(next);
    const { error } = await supabase.from('jobs').update({ parking_available: next }).eq('id', job.id);
    setParkingSaving(false);
    if (error) {
      setParkingValue(previous);
    } else {
      onStatusChange?.();
    }
  };
  const isProTradie = isTradie && checkIsPro(tradieDetails?.subscription_tier, profile?.is_premium);
  const FUNDED_STATUSES = ['funded', 'in_progress', 'completed'];
  const canSeeContactInfo = !isTradie || isProTradie || FUNDED_STATUSES.includes(localStatus);

  useEffect(() => {
    if (job) {
      setLocalStatus(job.status ?? 'pending');
      setStatusLoading(false);
      setSelectedAvailDate(null);
      setFinalPriceError(null);
      setFinalPriceSuccess(null);
      setFinalPriceInput('');
      setParkingValue(job.parking_available ?? null);
    }
  }, [job?.id, job?.status, job?.parking_available]);

  // Fetch linked recurring job if this job is part of a recurring service
  useEffect(() => {
    if (!isOpen || !job) {
      setRecurringJob(null);
      return;
    }
    let cancelled = false;

    const fetchRecurring = async () => {
      const { data } = await supabase
        .from('recurring_jobs')
        .select('*')
        .eq('original_job_id', job.id)
        .limit(1)
        .maybeSingle();
      if (!cancelled && data) {
        setRecurringJob(data as RecurringJob);
      } else if (!cancelled) {
        setRecurringJob(null);
      }
    };

    fetchRecurring();
    return () => { cancelled = true; };
  }, [isOpen, job?.id]);

  // Fetch accepted quote (for final price adjustment on site-visit jobs)
  useEffect(() => {
    if (!isOpen || !job || !isTradie) {
      setAcceptedQuote(null);
      setQuoteLoaded(false);
      setJobPaid(false);
      return;
    }
    let cancelled = false;
    setQuoteLoaded(false);

    const fetchAcceptedQuote = async () => {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .eq('job_id', job.id)
        .eq('status', 'accepted')
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setAcceptedQuote(data as Quote);
          // Pre-fill with original quote price
          const originalPrice = data.firm_price ?? data.price_max ?? data.price_min;
          if (originalPrice && !data.final_price) {
            setFinalPriceInput(String(originalPrice));
          }
        } else {
          setAcceptedQuote(null);
        }
        setQuoteLoaded(true);
      }
    };

    // Has the client already paid? Only money that actually moved counts
    // (completed = secured/routed, released = paid out) — a pending checkout
    // link or a dead row is NOT payment. Drives "Mark Complete" vs
    // "Mark Complete & Request Payment".
    const fetchPaidState = async () => {
      const { data } = await supabase
        .from('payments')
        .select('id')
        .eq('job_id', job.id)
        .eq('payment_type', 'job_funding')
        .in('status', ['completed', 'released'])
        .limit(1);
      if (!cancelled) setJobPaid((data ?? []).length > 0);
    };

    fetchAcceptedQuote();
    fetchPaidState();
    return () => { cancelled = true; };
  }, [isOpen, job?.id, isTradie]);

  // Auto-progress: when a tradie opens a funded job, auto-start it.
  // Skip if the quote requires a site inspection and the final price hasn't been set yet —
  // the tradie should confirm the final price at the "funded" stage first.
  useEffect(() => {
    if (!isOpen || !job || !isTradie || !user) return;
    if (job.status !== 'funded') return;

    // Wait for quote fetch to complete before deciding
    if (!quoteLoaded) return;

    // Block auto-progress for site-visit jobs until the tradie sets the final price
    if (acceptedQuote?.requires_site_inspection && acceptedQuote.final_price == null) return;

    (async () => {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'in_progress' })
        .eq('id', job.id);
      if (!error) {
        setLocalStatus('in_progress');
        onStatusChange?.();
      }
    })();
  }, [isOpen, job?.id, job?.status, isTradie, user, quoteLoaded, acceptedQuote]);

  // Trades that typically have multi-stage jobs needing milestones
  const MILESTONE_TRADES = new Set([
    'Builder', 'Renovation', 'Extension', 'Carpenter', 'Landscaper',
    'Kitchen', 'Bathroom', 'Concreter', 'Bricklayer', 'Roofer',
    'Pool Builder', 'Fencer', 'Demolition', 'Excavation', 'Welder',
  ]);

  const jobCategoryRaw = job?.description.match(/^\[([^\]]+)\]/)?.[1] || '';
  const jobCategory = jobCategoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const isMilestoneTrade = MILESTONE_TRADES.has(jobCategory);
  const canEditMilestones = isTradie && !!job && ['accepted', 'in_progress'].includes(localStatus) && isMilestoneTrade;

  const fetchMilestones = useCallback(async () => {
    if (!job) return;
    const { data } = await supabase
      .from('job_milestones')
      .select('*')
      .eq('job_id', job.id)
      .order('stage_number');
    if (data) setMilestones(data as JobMilestone[]);
  }, [job?.id]);

  useEffect(() => {
    if (isOpen && job) {
      fetchMilestones();
    }
  }, [isOpen, job?.id, fetchMilestones]);

  const [statusError, setStatusError] = useState<string | null>(null);
  // Off-app payment link (accepted one-off jobs for client contacts).
  const [payLinkState, setPayLinkState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSetFinalPrice = () => {
    if (!acceptedQuote || finalPriceLoading) return;
    const price = parseFloat(finalPriceInput);
    if (isNaN(price) || price < 1) {
      setFinalPriceError('Please enter a valid price of at least $1.');
      return;
    }

    const originalPrice = acceptedQuote.firm_price ?? acceptedQuote.price_max ?? acceptedQuote.price_min ?? 0;
    const originalPriceCents = Math.round(originalPrice * 100);
    const finalPriceCents = Math.round(price * 100);

    let confirmMsg: string;
    if (finalPriceCents < originalPriceCents) {
      const diff = (originalPrice - price).toFixed(2);
      confirmMsg = `This will refund approximately $${diff} to the client. This cannot be undone. Set final price to $${price.toFixed(2)}?`;
    } else if (finalPriceCents > originalPriceCents) {
      const diff = (price - originalPrice).toFixed(2);
      confirmMsg = `This will request an additional $${diff} from the client. Set final price to $${price.toFixed(2)}?`;
    } else {
      confirmMsg = `Confirm the final price at $${price.toFixed(2)} (no change from estimate)?`;
    }

    setConfirmDialog({
      message: confirmMsg,
      onConfirm: async () => {
        setConfirmDialog(null);
        setFinalPriceLoading(true);
        setFinalPriceError(null);
        setFinalPriceSuccess(null);

        try {
          const result = await adjustQuotePrice(acceptedQuote.id, price);

          let successMsg: string;
          if (result.action === 'decrease') {
            successMsg = `Final price set to $${price.toFixed(2)}. A refund of $${result.refundAmount?.toFixed(2)} is being processed to the client.`;
          } else if (result.action === 'increase_pending') {
            successMsg = `Final price set to $${price.toFixed(2)}. The client has been notified to pay the additional $${result.additionalAmount?.toFixed(2)}.`;
          } else {
            successMsg = `Final price confirmed at $${price.toFixed(2)}.`;
          }

          // Propagate price change to recurring service if linked
          if (recurringJob && job && Math.round(price * 100) !== Math.round(originalPrice * 100)) {
            try {
              await supabase
                .from('recurring_jobs')
                .update({ agreed_price: price })
                .eq('id', recurringJob.id);

              await supabase
                .from('service_agreements')
                .update({ rate_per_visit: price })
                .eq('recurring_job_id', recurringJob.id);

              setRecurringJob({ ...recurringJob, agreed_price: price });
              successMsg += ` The ongoing service rate has also been updated to $${price.toFixed(2)} per visit.`;

              // Off-app jobs (client_contact_id, no client_id) have no
              // platform account to notify.
              try {
                if (job.client_id) await insertNotification(
                  job.client_id,
                  'recurring_price_updated',
                  `Your ongoing service rate has been updated from $${originalPrice.toFixed(2)} to $${price.toFixed(2)} per visit.`,
                  { recurring_job_id: recurringJob.id, old_price: originalPrice, new_price: price },
                );
              } catch {
                // Non-critical
              }
            } catch (err) {
              console.error('Failed to update recurring service price:', err);
            }
          }

          setFinalPriceSuccess(successMsg);

          // Refresh the accepted quote to reflect final_price
          setAcceptedQuote({ ...acceptedQuote, final_price: price });
          onStatusChange?.();
        } catch (err) {
          setFinalPriceError(
            err instanceof Error ? err.message : 'Failed to set final price. Please try again.'
          );
        } finally {
          setFinalPriceLoading(false);
        }
      },
    });
  };

  if (!isOpen || !job) return null;

  const currentStep = getStepIndex(localStatus);
  const nextAction = getNextAction(localStatus, isTradie);
  const client = job.profiles;
  const categoryRaw = job.description.match(/^\[([^\]]+)\]/)?.[1];
  const category = categoryRaw ? categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
  const description = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const isRecurring = !!recurringJob || !!(job.title && /ongoing|recurring/i.test(job.title));
  const isDeclined = localStatus === 'declined';
  const isJobTaken = isTradie && job.tradie_id && job.tradie_id !== user?.id && ['accepted', 'funded', 'in_progress', 'completed'].includes(localStatus);

  // Parse description lines for numbered scope of work
  const descriptionLines = description
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => line.length > 0);

  // Recurring schedule helpers
  const frequencyLabel = recurringJob?.frequency_months === -3
    ? 'Daily'
    : recurringJob?.frequency_months === -1
      ? 'Weekly'
      : recurringJob?.frequency_months === -2 || recurringJob?.billing_cycle === 'fortnightly'
        ? 'Fortnightly'
        : recurringJob?.frequency_months === 1
          ? 'Monthly'
          : recurringJob?.frequency_months === 3
            ? 'Quarterly'
            : recurringJob?.frequency_months === 6
              ? 'Every 6 months'
              : recurringJob?.frequency_months === 12
                ? 'Annually'
                : recurringJob?.frequency_months
                  ? `Every ${recurringJob.frequency_months} months`
                  : null;

  const sessionsPerCycle = recurringJob?.billing_cycle === 'fortnightly' ? 2 : 1;
  const estimatedValue = recurringJob?.agreed_price
    ? `$${(recurringJob.agreed_price * sessionsPerCycle).toFixed(2)}`
    : 'Quote required';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg" closeOnBackdrop={false}>
      {/* Header */}
      <div className="sticky top-0 bg-ct-surface px-6 pt-5 pb-4 border-b border-ct-line-soft z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              {category && (
                <span className="px-3 py-1 bg-ct-surface-2 text-ct-mute-2 rounded-full text-xs font-medium border border-ct-line flex-shrink-0">
                  {category}
                </span>
              )}
              {isRecurring && frequencyLabel && (
                <span className="px-3 py-1 rounded-full bg-ct-teal/[0.14] text-ct-teal text-xs font-medium flex-shrink-0">
                  <Repeat className="w-3 h-3 inline mr-1" />{frequencyLabel}
                </span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${
                isDeclined ? 'bg-ct-rose/[0.13] text-ct-rose border-ct-rose/[0.34]'
                : localStatus === 'completed' ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30'
                : localStatus === 'in_progress' ? 'bg-ct-surface-2 text-ct-mute-2 border-ct-line'
                : localStatus === 'accepted' ? 'bg-ct-surface-2 text-ct-mute-2 border-ct-line'
                : 'bg-ct-amber/[0.13] text-ct-amber border-ct-amber/[0.34]'
              }`}>
                {localStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-ct-paper truncate">{description || 'Job Details'}</h2>
            <p className="text-xs text-ct-mute mt-0.5">
              Posted {formatDate(job.created_at)}
              {job.scheduled_date && (
                <>
                  <span className="mx-1.5 text-ct-mute">·</span>
                  <span className="text-ct-mute-2 font-medium">
                    Wanted by {formatDate(job.scheduled_date)}
                    {job.preferred_time_slot ? ` (${job.preferred_time_slot})` : ''}
                  </span>
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors flex-shrink-0 ml-3 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <X className="w-5 h-5 text-ct-mute" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
        {/* ── Progress Stepper ── */}
        {!isDeclined && (
          <div className="bg-ct-surface-2 rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wider mb-3">Job Progress</p>
            <div ref={stepperScrollRef} className="overflow-x-auto sm:overflow-visible scrollbar-hide -mx-1 px-1">
            <div className="flex items-center justify-between min-w-[280px] sm:min-w-0">
              {STEPS.map((step, i) => {
                const done = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div key={step.key} data-active-step={isCurrent ? 'true' : undefined} className="flex items-center flex-1">
                    <div className="flex flex-col items-center text-center flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        done
                          ? isCurrent
                            ? 'bg-ct-teal text-ct-ink ring-4 ring-ct-teal/30'
                            : 'bg-ct-teal text-ct-ink'
                          : 'bg-ct-line text-ct-mute-2'
                      }`}>
                        {done && !isCurrent ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <span className="text-xs font-bold">{i + 1}</span>
                        )}
                      </div>
                      <span className={`text-[10px] sm:text-xs mt-1.5 font-medium leading-tight whitespace-nowrap ${
                        isCurrent ? 'text-ct-mute-2' : done ? 'text-ct-mute-2' : 'text-ct-mute'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 sm:mx-2 rounded-ct-xs ${
                        i < currentStep ? 'bg-ct-surface-2' : 'bg-ct-line'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {isJobTaken && (
          <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md p-4 text-center">
            <p className="text-sm font-semibold text-ct-amber">This job has been taken by another tradie</p>
            <p className="text-xs text-ct-amber mt-1">This job is no longer available for quoting.</p>
          </div>
        )}

        {isDeclined && (
          <div className="bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-md p-4 text-center">
            <p className="text-sm font-semibold text-ct-rose">This job has been declined</p>
          </div>
        )}

        {/* ── Set Final Price (site visit required, tradie only) ── */}
        {isTradie &&
          !isDeclined &&
          acceptedQuote?.requires_site_inspection &&
          (localStatus === 'funded' || localStatus === 'in_progress') && (
          <div className="bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-md p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-ct-sm bg-ct-amber/[0.13] flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-4 h-4 text-ct-amber" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ct-paper">
                  {acceptedQuote.final_price != null
                    ? 'Final Price Set'
                    : 'Set Final Price After Site Visit'}
                </p>
                <p className="text-xs text-ct-amber mt-0.5">
                  {acceptedQuote.final_price != null
                    ? `Final price: $${acceptedQuote.final_price.toFixed(2)} (original estimate: $${(acceptedQuote.firm_price ?? acceptedQuote.price_max ?? acceptedQuote.price_min).toFixed(2)})`
                    : 'Visit the site and confirm your final price. If higher than your estimate, the client will need to approve and pay the difference.'}
                </p>
              </div>
            </div>

            {acceptedQuote.final_price == null && (
              <>
                <div className="flex items-center gap-2 mt-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ct-mute text-sm font-medium">$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={finalPriceInput}
                      onChange={(e) => {
                        setFinalPriceInput(e.target.value);
                        setFinalPriceError(null);
                      }}
                      placeholder="Final price"
                      className="w-full pl-7 pr-3 py-2.5 border border-ct-amber/[0.34] rounded-ct-sm text-sm text-ct-paper focus:outline-none focus:ring-2 focus:ring-ct-amber bg-ct-surface"
                    />
                  </div>
                  <button
                    onClick={handleSetFinalPrice}
                    disabled={finalPriceLoading || !finalPriceInput}
                    className={`px-4 py-2.5 text-sm font-medium rounded-ct-sm transition-colors ${
                      finalPriceLoading || !finalPriceInput
                        ? 'bg-ct-amber/[0.13] text-ct-amber cursor-not-allowed'
                        : 'bg-ct-amber/[0.13] text-ct-amber hover:bg-ct-amber hover:text-ct-ink'
                    }`}
                  >
                    {finalPriceLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Confirm'
                    )}
                  </button>
                </div>

                {finalPriceError && (
                  <div className="flex items-start gap-1.5 mt-2 text-xs text-ct-rose">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{finalPriceError}</span>
                  </div>
                )}
              </>
            )}

            {finalPriceSuccess && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-ct-teal bg-ct-teal/[0.14] rounded-ct-sm p-2 border border-ct-teal/30">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{finalPriceSuccess}</span>
              </div>
            )}
          </div>
        )}

        {/* ── What to do next ── */}
        {nextAction && !isDeclined && (
          <div className={`rounded-ct-md p-4 border ${
            localStatus === 'completed'
              ? 'bg-ct-teal/[0.14] border-ct-teal/30'
              : 'bg-ct-surface-2 border-ct-line'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-ct-sm flex items-center justify-center flex-shrink-0 ${
                localStatus === 'completed' ? 'bg-ct-teal/[0.14]' : 'bg-ct-surface-2'
              }`}>
                {localStatus === 'pending' && <Clock className="w-4 h-4 text-ct-mute-2" />}
                {localStatus === 'accepted' && <Play className="w-4 h-4 text-ct-mute-2" />}
                {localStatus === 'in_progress' && <Flag className="w-4 h-4 text-ct-mute-2" />}
                {localStatus === 'completed' && <CheckCircle2 className="w-4 h-4 text-ct-teal" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${
                  localStatus === 'completed' ? 'text-ct-teal' : 'text-ct-paper'
                }`}>
                  {nextAction.label}
                </p>
                <p className={`text-xs mt-0.5 ${
                  localStatus === 'completed' ? 'text-ct-teal' : 'text-ct-mute-2'
                }`}>
                  {nextAction.hint}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Scope of Work ── */}
        {description && description.length > 40 && (
          <div className="bg-ct-surface border border-ct-line rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">Scope of Work</p>
            {descriptionLines.length > 1 ? (
              <ul className="space-y-1.5">
                {descriptionLines.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-ct-mute-2 leading-relaxed">
                    <span className="mt-[0.5em] w-1.5 h-1.5 rounded-full bg-ct-surface-2 flex-shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ct-mute-2 leading-relaxed whitespace-pre-wrap">{description}</p>
            )}
          </div>
        )}

        {/* ── Job notes & conditions (tradie-side: owner, employees, subcontractors) —
               structured so a worker can read it at the job site. Never shown to the
               client (public-quote doesn't return jobs.notes, and this is role-gated). ── */}
        {isTradie && job.notes && (
          <div className="bg-ct-surface border border-ct-line rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-2">
              Job notes &amp; conditions <span className="font-normal normal-case text-ct-mute">· not shown to client</span>
            </p>
            <FormattedNotes text={job.notes} className="space-y-1" />
          </div>
        )}
        {isTradie && <AccessInstructions jobId={job.id} />}

        <div><ViewTrackingButton jobId={job.id} /></div>

        {/* ── Service Schedule (recurring only) ── */}
        {isRecurring && recurringJob && (
          <div className="bg-ct-surface border border-ct-line rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-3">Service Schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {frequencyLabel && (
                <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
                  <Repeat className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-ct-mute uppercase">Frequency</p>
                    <p className="text-sm text-ct-mute-2">{frequencyLabel}</p>
                  </div>
                </div>
              )}
              {recurringJob.next_due_date && (
                <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
                  <Calendar className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-ct-mute uppercase">Next Due</p>
                    <p className="text-sm text-ct-mute-2">
                      {new Date(recurringJob.next_due_date + 'T00:00:00').toLocaleDateString('en-AU', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
                <span className="text-base text-ct-mute-2 font-semibold flex-shrink-0">$</span>
                <div>
                  <p className="text-xs font-semibold text-ct-mute uppercase">Estimated Value</p>
                  <p className="text-sm text-ct-mute-2 font-medium">{estimatedValue}</p>
                </div>
              </div>
              {recurringJob.preferred_time && (
                <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
                  <Clock className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-ct-mute uppercase">Preferred Time</p>
                    <p className="text-sm text-ct-mute-2">{recurringJob.preferred_time}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Your Availability (tradie only, pending jobs) ── */}
        {isTradie && localStatus === 'pending' && user && (
          <div className="bg-ct-surface border border-ct-line rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute uppercase tracking-wide mb-3">Your Availability</p>
            <AvailabilityMiniCalendar
              tradieId={user.id}
              preferredDate={job.scheduled_date}
              selectedDate={selectedAvailDate}
              onSelectDate={setSelectedAvailDate}
            />
          </div>
        )}

        {/* ── Key Details ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {job.location_address && (
            <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
              <MapPin className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-ct-mute uppercase">Location</p>
                <p className="text-sm text-ct-mute-2">{job.location_address}</p>
              </div>
            </div>
          )}
          {job.scheduled_time && (
            <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
              <Calendar className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-ct-mute uppercase">Scheduled</p>
                <p className="text-sm text-ct-mute-2">
                  {new Date(job.scheduled_time).toLocaleDateString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )}
          {job.estimated_duration && (
            <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
              <Clock className="w-4 h-4 text-ct-mute-2 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-ct-mute uppercase">Duration</p>
                <p className="text-sm text-ct-mute-2">{job.estimated_duration}</p>
              </div>
            </div>
          )}
          {(job.budget_amount || job.budget_type) && (
            <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
              <span className="text-base text-ct-mute-2 font-semibold flex-shrink-0">$</span>
              <div>
                <p className="text-xs font-semibold text-ct-mute uppercase">Budget</p>
                <p className="text-sm text-ct-mute-2 font-medium">
                  {job.budget_amount
                    ? `$${job.budget_amount.toLocaleString()}${job.budget_type === 'hourly_rate' ? '/hr' : ''}`
                    : job.budget_type === 'request_quote'
                      ? 'Quote requested — client wants you to set the price'
                      : 'Not specified'}
                </p>
              </div>
            </div>
          )}
          {(isJobOwner || parkingValue !== null) && (
            <div className="flex items-center gap-2.5 bg-ct-surface-2 rounded-ct-md p-3">
              <Car className={`w-4 h-4 flex-shrink-0 ${parkingValue ? 'text-ct-teal' : 'text-ct-mute-2'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-ct-mute uppercase">Parking on site</p>
                {isJobOwner ? (
                  <div className="mt-1 inline-flex rounded-ct-sm border border-ct-line bg-ct-surface overflow-hidden">
                    <button
                      type="button"
                      disabled={parkingSaving}
                      onClick={() => handleParkingChange(true)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${parkingValue === true ? 'bg-ct-teal/[0.14] text-ct-teal' : 'text-ct-mute-2 hover:bg-ct-surface-2'}`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      disabled={parkingSaving}
                      onClick={() => handleParkingChange(false)}
                      className={`px-3 py-1 text-xs font-medium border-l border-ct-line transition-colors ${parkingValue === false ? 'bg-ct-surface-2 text-ct-mute-2' : 'text-ct-mute-2 hover:bg-ct-surface-2'}`}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-ct-mute-2 font-medium">
                    {parkingValue ? 'Available' : 'Not available'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Access instructions render once (PIN-gated) via the isTradie block above. */}

        {/* ── Photos ── */}
        {job.images_url && job.images_url.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-ct-mute" />
              <p className="text-xs font-semibold text-ct-mute">Photos ({job.images_url.length})</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {job.images_url.map((_, index) => {
                const signedUrl = photoSignedUrls[index];
                return (
                  <div key={index} className="w-20 h-20 rounded-ct-sm overflow-hidden bg-ct-surface-2 border border-ct-line flex-shrink-0">
                    {signedUrl ? (
                      <img
                        src={signedUrl}
                        alt={`Photo ${index + 1}`}
                        loading="lazy"
                        className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                        onClick={() => window.open(signedUrl, '_blank')}
                      />
                    ) : (
                      <div className="w-full h-full bg-ct-surface-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Client Contact ── */}
        {client && (
          <div className="bg-ct-surface border border-ct-line rounded-ct-md p-4">
            <p className="text-xs font-semibold text-ct-mute mb-3">Client</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-ct-surface-2 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-ct-mute-2" />
              </div>
              <div>
                <p className="font-semibold text-ct-paper">{client.full_name}</p>
                <p className="text-xs text-ct-mute">Client</p>
              </div>
            </div>
            {canSeeContactInfo ? (
              <div className="flex flex-wrap gap-2">
                {client.phone && (
                  <a
                    href={`tel:${client.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface-2 text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface-2 text-ct-mute-2 rounded-ct-sm text-sm font-medium hover:bg-ct-surface-2 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {client.email}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-ct-mute">Contact details available after payment is secured</p>
            )}
          </div>
        )}

        {/* ── Milestones — only for large/multi-stage trades, or if milestones already exist ── */}
        {(milestones.length > 0 || canEditMilestones) && (
          <div>
            <MilestoneEditor
              jobId={job.id}
              milestones={milestones}
              onUpdate={fetchMilestones}
              readOnly={!canEditMilestones}
              tradeCategory={jobCategory}
            />
          </div>
        )}
      </div>

      {/* ── Footer Actions ── */}
      {statusError && (
        <div className="mx-4 mb-2 px-3 py-2 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm text-sm text-ct-rose">
          {statusError}
        </div>
      )}
      <div
        className="sticky bottom-0 px-4 pt-4 border-t border-ct-line-soft bg-ct-surface flex gap-3"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={onClose}
          className="px-5 py-3 border border-ct-line text-ct-mute-2 font-medium rounded-ct-md hover:bg-ct-surface-2 transition-colors"
        >
          Close
        </button>

        {isTradie && localStatus === 'pending' && onQuote && job.budget_type === 'request_quote' && (
          <button
            onClick={() => onQuote(selectedAvailDate)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            {selectedAvailDate
              ? `Quote Now — Available ${new Date(selectedAvailDate + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
              : 'Quote Now'}
          </button>
        )}

        {isTradie && localStatus === 'accepted' && (
          job.client_contact_id && !job.client_id ? (
            /* Off-app client — email them a Stripe payment link for the accepted amount. */
            <button
              onClick={async () => {
                setPayLinkState('sending');
                setStatusError(null);
                const res = await sendJobPaymentLink(job.id);
                if (res.ok) {
                  setPayLinkState('sent');
                } else {
                  setPayLinkState('idle');
                  setStatusError(res.error || 'Could not send the payment link.');
                }
              }}
              disabled={payLinkState === 'sending'}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {payLinkState === 'sending' ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              ) : payLinkState === 'sent' ? (
                <><CheckCircle2 className="w-4 h-4" /> Payment link sent</>
              ) : (
                <><Send className="w-4 h-4" /> Email Payment Link</>
              )}
            </button>
          ) : (
            <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-amber/[0.13] text-ct-amber font-medium rounded-ct-md border border-ct-amber/[0.34]">
              <Clock className="w-4 h-4" />
              Awaiting Client Payment
            </div>
          )
        )}

        {isTradie && localStatus === 'funded' && acceptedQuote?.requires_site_inspection && acceptedQuote.final_price == null && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-amber/[0.13] text-ct-amber font-medium rounded-ct-md border border-ct-amber/[0.34]">
            Set final price above to continue
          </div>
        )}
        {isTradie && localStatus === 'funded' && !(acceptedQuote?.requires_site_inspection && acceptedQuote.final_price == null) && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-surface-2 text-ct-mute-2 font-medium rounded-ct-md border border-ct-line">
            <Loader2 className="w-4 h-4 animate-spin" />
            Auto-starting...
          </div>
        )}

        {isTradie && localStatus === 'in_progress' && !(acceptedQuote?.requires_site_inspection && acceptedQuote?.final_price == null) && (
          <button
            onClick={() => { onClose(); onComplete?.(); }}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            {/* "Request Payment" only makes sense for an ON-APP, not-yet-funded
                job. Off-app clients pay by an emailed link after completion, and
                already-paid jobs have nothing to request. */}
            {(jobPaid || isOffApp) ? 'Mark complete' : 'Mark complete & request payment'}
          </button>
        )}

        {isTradie && localStatus === 'in_progress' && acceptedQuote?.requires_site_inspection && acceptedQuote?.final_price == null && (
          <button
            disabled
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-line text-ct-mute font-semibold rounded-ct-md cursor-not-allowed"
          >
            <AlertCircle className="w-4 h-4" />
            Set final price first
          </button>
        )}

        {/* Off-app, completed, not yet paid → this is where the tradie gets
            paid: email the client a secure card payment link (reuses the same
            destination-charge flow as the accepted-state link). */}
        {isTradie && localStatus === 'completed' && isOffApp && !jobPaid && (
          <button
            onClick={async () => {
              setPayLinkState('sending');
              setStatusError(null);
              const res = await sendJobPaymentLink(job.id);
              if (res.ok) setPayLinkState('sent');
              else { setPayLinkState('idle'); setStatusError(res.error || 'Could not send the invoice.'); }
            }}
            disabled={payLinkState === 'sending'}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            {payLinkState === 'sending'
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
              : payLinkState === 'sent'
                ? <><CheckCircle2 className="w-4 h-4" /> Invoice sent — resend</>
                : <><Send className="w-4 h-4" /> Send Invoice by Email</>}
          </button>
        )}

        {isTradie && localStatus === 'completed' && !(isOffApp && !jobPaid) && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-ct-teal/[0.14] text-ct-teal font-semibold rounded-ct-md border border-ct-teal/30">
            <CheckCircle2 className="w-4 h-4" />
            Job Complete
          </div>
        )}
      </div>

      {/* Confirmation dialog overlay */}
      {confirmDialog && (
        <div className="absolute inset-0 bg-black/40 rounded-ct-lg flex items-center justify-center z-50 p-6">
          <div className="bg-ct-surface rounded-ct-md shadow-lg p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-ct-paper mb-2">Confirm Price</h3>
            <p className="text-sm text-ct-mute-2 mb-5">{confirmDialog.message}</p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium text-ct-mute-2 border border-ct-line rounded-ct-sm hover:bg-ct-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-medium text-ct-ink bg-ct-teal rounded-ct-sm hover:brightness-110"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
