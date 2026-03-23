import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Zap,
  MapPin,
  Clock,
  Loader2,
  Briefcase,
  Plus,
  Calendar,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  WifiOff,
  CalendarDays,
  Sun,
  CloudSun,
  Sunset,
  ShieldAlert,
  Settings,
  FileText,
  Users,
  User,
  CheckCircle2,
  Eye,
  XCircle,
  Trash2,
  Camera,
  X,
  Archive,
  CreditCard,
  Shield,
  DollarSign,
  Star,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Job, Quote } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';
import VerificationGateModal from '../components/VerificationGateModal';
import SubmitQuoteModal from '../components/SubmitQuoteModal';
import QuoteComparisonView from '../components/QuoteComparisonView';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import { formatDate, checkLicenseExpired } from '../lib/utils';
import { extractSuburb } from '../lib/contactGating';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';
import { acceptAndPay, verifyPayment, releaseEscrow, payPriceIncrease } from '../lib/stripePayments';
import { getJobHints } from '../lib/jobDescriptionHints';
import ClientServicesTab from '../components/ClientServicesTab';

function FlashCountdown({ expiry, onExpired }: { expiry: string; onExpired?: () => void }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiry).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        if (!expired) {
          setExpired(true);
          onExpired?.();
        }
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : `${mins}m ${secs}s`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry, expired, onExpired]);

  return <span className="font-bold tabular-nums">{timeLeft}</span>;
}

