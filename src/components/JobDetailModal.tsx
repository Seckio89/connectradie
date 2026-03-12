import { useState, useEffect, useCallback } from 'react';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  Key,
  Image as ImageIcon,
  CheckCircle2,
  MessageSquare,
  Play,
  Flag,
  ArrowRight,
  Loader2,
  Lock,
  Repeat,
} from 'lucide-react';
import { formatDate, friendlyError } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isPro as checkIsPro } from '../lib/subscription';
import type { Job, JobMilestone } from '../types/database';
import MilestoneEditor from './MilestoneEditor';
import Modal from './Modal';

interface JobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: (Job & { profiles?: { full_name: string; email: string; phone?: string } }) | null;
  onQuote?: () => void;
  isUnlocked?: boolean;
  onStatusChange?: () => void;
}

// Progress steps in order
const STEPS = [
  { key: 'pending', label: 'Quoted', description: 'Quote sent to client' },
  { key: 'accepted', label: 'Accepted', description: 'Client accepted your quote' },
  { key: 'funded', label: 'Funded', description: 'Client payment secured in escrow' },
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
      return { label: 'Starting automatically', hint: 'Payment is secured in escrow. The job will auto-start momentarily.' };
    case 'in_progress':
      return { label: 'Mark as complete', hint: 'Once you\'ve finished the work, mark this job as complete to request payment.' };
    case 'completed':
      return { label: 'All done!', hint: 'This job is complete. The client can now leave a review.' };
    default:
      return null;
  }
}

