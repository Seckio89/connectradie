import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Loader2, AlertTriangle, Clock, FileText, Archive, ArchiveRestore,
  MapPin, User, Calendar, Phone, Mail, CheckCircle2,
  Send, ChevronDown, ChevronUp, Repeat, Image,
  Zap, Users, Key, Eye, EyeOff,
  DollarSign, Shield, Camera, Plus, Check, Maximize2,
} from 'lucide-react';
import FormattedNotes from './FormattedNotes';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Job, Quote } from '../types/database';
import { extractSuburb } from '../lib/contactGating';
import SubmitQuoteModal from './SubmitQuoteModal';
import ConfirmModal from './ConfirmModal';
import TradieQuoteActions from './TradieQuoteActions';
import { adjustQuotePrice, approvePriceReduction } from '../lib/stripePayments';
import { sendJobPaymentLink } from '../lib/jobPaymentLink';
import { emailOffAppClientOnCompletion } from '../lib/offAppCompletionEmail';
import { useSignedUrls } from '../hooks/useSignedUrl';

// ── Types ──

interface JobData {
  id: string;
  client_id: string;
  tradie_id: string | null;
  title: string | null;
  description: string;
  status: string;
  priority: string;
  is_delayed: boolean;
  delayed_until: string | null;
  notes: string | null;
  scheduled_time: string | null;
  scheduled_date: string | null;
  location_address: string | null;
  budget_amount: number | null;
  budget_type: string | null;
  archived_at: string | null;
  created_at: string;
  max_quotes: number | null;
  quote_count: number | null;
  is_emergency: boolean;
  preferred_time_slot: string | null;
  estimated_duration: string | null;
  images_url: string[] | null;
  job_complexity: string | null;
  access_instructions: string | null;
  allows_site_inspection: boolean;
  completion_notes: string | null;
  completion_photo_url: string | null;
  completed_at: string | null;
  // 1 = legacy single-step flow, 2 = 3-stage estimate/visit/final/pay flow.
  // See docs/three-stage-quote-flow.md.
  flow_version: number;
  // Off-app CRM contact (set with client_id null for email-only clients).
  client_contact_id?: string | null;
  profiles?: { full_name: string; email: string; phone?: string } | null;
}

interface QuoteData {
  id: string;
  price_min: number;
  price_max: number;
  firm_price: number | null;
  final_price: number | null;
  requires_site_inspection: boolean;
  status: string;
  message: string;
  created_at: string;
  // 3-stage flow tracking (only meaningful when parent job.flow_version === 2)
  site_visit_scheduled_at: string | null;
  site_visit_completed_at: string | null;
  final_submitted_at: string | null;
  final_valid_until: string | null;
}

interface PaymentData {
  id: string;
  amount: number;
  processing_fee: number;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface PhotoItem {
  file: File;
  preview: string;
}

interface JobManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  onJobUpdated: () => void;
  isLicenseExpired?: boolean;
}

// ── Helpers ──