function AutoReleaseCountdown({ completedAt }: { completedAt: string }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const releaseTime = new Date(completedAt).getTime() + 48 * 60 * 60 * 1000;
    const update = () => {
      const diff = releaseTime - Date.now();
      if (diff <= 0) {
        setExpired(true);
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
    };

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [completedAt]);

  if (expired) {
    return (
      <div className="flex items-start gap-2 px-5 py-2.5 bg-amber-50 border-t border-amber-100">
        <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700">
          Auto-release window has passed. Please release payment manually to complete this job.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-5 py-2.5 bg-amber-50 border-t border-amber-100">
      <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-xs text-amber-800">
        <p>
          Payment will auto-release in <span className="font-semibold tabular-nums">{timeLeft}</span>.
          Release now or raise a dispute if there&apos;s an issue.
        </p>
      </div>
    </div>
  );
}

const SLOT_ICONS: Record<string, typeof Sun> = {
  morning: Sun,
  midday: CloudSun,
  afternoon: Sunset,
};

const SLOT_LABELS: Record<string, string> = {
  morning: '7-9 AM',
  midday: '10 AM-12 PM',
  afternoon: '1-5 PM',
};

function getDateGroupLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diffDays >= 0 && diffDays <= 6) {
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  if (diffDays >= 7 && diffDays <= 13) {
    return `Next Week - ${date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}`;
  }
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

type LeadFilter = 'all' | 'active' | 'pending' | 'accepted' | 'boosted' | 'urgent' | 'scheduled' | 'quoted' | 'history' | 'archived' | 'deleted' | 'open' | 'quoting' | 'in_progress' | 'completed' | 'services';

type LeadWithClient = Job & { client_name?: string; my_quote?: Quote | null };

export default function Leads({ embedded = false }: { embedded?: boolean }) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState<LeadWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadFilter>(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'services') return 'services';
    const urlFilter = params.get('filter');
    const validFilters: LeadFilter[] = ['all', 'active', 'open', 'quoting', 'accepted', 'in_progress', 'completed', 'archived', 'pending', 'boosted', 'urgent', 'scheduled', 'quoted', 'history', 'deleted', 'services'];
    return urlFilter && validFilters.includes(urlFilter as LeadFilter) ? urlFilter as LeadFilter : 'all';
  });
  const [showVerificationGate, setShowVerificationGate] = useState(false);
  const [gateReason, setGateReason] = useState<'unverified' | 'expired'>('unverified');
  const [quoteModalJob, setQuoteModalJob] = useState<Job | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(searchParams.get('job'));
  const [quoteAcceptedBanner, setQuoteAcceptedBanner] = useState<false | 'success' | 'price_increase_success' | 'cancelled' | 'error'>(false);
  const [fetchError, setFetchError] = useState('');
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('dismissed_leads');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const [deleteJobTarget, setDeleteJobTarget] = useState<LeadWithClient | null>(null);
  const [editJob, setEditJob] = useState<LeadWithClient | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editPhotos, setEditPhotos] = useState<{ url: string; isExisting: boolean; file?: File }[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [viewLeadDetail, setViewLeadDetail] = useState<LeadWithClient | null>(null);
  const [acceptedQuotes, setAcceptedQuotes] = useState<Record<string, Quote>>({});
  const [payingJobId, setPayingJobId] = useState<string | null>(null);
  const [priceConfirm, setPriceConfirm] = useState<{
    quoteId: string;
    jobId: string;
    min: number;
    max: number;
    agreedPrice: string;
  } | null>(null);

  const [releasingJobId, setReleasingJobId] = useState<string | null>(null);
  const [releasedJobIds, setReleasedJobIds] = useState<Set<string>>(new Set());
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set());
  const [pendingIncreases, setPendingIncreases] = useState<Record<string, { paymentId: string; amount: number; originalAmount: number; finalAmount: number }>>({});
  const [paidIncreaseJobIds, setPaidIncreaseJobIds] = useState<Set<string>>(new Set());
  const [viewCompletedJob, setViewCompletedJob] = useState<LeadWithClient | null>(null);
  const [withdrawQuoteTarget, setWithdrawQuoteTarget] = useState<LeadWithClient | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const isTradie = profile?.role === 'tradie';
  const isVerified = profile?.verification_status === 'verified';
  const isLicenseExpired = checkLicenseExpired(profile?.verification_status, profile?.license_expiry);

  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError('');

    try {
      if (isTradie) {
        await fetchTradieLeads();
      } else {
        await fetchClientLeads();
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
      setFetchError('Failed to load leads. Please try again.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isTradie, filter, dismissedJobIds]);

  useEffect(() => {
    if (user && profile) {
      fetchLeads();
    }
  }, [user, profile, fetchLeads]);

  // Handle payment callbacks and auto-expand job from ?job= query param
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const jobParam = searchParams.get('job') || searchParams.get('job_id');

    if (paymentStatus === 'success' && jobParam) {
      // Suppress pending increase banner for this job (webhook may not have cleared it yet)
      setPaidIncreaseJobIds(prev => new Set(prev).add(jobParam));
      searchParams.delete('payment');
      searchParams.delete('job_id');
      setSearchParams(searchParams, { replace: true });

      // Verify payment via Stripe (webhook fallback) then refresh
      (async () => {
        let isPriceIncreaseReturn = false;
        try {
          // Check if this is a return from paying a price increase (vs initial job funding)
          const { data: adjPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('job_id', jobParam)
            .eq('payment_type', 'price_adjustment')
            .limit(1)
            .maybeSingle();

          isPriceIncreaseReturn = !!adjPayment;

          if (!isPriceIncreaseReturn) {
            // Find the pending job_funding payment for webhook fallback verification
            const { data: pendingPayment } = await supabase
              .from('payments')
              .select('id, status')
              .eq('job_id', jobParam)
              .eq('payment_type', 'job_funding')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (pendingPayment && pendingPayment.status === 'pending') {
              await verifyPayment(pendingPayment.id);
            }
          }
        } catch (err) {
          console.error('Payment verification fallback failed:', err);
        }
        // Switch to active tab — funded jobs appear there.
        // The filter change triggers useEffect → fetchLeads() automatically.
        setFilter('active');
        setQuoteAcceptedBanner(isPriceIncreaseReturn ? 'price_increase_success' : 'success');
        setTimeout(() => setQuoteAcceptedBanner(false), 10000);
      })();
    } else if (paymentStatus === 'cancelled' && jobParam) {
      setQuoteAcceptedBanner('cancelled');
      setTimeout(() => setQuoteAcceptedBanner(false), 8000);
      searchParams.delete('payment');
      searchParams.delete('job_id');
      setSearchParams(searchParams, { replace: true });
    }

    if (jobParam && !loading && leads.length > 0) {
      const targetJob = leads.find((l) => l.id === jobParam);
      searchParams.delete('job');
      searchParams.delete('job_id');
      setSearchParams(searchParams, { replace: true });

      // Auto-switch to active tab if the deep-linked job is funded/in_progress
      if (targetJob && ['funded', 'in_progress'].includes(targetJob.status) && filter !== 'active' && filter !== 'all') {
        setFilter('active');
      }

      if (targetJob && !isTradie && targetJob.status === 'pending' && !targetJob.tradie_id) {
        // Expand quotes section if quotes exist — user can click card to open edit modal
        if (targetJob.quote_count > 0) {
          setExpandedJobId(jobParam);
        }
      } else {
        setExpandedJobId(jobParam);
      }

      setTimeout(() => {
        document.getElementById(`job-${jobParam}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [loading, leads, searchParams, setSearchParams]);

  const fetchTradieLeads = async () => {
    if (!user) return;

    let query = supabase
      .from('jobs')
      .select('*, profiles!jobs_client_id_fkey(full_name)')
      .is('tradie_id', null)
      .is('deleted_at', null)
      .eq('status', 'pending')
      .eq('quoting_status', 'open')
      .order('created_at', { ascending: false });

    if (filter === 'boosted') {
      query = query.eq('is_flash_boost', true);
    } else if (filter === 'urgent') {
      query = query.eq('priority', 'high');
    } else if (filter === 'scheduled') {
      query = query.eq('priority', 'normal').not('scheduled_date', 'is', null);
    }

    const { data, error } = await query;

    if (!error && data) {
      const { data: myQuotes } = await supabase
        .from('quotes')
        .select('*')
        .eq('tradie_id', user.id)
        .in('job_id', data.map((d: { id: string }) => d.id));

      const quoteMap = new Map<string, Quote>();
      ((myQuotes || []) as Quote[]).forEach((q) => quoteMap.set(q.job_id, q));

      let mapped = data
        .filter((lead: { id: string }) => !dismissedJobIds.has(lead.id))
        .map((lead: Job & { profiles: { full_name: string } | null }) => ({
          ...lead,
          client_name: lead.profiles?.full_name || 'Client',
          my_quote: quoteMap.get(lead.id) || null,
        }));

      if (filter === 'quoted') {
        mapped = mapped.filter((l: LeadWithClient) => l.my_quote);
      }

      setLeads(mapped);
    }
  };

  const ARCHIVE_AFTER_DAYS = 7;

  const isAutoArchivable = (job: Job) => {
    if (job.archived_at) return true;
    const finishedStatuses = ['completed', 'cancelled', 'declined'];
    if (!finishedStatuses.includes(job.status)) return false;
    const age = (Date.now() - new Date(job.updated_at).getTime()) / 86400000;
    return age >= ARCHIVE_AFTER_DAYS;
  };

  const fetchClientLeads = async () => {
    if (!user) return;

    let query = supabase
      .from('jobs')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false });

    // Tradie-only server-side filters
    if (filter === 'pending') {
      query = query.eq('status', 'pending').is('tradie_id', null);
    } else if (filter === 'boosted') {
      query = query.eq('is_flash_boost', true);
    } else if (filter === 'quoted') {
      query = query.eq('status', 'pending').is('tradie_id', null);
    }

    const { data, error } = await query;
    if (!error && data) {
      const jobs = data as LeadWithClient[];

      // Fetch accepted quotes for awarded jobs (tradie assigned but not yet funded)
      const awardedJobIds = jobs
        .filter(j => j.tradie_id && ['pending', 'accepted'].includes(j.status))
        .map(j => j.id);

      if (awardedJobIds.length > 0) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('*')
          .in('job_id', awardedJobIds)
          .eq('status', 'accepted');

        if (quotes && quotes.length > 0) {
          const quoteMap: Record<string, Quote> = {};
          for (const q of quotes) {
            quoteMap[q.job_id] = q as Quote;
          }
          setAcceptedQuotes(quoteMap);
        }
      }

      // Pre-check which completed jobs already had payment released and reviews left
      const completedJobIds = jobs
        .filter(j => j.status === 'completed')
        .map(j => j.id);

      if (completedJobIds.length > 0) {
        const [paymentsResult, reviewsResult] = await Promise.all([
          supabase
            .from('payments')
            .select('job_id, status, metadata')
            .in('job_id', completedJobIds),
          supabase
            .from('reviews')
            .select('job_id')
            .in('job_id', completedJobIds)
            .eq('client_id', user!.id),
        ]);

        if (paymentsResult.data && paymentsResult.data.length > 0) {
          const alreadyReleased = new Set<string>();
          const jobsWithPayments = new Set(paymentsResult.data.map(p => p.job_id));
          for (const p of paymentsResult.data) {
            const meta = p.metadata as Record<string, unknown> | null;
            if (meta?.transfer_id || p.status === 'released' || p.status === 'completed') {
              alreadyReleased.add(p.job_id);
            }
          }
          // Jobs with no payment record — already released or never had escrow
          for (const id of completedJobIds) {
            if (!jobsWithPayments.has(id)) alreadyReleased.add(id);
          }
          if (alreadyReleased.size > 0) {
            setReleasedJobIds(prev => {
              const next = new Set(prev);
              alreadyReleased.forEach(id => next.add(id));
              return next;
            });
          }
        } else {
          // No payment records at all — mark all completed jobs as released
          setReleasedJobIds(prev => {
            const next = new Set(prev);
            completedJobIds.forEach(id => next.add(id));
            return next;
          });
        }

        if (reviewsResult.data && reviewsResult.data.length > 0) {
          setReviewedJobIds(new Set(reviewsResult.data.map(r => r.job_id)));
        }
      }

      // Fetch pending price increases for active jobs
      const activeJobIds = jobs
        .filter(j => ['funded', 'in_progress', 'completed'].includes(j.status))
        .map(j => j.id);

      if (activeJobIds.length > 0) {
        const { data: activePayments } = await supabase
          .from('payments')
          .select('id, job_id, amount, metadata')
          .in('job_id', activeJobIds)
          .eq('payment_type', 'job_funding')
          .eq('status', 'completed');

        if (activePayments) {
          const increases: Record<string, { paymentId: string; amount: number; originalAmount: number; finalAmount: number }> = {};
          for (const p of activePayments) {
            const meta = p.metadata as Record<string, unknown> | null;
            if (meta?.pending_increase) {
              const inc = meta.pending_increase as Record<string, unknown>;
              const diffCents = typeof inc.diff_cents === 'number' ? inc.diff_cents : 0;
              if (diffCents > 0) {
                const originalCents = typeof p.amount === 'number' ? p.amount : 0;
                increases[p.job_id] = {
                  paymentId: p.id,
                  amount: diffCents / 100,
                  originalAmount: originalCents / 100,
                  finalAmount: (originalCents + diffCents) / 100,
                };
              }
            }
          }
          setPendingIncreases(increases);
        }
      }

      // Client-side filtering for progression tabs
      const isActive = (j: LeadWithClient) =>
        !j.archived_at && !j.deleted_at && j.status !== 'cancelled' && j.status !== 'declined';

      if (filter === 'open') {
        // Posted, no quotes yet
        setLeads(jobs.filter(j =>
          j.status === 'pending' && j.quote_count === 0
          && j.quoting_status !== 'awarded'
          && isActive(j)
        ));
      } else if (filter === 'quoting') {
        // Has quotes but quote not yet accepted/awarded
        setLeads(jobs.filter(j =>
          j.status === 'pending' && j.quote_count > 0
          && j.quoting_status !== 'awarded'
          && isActive(j)
        ));
      } else if (filter === 'accepted') {
        // Quote accepted (awarded), awaiting payment (not yet funded/in_progress/completed)
        setLeads(jobs.filter(j =>
          j.quoting_status === 'awarded' && ['pending', 'accepted'].includes(j.status)
          && isActive(j)
        ));
      } else if (filter === 'in_progress') {
        // Funded or actively being worked on
        setLeads(jobs.filter(j =>
          ['funded', 'in_progress'].includes(j.status)
          && isActive(j)
        ));
      } else if (filter === 'completed') {
        // Completed jobs — respect archive status
        setLeads(jobs.filter(j =>
          j.status === 'completed' && !j.deleted_at && !j.archived_at
        ));
      } else if (filter === 'archived') {
        // Only show jobs explicitly archived by the user (archived_at set) or
        // cancelled/declined that haven't been explicitly unarchived
        setLeads(jobs.filter(j =>
          !j.deleted_at && j.status !== 'completed' && !!j.archived_at
        ));
      } else if (filter === 'active') {
        // Combined active tab: open, quoting, awarded, in progress
        setLeads(jobs.filter(j =>
          isActive(j) && !isAutoArchivable(j) && j.status !== 'completed'
        ));
      } else if (filter === 'all') {
        // All active jobs — hide completed jobs that are fully done (released + reviewed)
        setLeads(jobs.filter(j =>
          isActive(j) && !isAutoArchivable(j)
        ));
      } else if (filter === 'history') {
        setLeads(jobs.filter(j => isAutoArchivable(j)));
      } else {
        setLeads(jobs);
      }
    }
  };

  const handleRestoreJob = async (jobId: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ deleted_at: null, deleted_by: null })
      .eq('id', jobId);
    if (!error) {
      setLeads(prev => prev.filter(j => j.id !== jobId));
    }
  };

  const handleArchiveJob = async (jobId: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', jobId);
    if (!error) {
      setLeads(prev => prev.filter(j => j.id !== jobId));
    }
  };

  const handleUnarchiveJob = async (jobId: string) => {
    const { error } = await supabase
      .from('jobs')
      .update({ archived_at: null })
      .eq('id', jobId);
    if (!error) {
      setLeads(prev => prev.filter(j => j.id !== jobId));
    }
  };

  const handleExportInvoice = async () => {
    const html2pdfModule = await import('html2pdf.js');
    const html2pdf = html2pdfModule.default;
    const now = new Date();
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const invoiceJobs = leads.filter(l => l.budget_amount && l.budget_amount > 0);
    const userName = profile?.full_name || 'Client';
    const userEmail = profile?.email || '';
    const isClientView = !isTradie;

    const subtotal = invoiceJobs.reduce((sum, j) => sum + (j.budget_amount || 0), 0);
    const gst = Math.round(subtotal / 11 * 100) / 100;
    const exGst = Math.round((subtotal - gst) * 100) / 100;

    let jobRows = '';
    invoiceJobs.forEach((lead, idx) => {
      const category = lead.description.match(/^\[([^\]]+)\]/)?.[1] || 'Service';
      const desc = lead.description.replace(/^\[[^\]]+\]\s*/, '');
      const completedDate = lead.updated_at
        ? new Date(lead.updated_at).toLocaleDateString('en-AU')
        : new Date(lead.created_at).toLocaleDateString('en-AU');
      const amount = lead.budget_amount || 0;
      const bg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      jobRows += '<tr style="background-color:' + bg + ';">' +
        '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;font-weight:500;">' + category + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">' + (desc.length > 70 ? desc.slice(0, 70) + '...' : desc) + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;text-align:center;">' + lead.status.replace('_', ' ') + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#6B7280;text-align:center;">' + completedDate + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#111827;text-align:right;font-weight:600;">$' + amount.toFixed(2) + '</td>' +
        '</tr>';
    });

    if (!jobRows) {
      jobRows = '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px;background:#F9FAFB;">No jobs with amounts in this period</td></tr>';
    }

    const invoiceDate = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.background = '#FFFFFF';
    container.innerHTML = '<div style="font-family:Arial,Helvetica,sans-serif;width:794px;padding:40px 48px;color:#1F2937;background:#FFFFFF;">' +

      // Header
      '<table style="width:100%;border-collapse:collapse;margin-bottom:0;">' +
        '<tr><td colspan="2" style="padding-bottom:20px;border-bottom:3px solid #004d40;">' +
          '<table style="width:100%;border-collapse:collapse;">' +
            '<tr>' +
              '<td style="vertical-align:top;width:50%;">' +
                '<div style="font-size:28px;font-weight:800;color:#004d40;margin:0;">ConnecTradie</div>' +
                '<div style="font-size:11px;color:#6B7280;margin-top:4px;">ABN: 00 000 000 000</div>' +
              '</td>' +
              '<td style="vertical-align:top;text-align:right;width:50%;">' +
                '<div style="font-size:22px;font-weight:700;color:#1F2937;">TAX INVOICE</div>' +
                '<div style="font-size:12px;color:#6B7280;margin-top:8px;">Invoice #: <strong style="color:#1F2937;">' + invoiceNumber + '</strong></div>' +
                '<div style="font-size:12px;color:#6B7280;margin-top:2px;">Date: ' + invoiceDate + '</div>' +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +

      // Bill To / Platform
      '<table style="width:100%;border-collapse:collapse;margin:28px 0;">' +
        '<tr>' +
          '<td style="vertical-align:top;width:50%;">' +
            '<div style="font-size:10px;font-weight:700;color:#004d40;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">' + (isClientView ? 'Bill To' : 'From') + '</div>' +
            '<div style="font-size:14px;font-weight:600;color:#1F2937;">' + userName + '</div>' +
            (userEmail ? '<div style="font-size:12px;color:#6B7280;margin-top:3px;">' + userEmail + '</div>' : '') +
          '</td>' +
          '<td style="vertical-align:top;text-align:right;width:50%;">' +
            '<div style="font-size:10px;font-weight:700;color:#004d40;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">Platform</div>' +
            '<div style="font-size:14px;font-weight:600;color:#1F2937;">ConnecTradie Pty Ltd</div>' +
            '<div style="font-size:12px;color:#6B7280;margin-top:3px;">support@connectradie.com</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +

      // Items Table
      '<table style="width:100%;border-collapse:collapse;">' +
        '<thead>' +
          '<tr style="background-color:#004d40;">' +
            '<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Service</th>' +
            '<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Description</th>' +
            '<th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Status</th>' +
            '<th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Date</th>' +
            '<th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Amount (AUD)</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + jobRows + '</tbody>' +
      '</table>' +

      // Totals
      '<table style="width:100%;border-collapse:collapse;margin-top:16px;">' +
        '<tr>' +
          '<td style="width:55%;"></td>' +
          '<td style="width:45%;">' +
            '<table style="width:100%;border-collapse:collapse;background:#F9FAFB;border:1px solid #E5E7EB;">' +
              '<tr><td style="padding:8px 16px;font-size:12px;color:#6B7280;">Subtotal (ex. GST)</td>' +
                  '<td style="padding:8px 16px;font-size:12px;color:#374151;text-align:right;font-weight:500;">$' + exGst.toFixed(2) + '</td></tr>' +
              '<tr><td style="padding:8px 16px;font-size:12px;color:#6B7280;border-bottom:2px solid #004d40;">GST (10%)</td>' +
                  '<td style="padding:8px 16px;font-size:12px;color:#374151;text-align:right;font-weight:500;border-bottom:2px solid #004d40;">$' + gst.toFixed(2) + '</td></tr>' +
              '<tr><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#004d40;">Total (inc. GST)</td>' +
                  '<td style="padding:12px 16px;font-size:15px;font-weight:700;color:#004d40;text-align:right;">$' + subtotal.toFixed(2) + '</td></tr>' +
            '</table>' +
          '</td>' +
        '</tr>' +
      '</table>' +

      // Payment Info
      '<table style="width:100%;border-collapse:collapse;margin-top:28px;">' +
        '<tr><td style="padding:16px 20px;background-color:#ECFDF6;border:1px solid #A7F3D5;">' +
          '<div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">Payment Information</div>' +
          '<div style="font-size:12px;color:#374151;line-height:1.6;">All payments processed securely via Stripe through the ConnecTradie platform. Funds held in escrow until job completion and client approval.</div>' +
        '</td></tr>' +
      '</table>' +

      // Footer
      '<table style="width:100%;border-collapse:collapse;margin-top:28px;">' +
        '<tr><td style="padding:16px 0 0;border-top:1px solid #E5E7EB;text-align:center;">' +
          '<div style="font-size:10px;color:#9CA3AF;line-height:1.6;">This is a computer-generated tax invoice. All amounts are in Australian Dollars (AUD) and include GST where applicable.</div>' +
          '<div style="font-size:10px;color:#9CA3AF;margin-top:4px;">Generated via ConnecTradie — ' + invoiceDate + '</div>' +
        '</td></tr>' +
      '</table>' +

    '</div>';

    document.body.appendChild(container);

    try {
      await html2pdf()
        .set({
          margin: [8, 0, 8, 0],
          filename: 'ConnecTradie-Invoice-' + invoiceNumber + '.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container.firstElementChild)
        .save();
    } finally {
      document.body.removeChild(container);
    }
  };

  const { urgentLeads, scheduledGroups, otherLeads } = useMemo(() => {
    if (!isTradie) return { urgentLeads: [], scheduledGroups: [], otherLeads: leads };

    const now = new Date();
    const urgent: LeadWithClient[] = [];
    const scheduled: LeadWithClient[] = [];
    const other: LeadWithClient[] = [];

    for (const lead of leads) {
      const isFlashActive = lead.is_flash_boost && lead.flash_expiry && new Date(lead.flash_expiry) > now;
      if (lead.priority === 'high' || isFlashActive) {
        urgent.push(lead);
      } else if (lead.scheduled_date) {
        scheduled.push(lead);
      } else {
        other.push(lead);
      }
    }

    urgent.sort((a, b) => {
      const aFlash = a.is_flash_boost && a.flash_expiry && new Date(a.flash_expiry) > now;
      const bFlash = b.is_flash_boost && b.flash_expiry && new Date(b.flash_expiry) > now;
      if (aFlash && !bFlash) return -1;
      if (!aFlash && bFlash) return 1;
      return 0;
    });

    scheduled.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));

    const groups: { label: string; date: string; leads: LeadWithClient[] }[] = [];
    for (const lead of scheduled) {
      const dateKey = lead.scheduled_date!;
      const existing = groups.find((g) => g.date === dateKey);
      if (existing) {
        existing.leads.push(lead);
      } else {
        groups.push({ label: getDateGroupLabel(dateKey), date: dateKey, leads: [lead] });
      }
    }

    return { urgentLeads: urgent, scheduledGroups: groups, otherLeads: other };
  }, [leads, isTradie]);

  const [offlineQueued] = useState<string | null>(null);

  const handleQuoteClick = (lead: Job) => {
    if (isTradie && isLicenseExpired) {
      setGateReason('expired');
      setShowVerificationGate(true);
      return;
    }

    if (isTradie && !isVerified) {
      setGateReason('unverified');
      setShowVerificationGate(true);
      return;
    }

    setQuoteModalJob(lead);
  };

  const handleWithdrawQuote = async () => {
    if (!withdrawQuoteTarget?.my_quote || !user) return;
    setWithdrawing(true);
    try {
      const { error: deleteError } = await supabase
        .from('quotes')
        .delete()
        .eq('id', withdrawQuoteTarget.my_quote.id)
        .eq('tradie_id', user.id);

      if (deleteError) throw deleteError;

      // Notify client
      if (withdrawQuoteTarget.client_id) {
        const jobTitle = (withdrawQuoteTarget.title || extractCategory(withdrawQuoteTarget.description) || 'your job').replace(/_/g, ' ');
        sendNotification({
          type: NOTIFICATION_TYPES.QUOTE_RECEIVED,
          userId: withdrawQuoteTarget.client_id,
          title: 'Quote Withdrawn',
          message: `A tradie has withdrawn their quote for ${jobTitle}.`,
          jobId: withdrawQuoteTarget.id,
          link: `/leads?job=${withdrawQuoteTarget.id}`,
        }).catch(() => {});
      }

      // Auto-dismiss so the lead doesn't reappear on dashboard or Leads page
      handleDismissLead(withdrawQuoteTarget.id);

      setWithdrawQuoteTarget(null);
      setViewLeadDetail(null);
      fetchLeads();
    } catch {
      setWithdrawQuoteTarget(null);
    } finally {
      setWithdrawing(false);
    }
  };

  const handleDismissLead = (leadId: string) => {
    setDismissedJobIds(prev => {
      const next = new Set(prev);
      next.add(leadId);
      localStorage.setItem('dismissed_leads', JSON.stringify([...next]));
      return next;
    });
    setLeads(prev => prev.filter(l => l.id !== leadId));
  };

  const handleFlashExpired = async (leadId: string) => {
    await supabase
      .from('jobs')
      .update({ is_flash_boost: false, flash_expiry: null })
      .eq('id', leadId);

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, is_flash_boost: false, flash_expiry: null } : l
      )
    );
  };

  const handleReleasePayment = async (jobId: string) => {
    setReleasingJobId(jobId);
    try {
      // Find the payment for this job
      const { data: payment } = await supabase
        .from('payments')
        .select('id, metadata')
        .eq('job_id', jobId)
        .eq('payment_type', 'job_funding')
        .eq('status', 'completed')
        .maybeSingle();

      if (!payment) {
        // No completed payment found — may already be released
        setReleasedJobIds(prev => new Set(prev).add(jobId));
      } else {
        const meta = payment.metadata as Record<string, unknown> | null;
        if (meta?.transfer_id) {
          // Already released — skip calling release-escrow again
          setReleasedJobIds(prev => new Set(prev).add(jobId));
        } else if (meta?.pending_increase && !paidIncreaseJobIds.has(jobId)) {
          // Price increase pending — redirect to pay the difference
          const { url } = await payPriceIncrease(payment.id, jobId);
          window.location.href = url;
          return;
        } else {
          await releaseEscrow(payment.id);
          setReleasedJobIds(prev => new Set(prev).add(jobId));
        }
      }

      navigate(`/review/${jobId}`);
    } catch (err) {
      console.error('Failed to release payment:', err);
      const errCode = (err as Error & { code?: string })?.code;
      const errMsg = err instanceof Error ? err.message : '';
      if (errCode === 'pending_increase_not_paid' || (errMsg.includes('pending') && errMsg.includes('increase'))) {
        // If the client just returned from paying the increase, the webhook may not
        // have processed yet. Do NOT redirect to pay again — that risks double-charging.
        if (paidIncreaseJobIds.has(jobId)) {
          alert('Your additional payment is still being processed. Please wait a moment and try releasing again.');
          return;
        }
        // Price increase pending — find the payment and redirect
        try {
          const { data: payment } = await supabase
            .from('payments')
            .select('id')
            .eq('job_id', jobId)
            .eq('payment_type', 'job_funding')
            .eq('status', 'completed')
            .maybeSingle();
          if (payment) {
            const { url } = await payPriceIncrease(payment.id, jobId);
            window.location.href = url;
            return;
          }
        } catch {
          // Fall through to default navigation
        }
      }
      // Still navigate to review if release fails (payment might already be released)
      navigate(`/review/${jobId}`);
    } finally {
      setReleasingJobId(null);
    }
  };

  const handleAcceptQuote = async (quoteId: string, jobId: string, agreedPrice?: number) => {
    try {
      const { url } = await acceptAndPay(quoteId, jobId, agreedPrice);
      window.location.href = url;
    } catch (err) {
      console.error('Accept & Pay failed:', err);
      setPayingJobId(null);
      setQuoteAcceptedBanner('error');
      setTimeout(() => setQuoteAcceptedBanner(false), 8000);
    }
  };

  const handleDeclineQuote = async (quoteId: string) => {
    // Fetch quote details before declining (for notification)
    const { data: quote } = await supabase
      .from('quotes')
      .select('tradie_id, job_id')
      .eq('id', quoteId)
      .maybeSingle();

    await supabase
      .from('quotes')
      .update({ status: 'declined' })
      .eq('id', quoteId);

    // Notify the tradie
    if (quote?.tradie_id) {
      try {
        await supabase.from('notifications').insert({
          user_id: quote.tradie_id,
          type: 'JOB_DECLINED',
          title: 'Quote Not Accepted',
          message: `${profile?.full_name || 'The client'} chose a different tradie for this job.`,
          job_id: quote.job_id,
          metadata: {},
          read: false,
        });
      } catch {
        // Non-critical
      }
    }
  };

  const handleMessageTradie = (tradieId: string, jobId: string) => {
    navigate(`/messages?tradie=${tradieId}&job=${jobId}`);
  };

  const BOOST_PRICE = 4.99;
  const BOOST_DURATION_HOURS = 24;

  const handleBoostJob = async (jobId: string) => {
    const expiry = new Date(Date.now() + BOOST_DURATION_HOURS * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ is_flash_boost: true, flash_expiry: expiry, priority: 'high' })
      .eq('id', jobId);

    if (!error) {
      setLeads((prev) =>
        prev.map((l) =>
          l.id === jobId ? { ...l, is_flash_boost: true, flash_expiry: expiry, priority: 'high' as const } : l
        )
      );
    }
  };

  const handleDeleteJob = async () => {
    if (!deleteJobTarget || !user) return;
    const jobId = deleteJobTarget.id;

    try {
      // Child tables use ON DELETE CASCADE (migration 20260321100000),
      // so just delete the job — DB handles cleanup automatically.
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      if (error) throw error;

      setLeads((prev) => prev.filter((l) => l.id !== jobId));
    } catch (err) {
      console.error('Failed to cancel job:', err);
    } finally {
      setDeleteJobTarget(null);
    }
  };

  const openEditJob = (lead: LeadWithClient) => {
    const desc = lead.description.replace(/^\[[^\]]+\]\s*/, '');
    setEditTitle(lead.title || '');
    setEditDesc(desc);
    setEditLocation(lead.location_address || '');
    setEditBudget(lead.budget_amount ? String(lead.budget_amount) : '');
    setEditPhotos(
      (lead.images_url || []).map((url) => ({ url, isExisting: true }))
    );
    setEditJob(lead);
  };

  const handleEditPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      if (editPhotos.length >= 5) break;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setEditPhotos((prev) => {
          if (prev.length >= 5) return prev;
          return [...prev, { url: ev.target?.result as string, isExisting: false, file }];
        });
      };
      reader.readAsDataURL(file);
    }
    if (editFileRef.current) editFileRef.current.value = '';
  };

  const removeEditPhoto = (index: number) => {
    setEditPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    if (!editJob || !user) return;
    setEditSaving(true);
    try {
      // Upload new photos
      const imageUrls: string[] = [];
      for (const photo of editPhotos) {
        if (photo.isExisting) {
          imageUrls.push(photo.url);
        } else if (photo.file) {
          const ext = photo.file.name.split('.').pop() || 'jpg';
          const filePath = `${user.id}/${editJob.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('job-attachments')
            .upload(filePath, photo.file, { cacheControl: '3600', upsert: false });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('job-attachments')
              .getPublicUrl(filePath);
            if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
          }
        }
      }

      const category = editJob.description.match(/^\[([^\]]+)\]/)?.[1] || '';
      const newDescription = category ? `[${category}] ${editDesc.trim()}` : editDesc.trim();
      const updateData: Record<string, unknown> = {
        title: editTitle.trim() || null,
        description: newDescription,
        location_address: editLocation.trim(),
        images_url: imageUrls.length > 0 ? imageUrls : null,
      };
      if (editBudget) {
        updateData.budget_amount = parseFloat(editBudget);
        updateData.budget_type = 'fixed_budget';
      } else {
        updateData.budget_amount = null;
        updateData.budget_type = 'request_quote';
      }
      const { error } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', editJob.id)
        .eq('client_id', user.id);
      if (!error) {
        setEditJob(null);
        fetchLeads();
      }
    } catch (err) {
      console.error('Failed to save job edit:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const extractCategory = (description: string) => {
    const match = description.match(/^\[([^\]]+)\]/);
    if (!match) return null;
    // Format raw category: cleaning_weekly → Cleaning Weekly, plumber → Plumber
    return match[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const cleanDescription = (description: string) => {
    return description.replace(/^\[[^\]]+\]\s*/, '');
  };

  const getClientStatusLabel = (lead: Job) => {
    if (lead.status === 'completed') {
      const isReleased = releasedJobIds.has(lead.id);
      const isReviewed = reviewedJobIds.has(lead.id);
      if (isReleased && isReviewed) return 'Completed';
      if (isReleased) return 'Awaiting Review';
      return 'Awaiting Release';
    }
    if (lead.status === 'in_progress') return 'In Progress';
    if (lead.status === 'funded') return 'Paid — Tradie Assigned';
    if (lead.status === 'accepted') return 'Accepted — Awaiting Payment';
    if (lead.quoting_status === 'awarded') return 'Awarded';
    if (lead.quote_count > 0) return `${lead.quote_count} Quote${lead.quote_count !== 1 ? 's' : ''}`;
    if (lead.tradie_id && lead.status !== 'pending') return 'Picked Up';
    if (lead.is_flash_boost) return 'Boosted';
    if (lead.priority === 'high') return 'High Priority';
    if (lead.scheduled_date) return 'Scheduled';
    return 'Waiting';
  };

  const getClientStatusColor = (lead: Job) => {
    if (lead.status === 'completed') {
      const isReleased = releasedJobIds.has(lead.id);
      const isReviewed = reviewedJobIds.has(lead.id);
      if (isReleased && isReviewed) return 'bg-green-100 text-green-800 border-green-300';
      return 'bg-amber-100 text-amber-700 border-amber-200';
    }
    if (lead.status === 'in_progress') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (lead.status === 'funded') return 'bg-green-100 text-green-700 border-green-200';
    if (lead.status === 'accepted') return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    if (lead.quoting_status === 'awarded') return 'bg-green-100 text-green-700 border-green-200';
    if (lead.quote_count > 0) return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    if (lead.tradie_id && lead.status !== 'pending') return 'bg-green-100 text-green-700 border-green-200';
    if (lead.is_flash_boost) return 'bg-warm-100 text-warm-700 border-warm-200';
    if (lead.priority === 'high') return 'bg-orange-100 text-orange-700 border-orange-200';
    if (lead.scheduled_date) return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  const tradieFilters: { key: LeadFilter; label: string }[] = [
    { key: 'all', label: 'All Leads' },
    { key: 'urgent', label: 'Urgent' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'boosted', label: 'Flash Deals' },
    { key: 'quoted', label: 'My Quotes' },
  ];

  const clientFilters: { key: LeadFilter; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'services', label: 'Ongoing Services' },
    { key: 'completed', label: 'Completed' },
    { key: 'archived', label: 'Archived' },
  ];

  const filters = isTradie ? tradieFilters : clientFilters;

  const renderLeadCard = (lead: LeadWithClient) => {
    const now = new Date();
    const isFlashActive =
      lead.is_flash_boost &&
      lead.flash_expiry &&
      new Date(lead.flash_expiry) > now;
    const category = extractCategory(lead.description);
    const desc = cleanDescription(lead.description);
    const isUrgent = lead.priority === 'high';
    const SlotIcon = lead.preferred_time_slot ? SLOT_ICONS[lead.preferred_time_slot] : null;
    const hasQuoted = isTradie && lead.my_quote;
    const slotsRemaining = lead.max_quotes - lead.quote_count;
    const isClientViewing = !isTradie;
    const showQuoteComparison = isClientViewing && expandedJobId === lead.id && lead.quote_count > 0;
    const isClientEditable = isClientViewing && lead.status === 'pending' && !lead.tradie_id && !lead.deleted_at;

    return (
      <div key={lead.id} id={`job-${lead.id}`}>
        <div
          role="button"
          tabIndex={0}
          onClick={isClientEditable ? () => openEditJob(lead) : isTradie ? () => setViewLeadDetail(lead) : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isClientEditable) openEditJob(lead); else if (isTradie) setViewLeadDetail(lead); } }}
          className={`rounded-2xl overflow-hidden transition-all ${
            isClientEditable || isTradie ? 'cursor-pointer ' : ''
          }${
            isFlashActive && isTradie && lead.status === 'pending'
              ? 'border border-warm-200 bg-white shadow-md hover:shadow-xl ring-1 ring-warm-100'
              : isUrgent && isTradie
              ? 'border border-red-200 bg-white shadow-md hover:shadow-xl'
              : hasQuoted
              ? 'border border-secondary-200 bg-white shadow-sm hover:shadow-md'
              : 'border border-gray-200 bg-white shadow-sm hover:shadow-lg hover:border-gray-300'
          }`}
        >
          {/* Left accent bar + card content */}
          <div className="flex">
            {/* Accent bar */}
            <div className={`w-1.5 flex-shrink-0 ${
              isFlashActive && isTradie && lead.status === 'pending' ? 'bg-warm-500'
              : isUrgent && isTradie ? 'bg-red-400'
              : hasQuoted ? 'bg-secondary-400'
              : 'bg-primary-400'
            }`} />

            <div className="flex-1 min-w-0">
              {/* Card body */}
              <div className="px-5 py-4">
                {/* Header row: title + status + delete */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 leading-snug capitalize">
                      {(() => {
                        const raw = lead.title || category || 'Untitled Job';
                        return raw.replace(/_/g, ' ');
                      })()}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isTradie && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getClientStatusColor(lead)}`}>
                        {getClientStatusLabel(lead)}
                      </span>
                    )}
                    {isFlashActive && isTradie && lead.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-warm-500 text-white rounded-full text-[11px] font-bold shadow-sm animate-pulse">
                        <Zap className="w-3 h-3" />
                        Flash
                      </span>
                    )}
                    {!isFlashActive && isUrgent && isTradie && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 rounded-full text-[11px] font-semibold border border-red-200">
                        <Zap className="w-3 h-3" />
                        Urgent
                      </span>
                    )}
                    {isTradie && !!(lead.title && /ongoing|recurring/i.test(lead.title)) && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-semibold border border-purple-200">
                        <RefreshCw className="w-3 h-3" />
                        Ongoing
                      </span>
                    )}
                    {isClientEditable && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteJobTarget(lead); }}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Cancel job"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-500 mb-3 line-clamp-2 leading-relaxed">{desc}</p>

                {/* Details row */}
                <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-gray-500">
                  {category && (
                    <span className="inline-flex items-center gap-1 text-gray-600 font-medium">
                      <Briefcase className="w-3 h-3 text-gray-400" />
                      {category}
                    </span>
                  )}
                  {lead.location_address && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-gray-400" />
                      {isTradie ? extractSuburb(lead.location_address) || 'Nearby' : (() => {
                        const parts = lead.location_address!.split(',').map(s => s.trim());
                        return parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0];
                      })()}
                    </span>
                  )}
                  {lead.scheduled_date && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3 h-3 text-secondary-500" />
                      <span className="text-secondary-700 font-medium">
                        {new Date(lead.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                  )}
                  {lead.preferred_time_slot && SlotIcon && (
                    <span className="inline-flex items-center gap-1">
                      <SlotIcon className="w-3 h-3 text-gray-400" />
                      {SLOT_LABELS[lead.preferred_time_slot]}
                    </span>
                  )}
                  {lead.budget_amount ? (
                    <span className="inline-flex items-center font-bold text-emerald-700">
                      ${lead.budget_amount.toLocaleString()}
                    </span>
                  ) : lead.budget_type === 'request_quote' ? (
                    <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                      <FileText className="w-3 h-3" />
                      Quote Requested
                    </span>
                  ) : null}
                  {isTradie && slotsRemaining <= 2 && slotsRemaining > 0 && !hasQuoted && (
                    <span className="inline-flex items-center gap-1 text-warm-700 font-semibold">
                      <Users className="w-3 h-3" />
                      {slotsRemaining} spot{slotsRemaining !== 1 ? 's' : ''} left
                    </span>
                  )}
                  {isTradie && slotsRemaining > 2 && lead.quote_count > 0 && !hasQuoted && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3 text-gray-400" />
                      {lead.quote_count}/{lead.max_quotes} quotes
                    </span>
                  )}
                  {hasQuoted && (
                    <span className="inline-flex items-center gap-1 text-secondary-700 font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      Quoted
                    </span>
                  )}
                </div>
              </div>

              {/* Footer: actions + meta */}
              {isTradie && !hasQuoted && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-gray-400">
                    Posted by {((lead as LeadWithClient).client_name || 'Client').split(' ')[0]} · {formatDate(lead.created_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDismissLead(lead.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Pass
                    </button>
                    <button
                      onClick={() => handleQuoteClick(lead)}
                      className="inline-flex items-center gap-1.5 px-5 py-1.5 rounded-lg text-xs font-semibold bg-warm-500 text-white hover:bg-warm-600 shadow-sm transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Submit Quote
                    </button>
                  </div>
                </div>
              )}
              {isTradie && hasQuoted && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">
                    Posted by {((lead as LeadWithClient).client_name || 'Client').split(' ')[0]} · {formatDate(lead.created_at)}
                  </span>
                </div>
              )}

              {/* Flash/Boost banners */}
              {isFlashActive && isTradie && lead.status === 'pending' && (
                <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg">
                  <Zap className="w-3.5 h-3.5 text-warm-600 flex-shrink-0" />
                  <span className="text-xs font-medium text-warm-700">
                    Flash Deal — Quick Quote Priority
                  </span>
                </div>
              )}

              {!isTradie && isFlashActive && lead.status === 'pending' && (
                <div className="mx-5 mb-3 flex items-center justify-between px-3 py-2 bg-gradient-to-r from-warm-50 to-orange-50 border border-warm-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-warm-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-warm-700">
                      Boosted — finding tradies faster
                    </span>
                  </div>
                  <div className="text-xs text-warm-600">
                    <FlashCountdown
                      expiry={lead.flash_expiry!}
                      onExpired={() => handleFlashExpired(lead.id)}
                    />
                    {' '}remaining
                  </div>
                </div>
              )}

          {isTradie && hasQuoted && (() => {
            const qs = lead.my_quote!.status;
            const statusConfig = qs === 'accepted'
              ? { bg: 'bg-green-50 border-green-200', icon: <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />, label: 'Quote accepted — the client chose you!', textColor: 'text-green-800' }
              : qs === 'declined'
              ? { bg: 'bg-red-50 border-red-200', icon: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />, label: 'Quote declined by client', textColor: 'text-red-700' }
              : qs === 'expired'
              ? { bg: 'bg-gray-50 border-gray-200', icon: <Clock className="w-5 h-5 text-gray-400 flex-shrink-0" />, label: 'Quote expired', textColor: 'text-gray-600' }
              : qs === 'withdrawn'
              ? { bg: 'bg-gray-50 border-gray-200', icon: <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />, label: 'Quote withdrawn', textColor: 'text-gray-600' }
              : { bg: 'bg-secondary-50 border-secondary-200', icon: <Clock className="w-5 h-5 text-secondary-600 flex-shrink-0" />, label: 'Awaiting client decision', textColor: 'text-secondary-600' };
            return (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
                <div className={`flex items-center gap-3 px-4 py-3 ${statusConfig.bg} border rounded-xl`}>
                  {statusConfig.icon}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-secondary-800">
                      You quoted {lead.my_quote!.firm_price
                        ? `$${lead.my_quote!.firm_price.toLocaleString()}`
                        : `$${lead.my_quote!.price_min.toLocaleString()} - $${lead.my_quote!.price_max.toLocaleString()}`
                      }
                    </p>
                    <p className={`text-xs ${statusConfig.textColor}`}>
                      {statusConfig.label}
                    </p>
                  </div>
                  {qs === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setWithdrawQuoteTarget(lead); }}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {!isTradie && !lead.tradie_id && lead.status === 'pending' && lead.quote_count === 0 && (
            <div className="flex items-center gap-2 px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Waiting for tradies to submit quotes...
            </div>
          )}

          {!isTradie && lead.status === 'pending' && lead.quote_count > 0 && (
            <div className="border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setExpandedJobId(expandedJobId === lead.id ? null : lead.id)}
                className={`w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${
                  expandedJobId === lead.id
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <Eye className="w-4 h-4" />
                {expandedJobId === lead.id ? 'Hide Quotes' : `View ${lead.quote_count} Quote${lead.quote_count !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {!isTradie && lead.status === 'completed' && (() => {
            const isReleased = releasedJobIds.has(lead.id);
            const isReviewed = reviewedJobIds.has(lead.id);
            const isFullyDone = isReleased && isReviewed;
            const completedAt = (lead as Record<string, unknown>).completed_at as string | null;
            return (
              <>
                {!isReleased && completedAt && (
                  <AutoReleaseCountdown completedAt={completedAt} />
                )}
                <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  {isFullyDone ? (
                    <button
                      onClick={() => setViewCompletedJob(lead)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-semibold rounded-lg hover:bg-primary-100 border border-primary-200 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                  ) : !isReleased ? (
                    <button
                      onClick={() => handleReleasePayment(lead.id)}
                      disabled={releasingJobId === lead.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white text-xs font-semibold rounded-lg hover:bg-warm-700 transition-colors disabled:opacity-60"
                    >
                      {releasingJobId === lead.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      Release & Review
                    </button>
                  ) : (
                    <Link
                      to={`/review/${lead.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-500 text-white text-xs font-semibold rounded-lg hover:bg-warm-600 transition-colors"
                    >
                      <Star className="w-3.5 h-3.5" />
                      Leave a Review
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!lead.archived_at && filter !== 'history' && (
                    <button
                      onClick={() => handleArchiveJob(lead.id)}
                      className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg transition-colors"
                      title="Archive"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              </>
            );
          })()}

          {!isTradie && lead.status === 'funded' && lead.tradie_id && !pendingIncreases[lead.id] && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Payment received — waiting for tradie to start
            </div>
          )}

          {!isTradie && lead.status === 'in_progress' && lead.tradie_id && !pendingIncreases[lead.id] && (
            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 text-sm text-blue-600">
              <Loader2 className="w-4 h-4" />
              Work in progress
            </div>
          )}

          {!isTradie && pendingIncreases[lead.id] && !paidIncreaseJobIds.has(lead.id) && ['funded', 'in_progress'].includes(lead.status) && (
            <div className="px-5 py-3 border-t border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Price adjusted after site visit</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-amber-700 mb-3 ml-6">
                <span>Original: <span className="font-semibold">${pendingIncreases[lead.id].originalAmount.toFixed(2)}</span></span>
                <span className="text-amber-400">→</span>
                <span>Final: <span className="font-semibold">${pendingIncreases[lead.id].finalAmount.toFixed(2)}</span></span>
                <span className="text-amber-400">|</span>
                <span>Additional: <span className="font-semibold text-amber-900">${pendingIncreases[lead.id].amount.toFixed(2)}</span></span>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const inc = pendingIncreases[lead.id];
                    setPayingJobId(lead.id);
                    payPriceIncrease(inc.paymentId, lead.id)
                      .then(({ url }) => { window.location.href = url; })
                      .catch((err) => {
                        console.error('Pay price increase failed:', err);
                        setPayingJobId(null);
                      });
                  }}
                  disabled={payingJobId === lead.id}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60"
                >
                  {payingJobId === lead.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CreditCard className="w-3.5 h-3.5" />
                  )}
                  Pay Difference
                </button>
              </div>
            </div>
          )}

          {!isTradie && lead.tradie_id && lead.quoting_status === 'awarded' && lead.status !== 'completed' && lead.status !== 'in_progress' && lead.status !== 'funded' && (
            <div className="px-5 py-3 border-t border-gray-100">
              {acceptedQuotes[lead.id] ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Quoted <span className="font-semibold">{(() => {
                      const q = acceptedQuotes[lead.id];
                      if (q.firm_price) return `$${q.firm_price.toLocaleString()}`;
                      return `$${q.price_min.toLocaleString()} – $${q.price_max.toLocaleString()}`;
                    })()}</span></span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const q = acceptedQuotes[lead.id];
                      // Range quote → ask client to confirm agreed price first
                      if (!q.firm_price && q.price_min && q.price_max) {
                        setPriceConfirm({
                          quoteId: q.id,
                          jobId: lead.id,
                          min: q.price_min,
                          max: q.price_max,
                          agreedPrice: '',
                        });
                      } else {
                        setPayingJobId(lead.id);
                        handleAcceptQuote(q.id, lead.id);
                      }
                    }}
                    disabled={payingJobId === lead.id}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
                  >
                    {payingJobId === lead.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    Pay & Secure
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Quote accepted — tradie assigned
                </div>
              )}
            </div>
          )}

          {/* Archive button for cancelled/declined jobs */}
          {!isTradie && !lead.archived_at && filter !== 'history' && (lead.status === 'cancelled' || lead.status === 'declined') && (
            <div className="flex justify-end px-5 py-3 border-t border-gray-100">
              <button
                onClick={(e) => { e.stopPropagation(); handleArchiveJob(lead.id); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
            </div>
          )}
            </div>{/* close flex-1 */}
          </div>{/* close flex */}
        </div>

        {showQuoteComparison && (
          <div className="relative mt-0 ml-6 pl-6 border-l-2 border-gray-200">
            {/* Connector from job card to quotes */}
            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-2 border-gray-300" />
            <div className="pt-2">
              <QuoteComparisonView
                job={lead}
                onAcceptQuote={handleAcceptQuote}
                onDeclineQuote={handleDeclineQuote}
                onMessageTradie={handleMessageTradie}
                onConfirmPrice={(quoteId, jobId, min, max) =>
                  setPriceConfirm({ quoteId, jobId, min, max, agreedPrice: '' })
                }
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTradieGroupedView = () => {
    const showGrouped = filter === 'all' || filter === 'scheduled';
    const showUrgent = filter === 'all' || filter === 'urgent';
    const showQuoted = filter === 'quoted';

    if (showQuoted) {
      const quotedLeads = leads.filter((l) => l.my_quote);
      if (quotedLeads.length === 0) {
        return (
          <EmptyState
            icon={FileText}
            title="No Quotes Submitted"
            description="You haven't submitted any quotes yet. Browse available leads and start quoting."
          />
        );
      }
      return (
        <div className="space-y-3">
          {quotedLeads.map(renderLeadCard)}
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {showUrgent && urgentLeads.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-warm-400 to-red-400 flex items-center justify-center">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Urgent / Now</h3>
              <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                {urgentLeads.length}
              </span>
            </div>
            <div className="space-y-3">
              {urgentLeads.map(renderLeadCard)}
            </div>
          </div>
        )}

        {showGrouped && scheduledGroups.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-400 flex items-center justify-center">
                <CalendarDays className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Ongoing Leads</h3>
              <span className="ml-auto px-2 py-0.5 bg-secondary-100 text-secondary-700 rounded-full text-xs font-semibold">
                {scheduledGroups.reduce((acc, g) => acc + g.leads.length, 0)}
              </span>
            </div>
            <div className="space-y-5">
              {scheduledGroups.map((group) => (
                <div key={group.date}>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-secondary-600" />
                    <span className="text-sm font-semibold text-secondary-700">{group.label}</span>
                    <div className="flex-1 h-px bg-secondary-100" />
                  </div>
                  <div className="space-y-3 ml-6">
                    {group.leads.map(renderLeadCard)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showGrouped && otherLeads.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-gray-600" />
              </div>
              <h3 className="font-bold text-gray-900">Other Leads</h3>
              <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                {otherLeads.length}
              </span>
            </div>
            <div className="space-y-3">
              {otherLeads.map(renderLeadCard)}
            </div>
          </div>
        )}

        {urgentLeads.length === 0 && scheduledGroups.length === 0 && otherLeads.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No leads right now</h3>
            <p className="text-gray-600 text-sm mb-5 max-w-sm mx-auto">
              New jobs are posted every day. While you wait, here are some things you can do to get more leads:
            </p>
            <div className="grid sm:grid-cols-3 gap-3 max-w-lg mx-auto mb-6">
              <Link to="/settings" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 hover:bg-primary-50 border border-gray-200 hover:border-primary-200 transition-all text-center">
                <User className="w-5 h-5 text-primary-600" />
                <span className="text-xs font-medium text-gray-700">Complete profile</span>
              </Link>
              <Link to="/dashboard" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 hover:bg-primary-50 border border-gray-200 hover:border-primary-200 transition-all text-center">
                <Calendar className="w-5 h-5 text-primary-600" />
                <span className="text-xs font-medium text-gray-700">Update availability</span>
              </Link>
              <Link to="/settings" state={{ tab: 'verification' }} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-gray-50 hover:bg-primary-50 border border-gray-200 hover:border-primary-200 transition-all text-center">
                <ShieldAlert className="w-5 h-5 text-primary-600" />
                <span className="text-xs font-medium text-gray-700">Get verified</span>
              </Link>
            </div>
            <p className="text-xs text-gray-400">Verified tradies with complete profiles appear higher in search results. New leads typically arrive daily.</p>
          </div>
        )}
      </div>
    );
  };

  const content = (
    <>
      <div className={`${embedded ? '' : 'max-w-5xl'} mx-auto`}>
        {quoteAcceptedBanner === 'success' && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-bold text-green-800">Payment successful!</p>
            </div>
            <p className="text-xs text-green-700 ml-8">Your tradie has been hired and payment is held securely in escrow. The tradie will be notified and can start work.</p>
          </div>
        )}
        {quoteAcceptedBanner === 'price_increase_success' && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-bold text-green-800">Additional payment successful!</p>
            </div>
            <p className="text-xs text-green-700 ml-8">The adjusted amount is now held securely in escrow. You can release payment once the work is complete.</p>
          </div>
        )}
        {quoteAcceptedBanner === 'cancelled' && (
          <div className="mb-4 bg-accent-50 border border-accent-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <AlertCircle className="w-5 h-5 text-accent-600 flex-shrink-0" />
              <p className="text-sm font-bold text-accent-800">Payment not completed</p>
            </div>
            <p className="text-xs text-accent-700 ml-8">The quote has been accepted but payment was not completed. You can complete payment from the Payments page.</p>
          </div>
        )}
        {quoteAcceptedBanner === 'error' && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-bold text-red-800">Something went wrong</p>
            </div>
            <p className="text-xs text-red-700 ml-8">Failed to process the quote acceptance. Please try again.</p>
          </div>
        )}
        {offlineQueued && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-warm-50 border border-warm-200 rounded-xl animate-pulse">
            <WifiOff className="w-5 h-5 text-warm-600 flex-shrink-0" />
            <p className="text-sm font-medium text-warm-800">
              You're offline. Your action has been queued and will sync automatically when you're back online.
            </p>
          </div>
        )}
        {!embedded && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isTradie ? 'Available Work' : 'My Jobs'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {isTradie
                  ? 'These are jobs posted by clients near you. Quote on the ones you want.'
                  : 'Track your quote requests and compare incoming quotes'}
              </p>
            </div>
            {!isTradie && (
              <div className="flex items-center gap-2">
                {(() => {
                  const unboosted = leads.filter(l => l.status === 'pending' && !l.is_flash_boost && !l.tradie_id);
                  if (unboosted.length === 0) return null;
                  return (
                    <button
                      onClick={() => {
                        if (unboosted.length === 1) {
                          handleBoostJob(unboosted[0].id);
                        } else {
                          setFilter('pending');
                        }
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-warm-300 text-warm-700 text-sm font-semibold rounded-lg hover:bg-warm-50 transition-colors"
                    >
                      <Zap className="w-4 h-4" />
                      Boost ${BOOST_PRICE.toFixed(2)}
                    </button>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {isTradie && isLicenseExpired && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-lg">License Expired</h3>
                <p className="text-red-800 mt-1">
                  Your trade license has expired. You cannot submit quotes until your license is renewed.
                </p>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Upload Renewed License
                </Link>
              </div>
            </div>
          </div>
        )}

        {isTradie && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <p className="text-xs text-gray-500">
              <span className="font-semibold">Blind quoting:</span> Other tradies cannot see your price. Compete on quality, not just cost.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`pb-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                filter === f.key
                  ? 'border-warm-500 text-warm-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div>

          {filter === 'services' ? (
            <ClientServicesTab />
          ) : fetchError ? (
            <div className="bg-white rounded-2xl border border-red-200 p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
              <p className="text-gray-600 mb-4">{fetchError}</p>
              <button onClick={fetchLeads} className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                <RefreshCw className="w-4 h-4" />Try Again
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : isTradie ? (
            renderTradieGroupedView()
          ) : leads.length === 0 ? (
            (filter === 'active' || filter === 'all') ? (
              <EmptyState
                icon={Briefcase}
                title="No Active Jobs"
                description="You don't have any active jobs right now. Post one and tradies in your area will start quoting."
                actionLabel="Post a Job"
                onAction={() => navigate('/post-lead')}
              />
            ) : filter === 'completed' ? (
              <EmptyState
                icon={CheckCircle2}
                title="No Completed Jobs"
                description="Finished jobs will appear here. You can leave reviews and export invoices."
              />
            ) : filter === 'archived' ? (
              <EmptyState
                icon={Archive}
                title="No Archived Jobs"
                description="Archived, cancelled, and declined jobs will appear here."
              />
            ) : (
              <EmptyState
                icon={Briefcase}
                title="No Jobs Found"
                description="No jobs match this filter."
              />
            )
          ) : filter === 'completed' ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  {leads.length} completed job{leads.length !== 1 ? 's' : ''}
                </p>
                <button
                  onClick={handleExportInvoice}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export Invoice
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {leads.map((lead) => {
                  const category = extractCategory(lead.description);
                  const desc = cleanDescription(lead.description);
                  const isReleased = releasedJobIds.has(lead.id);
                  const isReviewed = reviewedJobIds.has(lead.id);
                  const isFullyDone = isReleased && isReviewed;
                  const completedAt2 = (lead as Record<string, unknown>).completed_at as string | null;
                  return (
                    <div key={lead.id}>
                      {!isReleased && completedAt2 && (
                        <AutoReleaseCountdown completedAt={completedAt2} />
                      )}
                      <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900 truncate capitalize">
                            {(lead.title || category || 'Untitled Job').replace(/_/g, ' ')}
                          </h4>
                          {category && (
                            <span className="hidden sm:inline px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded text-[10px] font-medium flex-shrink-0">
                              {category}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{desc}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {isFullyDone ? (
                          <button
                            onClick={() => setViewCompletedJob(lead)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-xs font-semibold rounded-lg hover:bg-primary-100 border border-primary-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        ) : !isReleased ? (
                          <button
                            onClick={() => handleReleasePayment(lead.id)}
                            disabled={releasingJobId === lead.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white text-xs font-semibold rounded-lg hover:bg-warm-700 transition-colors disabled:opacity-60"
                          >
                            {releasingJobId === lead.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            Release & Review
                          </button>
                        ) : (
                          <Link
                            to={`/review/${lead.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-500 text-white text-xs font-semibold rounded-lg hover:bg-warm-600 transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" />
                            Leave a Review
                          </Link>
                        )}
                        <button
                          onClick={() => handleArchiveJob(lead.id)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Archive"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : filter === 'archived' ? (
            <div>
              <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                <Archive className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  Archived jobs are hidden from your main list. You can unarchive them anytime to bring them back.
                </p>
              </div>
              <div className="space-y-3">
                {leads.map(lead => {
                  const category = lead.description.match(/^\[([^\]]+)\]/)?.[1] || '';
                  const desc = lead.description.replace(/^\[[^\]]+\]\s*/, '');
                  return (
                    <div key={lead.id} className="rounded-xl p-5 border border-gray-200 bg-white">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <h3 className="text-base font-semibold text-gray-900">{lead.title || category || 'Untitled Job'}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleUnarchiveJob(lead.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Unarchive
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{desc}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                        {category && <span className="px-2 py-0.5 bg-gray-100 rounded-full">{category}</span>}
                        <span className={`px-2 py-0.5 rounded-full ${
                          lead.status === 'completed' ? 'bg-green-100 text-green-700' :
                          lead.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                          lead.status === 'declined' ? 'bg-red-100 text-red-600' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{lead.status.replace('_', ' ')}</span>
                        {lead.location_address && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.location_address}</span>
                        )}
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(lead.created_at)}</span>
                        {lead.archived_at && (
                          <span className="text-gray-400">Archived {new Date(lead.archived_at).toLocaleDateString('en-AU')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {leads.map(renderLeadCard)}
            </div>
          )}
        </div>
      </div>

      {/* Job Detail Modal for Tradies */}
      {viewLeadDetail && (() => {
        const vl = viewLeadDetail;
        const vlCategory = extractCategory(vl.description);
        const vlDesc = cleanDescription(vl.description);
        const vlIsUrgent = vl.priority === 'high';
        const vlIsFlash = vl.is_flash_boost && vl.flash_expiry && new Date(vl.flash_expiry) > new Date();
        const vlSlotIcon = vl.preferred_time_slot ? SLOT_ICONS[vl.preferred_time_slot] : null;
        const vlHasQuoted = isTradie && vl.my_quote;
        const vlPhotos = vl.images_url || [];

        return (
          <Modal isOpen={!!viewLeadDetail} onClose={() => setViewLeadDetail(null)} maxWidth="2xl">
            <div className="overflow-hidden">
              {/* Header */}
              <div className={`px-6 py-4 border-b ${
                vlIsFlash ? 'bg-gradient-to-r from-warm-50 to-orange-50 border-warm-200'
                : vlIsUrgent ? 'bg-red-50 border-red-100'
                : 'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      vlIsFlash ? 'bg-warm-100' : vlIsUrgent ? 'bg-red-100' : 'bg-white border border-gray-200'
                    }`}>
                      <Briefcase className={`w-5 h-5 ${
                        vlIsFlash ? 'text-warm-600' : vlIsUrgent ? 'text-red-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 capitalize">
                        {(vl.title || vlCategory || 'Untitled Job').replace(/_/g, ' ')}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        {vlCategory && (
                          <span className="px-2.5 py-0.5 bg-white text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                            {vlCategory}
                          </span>
                        )}
                        {vlIsFlash && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warm-500 text-white rounded-full text-xs font-bold animate-pulse">
                            <Zap className="w-3 h-3" />
                            Flash Deal
                          </span>
                        )}
                        {vlIsUrgent && !vlIsFlash && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold border border-red-200">
                            <Zap className="w-3 h-3" />
                            Urgent
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setViewLeadDetail(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Description section */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Job Description</h4>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{vlDesc}</p>
                </div>

                {/* Photos */}
                {vlPhotos.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Photos</h4>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {vlPhotos.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPreviewPhoto(url)}
                          className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-gray-200 hover:border-primary-300 transition-colors"
                        >
                          <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  {vl.location_address && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</p>
                        <p className="text-sm text-gray-700 mt-0.5">{extractSuburb(vl.location_address) || 'Nearby'}</p>
                      </div>
                    </div>
                  )}
                  {vl.scheduled_date && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                      <CalendarDays className="w-4 h-4 text-secondary-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Scheduled Date</p>
                        <p className="text-sm text-gray-700 mt-0.5">
                          {new Date(vl.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  )}
                  {vl.preferred_time_slot && vlSlotIcon && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                      {(() => { const Icon = vlSlotIcon; return <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />; })()}
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Preferred Time</p>
                        <p className="text-sm text-gray-700 mt-0.5">{SLOT_LABELS[vl.preferred_time_slot]}</p>
                      </div>
                    </div>
                  )}
                  {vl.budget_amount ? (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-emerald-50 rounded-xl">
                      <DollarSign className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Budget</p>
                        <p className="text-sm font-semibold text-emerald-700 mt-0.5">${vl.budget_amount.toLocaleString()}</p>
                      </div>
                    </div>
                  ) : vl.budget_type === 'request_quote' ? (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-secondary-50 rounded-xl">
                      <FileText className="w-4 h-4 text-secondary-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Budget</p>
                        <p className="text-sm font-medium text-secondary-700 mt-0.5">Requesting Quote</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                    <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Posted</p>
                      <p className="text-sm text-gray-700 mt-0.5">{formatDate(vl.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                    <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Quote Slots</p>
                      <p className="text-sm text-gray-700 mt-0.5">{vl.quote_count}/{vl.max_quotes} filled</p>
                    </div>
                  </div>
                  {vl.allows_site_inspection && !['Cleaner', 'Handyman', 'Pest Control', 'Locksmith', 'Appliance Repair', 'Private Chef', 'Event Catering', 'Security Systems', 'Garage Doors'].includes(vlCategory) && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-blue-50 rounded-xl">
                      <Eye className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Site Inspection</p>
                        <p className="text-sm text-blue-700 mt-0.5">Client allows inspections</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Posted by */}
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <User className="w-3.5 h-3.5" />
                  Posted by {((vl as LeadWithClient).client_name || 'Client').split(' ')[0]}
                </div>
              </div>

              {/* Footer actions */}
              {isTradie && !vlHasQuoted && (
                <div className="flex items-center gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => { handleDismissLead(vl.id); setViewLeadDetail(null); }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-white hover:text-gray-700 border border-gray-200 transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    Not Interested
                  </button>
                  <button
                    onClick={() => { setViewLeadDetail(null); handleQuoteClick(vl); }}
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-semibold bg-warm-500 text-white hover:bg-warm-600 shadow-sm transition-all"
                  >
                    <FileText className="w-4 h-4" />
                    Submit Quote
                  </button>
                </div>
              )}

              {/* Client: View Quotes button */}
              {!isTradie && vl.status === 'pending' && vl.quote_count > 0 && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setViewLeadDetail(null);
                      setExpandedJobId(vl.id);
                      setTimeout(() => {
                        document.getElementById(`job-${vl.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    <Eye className="w-4 h-4" />
                    View {vl.quote_count} Quote{vl.quote_count !== 1 ? 's' : ''}
                  </button>
                </div>
              )}

              {isTradie && vlHasQuoted && (() => {
                const qs = vl.my_quote!.status;
                const statusConfig = qs === 'accepted'
                  ? { bg: 'bg-green-50 border-green-200', icon: <CheckCircle2 className="w-5 h-5 text-green-600" />, label: 'Quote accepted — the client chose you!', textColor: 'text-green-800' }
                  : qs === 'declined'
                  ? { bg: 'bg-red-50 border-red-200', icon: <XCircle className="w-5 h-5 text-red-500" />, label: 'Quote declined by client', textColor: 'text-red-700' }
                  : { bg: 'bg-secondary-50 border-secondary-200', icon: <Clock className="w-5 h-5 text-secondary-600" />, label: 'Awaiting client decision', textColor: 'text-secondary-600' };
                return (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <div className={`flex items-center gap-3 px-4 py-3 ${statusConfig.bg} border rounded-xl`}>
                      {statusConfig.icon}
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">
                          You quoted {vl.my_quote!.firm_price
                            ? `$${vl.my_quote!.firm_price.toLocaleString()}`
                            : `$${vl.my_quote!.price_min.toLocaleString()} – $${vl.my_quote!.price_max.toLocaleString()}`
                          }
                        </p>
                        <p className={`text-xs ${statusConfig.textColor}`}>{statusConfig.label}</p>
                      </div>
                      {qs === 'pending' && (
                        <button
                          onClick={() => setWithdrawQuoteTarget(vl)}
                          className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </Modal>
        );
      })()}

      <VerificationGateModal
        isOpen={showVerificationGate}
        onClose={() => setShowVerificationGate(false)}
        reason={gateReason}
      />

      {withdrawQuoteTarget && (
        <ConfirmModal
          title="Withdraw Quote?"
          message="Are you sure you want to withdraw your quote? The client will be notified."
          confirmText={withdrawing ? 'Withdrawing...' : 'Withdraw Quote'}
          cancelText="Cancel"
          type="danger"
          onConfirm={handleWithdrawQuote}
          onCancel={() => setWithdrawQuoteTarget(null)}
        />
      )}

      {quoteModalJob && (
        <SubmitQuoteModal
          isOpen={!!quoteModalJob}
          onClose={() => setQuoteModalJob(null)}
          job={quoteModalJob}
          onQuoteSubmitted={() => {
            setQuoteModalJob(null);
            fetchLeads();
          }}
        />
      )}

      {editJob && (() => {
        const ej = editJob;
        const ejCategory = extractCategory(ej.description);
        const ejIsFlash = ej.is_flash_boost && ej.flash_expiry && new Date(ej.flash_expiry) > new Date();
        return (
          <Modal isOpen={!!editJob} onClose={() => setEditJob(null)} maxWidth="lg">
            <div className="p-6">
              {/* Header — category as title */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary-100 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-secondary-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{ej.title || ejCategory || 'Job Details'}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getClientStatusColor(ej)}`}>
                        {getClientStatusLabel(ej)}
                      </span>
                      {ejIsFlash && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-warm-100 text-warm-700 rounded-full text-xs font-semibold border border-warm-200">
                          <Zap className="w-3 h-3" />
                          Boosted
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => setEditJob(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info pills */}
              <div className="flex flex-wrap gap-2 mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg text-xs text-gray-600">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  Posted {formatDate(ej.created_at)}
                </div>
                {ej.quote_count > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary-50 rounded-lg text-xs text-secondary-700 font-medium">
                    <Users className="w-3.5 h-3.5" />
                    {ej.quote_count} quote{ej.quote_count !== 1 ? 's' : ''}
                  </div>
                )}
                {ej.scheduled_date && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg text-xs text-blue-700">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(ej.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
                {ej.budget_amount && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg text-xs text-green-700 font-medium">
                    ${ej.budget_amount.toLocaleString()} budget
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                  Job Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Give your job a short title"
                  maxLength={80}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-warm-500 transition-colors"
                />
              </div>

              {/* Description section */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                  <FileText className="w-3.5 h-3.5" />
                  Description
                </label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  placeholder="Describe what you need done — the more detail, the better the quotes."
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-warm-500 transition-colors resize-none"
                />
                {/* Quick-add hints — compact, below description */}
                {ejCategory && (
                  <details className="mt-2" open={editDesc.length < 40}>
                    <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                      Quick-add suggestions for {ejCategory}
                    </summary>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {getJobHints(ejCategory).map((hint) => {
                        const isAdded = editDesc.includes(hint.replace(/:$/, ''));
                        return (
                          <button
                            key={hint}
                            type="button"
                            onClick={() => {
                              if (!isAdded) {
                                const separator = editDesc.trim() ? '. ' : '';
                                setEditDesc((prev) => prev.trim() + separator + hint + ' ');
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                              isAdded
                                ? 'bg-secondary-50 text-secondary-600 border-secondary-200 cursor-default'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-warm-50 hover:border-warm-300 hover:text-warm-700'
                            }`}
                          >
                            {isAdded ? '✓ ' : '+ '}{hint}
                          </button>
                        );
                      })}
                    </div>
                  </details>
                )}
              </div>

              {/* Location & Budget — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="sm:col-span-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Location
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-warm-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                    Budget
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={editBudget}
                      onChange={(e) => setEditBudget(e.target.value)}
                      placeholder="—"
                      className="w-full pl-8 pr-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-warm-500 focus:border-warm-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Photos — compact row */}
              <div className="mb-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
                  <Camera className="w-3.5 h-3.5" />
                  Photos
                  <span className="text-gray-400 font-normal">({editPhotos.length}/5)</span>
                </label>
                <div className="flex gap-2 items-center flex-wrap">
                  {editPhotos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 group">
                      <img
                        src={p.url}
                        alt={`Photo ${i + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewPhoto(p.url)}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeEditPhoto(i); }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {editPhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => editFileRef.current?.click()}
                      className="w-16 h-16 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 border border-dashed border-gray-300 rounded-lg hover:border-warm-400 hover:bg-warm-50/30 transition-colors group"
                    >
                      <Plus className="w-4 h-4 text-gray-400 group-hover:text-warm-600 transition-colors" />
                      <span className="text-[10px] text-gray-400 group-hover:text-warm-600">Add</span>
                    </button>
                  )}
                </div>
                <input
                  ref={editFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  multiple
                  onChange={handleEditPhotoSelect}
                  className="hidden"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setEditJob(null); setDeleteJobTarget(ej); }}
                  className="inline-flex items-center gap-1.5 text-red-500 hover:text-red-700 transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Cancel Job
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => setEditJob(null)}
                  className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving || !editDesc.trim() || !editLocation.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-warm-500 text-white rounded-lg hover:bg-warm-600 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Photo lightbox */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onMouseDown={() => setPreviewPhoto(null)}
        >
          <img
            src={previewPhoto}
            alt="Photo preview"
            className="max-w-full max-h-[85vh] rounded-lg object-contain"
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setPreviewPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {priceConfirm && (
        <Modal isOpen={true} onClose={() => setPriceConfirm(null)}>
          <div className="px-6 pt-5 pb-1">
            <h2 className="text-lg font-semibold text-gray-900">Confirm Agreed Price</h2>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <p className="text-sm text-gray-600">
              The tradie quoted a range of <span className="font-semibold">${priceConfirm.min.toLocaleString()}</span> – <span className="font-semibold">${priceConfirm.max.toLocaleString()}</span>.
            </p>
            <p className="text-sm text-gray-600">
              Please enter the price you and the tradie have agreed on:
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input
                type="number"
                min={priceConfirm.min}
                max={priceConfirm.max}
                step="0.01"
                value={priceConfirm.agreedPrice}
                onChange={(e) => setPriceConfirm({ ...priceConfirm, agreedPrice: e.target.value })}
                placeholder={`${priceConfirm.min} – ${priceConfirm.max}`}
                className="w-full pl-8 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            {priceConfirm.agreedPrice && (
              Number(priceConfirm.agreedPrice) < priceConfirm.min || Number(priceConfirm.agreedPrice) > priceConfirm.max
            ) && (
              <p className="text-xs text-red-500">
                Price must be between ${priceConfirm.min.toLocaleString()} and ${priceConfirm.max.toLocaleString()}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPriceConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const price = Number(priceConfirm.agreedPrice);
                  if (price >= priceConfirm.min && price <= priceConfirm.max) {
                    setPayingJobId(priceConfirm.jobId);
                    handleAcceptQuote(priceConfirm.quoteId, priceConfirm.jobId, price);
                    setPriceConfirm(null);
                  }
                }}
                disabled={
                  !priceConfirm.agreedPrice ||
                  Number(priceConfirm.agreedPrice) < priceConfirm.min ||
                  Number(priceConfirm.agreedPrice) > priceConfirm.max
                }
                className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Shield className="w-4 h-4" />
                Confirm & Pay
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewCompletedJob && (() => {
        const cj = viewCompletedJob;
        const cjCategory = extractCategory(cj.description);
        const cjDesc = cleanDescription(cj.description);
        const cjPhotos = cj.images_url || [];
        const completedDate = cj.updated_at
          ? new Date(cj.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
          : new Date(cj.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

        const handleExportSingleInvoice = async () => {
          const html2pdfModule = await import('html2pdf.js');
          const html2pdf = html2pdfModule.default;
          const now = new Date();
          const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const userName = profile?.full_name || 'Client';
          const userEmail = profile?.email || '';
          const amount = cj.budget_amount || 0;
          const gst = Math.round(amount / 11 * 100) / 100;
          const exGst = Math.round((amount - gst) * 100) / 100;
          const invoiceDate = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
          const category = cjCategory || 'Service';
          const desc = cjDesc.length > 70 ? cjDesc.slice(0, 70) + '...' : cjDesc;

          const container = document.createElement('div');
          container.style.position = 'fixed';
          container.style.left = '-9999px';
          container.style.top = '0';
          container.style.width = '794px';
          container.style.background = '#FFFFFF';
          container.innerHTML = '<div style="font-family:Arial,Helvetica,sans-serif;width:794px;padding:40px 48px;color:#1F2937;background:#FFFFFF;">' +
            '<table style="width:100%;border-collapse:collapse;margin-bottom:0;"><tr><td colspan="2" style="padding-bottom:20px;border-bottom:3px solid #004d40;"><table style="width:100%;border-collapse:collapse;"><tr>' +
            '<td style="vertical-align:top;width:50%;"><div style="font-size:28px;font-weight:800;color:#004d40;margin:0;">ConnecTradie</div><div style="font-size:11px;color:#6B7280;margin-top:4px;">ABN: 00 000 000 000</div></td>' +
            '<td style="vertical-align:top;text-align:right;width:50%;"><div style="font-size:22px;font-weight:700;color:#1F2937;">TAX INVOICE</div><div style="font-size:12px;color:#6B7280;margin-top:8px;">Invoice #: <strong style="color:#1F2937;">' + invoiceNumber + '</strong></div><div style="font-size:12px;color:#6B7280;margin-top:2px;">Date: ' + invoiceDate + '</div></td>' +
            '</tr></table></td></tr></table>' +
            '<table style="width:100%;border-collapse:collapse;margin:28px 0;"><tr><td style="vertical-align:top;width:50%;"><div style="font-size:10px;font-weight:700;color:#004d40;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">Bill To</div><div style="font-size:14px;font-weight:600;color:#1F2937;">' + userName + '</div>' + (userEmail ? '<div style="font-size:12px;color:#6B7280;margin-top:3px;">' + userEmail + '</div>' : '') + '</td>' +
            '<td style="vertical-align:top;text-align:right;width:50%;"><div style="font-size:10px;font-weight:700;color:#004d40;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">Platform</div><div style="font-size:14px;font-weight:600;color:#1F2937;">ConnecTradie Pty Ltd</div><div style="font-size:12px;color:#6B7280;margin-top:3px;">support@connectradie.com</div></td></tr></table>' +
            '<table style="width:100%;border-collapse:collapse;"><thead><tr style="background-color:#004d40;">' +
            '<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Service</th>' +
            '<th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Description</th>' +
            '<th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Date</th>' +
            '<th style="padding:10px 14px;text-align:right;font-size:10px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.5px;">Amount (AUD)</th>' +
            '</tr></thead><tbody>' +
            '<tr style="background-color:#FFFFFF;"><td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;font-weight:500;">' + category + '</td>' +
            '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;">' + desc + '</td>' +
            '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#6B7280;text-align:center;">' + completedDate + '</td>' +
            '<td style="padding:10px 14px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#111827;text-align:right;font-weight:600;">$' + amount.toFixed(2) + '</td></tr>' +
            '</tbody></table>' +
            '<table style="width:100%;border-collapse:collapse;margin-top:16px;"><tr><td style="width:55%;"></td><td style="width:45%;"><table style="width:100%;border-collapse:collapse;background:#F9FAFB;border:1px solid #E5E7EB;">' +
            '<tr><td style="padding:8px 16px;font-size:12px;color:#6B7280;">Subtotal (ex. GST)</td><td style="padding:8px 16px;font-size:12px;color:#374151;text-align:right;font-weight:500;">$' + exGst.toFixed(2) + '</td></tr>' +
            '<tr><td style="padding:8px 16px;font-size:12px;color:#6B7280;border-bottom:2px solid #004d40;">GST (10%)</td><td style="padding:8px 16px;font-size:12px;color:#374151;text-align:right;font-weight:500;border-bottom:2px solid #004d40;">$' + gst.toFixed(2) + '</td></tr>' +
            '<tr><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#004d40;">Total (inc. GST)</td><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#004d40;text-align:right;">$' + amount.toFixed(2) + '</td></tr>' +
            '</table></td></tr></table>' +
            '<table style="width:100%;border-collapse:collapse;margin-top:28px;"><tr><td style="padding:16px 0 0;border-top:1px solid #E5E7EB;text-align:center;"><div style="font-size:10px;color:#9CA3AF;line-height:1.6;">This is a computer-generated tax invoice. All amounts are in Australian Dollars (AUD) and include GST where applicable.</div><div style="font-size:10px;color:#9CA3AF;margin-top:4px;">Generated via ConnecTradie — ' + invoiceDate + '</div></td></tr></table>' +
            '</div>';

          document.body.appendChild(container);
          try {
            await html2pdf().set({
              margin: 0,
              filename: `ConnecTradie-Invoice-${invoiceNumber}.pdf`,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            }).from(container).save();
          } finally {
            document.body.removeChild(container);
          }
        };

        return (
          <Modal isOpen={!!viewCompletedJob} onClose={() => setViewCompletedJob(null)} maxWidth="lg">
            <div className="overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b bg-green-50 border-green-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 capitalize">
                        {(cj.title || cjCategory || 'Untitled Job').replace(/_/g, ' ')}
                      </h2>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-2.5 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-semibold border border-green-300">
                          Completed
                        </span>
                        {cjCategory && (
                          <span className="px-2.5 py-0.5 bg-white text-gray-600 rounded-full text-xs font-medium border border-gray-200">
                            {cjCategory}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setViewCompletedJob(null)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Description */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Job Description</h4>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{cjDesc}</p>
                </div>

                {/* Photos */}
                {cjPhotos.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Photos</h4>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {cjPhotos.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPreviewPhoto(url)}
                          className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-200 hover:border-primary-300 transition-colors"
                        >
                          <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  {cj.location_address && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</p>
                        <p className="text-sm text-gray-700 mt-0.5">{cj.location_address}</p>
                      </div>
                    </div>
                  )}
                  {cj.scheduled_date && (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                      <CalendarDays className="w-4 h-4 text-secondary-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Scheduled Date</p>
                        <p className="text-sm text-gray-700 mt-0.5">
                          {new Date(cj.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 px-3.5 py-3 bg-gray-50 rounded-xl">
                    <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Completed</p>
                      <p className="text-sm text-gray-700 mt-0.5">{completedDate}</p>
                    </div>
                  </div>
                  {cj.budget_amount ? (
                    <div className="flex items-start gap-2.5 px-3.5 py-3 bg-emerald-50 rounded-xl">
                      <DollarSign className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount Paid</p>
                        <p className="text-sm font-semibold text-emerald-700 mt-0.5">${cj.budget_amount.toLocaleString()}</p>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Payment & Review status */}
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-800">Payment Released & Reviewed</p>
                    <p className="text-xs text-green-600 mt-0.5">This job has been fully completed. Payment has been released to the tradie and a review has been left.</p>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={() => setViewCompletedJob(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleExportSingleInvoice}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Export Invoice
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {deleteJobTarget && (
        <ConfirmModal
          title="Cancel Job?"
          message={`Are you sure you want to cancel "${deleteJobTarget.title || cleanDescription(deleteJobTarget.description).slice(0, 60)}"?${deleteJobTarget.quote_count > 0 ? ` Any quotes received will be removed and tradies will be notified.` : ''} This action cannot be undone.`}
          confirmText="Cancel Job"
          cancelText="Keep Job"
          onConfirm={handleDeleteJob}
          onCancel={() => setDeleteJobTarget(null)}
          type="danger"
        />
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout><SectionErrorBoundary>{content}</SectionErrorBoundary></DashboardLayout>;
}