export default function JobDetailModal({ isOpen, onClose, job, isUnlocked = true, onStatusChange }: JobDetailModalProps) {
  const { user, profile, tradieDetails } = useAuth();
  const [milestones, setMilestones] = useState<JobMilestone[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<string>(job?.status || 'pending');

  const isTradie = profile?.role === 'tradie';
  const isProTradie = isTradie && checkIsPro(tradieDetails?.subscription_tier, profile?.is_premium);
  const FUNDED_STATUSES = ['funded', 'in_progress', 'completed'];
  const canSeeContactInfo = !isTradie || isProTradie || FUNDED_STATUSES.includes(localStatus);

  useEffect(() => {
    if (job) {
      setLocalStatus(job.status);
      setStatusLoading(false);
    }
  }, [job?.id, job?.status]);

  // Auto-progress: when a tradie opens a funded job, auto-start it
  useEffect(() => {
    if (!isOpen || !job || !isTradie || !user) return;
    if (job.status === 'funded') {
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
    }
  }, [isOpen, job?.id, job?.status, isTradie, user]);

  // Trades that typically have multi-stage jobs needing milestones
  const MILESTONE_TRADES = new Set([
    'Builder', 'Renovation', 'Extension', 'Carpenter', 'Landscaper',
    'Kitchen', 'Bathroom', 'Concreter', 'Bricklayer', 'Roofer',
    'Pool Builder', 'Fencer', 'Demolition', 'Excavation',
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
  const [completionChecks, setCompletionChecks] = useState({ workDone: false, siteClean: false, clientNotified: false });

  const handleUpdateStatus = async (newStatus: Job['status']) => {
    if (!job || !user || statusLoading) return;
    setStatusLoading(true);
    setStatusError(null);

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', job.id);

      if (error) {
        console.error('Job status update failed:', error);
        setStatusError(friendlyError(error, 'Unable to update the job status. Please try again.'));
      } else {
        setLocalStatus(newStatus);
        onStatusChange?.();
      }
    } catch (err) {
      console.error('Job status update exception:', err);
      setStatusError('Update failed unexpectedly. Please try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  if (!isOpen || !job) return null;

  const currentStep = getStepIndex(localStatus);
  const nextAction = getNextAction(localStatus, isTradie);
  const client = job.profiles;
  const categoryRaw = job.description.match(/^\[([^\]]+)\]/)?.[1];
  const category = categoryRaw ? categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
  const description = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const isRecurring = !!(job.title && /recurring/i.test(job.title));
  const isDeclined = localStatus === 'declined';

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg" closeOnBackdrop={false}>
      {/* Header */}
      <div className="sticky top-0 bg-white px-6 pt-5 pb-4 border-b border-gray-100 z-10">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              {category && (
                <span className="px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-semibold border border-secondary-200 flex-shrink-0">
                  {category}
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${
                isDeclined ? 'bg-red-50 text-red-700 border-red-200'
                : localStatus === 'completed' ? 'bg-green-50 text-green-700 border-green-200'
                : localStatus === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200'
                : localStatus === 'accepted' ? 'bg-secondary-50 text-secondary-700 border-secondary-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {localStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 truncate">{description || 'Job Details'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Posted {formatDate(job.created_at)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
        {/* ── Progress Stepper ── */}
        {!isDeclined && (
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Job Progress</p>
            <div className="flex items-center justify-between">
              {STEPS.map((step, i) => {
                const done = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center text-center flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        done
                          ? isCurrent
                            ? 'bg-secondary-500 text-white ring-4 ring-secondary-100'
                            : 'bg-secondary-500 text-white'
                          : 'bg-gray-200 text-gray-400'
                      }`}>
                        {done && !isCurrent ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <span className="text-xs font-bold">{i + 1}</span>
                        )}
                      </div>
                      <span className={`text-xs mt-1.5 font-medium leading-tight ${
                        isCurrent ? 'text-secondary-700' : done ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 rounded ${
                        i < currentStep ? 'bg-secondary-400' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isDeclined && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold text-red-700">This job has been declined</p>
          </div>
        )}

        {/* ── What to do next ── */}
        {nextAction && !isDeclined && (
          <div className={`rounded-xl p-4 border ${
            localStatus === 'completed'
              ? 'bg-green-50 border-green-200'
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                localStatus === 'completed' ? 'bg-green-100' : 'bg-blue-100'
              }`}>
                {localStatus === 'pending' && <Clock className="w-4 h-4 text-blue-600" />}
                {localStatus === 'accepted' && <Play className="w-4 h-4 text-blue-600" />}
                {localStatus === 'in_progress' && <Flag className="w-4 h-4 text-blue-600" />}
                {localStatus === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${
                  localStatus === 'completed' ? 'text-green-800' : 'text-blue-900'
                }`}>
                  {nextAction.label}
                </p>
                <p className={`text-xs mt-0.5 ${
                  localStatus === 'completed' ? 'text-green-700' : 'text-blue-700'
                }`}>
                  {nextAction.hint}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Job Description ── */}
        {description && description.length > 40 && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Job Description</p>
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{description}</p>
          </div>
        )}

        {/* ── Key Details ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {job.location_address && (
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
              <MapPin className="w-4 h-4 text-secondary-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Location</p>
                <p className="text-sm text-gray-700">{job.location_address}</p>
              </div>
            </div>
          )}
          {job.scheduled_time && (
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
              <Calendar className="w-4 h-4 text-secondary-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Scheduled</p>
                <p className="text-sm text-gray-700">
                  {new Date(job.scheduled_time).toLocaleDateString('en-AU', {
                    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )}
          {job.estimated_duration && (
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
              <Clock className="w-4 h-4 text-secondary-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Duration</p>
                <p className="text-sm text-gray-700">{job.estimated_duration}</p>
              </div>
            </div>
          )}
          {job.budget_amount && (
            <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-3">
              <span className="text-base text-secondary-500 font-semibold flex-shrink-0">$</span>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase">Budget</p>
                <p className="text-sm text-gray-700 font-medium">${job.budget_amount.toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Access Instructions ── */}
        {job.access_instructions && isUnlocked && (
          <div className="flex items-start gap-2.5 bg-warm-50 border border-warm-100 rounded-xl p-3">
            <Key className="w-4 h-4 text-warm-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warm-700 mb-0.5">Access Instructions</p>
              <p className="text-sm text-warm-900">{job.access_instructions}</p>
            </div>
          </div>
        )}

        {/* ── Photos ── */}
        {job.images_url && job.images_url.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">Photos ({job.images_url.length})</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {job.images_url.map((url, index) => (
                <div key={index} className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    loading="lazy"
                    className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer"
                    onClick={() => window.open(url, '_blank')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Client Contact ── */}
        {client && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">Client</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-secondary-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-secondary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">{client.full_name}</p>
                <p className="text-xs text-gray-500">Client</p>
              </div>
            </div>
            {canSeeContactInfo ? (
              <div className="flex flex-wrap gap-2">
                {client.phone && (
                  <a
                    href={`tel:${client.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 rounded-lg text-sm font-medium hover:bg-secondary-100 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {client.phone}
                  </a>
                )}
                {client.email && (
                  <a
                    href={`mailto:${client.email}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 text-secondary-700 rounded-lg text-sm font-medium hover:bg-secondary-100 transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    {client.email}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Contact details available after payment is secured</p>
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
        <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {statusError}
        </div>
      )}
      <div className="sticky bottom-0 p-4 border-t border-gray-100 bg-white flex gap-3">
        <button
          onClick={onClose}
          className="px-5 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          Close
        </button>

        {isTradie && localStatus === 'accepted' && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 text-amber-700 font-medium rounded-xl border border-amber-200">
            <Clock className="w-4 h-4" />
            Awaiting Client Payment
          </div>
        )}

        {isTradie && localStatus === 'funded' && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-secondary-50 text-secondary-700 font-medium rounded-xl border border-secondary-200">
            <Loader2 className="w-4 h-4 animate-spin" />
            Auto-starting...
          </div>
        )}

        {isTradie && localStatus === 'in_progress' && (() => {
          const allChecked = completionChecks.workDone && completionChecks.siteClean && completionChecks.clientNotified;
          return (
            <div className="flex-1 space-y-2">
              <div className="flex flex-col gap-1.5 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={completionChecks.workDone} onChange={(e) => setCompletionChecks(p => ({ ...p, workDone: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  <span className="text-gray-600">All work completed as quoted</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={completionChecks.siteClean} onChange={(e) => setCompletionChecks(p => ({ ...p, siteClean: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  <span className="text-gray-600">Site left clean and safe</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={completionChecks.clientNotified} onChange={(e) => setCompletionChecks(p => ({ ...p, clientNotified: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                  <span className="text-gray-600">Client notified of completion</span>
                </label>
              </div>
              <button
                onClick={() => handleUpdateStatus('completed')}
                disabled={statusLoading || !allChecked}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 font-semibold rounded-xl transition-colors ${
                  allChecked
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {statusLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {statusLoading ? 'Completing...' : allChecked ? 'Job Complete' : 'Complete checklist to finish'}
              </button>
            </div>
          );
        })()}

        {isTradie && localStatus === 'completed' && (
          <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 font-semibold rounded-xl border border-green-200">
            <CheckCircle2 className="w-4 h-4" />
            Job Complete
          </div>
        )}
      </div>
    </Modal>
  );
}