function parseJobInfo(job: JobData) {
  const categoryMatch = job.description.match(/^\[([^\]]+)\]/);
  const category = categoryMatch?.[1]?.replace(/_/g, ' ') || null;
  const cleanDescription = job.description.replace(/^\[[^\]]+\]\s*/, '');
  const displayTitle = job.title || category || 'Untitled Job';
  return { category, cleanDescription, displayTitle };
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'pending': return { label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' };
    case 'accepted': return { label: 'Accepted', color: 'bg-secondary-100 text-secondary-800 border-secondary-200', dot: 'bg-secondary-500' };
    case 'funded': return { label: 'Funded', color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' };
    case 'in_progress': return { label: 'In Progress', color: 'bg-secondary-100 text-secondary-800 border-secondary-200', dot: 'bg-secondary-500' };
    case 'completed': return { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' };
    case 'cancelled': return { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' };
    case 'declined': return { label: 'Declined', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' };
    default: return { label: status, color: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' };
  }
}

const STATUS_STEPS = ['pending', 'accepted', 'in_progress', 'completed'] as const;
const STEP_LABELS: Record<string, string> = {
  pending: 'Quoted',
  accepted: 'Accepted',
  in_progress: 'Paid & Active',
  completed: 'Completed',
};

// ── Completion prompts (trade-specific) ──
const COMPLETION_PROMPTS: Record<string, string[]> = {
  Cleaner: ['All rooms deep cleaned and sanitised', 'Kitchen and bathrooms scrubbed', 'Floors vacuumed and mopped', 'Windows and glass cleaned', 'Rubbish removed from site'],
  Plumber: ['Leak repaired and pressure tested', 'New fixture installed and tested', 'Blocked drain cleared', 'Compliance certificate issued'],
  Electrician: ['New circuit installed and tested', 'Switchboard upgraded', 'Safety switch (RCD) installed', 'Certificate of compliance issued'],
  Builder: ['All structural work complete to plans', 'Practical completion achieved', 'Defect-free handover', 'Site cleaned and cleared'],
  Painter: ['All surfaces prepped and primed', 'Two coats applied — even coverage', 'Touch-ups completed', 'Drop sheets removed — area cleaned'],
  Landscaper: ['Garden beds prepared and planted', 'Turf laid and watered in', 'Paving laid and compacted', 'Site levelled and cleared'],
};
const DEFAULT_PROMPTS = ['All work completed as quoted', 'Site left clean and tidy', 'Tested and confirmed working', 'Recommend follow-up maintenance'];

function matchCategory(raw: string): string | null {
  const lower = raw.toLowerCase().replace(/_/g, ' ');
  const MAP: Record<string, string> = {
    cleaner: 'Cleaner', cleaning: 'Cleaner', plumber: 'Plumber', plumbing: 'Plumber',
    electrician: 'Electrician', electrical: 'Electrician', builder: 'Builder', building: 'Builder',
    painter: 'Painter', painting: 'Painter', landscaper: 'Landscaper', landscaping: 'Landscaper',
  };
  if (MAP[lower]) return MAP[lower];
  for (const [key, value] of Object.entries(MAP)) {
    if (lower.includes(key)) return value;
  }
  return null;
}

// ── Main Component ──

export default function JobManagementModal({
  isOpen,
  onClose,
  jobId,
  onJobUpdated,
  isLicenseExpired = false,
}: JobManagementModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<JobData | null>(null);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [payment, setPayment] = useState<PaymentData | null>(null);
  const [notes, setNotes] = useState('');
  // Off-app payment link (accepted one-off jobs for client contacts).
  const [payLinkState, setPayLinkState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [payLinkError, setPayLinkError] = useState('');
  const [showNotesFull, setShowNotesFull] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [priority, setPriority] = useState('normal');
  const [isDelayed, setIsDelayed] = useState(false);
  const [delayedUntil, setDelayedUntil] = useState('');
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteCount, setQuoteCount] = useState(0);

  // Completion form state
  const [completionPhotos, setCompletionPhotos] = useState<PhotoItem[]>([]);
  const [completionCustomNotes, setCompletionCustomNotes] = useState('');
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [isGstRegistered, setIsGstRegistered] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Final price state (shown for site-visit-required quotes after deposit,
  // or as a variation request for any funded job once the tradie confirms
  // they've completed the site visit).
  const [finalPriceInput, setFinalPriceInput] = useState('');
  const [finalPriceLoading, setFinalPriceLoading] = useState(false);
  const [finalPriceError, setFinalPriceError] = useState<string | null>(null);
  const [finalPriceSuccess, setFinalPriceSuccess] = useState<string | null>(null);
  // For firm-price variations: tradie has to click "site visit completed" first
  // so we don't surface a price-change form by default on every funded job.

  // In-app confirm modal (replaces native window.confirm for price adjustments)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  } | null>(null);

  // Client-requested price reduction state
  const [reductionLoading, setReductionLoading] = useState(false);
  const [reductionError, setReductionError] = useState<string | null>(null);
  const [reductionSuccess, setReductionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && jobId) {
      loadJob();
    }
  }, [isOpen, jobId]);

  const loadJob = async () => {
    setLoading(true);
    const [jobResult, quoteResult, quoteCountResult, paymentResult] = await Promise.all([
      supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email, phone)')
        .eq('id', jobId)
        .maybeSingle(),
      user ? supabase
        .from('quotes')
        .select('id, price_min, price_max, firm_price, final_price, requires_site_inspection, status, message, created_at, site_visit_scheduled_at, site_visit_completed_at, final_submitted_at, final_valid_until')
        .eq('job_id', jobId)
        .eq('tradie_id', user.id)
        .maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from('quotes')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', jobId),
      supabase
        .from('payments')
        .select('id, amount, processing_fee, status, metadata, created_at')
        .eq('job_id', jobId)
        .eq('payment_type', 'job_funding')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (jobResult.data) {
      const jobData = jobResult.data as unknown as JobData;
      setJob(jobData);
      setPriority(jobData.priority || 'normal');
      setIsDelayed(jobData.is_delayed || false);
      setDelayedUntil(jobData.delayed_until ? new Date(jobData.delayed_until).toISOString().slice(0, 16) : '');
      setNotes(jobData.notes || '');
    }
    if (quoteResult.data) {
      setQuote(quoteResult.data as QuoteData);
    } else if (jobResult.data && (jobResult.data as unknown as JobData).status === 'pending') {
      setShowQuoteModal(true);
    }
    {
      // A job can carry several payment rows (e.g. an abandoned/expired checkout
      // next to the paid one). Showing "latest" made a dead row mask a paid one
      // ("failed" badge next to "Secured with Stripe"). Prefer money that
      // actually moved: completed/released first, then a live pending link;
      // dead rows (failed/refunded) are never shown as the job's payment state.
      const rows = (paymentResult.data as PaymentData[] | null) ?? [];
      const best =
        rows.find((p) => p.status === 'completed' || p.status === 'released') ??
        rows.find((p) => p.status === 'pending') ??
        null;
      setPayment(best);
    }
    setQuoteCount(quoteCountResult.count || 0);

    // Fetch tradie's GST registration status
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_gst_registered')
        .eq('id', user.id)
        .maybeSingle();
      setIsGstRegistered(profile?.is_gst_registered ?? false);
    }

    setLoading(false);
  };

  const handleStatusAdvance = async (nextStatus: string) => {
    if (isLicenseExpired || !job) return;

    // For completing a job, use the completion form handler
    if (nextStatus === 'completed') {
      await handleCompletion();
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('jobs')
      .update({ status: nextStatus })
      .eq('id', jobId);

    if (!error) {
      if (job.client_id) {
        const { displayTitle } = parseJobInfo(job);
        const tradieName = user?.user_metadata?.full_name || 'Your tradie';
        try {
          if (nextStatus === 'in_progress') {
            await supabase.rpc('create_notification', {
              p_user_id: job.client_id,
              p_title: 'Work Started',
              p_message: `${tradieName} has started work on ${displayTitle}.`,
              p_type: 'job_update',
              p_channel: 'in_app',
              p_read: false,
              p_link: null,
              p_job_id: jobId,
              p_metadata: {},
            });
          }
        } catch {
          // Non-critical
        }
      }
      onJobUpdated();
      setJob(prev => prev ? { ...prev, status: nextStatus } : prev);
    }
    setSaving(false);
  };

  // ── Completion form logic ──
  const jobCategoryRaw = job?.description?.match(/^\[([^\]]+)\]/)?.[1] || '';
  const matched = matchCategory(jobCategoryRaw);
  // Prefer the actual task lines from the client's description so the checklist
  // reflects what was quoted (e.g. "Clean bathrooms x 2") rather than generic
  // trade prompts. Falls back to trade defaults when description has no list.
  const prompts = useMemo(() => {
    const body = (job?.description || '').replace(/^\[[^\]]+\]\s*/, '').trim();
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[•\-\*]\s*/, '').trim())
      .filter((l) => l.length > 0 && l.length <= 120);
    const taskLines = lines.filter((l) => /^[A-Z0-9]/i.test(l));
    if (taskLines.length >= 2) return taskLines.slice(0, 8);
    return (matched && COMPLETION_PROMPTS[matched]) || DEFAULT_PROMPTS;
  }, [job?.description, matched]);

  // Resolve signed URLs for the job's photos (job-attachments bucket).
  const photoSignedUrls = useSignedUrls('job-attachments', job?.images_url || []);

  const combinedCompletionNotes = useMemo(() => {
    const promptLines = prompts
      .filter((p) => selectedPrompts.has(p))
      .map((p) => `• ${p}`);
    const parts: string[] = [];
    if (promptLines.length > 0) parts.push(promptLines.join('\n'));
    if (completionCustomNotes.trim()) parts.push(completionCustomNotes.trim());
    return parts.join('\n\n');
  }, [selectedPrompts, completionCustomNotes, prompts]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setCompletionError(null);
    for (const file of files) {
      if (!file.type.startsWith('image/')) { setCompletionError('Only image files accepted.'); continue; }
      if (file.size > 10 * 1024 * 1024) { setCompletionError('Each image must be under 10MB.'); continue; }
      if (completionPhotos.length >= 15) { setCompletionError('Maximum 15 photos.'); break; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCompletionPhotos((prev) => prev.length >= 15 ? prev : [...prev, { file, preview: ev.target?.result as string }]);
      };
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCompletion = async () => {
    if (!combinedCompletionNotes.trim()) {
      setCompletionError('Please select at least one item or add notes.');
      return;
    }
    if (!job || !user) return;

    setSaving(true);
    setCompletionError(null);

    try {
      // Upload photos
      const photoPaths: string[] = [];
      for (let i = 0; i < completionPhotos.length; i++) {
        const photo = completionPhotos[i];
        const ext = photo.file.name.split('.').pop() || 'jpg';
        const filePath = `${user.id}/${job.id}-completion-${i}-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('job-attachments')
          .upload(filePath, photo.file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw new Error(`Failed to upload photo ${i + 1}.`);
        photoPaths.push(filePath);
      }

      let thumbnailUrl: string | null = null;
      if (photoPaths.length > 0) {
        const { data: signedData } = await supabase.storage
          .from('job-attachments')
          .createSignedUrl(photoPaths[0], 60 * 60 * 24 * 365);
        if (signedData?.signedUrl) thumbnailUrl = signedData.signedUrl;
      }

      const updateData: Record<string, unknown> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_notes: combinedCompletionNotes.trim(),
      };
      if (thumbnailUrl) updateData.completion_photo_url = thumbnailUrl;

      const { error: updateError } = await supabase.from('jobs').update(updateData).eq('id', job.id);
      if (updateError) throw new Error('Failed to save completion details.');

      // Off-app client: email them the quote link so they can approve & release
      // (best-effort; no-ops for on-app jobs).
      void emailOffAppClientOnCompletion(job.id);

      // Notify client
      if (job.client_id) {
        const { displayTitle } = parseJobInfo(job);
        const tradieName = user?.user_metadata?.full_name || 'Your tradie';
        try {
          await supabase.rpc('create_notification', {
            p_user_id: job.client_id,
            p_title: 'Job Completed',
            p_message: `${tradieName} has completed ${displayTitle}. Please review and release payment.`,
            p_type: 'JOB_COMPLETED',
            p_channel: 'in_app',
            p_read: false,
            p_link: null,
            p_job_id: jobId,
            p_metadata: {},
          });
        } catch { /* non-critical */ }
      }

      onJobUpdated();
      setJob(prev => prev ? { ...prev, status: 'completed' } : prev);
    } catch (err) {
      setCompletionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
    setSaving(false);
  };

  const submitFinalPrice = async (price: number) => {
    if (!quote) return;
    setFinalPriceLoading(true);
    setFinalPriceError(null);
    setFinalPriceSuccess(null);
    try {
      const result = await adjustQuotePrice(quote.id, price);
      if (result.action === 'decrease') {
        setFinalPriceSuccess(`Final price set to $${price.toFixed(2)}. A refund of $${result.refundAmount?.toFixed(2)} is being processed to the client.`);
      } else if (result.action === 'increase_pending') {
        setFinalPriceSuccess(`Final price set to $${price.toFixed(2)}. The client has been notified to pay the additional $${result.additionalAmount?.toFixed(2)}.`);
      } else {
        setFinalPriceSuccess(`Final price confirmed at $${price.toFixed(2)}.`);
      }
      setQuote(prev => prev ? { ...prev, final_price: price } : prev);
      onJobUpdated();
    } catch (err) {
      setFinalPriceError(err instanceof Error ? err.message : 'Failed to set final price.');
    } finally {
      setFinalPriceLoading(false);
    }
  };

  const handleSetFinalPrice = () => {
    if (!quote || finalPriceLoading) return;
    const price = parseFloat(finalPriceInput);
    if (!price || price <= 0) {
      setFinalPriceError('Enter a valid final price.');
      return;
    }
    const originalPrice = quote.firm_price ?? quote.price_max ?? quote.price_min;
    const originalCents = Math.round(originalPrice * 100);
    const finalCents = Math.round(price * 100);

    let title: string;
    let message: string;
    let confirmText: string;
    let type: 'danger' | 'warning' | 'info' = 'info';
    if (finalCents < originalCents) {
      title = 'Confirm price reduction';
      message = `Setting the final price to $${price.toFixed(2)} will refund approximately $${(originalPrice - price).toFixed(2)} to the client.`;
      confirmText = 'Set final price';
      type = 'info';
    } else if (finalCents > originalCents) {
      title = 'Request additional payment?';
      message = `Setting the final price to $${price.toFixed(2)} will request an additional $${(price - originalPrice).toFixed(2)} from the client before work continues.`;
      confirmText = 'Send for approval';
      type = 'warning';
    } else {
      title = 'Confirm final price';
      message = `Lock in the final price at $${price.toFixed(2)} (no change from the deposit).`;
      confirmText = 'Confirm';
      type = 'info';
    }

    setConfirmDialog({
      title,
      message,
      confirmText,
      type,
      onConfirm: () => {
        setConfirmDialog(null);
        void submitFinalPrice(price);
      },
    });
  };

  const submitReductionResponse = async (
    approve: boolean,
    proposedDollars: number,
    refundDollars: number,
  ) => {
    if (!payment) return;
    setReductionLoading(true);
    setReductionError(null);
    setReductionSuccess(null);
    try {
      const result = await approvePriceReduction(payment.id, approve);
      if (result.action === 'approved') {
        setReductionSuccess(`Approved. $${result.refundAmount?.toFixed(2) ?? refundDollars.toFixed(2)} refund is processing. Payment is now $${result.newTotal?.toFixed(2) ?? proposedDollars.toFixed(2)}.`);
        setPayment(prev => {
          if (!prev) return prev;
          const newMeta = { ...(prev.metadata || {}) } as Record<string, unknown>;
          delete newMeta.pending_reduction;
          return {
            ...prev,
            amount: Math.round((result.newTotal ?? proposedDollars) * 100),
            metadata: newMeta,
          };
        });
      } else {
        setReductionSuccess('Reduction request declined. The client has been notified.');
        setPayment(prev => {
          if (!prev) return prev;
          const newMeta = { ...(prev.metadata || {}) } as Record<string, unknown>;
          delete newMeta.pending_reduction;
          return { ...prev, metadata: newMeta };
        });
      }
      onJobUpdated();
    } catch (err) {
      setReductionError(err instanceof Error ? err.message : 'Failed to respond to the reduction request.');
    } finally {
      setReductionLoading(false);
    }
  };

  const handleReductionResponse = (approve: boolean) => {
    if (!payment || reductionLoading) return;
    const pending = (payment.metadata as Record<string, unknown> | null)?.pending_reduction as
      | { proposed_amount_cents?: number; diff_cents?: number }
      | undefined;
    if (!pending) return;

    const proposedDollars = (pending.proposed_amount_cents ?? 0) / 100;
    const refundDollars = (pending.diff_cents ?? 0) / 100;

    setConfirmDialog({
      title: approve ? "Approve reduction request?" : "Decline reduction request?",
      message: approve
        ? `The payment will drop to $${proposedDollars.toFixed(2)} and $${refundDollars.toFixed(2)} will be refunded to the client's card. This cannot be undone.`
        : "The original amount will stay in place and the client will be notified.",
      confirmText: approve ? 'Approve refund' : 'Decline',
      type: approve ? 'warning' : 'info',
      onConfirm: () => {
        setConfirmDialog(null);
        void submitReductionResponse(approve, proposedDollars, refundDollars);
      },
    });
  };

  const handleSave = async () => {
    if (isLicenseExpired) return;
    setSaving(true);
    const { error } = await supabase
      .from('jobs')
      .update({ priority, is_delayed: isDelayed, delayed_until: isDelayed && delayedUntil ? new Date(delayedUntil).toISOString() : null, notes })
      .eq('id', jobId);

    if (!error && user) {
      const { data: existingQuote } = await supabase.from('quotes').select('id').eq('job_id', jobId).eq('tradie_id', user.id).maybeSingle();
      if (existingQuote) {
        const startDate = isDelayed && delayedUntil ? delayedUntil.slice(0, 10) : null;
        await supabase.from('quotes').update({ proposed_start_date: startDate }).eq('id', existingQuote.id);
      }
      onJobUpdated();
      onClose();
    }
    setSaving(false);
  };

  const handleArchiveToggle = async () => {
    setSaving(true);
    const newValue = job?.archived_at ? null : new Date().toISOString();
    const { error } = await supabase.from('jobs').update({ archived_at: newValue }).eq('id', jobId);
    if (!error) { onJobUpdated(); onClose(); }
    setSaving(false);
  };

  const isFinished = ['completed', 'cancelled', 'declined'].includes(job?.status || '');
  const isArchived = !!job?.archived_at;
  // Off-app client (CRM contact, no account): paid via an emailed link after the
  // job, never an in-app request. jobPaid = escrow/link already settled.
  const isOffApp = !!job?.client_contact_id && !job?.client_id;
  const jobPaid = payment?.status === 'completed' || payment?.status === 'released';
  const canSeeContact = ['funded', 'in_progress', 'completed'].includes(job?.status || '');
  const isRecurring = !!(job?.title && /ongoing|recurring/i.test(job.title));
  // Treat 'funded' as 'in_progress' for the progress bar (auto-start)
  const mappedStatus = job?.status === 'funded' ? 'in_progress' : job?.status;
  const currentStepIndex = STATUS_STEPS.indexOf(mappedStatus as typeof STATUS_STEPS[number]);

  if (!isOpen) return null;

  const parsed = job ? parseJobInfo(job) : null;
  const statusConfig = job ? getStatusConfig(job.status) : null;

  // Payment display calculations
  const paymentAmountDollars = payment ? payment.amount / 100 : 0;
  const gstDollars = payment?.metadata?.gst ? Number(payment.metadata.gst) / 100 : paymentAmountDollars * 0.1;
  const totalPaid = paymentAmountDollars + gstDollars;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 modal-sheet-overlay">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col modal-sheet">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : job && parsed && statusConfig ? (
          <>
            {/* ── Header ── */}
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-secondary-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 capitalize">{parsed.displayTitle}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                      {job.priority === 'high' && (
                        <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full border border-orange-200">HIGH PRIORITY</span>
                      )}
                      {job.is_emergency && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium border border-red-200">
                          <Zap className="w-3 h-3" /> Emergency
                        </span>
                      )}
                      {isRecurring && (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-medium border border-secondary-200">
                          <Repeat className="w-3 h-3" /> Ongoing
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ── Status Progress Bar ── */}
              {!['cancelled', 'declined'].includes(job.status) && (
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    {STATUS_STEPS.map((step, i) => {
                      const isActive = i <= currentStepIndex;
                      const isCurrent = step === job.status;
                      return (
                        <div key={step} className="flex-1 flex flex-col items-center relative">
                          {i > 0 && (
                            <div className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2 ${i <= currentStepIndex ? 'bg-emerald-500' : 'bg-gray-200'}`} />
                          )}
                          <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                            isCurrent ? 'bg-emerald-500 border-emerald-500 text-white' :
                            isActive ? 'bg-emerald-500 border-emerald-500 text-white' :
                            'bg-white border-gray-300 text-gray-400'
                          }`}>
                            {isActive ? <Check className="w-3 h-3" /> : i + 1}
                          </div>
                          <span className={`text-[10px] mt-1 font-medium ${isCurrent ? 'text-emerald-700' : isActive ? 'text-gray-600' : 'text-gray-400'}`}>
                            {STEP_LABELS[step]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLicenseExpired && (
                <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">License expired — renew to manage jobs.</p>
                </div>
              )}

              {/* ── Action Banner ── */}
              {!isLicenseExpired && (
                <div className="px-6 pt-4">
                  {job.status === 'pending' && !quote && (
                    <button
                      onClick={() => setShowQuoteModal(true)}
                      className="w-full flex items-center justify-center gap-2.5 px-4 py-3.5 bg-secondary-500 text-white rounded-xl text-sm font-semibold hover:bg-secondary-600 transition-colors shadow-sm"
                    >
                      <Send className="w-4 h-4" />
                      Quote Now
                    </button>
                  )}
                  {job.status === 'pending' && quote && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-100 text-gray-600">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Waiting for Client</p>
                        <p className="text-xs opacity-80">Client is reviewing your quote</p>
                      </div>
                    </div>
                  )}
                  {job.status === 'accepted' && (job.client_contact_id && !job.client_id ? (
                    /* Off-app client: they have no account to pay from — the tradie
                       emails them a Stripe payment link for the accepted amount. */
                    <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <div className="flex items-center gap-3 text-emerald-800">
                        <DollarSign className="w-4 h-4 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">Quote accepted — get paid</p>
                          <p className="text-xs opacity-80">Email your client a secure card payment link for the quoted amount.</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          setPayLinkState('sending'); setPayLinkError('');
                          const res = await sendJobPaymentLink(job.id);
                          if (res.ok) setPayLinkState('sent');
                          else { setPayLinkState('error'); setPayLinkError(res.error || 'Could not send the payment link.'); }
                        }}
                        disabled={payLinkState === 'sending'}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                      >
                        {payLinkState === 'sending' ? (<><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>)
                          : payLinkState === 'sent' ? (<><CheckCircle2 className="w-4 h-4" /> Payment link sent — resend</>)
                          : (<><Send className="w-4 h-4" /> Email Payment Link</>)}
                      </button>
                      {payLinkState === 'sent' && (
                        <p className="text-xs text-emerald-700">You'll be notified as soon as they pay — the job then starts automatically.</p>
                      )}
                      {payLinkState === 'error' && payLinkError && (
                        <p className="text-xs text-red-600">{payLinkError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 text-amber-700">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Awaiting Payment</p>
                        <p className="text-xs opacity-80">Client accepted — waiting for Stripe payment</p>
                      </div>
                    </div>
                  ))}
                  {job.status === 'funded' && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 text-green-700">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Payment Secured — Job Active</p>
                        <p className="text-xs opacity-80">You can start work. Mark complete when finished.</p>
                      </div>
                    </div>
                  )}
                  {job.status === 'completed' && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary-50 text-secondary-700">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">Job Complete</p>
                        <p className="text-xs opacity-80">Awaiting client approval and payout release</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="px-6 pt-4 space-y-4">
                {/* ── Description ── */}
                {parsed.cleanDescription && parsed.cleanDescription !== parsed.displayTitle && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    {parsed.category && (
                      <span className="inline-block px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-medium border border-secondary-200 mb-2">
                        {parsed.category}
                      </span>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{parsed.cleanDescription}</p>
                  </div>
                )}

                {/* ── Client & Contact ── */}
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Client</p>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-secondary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-secondary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{job.profiles?.full_name || 'Client'}</p>
                      {canSeeContact ? (
                        <div className="flex items-center gap-3 mt-1">
                          {job.profiles?.phone && (
                            <a href={`tel:${job.profiles.phone}`} className="flex items-center gap-1 text-xs text-secondary-600 hover:text-secondary-700">
                              <Phone className="w-3 h-3" />{job.profiles.phone}
                            </a>
                          )}
                          {job.profiles?.email && (
                            <a href={`mailto:${job.profiles.email}`} className="flex items-center gap-1 text-xs text-secondary-600 hover:text-secondary-700">
                              <Mail className="w-3 h-3" />{job.profiles.email}
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">Contact visible after payment is secured</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Payment & Escrow Status ──
                    Only render for money that's actually secured (completed) or
                    paid out (released) — a pending checkout link isn't "Secured
                    with Stripe" and must not claim to be. */}
                {payment && (payment.status === 'completed' || payment.status === 'released') && (() => {
                  const pendingInc = (payment.metadata as Record<string, unknown> | null)?.pending_increase as
                    | { diff_cents?: number; additional_gst?: number }
                    | undefined;
                  const pendingDiffDollars = (pendingInc?.diff_cents ?? 0) / 100;
                  // Fall back to computing GST on the delta if metadata predates the additional_gst field.
                  // Without this, "Final once paid" mis-shows totalPaid + base only and the missing $9 looks like a phantom refund.
                  const pendingGstDollars = pendingInc?.additional_gst != null
                    ? pendingInc.additional_gst / 100
                    : (isGstRegistered ? pendingDiffDollars * 0.1 : 0);
                  const pendingTopUp = pendingDiffDollars + pendingGstDollars;
                  return (
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment Status</p>
                        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${
                          payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                          payment.status === 'released' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {payment.status === 'completed' ? 'Secured' : payment.status === 'released' ? 'Released' : payment.status}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">{isGstRegistered ? 'Paid (ex. GST)' : 'Paid'}</span>
                          <span className="font-medium text-gray-900">${paymentAmountDollars.toFixed(2)}</span>
                        </div>
                        {isGstRegistered && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">GST (10%)</span>
                            <span className="font-medium text-gray-900">${gstDollars.toFixed(2)}</span>
                          </div>
                        )}
                        <div className={`${isGstRegistered ? 'border-t border-gray-200 pt-1.5' : ''} flex justify-between`}>
                          <span className="font-semibold text-gray-700">Secured with Stripe</span>
                          <span className="font-bold text-emerald-700">${totalPaid.toFixed(2)}</span>
                        </div>
                        {pendingInc && pendingTopUp > 0 && (
                          <>
                            <div className="border-t border-amber-200 mt-2 pt-2 flex justify-between">
                              <span className="text-amber-700">Awaiting top-up from client</span>
                              <span className="font-medium text-amber-700">+${pendingTopUp.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-amber-800">Final once paid</span>
                              <span className="font-bold text-amber-800">${(totalPaid + pendingTopUp).toFixed(2)}</span>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-secondary-500">
                        <Shield className="w-3 h-3" />
                        <span>{pendingInc ? 'Payment updates once the client pays the difference' : 'Funds secured with Stripe until job completion'}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Client requested a price reduction ── */}
                {payment && (payment.metadata as Record<string, unknown> | null)?.pending_reduction && (() => {
                  const pr = (payment.metadata as Record<string, unknown>).pending_reduction as
                    | { proposed_amount_cents?: number; original_amount_cents?: number; diff_cents?: number; reason?: string | null }
                    | undefined;
                  if (!pr) return null;
                  const originalDollars = (pr.original_amount_cents ?? 0) / 100;
                  const proposedDollars = (pr.proposed_amount_cents ?? 0) / 100;
                  const refundDollars = (pr.diff_cents ?? 0) / 100;
                  return (
                    <div className="bg-secondary-50 border border-secondary-200 rounded-xl p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary-100 flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-4 h-4 text-secondary-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-secondary-900">Client Requested a Price Reduction</p>
                          <p className="text-xs text-secondary-700 mt-0.5">
                            The client wants to reduce the payment from <span className="font-semibold">${originalDollars.toFixed(2)}</span> to <span className="font-semibold">${proposedDollars.toFixed(2)}</span>.
                            If you approve, ${refundDollars.toFixed(2)} will be refunded to their card and your payout drops accordingly.
                          </p>
                          {pr.reason && (
                            <p className="text-xs text-secondary-600 mt-1 italic">Client note: "{pr.reason}"</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReductionResponse(false)}
                          disabled={reductionLoading}
                          className="flex-1 px-3 py-2 bg-white border border-secondary-200 text-secondary-700 rounded-lg text-sm font-medium hover:bg-secondary-100 disabled:opacity-50 transition-colors"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleReductionResponse(true)}
                          disabled={reductionLoading}
                          className="flex-1 px-3 py-2 bg-secondary-600 text-white rounded-lg text-sm font-medium hover:bg-secondary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {reductionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          Approve & refund
                        </button>
                      </div>
                      {reductionError && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{reductionError}</span>
                        </div>
                      )}
                      {reductionSuccess && (
                        <div className="flex items-start gap-1.5 mt-2 text-xs text-green-700 bg-green-50 rounded-lg p-2 border border-green-200">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{reductionSuccess}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {reductionSuccess && !(payment?.metadata as Record<string, unknown> | null)?.pending_reduction && (
                  <div className="flex items-start gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg p-3 border border-green-200">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    <span>{reductionSuccess}</span>
                  </div>
                )}

                {/* ── Site-Visit Final Pricing ──
                    ONLY site-inspection quotes may adjust the price after
                    funding — their price was always provisional (3-stage flow).
                    Firm-price quotes are LOCKED once the client pays: no
                    "price variation" is offered on secured funds. A genuine
                    mid-work scope change is a separate additional charge, not a
                    rewrite of what the client already paid for. Requires the
                    payment to actually be secured (completed) — never a pending
                    or dead payment row. */}
                {quote && payment && payment.status === 'completed'
                  && (job?.status === 'funded' || job?.status === 'in_progress')
                  && (quote.requires_site_inspection || quote.final_price != null) && (() => {
                  const isSiteInspect = !!quote.requires_site_inspection;
                  const inputVisible = quote.final_price == null && isSiteInspect;
                  const title = quote.final_price != null
                    ? (isSiteInspect ? 'Final Price Set' : 'Variation Submitted')
                    : 'Set Final Price After Site Visit';
                  const helper = quote.final_price != null
                    ? (() => {
                        const finalDollars = quote.final_price as number;
                        const paidDollars = paymentAmountDollars;
                        const pendingInc = (payment.metadata as Record<string, unknown> | null)?.pending_increase as
                          | { diff_cents?: number }
                          | undefined;
                        const pendingDollars = (pendingInc?.diff_cents ?? 0) / 100;
                        if (pendingDollars > 0) {
                          return `Final price: $${finalDollars.toFixed(2)} ${isGstRegistered ? '(ex. GST)' : ''} · paid so far $${paidDollars.toFixed(2)} · awaiting client to pay $${pendingDollars.toFixed(2)}${isGstRegistered ? ' + GST' : ''}.`;
                        }
                        if (Math.abs(finalDollars - paidDollars) < 0.01) {
                          return `Final price: $${finalDollars.toFixed(2)} ${isGstRegistered ? '(ex. GST)' : ''} · matches the amount in escrow.`;
                        }
                        return `Final price: $${finalDollars.toFixed(2)} ${isGstRegistered ? '(ex. GST)' : ''} · originally paid $${paidDollars.toFixed(2)} (refund issued for the difference).`;
                      })()
                    : `Enter your final ${isGstRegistered ? 'ex-GST' : ''} price. If higher than the amount paid, the client approves and pays the difference before work continues. If lower, the client gets a refund.`;

                  return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-900">{title}</p>
                        <p className="text-xs text-amber-700 mt-0.5">{helper}</p>
                      </div>
                    </div>

                    {inputVisible && (
                      <>
                        {/* Stacked on mobile so the input never gets squeezed to
                            a sliver by the button ("$ Fin…"); row on ≥sm. */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
                          <div className="relative flex-1 w-full">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                            <input
                              type="number"
                              min="1"
                              step="0.01"
                              value={finalPriceInput}
                              onChange={(e) => { setFinalPriceInput(e.target.value); setFinalPriceError(null); }}
                              placeholder={isGstRegistered ? 'Final price (ex. GST)' : 'Final price'}
                              className="w-full pl-7 pr-3 py-2.5 border border-amber-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                            />
                          </div>
                          <button
                            onClick={handleSetFinalPrice}
                            disabled={finalPriceLoading || !finalPriceInput}
                            className={`w-full sm:w-auto px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                              finalPriceLoading || !finalPriceInput
                                ? 'bg-amber-300 text-amber-100 cursor-not-allowed'
                                : 'bg-amber-500 text-white hover:bg-amber-600'
                            }`}
                          >
                            {finalPriceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                          </button>
                        </div>
                        {isGstRegistered && parseFloat(finalPriceInput) > 0 && (
                          <p className="mt-1.5 text-xs text-amber-700">
                            Client pays <span className="font-semibold">${(parseFloat(finalPriceInput) * 1.1).toFixed(2)}</span> total
                            <span className="text-amber-500"> (${parseFloat(finalPriceInput).toFixed(2)} + ${(parseFloat(finalPriceInput) * 0.1).toFixed(2)} GST)</span>
                          </p>
                        )}
                        {finalPriceError && (
                          <div className="flex items-start gap-1.5 mt-2 text-xs text-red-600">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <span>{finalPriceError}</span>
                          </div>
                        )}
                      </>
                    )}

                    {finalPriceSuccess && (
                      <div className="flex items-start gap-1.5 mt-2 text-xs text-green-700 bg-green-50 rounded-lg p-2 border border-green-200">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{finalPriceSuccess}</span>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {/* ── 3-Stage Flow Actions (v2 pre-payment) ──
                    Renders the tradie-side action surface for v2 jobs:
                    "mark site visit complete" once the client has booked one,
                    and "submit final quote" once the visit is done (or fast-
                    path when no visit was required). The component is a no-op
                    on flow_version=1 so v1 surfaces continue unchanged. */}
                {quote && !payment && job?.flow_version === 2 && (
                  <div className="bg-white border border-secondary-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Next step</p>
                    <TradieQuoteActions
                      quote={quote as unknown as Quote}
                      job={{ id: job.id, flow_version: job.flow_version }}
                      onChange={() => { loadJob(); onJobUpdated(); }}
                    />
                  </div>
                )}

                {/* ── Your Quote (only when no payment record yet — avoids duplicate price display) ── */}
                {quote && !payment && (
                  <div className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">Your Quote</p>
                    <p className="text-sm font-semibold text-secondary-800">
                      {quote.firm_price
                        ? `$${quote.firm_price.toLocaleString()}`
                        : `$${quote.price_min.toLocaleString()} – $${quote.price_max.toLocaleString()}`}
                      {isGstRegistered && <span className="text-xs font-normal text-gray-500 ml-1">+ GST</span>}
                    </p>
                    {quote.message && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{quote.message}</p>}
                  </div>
                )}
                {/* ── Quote message (when payment exists, show message without duplicate price) ── */}
                {quote?.message && payment && (
                  <div className="bg-secondary-50 border border-secondary-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">Your Quote Message</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{quote.message}</p>
                  </div>
                )}

                {/* ── Budget & Quotes (for pending jobs without own quote) ── */}
                {job.status === 'pending' && !quote && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-200">
                      <p className="text-xs text-gray-500 mb-0.5">Budget</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {job.budget_amount
                          ? `$${job.budget_amount.toLocaleString()}${job.budget_type === 'hourly_rate' ? '/hr' : ''}`
                          : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted')
                            ? 'Quote requested'
                            : 'Not specified'}
                      </p>
                    </div>
                    {job.tradie_id ? (
                      <div className="rounded-xl px-3 py-2.5 bg-secondary-50 border border-secondary-200">
                        <p className="text-xs text-gray-500 mb-0.5">Sent To You</p>
                        <p className="text-sm font-semibold text-secondary-700 flex items-center gap-1">
                          <User className="w-3.5 h-3.5" /> Private request
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl px-3 py-2.5 bg-gray-50 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-0.5">Quotes</p>
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {quoteCount} of {job.max_quotes || 5}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Key Info Grid ── */}
                <div className="grid grid-cols-2 gap-2.5">
                  {job.location_address && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Area</p>
                      <p className="text-sm text-gray-800 flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                        <span className="line-clamp-2">
                          {canSeeContact ? job.location_address : extractSuburb(job.location_address) || 'Suburb hidden'}
                        </span>
                      </p>
                    </div>
                  )}
                  {job.preferred_time_slot && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Preferred Time</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5 capitalize">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> {job.preferred_time_slot}
                      </p>
                    </div>
                  )}
                  {(job.scheduled_date || job.scheduled_time) && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Scheduled</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {new Date(job.scheduled_date || job.scheduled_time!).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  )}
                  {job.estimated_duration && (
                    <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Est. Duration</p>
                      <p className="text-sm text-gray-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-gray-400" /> {job.estimated_duration}
                      </p>
                    </div>
                  )}
                  <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Posted</p>
                    <p className="text-sm text-gray-800">
                      {new Date(job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* ── Access Instructions ── */}
                {job.access_instructions && (
                  <div className="border border-gray-200 rounded-xl px-3 py-2.5">
                    <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Key className="w-3 h-3" /> Access Instructions</p>
                    <p className="text-sm text-gray-800">{job.access_instructions}</p>
                  </div>
                )}

                {/* ── Photos ── */}
                {job.images_url && job.images_url.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Image className="w-3 h-3" /> Photos ({job.images_url.length})
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {job.images_url.slice(0, 6).map((_, i) => {
                        const signedUrl = photoSignedUrls[i];
                        return (
                          <a key={i} href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-primary-300 transition-colors">
                            {signedUrl
                              ? <img src={signedUrl} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                              : <div className="w-full h-full bg-gray-100" />}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Completion Form (only for in_progress jobs) ── */}
                {(job.status === 'in_progress' || job.status === 'funded') && !isLicenseExpired && (
                  <div className="border-2 border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
                      <Camera className="w-4 h-4 text-emerald-600" />
                      Complete This Job
                    </h3>

                    {/* Completion prompts */}
                    <p className="text-xs text-gray-500 mb-2">Select what was completed:</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {prompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => {
                            setSelectedPrompts(prev => {
                              const next = new Set(prev);
                              next.has(prompt) ? next.delete(prompt) : next.add(prompt);
                              return next;
                            });
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                            selectedPrompts.has(prompt)
                              ? 'bg-emerald-500 text-white border-emerald-500'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'
                          }`}
                        >
                          {selectedPrompts.has(prompt) && <Check className="w-3 h-3 inline mr-1" />}
                          {prompt}
                        </button>
                      ))}
                    </div>

                    {/* Additional notes */}
                    <textarea
                      value={completionCustomNotes}
                      onChange={(e) => setCompletionCustomNotes(e.target.value)}
                      placeholder="Add any additional notes..."
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 resize-none mb-3"
                    />

                    {/* Photo upload */}
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <Plus className="w-3 h-3" /> Add Photos ({completionPhotos.length}/15)
                      </button>
                    </div>

                    {completionPhotos.length > 0 && (
                      <div className="grid grid-cols-5 gap-1.5 mb-3">
                        {completionPhotos.map((photo, i) => (
                          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                            <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setCompletionPhotos(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {completionError && (
                      <p className="text-xs text-red-600 mb-2">{completionError}</p>
                    )}

                    <button
                      onClick={handleCompletion}
                      disabled={saving || (!combinedCompletionNotes.trim())}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      {/* Off-app clients pay by emailed link after completion, and
                          funded jobs already hold the money — no request either way. */}
                      {(isOffApp || jobPaid) ? 'Mark Complete' : 'Mark Complete & Request Payout'}
                    </button>
                    {isOffApp && (
                      <p className="mt-2 text-xs text-gray-500 text-center">You'll email {job.profiles?.full_name ? job.profiles.full_name.split(' ')[0] : 'the client'} a payment link once the job is marked complete.</p>
                    )}
                  </div>
                )}

                {/* ── Completion Summary (for completed jobs) ── */}
                {job.status === 'completed' && job.completion_notes && (
                  <div className="border border-green-200 rounded-xl p-4 bg-green-50/50">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Completion Notes
                    </h3>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.completion_notes}</p>
                    {job.completion_photo_url && (
                      <img src={job.completion_photo_url} alt="Completion" className="mt-2 rounded-lg max-h-32 object-cover" />
                    )}
                    {job.completed_at && (
                      <p className="text-xs text-gray-400 mt-2">
                        Completed {new Date(job.completed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}

                {/* Off-app + completed + unpaid → get paid: email a card link. */}
                {job.status === 'completed' && isOffApp && !jobPaid && (
                  <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-gray-900">Get paid</h3>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">Email your client a secure card payment link for this job.</p>
                    <button
                      onClick={async () => {
                        setPayLinkState('sending'); setPayLinkError('');
                        const res = await sendJobPaymentLink(job.id);
                        if (res.ok) setPayLinkState('sent');
                        else { setPayLinkState('error'); setPayLinkError(res.error || 'Could not send the invoice.'); }
                      }}
                      disabled={payLinkState === 'sending'}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
                    >
                      {payLinkState === 'sending' ? (<><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>)
                        : payLinkState === 'sent' ? (<><CheckCircle2 className="w-4 h-4" /> Invoice sent — resend</>)
                        : (<><Send className="w-4 h-4" /> Send Invoice by Email</>)}
                    </button>
                    {payLinkState === 'error' && payLinkError && (
                      <p className="mt-2 text-xs text-red-600">{payLinkError}</p>
                    )}
                  </div>
                )}

                {/* ── Your Notes ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Notes</label>
                    {notes.trim() && (
                      <button
                        type="button"
                        onClick={() => setShowNotesFull(true)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700"
                      >
                        <Maximize2 className="w-3.5 h-3.5" /> View full
                      </button>
                    )}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add private notes about this job..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                  {notes.trim() && (
                    <p className="mt-1 text-[11px] text-gray-400">Long notes? Tap “View full” to read them all.</p>
                  )}
                </div>

                {/* Full-screen notes reader — long auto-generated notes (assumptions,
                    pricing rationale) don't fit the small box, so open them large
                    with bullets rendered from dashes. */}
                {showNotesFull && (
                  <div
                    className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
                    onClick={() => setShowNotesFull(false)}
                  >
                    <div
                      className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                        <h3 className="text-base font-semibold text-gray-900">Your notes</h3>
                        <button
                          onClick={() => setShowNotesFull(false)}
                          aria-label="Close notes"
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-50"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto px-5 py-4">
                        <FormattedNotes text={notes} className="space-y-1" />
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Preferences (collapsible) ── */}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Your Preferences
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="space-y-3 pb-1">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-gray-500">Priority</label>
                        <span className="flex items-center gap-1 text-[11px] text-gray-400"><EyeOff className="w-3 h-3" /> Only visible to you</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['low', 'normal', 'high'] as const).map((p) => (
                          <button
                            key={p}
                            onClick={() => setPriority(p)}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border capitalize ${
                              priority === p
                                ? p === 'low' ? 'bg-secondary-500 text-white border-secondary-500'
                                  : p === 'high' ? 'bg-orange-500 text-white border-orange-500'
                                  : 'bg-gray-600 text-white border-gray-600'
                                : 'bg-white text-gray-500 border-gray-200'
                            }`}
                          >{p}</button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer border border-gray-200 rounded-lg p-3">
                      <input type="checkbox" checked={isDelayed} onChange={(e) => setIsDelayed(e.target.checked)} className="w-4 h-4 text-secondary-600 rounded focus:ring-secondary-500" />
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <span className="text-sm text-gray-700">Can&apos;t start yet</span>
                        <p className="flex items-center gap-1 text-xs text-gray-400"><Eye className="w-3 h-3" /> Client will see your earliest available date</p>
                      </div>
                    </label>
                    {isDelayed && (
                      <input
                        type="date"
                        value={delayedUntil ? delayedUntil.slice(0, 10) : ''}
                        onChange={(e) => setDelayedUntil(e.target.value ? `${e.target.value}T00:00` : '')}
                        min={new Date().toISOString().slice(0, 10)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-secondary-500 focus:border-secondary-500"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-6 pt-4 border-t border-gray-100 space-y-2" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
              {isFinished && (
                <button
                  onClick={handleArchiveToggle}
                  disabled={saving}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    isArchived ? 'bg-secondary-50 text-secondary-700 border border-secondary-200 hover:bg-secondary-100' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {isArchived ? <><ArchiveRestore className="w-4 h-4" /> Unarchive</> : <><Archive className="w-4 h-4" /> Archive Job</>}
                </button>
              )}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || isLicenseExpired}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary-600 text-white rounded-xl text-sm font-medium hover:bg-secondary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Notes'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-6 text-center text-gray-500">Job not found</div>
        )}
      </div>

      {/* SubmitQuoteModal */}
      {showQuoteModal && job && (
        <SubmitQuoteModal
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          job={job as unknown as Job}
          onQuoteSubmitted={() => {
            setShowQuoteModal(false);
            loadJob();
            onJobUpdated();
          }}
        />
      )}

      {/* In-app confirmation for price-adjustment actions (replaces window.confirm) */}
      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmText={confirmDialog.confirmText}
          type={confirmDialog.type}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
