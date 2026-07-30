import { proseInputProps } from '../lib/proseInput';
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Bell, Plus, Loader2, MapPin, ArrowRight, Crown, RefreshCw, Repeat, Trash2, CalendarClock, DollarSign, Briefcase, Clock, Eye, CheckCircle2, Archive, ArchiveRestore, Pencil, X, Check, Send, Play, ExternalLink, Pause, FileText, Star, ChevronDown, Gift, AlertCircle, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isReleaseActioned } from '../lib/paymentRelease';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails, AvailabilitySlot, Job, Insert } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import UpcomingTimeline from '../components/UpcomingTimeline';
import RecommendedTradies from '../components/RecommendedTradies';
import OnboardingChecklist from '../components/OnboardingChecklist';
import { redactName } from '../lib/contactGating';
import SubscriptionModal from '../components/SubscriptionModal';
// TooltipHint available for future use
import WelcomeGuide from '../components/WelcomeGuide';
import { DashboardStatsSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ConfirmModal from '../components/ConfirmModal';
import BonusModal from '../components/BonusModal';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getRecurringJobs, createRecurringJob, cancelRecurringJob, pauseRecurringJob, resumeRecurringJob, updateRecurringJob, suggestRecurringJob, getUpcomingSessions, getKeywordSuggestions, RECURRING_SERVICE_SUBCATEGORIES, RECURRING_SERVICE_DESCRIPTIONS, type RecurringJob, type RecurringSession, type KeywordSuggestion } from '../lib/recurringJobs';
import { releaseEscrow, payPriceIncrease, humanizePaymentError, createJobPaymentCheckout } from '../lib/stripePayments';
import { callEdgeFunction } from '../lib/edgeFn';
import RecurringSessionCard from '../components/RecurringSessionCard';
import RecurringInvoiceCard from '../components/RecurringInvoiceCard';
import type { RecurringInvoice } from '../components/RecurringInvoiceCard';

export default function ClientDashboard() {
  const [savedTradies, setSavedTradies] = useState<TradieWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const [availableThisWeek, setAvailableThisWeek] = useState(0);
  const [showSlotsBanner, setShowSlotsBanner] = useState(() => {
    // Persist dismissal for the current session — banner reappears on next login
    // if a saved tradie is still showing fresh availability.
    return typeof window === 'undefined' || sessionStorage.getItem('dismissed_slots_banner') !== '1';
  });

  // Auto-dismiss the saved-tradie slots banner after 15s so it doesn't sit there
  // forever if the client never explicitly closes it.
  useEffect(() => {
    if (availableThisWeek <= 0 || !showSlotsBanner) return;
    const timer = setTimeout(() => setShowSlotsBanner(false), 15000);
    return () => clearTimeout(timer);
  }, [availableThisWeek, showSlotsBanner]);
  const [unreadByTradie, setUnreadByTradie] = useState<Map<string, number>>(new Map());
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; show: boolean; isError?: boolean }>({ message: '', show: false });
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboardedBanner, setShowOnboardedBanner] = useState(false);
  const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [cancelServiceTarget, setCancelServiceTarget] = useState<{ id: string; label: string } | null>(null);
  const [expandedDescs, setExpandedDescs] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingService, setCancellingService] = useState(false);
  const [sentRecurringIds, setSentRecurringIds] = useState<Set<string>>(new Set());
  const [jobSessions, setJobSessions] = useState<Record<string, RecurringSession[]>>({});
  const [sessionsLoading, setSessionsLoading] = useState<Set<string>>(new Set());
  const [spendingSummary, setSpendingSummary] = useState({ total: 0, thisMonth: 0, pendingJobs: 0, activeServices: 0 });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [jobTab, setJobTab] = useState<'active' | 'accepted' | 'completed'>('active');
  const [recurringJobIds, setRecurringJobIds] = useState<Set<string>>(new Set());
  const [releasedJobIds, setReleasedJobIds] = useState<Set<string>>(new Set());
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set());
  const [cancelJobTarget, setCancelJobTarget] = useState<Job | null>(null);
  const [bonusTarget, setBonusTarget] = useState<{ jobId: string; tradieName?: string | null; jobLabel?: string | null } | null>(null);
  const [releasingJobId, setReleasingJobId] = useState<string | null>(null);
  const [pendingIncreases, setPendingIncreases] = useState<Record<string, { paymentId: string; amount: number; originalAmount: number; finalAmount: number }>>({});
  const [payingIncreaseJobId, setPayingIncreaseJobId] = useState<string | null>(null);
  const [cancelRecurringTarget, setCancelRecurringTarget] = useState<RecurringJob | null>(null);
  const [invoices, setInvoices] = useState<RecurringInvoice[]>([]);
  const [pendingPayments, setPendingPayments] = useState<{ id: string; amount: number; job_id: string | null; jobTitle: string; created_at: string }[]>([]);
  const [payingPendingId, setPayingPendingId] = useState<string | null>(null);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [quoteRequestTradie, setQuoteRequestTradie] = useState<TradieWithDetails | null>(null);
  const [clientPendingJobs, setClientPendingJobs] = useState<{ id: string; title: string | null; description: string; location_address: string | null }[]>([]);
  const [loadingQuoteJobs, setLoadingQuoteJobs] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isClientPro = profile?.is_premium;

  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, isError });
    setTimeout(() => setToast({ message: '', show: false }), 3000);
  };

  const fetchRecurring = useCallback(async () => {
    if (!user) return;
    try {
      const jobs = await getRecurringJobs(user.id);
      setRecurringJobs(jobs);
      // Fetch upcoming sessions for each active job
      const activeJobs = jobs.filter(j => j.is_active);
      const loadingIds = new Set(activeJobs.map(j => j.id));
      setSessionsLoading(loadingIds);
      const sessionsMap: Record<string, RecurringSession[]> = {};
      await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const sessions = await getUpcomingSessions(job.id);
            sessionsMap[job.id] = sessions;
          } catch {
            sessionsMap[job.id] = [];
          }
        }),
      );
      setJobSessions(sessionsMap);
      setSessionsLoading(new Set());
    } catch (err) {
      console.error('fetchRecurring error:', err);
    }
  }, [user]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      // Anything that needs the client's eyes — pending_approval was missing
      // before, which meant invoices on My Jobs ("Awaiting Your Approval")
      // didn't surface on the dashboard's Invoices widget.
      const { data: outstanding } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price, description, location), tradie:profiles!recurring_invoices_tradie_id_fkey(full_name)')
        .eq('homeowner_id', user.id)
        .in('status', ['pending_approval', 'sent', 'overdue', 'draft'])
        .order('created_at', { ascending: false });

      setInvoices((outstanding ?? []) as unknown as RecurringInvoice[]);
    } catch { /* ignore */ }
  }, [user]);

  const fetchPendingPayments = useCallback(async () => {
    if (!user) return;
    try {
      const { data: pending } = await supabase
        .from('payments')
        .select('id, amount, job_id, created_at, metadata')
        .eq('profile_id', user.id)
        .eq('status', 'pending')
        .eq('payment_type', 'job_funding')
        .order('created_at', { ascending: false });

      if (!pending || pending.length === 0) {
        setPendingPayments([]);
        return;
      }

      // Fetch job titles for context
      const jobIds = [...new Set(pending.map(p => p.job_id).filter((id): id is string => id !== null))];
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, title, description')
        .in('id', jobIds);

      const jobMap = new Map((jobs || []).map(j => [j.id, j]));

      setPendingPayments(pending.map(p => {
        const job = p.job_id ? jobMap.get(p.job_id) : undefined;
        const category = job?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
        return {
          id: p.id,
          amount: p.amount,
          job_id: p.job_id,
          jobTitle: job?.title || category || 'Job payment',
          created_at: p.created_at,
        };
      }));
    } catch (err) {
      console.error('Failed to fetch pending payments:', err);
    }
  }, [user]);

  useEffect(() => {
    if (searchParams.get('onboarded') === 'client') {
      setShowOnboardedBanner(true);
      setSearchParams((prev) => { prev.delete('onboarded'); return prev; }, { replace: true });
      setTimeout(() => setShowOnboardedBanner(false), 12000);
    }
  }, []);

  const fetchSpendingSummary = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [totalResult, monthResult, pendingResult, servicesResult] = await Promise.all([
        supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed'),
        supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed').gte('created_at', monthStart),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('client_id', user.id).in('status', ['funded', 'in_progress']).is('archived_at', null),
        supabase.from('recurring_jobs').select('id', { count: 'exact', head: true }).eq('client_id', user.id).eq('is_active', true),
      ]);
      setSpendingSummary({
        total: (totalResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
        thisMonth: (monthResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
        pendingJobs: pendingResult.count || 0,
        activeServices: servicesResult.count || 0,
      });
    } catch (err) {
      console.error('fetchSpendingSummary error:', err);
    }
  }, [user]);

  const fetchRecentJobs = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', user.id)
        .is('deleted_at', null)
        .is('archived_at', null)
        .not('status', 'in', '("cancelled","declined")')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        const jobs = data as Job[];
        // Check payment status BEFORE rendering jobs to avoid flash
        const completedIds = jobs.filter(j => j.status === 'completed').map(j => j.id);
        const released = new Set<string>();
        if (completedIds.length > 0) {
          const { data: payments } = await supabase
            .from('payments')
            .select('job_id, status, metadata')
            .in('job_id', completedIds);
          if (payments) {
            const jobsWithPayments = new Set(payments.map(p => p.job_id));
            for (const p of payments) {
              // Shared predicate (lib/paymentRelease) — "the CLIENT'S part is done",
              // not "the money finished moving". `status === 'completed'` alone only
              // means they paid INTO escrow. Must match the sidebar dot exactly.
              if (p.job_id && isReleaseActioned({ status: p.status, metadata: p.metadata as Record<string, unknown> | null })) {
                released.add(p.job_id);
              }
            }
            // Jobs with no payment record at all — legacy, treat as released
            for (const id of completedIds) {
              if (!jobsWithPayments.has(id)) released.add(id);
            }
          }
        }
        // Check which completed jobs have been reviewed
        let reviewed = new Set<string>();
        if (completedIds.length > 0) {
          const { data: reviews } = await supabase
            .from('reviews')
            .select('job_id')
            .in('job_id', completedIds)
            .eq('client_id', user.id);
          if (reviews) {
            reviewed = new Set(reviews.flatMap(r => r.job_id ? [r.job_id] : []));
          }
        }
        // Find jobs linked to recurring services — these belong under "Ongoing Services",
        // not the regular Active/Accepted tabs. Cover both the original placeholder
        // (recurring_jobs.original_job_id) and any quote-request jobs (jobs.recurring_job_id).
        const [recurringLinksRes, recurringJobLinksRes] = await Promise.all([
          supabase
            .from('recurring_jobs')
            .select('original_job_id')
            .eq('client_id', user.id)
            .eq('is_active', true)
            .is('cancelled_at', null)
            .not('original_job_id', 'is', null)
            .not('tradie_id', 'is', null),
          supabase
            .from('jobs')
            .select('id')
            .eq('client_id', user.id)
            .not('recurring_job_id', 'is', null),
        ]);
        const recurringIds = new Set<string>([
          ...((recurringLinksRes.data ?? []).map(r => r.original_job_id).filter(Boolean) as string[]),
          ...((recurringJobLinksRes.data ?? []).map(r => r.id).filter(Boolean) as string[]),
        ]);
        setRecurringJobIds(recurringIds);

        // Pending price increases — surface them on the job card so the client
        // doesn't have to dig into Payments to find the "Pay Increase" CTA.
        // Include 'completed' because tradies sometimes mark complete before the
        // client has paid the increase; we want the banner to follow the money.
        const activeJobIds = jobs
          .filter(j => j.status !== null && ['funded', 'in_progress', 'completed'].includes(j.status))
          .map(j => j.id);
        const increases: Record<string, { paymentId: string; amount: number; originalAmount: number; finalAmount: number }> = {};
        if (activeJobIds.length > 0) {
          const { data: activePayments } = await supabase
            .from('payments')
            .select('id, job_id, amount, metadata')
            .in('job_id', activeJobIds)
            .eq('payment_type', 'job_funding')
            .eq('status', 'completed');
          for (const p of activePayments ?? []) {
            const meta = p.metadata as Record<string, unknown> | null;
            if (meta?.transfer_id || meta?.released_at) continue;
            const inc = meta?.pending_increase as Record<string, unknown> | undefined;
            if (!inc) continue;
            const diffCents = typeof inc.diff_cents === 'number' ? inc.diff_cents : 0;
            if (diffCents <= 0) continue;
            const originalCents = typeof p.amount === 'number' ? p.amount : 0;
            if (!p.job_id) continue;
            increases[p.job_id] = {
              paymentId: p.id,
              amount: diffCents / 100,
              originalAmount: originalCents / 100,
              finalAmount: (originalCents + diffCents) / 100,
            };
          }
        }

        // Set all at once — no flash
        setReleasedJobIds(released);
        setReviewedJobIds(reviewed);
        setPendingIncreases(increases);
        setRecentJobs(jobs);
      }
    } catch (err) {
      console.error('fetchRecentJobs error:', err);
    }
  }, [user]);

  const archiveJob = async (jobId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('client_id', user.id);
      if (error) throw error;
      setRecentJobs(prev => prev.filter(j => j.id !== jobId));
      showToast('Job archived');
    } catch (err) {
      console.error('archiveJob error:', err);
      showToast('Failed to archive job', true);
    }
  };

  const handleReleasePayment = async (jobId: string) => {
    if (releasingJobId) return;
    setReleasingJobId(jobId);
    try {
      const { data: payment } = await supabase
        .from('payments')
        .select('id, metadata')
        .eq('job_id', jobId)
        .eq('payment_type', 'job_funding')
        .eq('status', 'completed')
        .maybeSingle();

      if (!payment) {
        setReleasedJobIds(prev => new Set(prev).add(jobId));
      } else {
        const meta = payment.metadata as Record<string, unknown> | null;
        // Already released OR already approved (payout still settling) — don't call
        // release-escrow again, just take them to the review.
        if (isReleaseActioned({ metadata: meta })) {
          setReleasedJobIds(prev => new Set(prev).add(jobId));
        } else if (meta?.pending_increase) {
          showToast('A price adjustment needs to be paid first. Opening that now…', true);
          navigate(`/leads?filter=active&job=${jobId}`);
          return;
        } else {
          await releaseEscrow(payment.id);
          setReleasedJobIds(prev => new Set(prev).add(jobId));
        }
      }
      navigate(`/review/${jobId}`);
    } catch (err) {
      console.error('Failed to release payment:', err);
      const rawMsg = err instanceof Error ? err.message : 'Failed to release payment';
      if (rawMsg.includes('pending') && rawMsg.includes('increase')) {
        showToast('A price adjustment needs to be paid before release.', true);
        navigate(`/leads?filter=active&job=${jobId}`);
      } else {
        showToast(humanizePaymentError(rawMsg), true);
      }
    } finally {
      setReleasingJobId(null);
    }
  };

  const unarchiveJob = async (jobId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ archived_at: null })
        .eq('id', jobId)
        .eq('client_id', user.id);
      if (error) throw error;
      setRecentJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived_at: null } : j));
      showToast('Job restored');
    } catch (err) {
      console.error('unarchiveJob error:', err);
      showToast('Failed to restore job', true);
    }
  };

  const handleCancelJob = async () => {
    if (!cancelJobTarget || !user) return;
    const jobId = cancelJobTarget.id;
    try {
      // Child tables with ON DELETE CASCADE are cleaned up automatically by the DB.
      // Just delete the job — the migration 20260321100000 ensures all FKs cascade.
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      if (error) throw error;
      setRecentJobs(prev => prev.filter(j => j.id !== jobId));
      showToast('Job cancelled');
    } catch (err) {
      console.error('handleCancelJob error:', err);
      showToast('Failed to cancel job', true);
    } finally {
      setCancelJobTarget(null);
    }
  };

  const sendQuoteRequest = async (job: RecurringJob, targetMode: 'saved' | 'all') => {
    if (!user) return;
    try {
      // Create a job from the recurring service
      // Annotated so every key is column-checked — see the `Insert`/`Update`
      // note in types/database.ts.
      const jobData: Insert<'jobs'> = {
        client_id: user.id,
        title: `${job.service_subtype || job.trade_category.replace(/_/g, ' ')} — Ongoing Service`,
        description: `[${job.trade_category}] ${job.description}`,
        status: 'pending',
        location_address: job.location || null,
        budget_type: job.agreed_price ? 'fixed_budget' : 'request_quote',
        budget_amount: job.agreed_price || null,
        is_emergency: false,
        priority: 'normal',
        is_delayed: false,
        max_quotes: 5,
        recurring_job_id: job.id,
        // If sending to a specific saved tradie, assign them directly
        tradie_id: targetMode === 'saved' && job.tradie_id ? job.tradie_id : null,
      };

      const { data: insertedJob, error: insertError } = await supabase
        .from('jobs')
        .insert(jobData)
        .select()
        .maybeSingle();

      if (insertError || !insertedJob) throw insertError || new Error('Failed to create job');

      const jobId = insertedJob.id;
      const tradeName = job.trade_category.replace(/_/g, ' ');
      const clientName = profile?.full_name || 'A client';

      // Notify the assigned tradie directly
      if (targetMode === 'saved' && job.tradie_id) {
        await supabase.rpc('create_notification', {
          p_user_id: job.tradie_id,
          p_title: 'New quote request',
          p_message: `${clientName} sent you an ongoing ${tradeName} service — review and quote now`,
          p_type: 'new_job',
          p_channel: 'in_app',
          p_read: false,
          p_job_id: jobId,
          p_metadata: {},
        });
      }

      // If sending to saved tradies (not just assigned one), notify all saved tradies matching the trade
      if (targetMode === 'saved' && !job.tradie_id) {
        const matchingTradies = savedTradies.filter(t =>
          t.tradie_details?.trade_category?.toLowerCase() === job.trade_category.toLowerCase()
        );
        if (matchingTradies.length > 0) {
          await Promise.all(matchingTradies.map(t => supabase.rpc('create_notification', {
            p_user_id: t.id,
            p_title: 'New quote request from a saved client',
            p_message: `${clientName} is looking for a ${tradeName} — ongoing service`,
            p_type: 'new_job',
            p_channel: 'in_app',
            p_read: false,
            p_job_id: jobId,
            p_metadata: {},
          })));
        }
      }

      fetchRecentJobs();
      setSentRecurringIds(prev => new Set(prev).add(job.id));
      showToast(targetMode === 'saved' && job.tradie_id
        ? 'Quote request sent to your assigned tradie'
        : targetMode === 'saved'
        ? 'Quote request sent to your saved tradies'
        : 'Job posted — all matching tradies can quote');
    } catch (err) {
      console.error('sendQuoteRequest error:', err);
      showToast('Failed to send quote request', true);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSavedTradies();
      fetchUnreadCounts();
      fetchTrainingMode();
      fetchRecurring();
      fetchInvoices();
      fetchPendingPayments();
      fetchSpendingSummary();
      fetchRecentJobs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // sentRecurringIds is only populated when the user explicitly clicks "Send" on a recurring job card

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchTrainingMode();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const fetchTrainingMode = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'training_mode_enabled')
        .maybeSingle();

      setTrainingModeEnabled(data?.value === true);
    } catch (err) {
      console.error('fetchTrainingMode error:', err);
    }
  };

  const fetchSavedTradies = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: savedIds, error: savedError } = await supabase
        .from('my_trades')
        .select('tradie_id')
        .eq('client_id', user.id);

      if (savedError) throw savedError;

      if (savedIds && savedIds.length > 0) {
        const tradieIds = savedIds.map((s) => s.tradie_id);

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select(`*, tradie_details (*)`)
          .in('id', tradieIds);

        if (profilesError) throw profilesError;

        if (profiles) {
          const tradiesWithAvailability = await Promise.all(
            (profiles as unknown as TradieWithDetails[]).map(async (tradie) => {
              const now = new Date();
              const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

              const { data: slots } = await supabase
                .from('availability_slots')
                .select('*')
                .eq('tradie_id', tradie.id)
                .eq('status', 'available')
                .gte('start_time', now.toISOString())
                .lte('start_time', weekFromNow.toISOString());

              const availabilityHours = ((slots || []) as AvailabilitySlot[]).reduce((acc: number, slot: AvailabilitySlot) => {
                const start = new Date(slot.start_time);
                const end = new Date(slot.end_time);
                return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
              }, 0);

              return {
                ...tradie,
                tradie_details: tradie.tradie_details,
                availability_hours: availabilityHours,
              } as TradieWithDetails;
            })
          );

          setSavedTradies(tradiesWithAvailability);

          const available = tradiesWithAvailability.filter((t) => (t.availability_hours || 0) >= 10).length;
          setAvailableThisWeek(available);
        }
      }
    } catch {
      showToast('Failed to load saved tradies. Please refresh.', true);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCounts = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .is('read_at', null)
        .is('deleted_at', null);

      if (data) {
        // One row per unread message, so tally per sender rather than collapsing
        // to a set — the card badge shows the count.
        const counts = new Map<string, number>();
        for (const m of data) {
          if (!m.sender_id) continue;
          counts.set(m.sender_id, (counts.get(m.sender_id) ?? 0) + 1);
        }
        setUnreadByTradie(counts);
      }
    } catch (err) {
      console.error('fetchUnreadCounts error:', err);
    }
  };

  const handleOpenChat = (tradie: TradieWithDetails) => {
    setChatTradie(tradie);
    setUnreadByTradie((prev) => {
      const next = new Map(prev);
      next.delete(tradie.id);
      return next;
    });
    supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', tradie.id)
      .eq('receiver_id', user!.id)
      .is('read_at', null)
      .then(() => {});
  };

  const handleRemoveTradie = async (tradie: TradieWithDetails) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('my_trades')
        .delete()
        .eq('client_id', user.id)
        .eq('tradie_id', tradie.id);

      if (error) throw error;

      setSavedTradies(savedTradies.filter((t) => t.id !== tradie.id));
      const isPro = tradie.tradie_details?.subscription_tier === 'pro' || tradie.tradie_details?.subscription_tier === 'business';
      showToast(`${isPro ? (tradie.tradie_details?.business_name || tradie.full_name) : redactName(tradie.full_name)} removed`);
    } catch {
      showToast('Failed to remove tradie. Please try again.', true);
    }
  };

  const handleRequestQuote = async (tradie: TradieWithDetails) => {
    if (!user) return;
    setQuoteRequestTradie(tradie);
    setLoadingQuoteJobs(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, description, location_address')
        .eq('client_id', user.id)
        .in('status', ['pending', 'accepted'])
        .is('archived_at', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) console.error('Failed to fetch jobs:', error);
      setClientPendingJobs(data || []);
    } catch {
      setClientPendingJobs([]);
    } finally {
      setLoadingQuoteJobs(false);
    }
  };

  const sendQuoteInvitation = async (jobId: string) => {
    if (!user || !quoteRequestTradie) return;
    setSendingInvite(true);
    try {
      const clientName = profile?.full_name || 'A client';
      await supabase.rpc('create_notification', {
        p_user_id: quoteRequestTradie.id,
        p_title: 'Quote invitation',
        p_message: `${clientName} has invited you to quote on a job`,
        p_type: 'new_job',
        p_channel: 'in_app',
        p_read: false,
        p_job_id: jobId,
        p_metadata: { invited: true, invited_by: user.id },
      });
      showToast('Quote request sent! The tradie will be notified.');
      setQuoteRequestTradie(null);
    } catch {
      showToast('Failed to send quote request. Please try again.', true);
    } finally {
      setSendingInvite(false);
    }
  };

  return (
    <DashboardLayout>
      <WelcomeGuide role="client" userName={profile?.full_name} />
      {showOnboardedBanner && (
        <div className="mb-4">
          <div className="bg-gradient-to-r from-ct-teal to-ct-surface-2 border border-ct-line rounded-ct-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-ct-teal mb-1">Welcome to ConnecTradie!</h3>
              <p className="text-sm text-ct-teal">Post your first job to get quotes from verified tradies in your area.</p>
            </div>
            <Link to="/post-lead" className="flex-shrink-0 px-4 py-2.5 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors text-sm text-center min-h-[44px] inline-flex items-center justify-center">
              Post a Job
            </Link>
          </div>
        </div>
      )}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">
              Welcome back, {profile?.full_name?.split(' ')[0]}!
            </h1>
            <p className="text-ct-mute-2 mt-1">Your jobs, quotes, and personalised recommendations</p>
          </div>
          <Link
            to="/search"
            data-tour="find-tradie"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors min-h-[44px]"
          >
            <Plus className="w-5 h-5" />
            Find New Tradie
          </Link>
        </div>

        {/* ── Needs Your Attention — consolidated action items ── */}
        {(() => {
          const awaitingRelease = recentJobs.filter(j => !j.archived_at && j.status === 'completed' && !releasedJobIds.has(j.id));
          const jobsWithQuotes = recentJobs.filter(j => !j.archived_at && j.status === 'pending' && j.quote_count > 0);
          const hasPendingPayments = pendingPayments.length > 0;
          const hasInvoices = invoices.length > 0;
          const totalItems = awaitingRelease.length + jobsWithQuotes.length + (hasPendingPayments ? pendingPayments.length : 0) + (hasInvoices ? invoices.length : 0);

          if (totalItems === 0) return null;

          return (
            <div id="attention-section" className="mb-8 bg-ct-surface border-2 border-ct-amber/[0.34] rounded-ct-lg overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-ct-amber/[0.13] border-b border-ct-amber/[0.34] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-ct-amber" />
                <h2 className="text-sm font-semibold text-ct-paper">
                  {totalItems === 1 ? '1 item needs your attention' : `${totalItems} items need your attention`}
                </h2>
              </div>
              <div className="divide-y divide-ct-line-soft">
                {awaitingRelease.map(job => {
                  const category = job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
                  const label = (job.title || category || 'Job').toString();
                  return (
                    <div key={`release-${job.id}`} className="px-3 sm:px-5 py-3 flex items-center gap-3 hover:bg-ct-surface-2 transition-colors">
                      <div className="w-8 h-8 bg-ct-teal/[0.14] rounded-full flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-ct-teal" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ct-paper truncate capitalize">{label}</p>
                        <p className="text-xs text-ct-mute">Tradie finished — release payment & leave a review</p>
                      </div>
                      <button
                        onClick={() => handleReleasePayment(job.id)}
                        disabled={releasingJobId === job.id}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-ct-teal text-ct-ink text-xs font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-60 transition-colors min-h-[44px]"
                      >
                        {releasingJobId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Release & Review
                      </button>
                    </div>
                  );
                })}
                {jobsWithQuotes.map(job => {
                  const category = job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
                  const label = (job.title || category || 'Job').toString();
                  const isRecurring = recurringJobIds.has(job.id);
                  return (
                    <Link key={`quote-${job.id}`} to={isRecurring ? `/leads?tab=ongoing&job=${job.id}` : `/leads?job=${job.id}`} className="px-5 py-3 flex items-center gap-3 hover:bg-ct-surface-2 transition-colors">
                      <div className="w-8 h-8 bg-ct-surface-2 rounded-full flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4 text-ct-mute-2" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ct-paper truncate capitalize">{label}</p>
                        <p className="text-xs text-ct-mute">{job.quote_count} quote{job.quote_count !== 1 ? 's' : ''} received — review & accept</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ct-mute flex-shrink-0" />
                    </Link>
                  );
                })}
                {pendingPayments.map(pp => (
                  <div key={`pay-${pp.id}`} className="px-3 sm:px-5 py-3 flex items-center gap-3 hover:bg-ct-surface-2 transition-colors">
                    <div className="w-8 h-8 bg-ct-amber/[0.13] rounded-full flex items-center justify-center flex-shrink-0">
                      <CreditCard className="w-4 h-4 text-ct-amber" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ct-paper truncate">{pp.jobTitle}</p>
                      <p className="text-xs text-ct-mute">${(pp.amount / 100).toFixed(2)} — payment incomplete</p>
                    </div>
                    <button
                      onClick={async () => {
                        setPayingPendingId(pp.id);
                        try {
                          const { url } = await createJobPaymentCheckout(pp.id);
                          if (url) window.location.href = url;
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'Failed to start payment', true);
                        } finally {
                          setPayingPendingId(null);
                        }
                      }}
                      disabled={payingPendingId === pp.id}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-ct-amber/[0.13]0 text-ct-ink text-xs font-medium rounded-ct-sm hover:bg-ct-amber disabled:opacity-60 transition-colors min-h-[44px]"
                    >
                      {payingPendingId === pp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                      Pay Now
                    </button>
                  </div>
                ))}
                {invoices.map(inv => (
                  <Link key={`inv-${inv.id}`} to="/payments" className="px-5 py-3 flex items-center gap-3 hover:bg-ct-surface-2 transition-colors">
                    <div className="w-8 h-8 bg-ct-surface-2 rounded-full flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-ct-mute-2" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ct-paper truncate">Invoice — {(inv as unknown as Record<string, unknown>).status === 'overdue' ? 'Overdue' : 'Needs approval'}</p>
                      <p className="text-xs text-ct-mute">Review and approve or dispute</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-ct-mute flex-shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {availableThisWeek > 0 && showSlotsBanner && (
          <div className="mb-8 p-4 bg-gradient-to-r from-ct-amber to-ct-amber border border-ct-amber/[0.34] rounded-ct-md flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="w-10 h-10 bg-ct-amber/[0.13] rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-ct-amber animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-ct-paper">
                One of your saved tradies opened up slots this week
              </p>
              <p className="text-sm text-ct-paper mt-0.5">
                Check their calendars now — popular times fill up fast
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSlotsBanner(false);
                try { sessionStorage.setItem('dismissed_slots_banner', '1'); } catch { /* private mode — non-critical */ }
              }}
              aria-label="Dismiss"
              className="p-1.5 -m-1 text-ct-amber hover:text-ct-paper hover:bg-ct-amber/[0.13] rounded-ct-sm transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 min-w-0 space-y-8">
            {/* My Recent Jobs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-ct-paper flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-ct-teal" />
                  My Jobs
                </h2>
                <div className="flex items-center gap-3">
                  <Link to="/leads" className="text-sm font-medium text-ct-mute-2 hover:text-ct-mute-2 flex items-center gap-1">
                    View All <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {/* Job tabs — underline style, matching the client My Jobs page (/leads)
                  and every other tab strip in the app. */}
              <div className="overflow-x-auto -mx-1 px-1 border-b border-ct-line mb-4 scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="flex items-center gap-3 sm:gap-6 flex-nowrap">
                  {([
                    { key: 'active' as const, label: 'Active', count: recentJobs.filter(j => !j.archived_at && j.status === 'pending').length },
                    { key: 'accepted' as const, label: 'Accepted', count: recentJobs.filter(j => !j.archived_at && !recurringJobIds.has(j.id) && ((j.status !== null && ['accepted', 'funded', 'in_progress'].includes(j.status)) || (j.status === 'completed' && (!releasedJobIds.has(j.id) || !reviewedJobIds.has(j.id))))).length },
                    { key: 'completed' as const, label: 'Completed', count: recentJobs.filter(j => !j.archived_at && j.status === 'completed' && releasedJobIds.has(j.id) && reviewedJobIds.has(j.id)).length },
                  ]).map(tab => {
                    // Archived is a peer tab, so a tab is only current when we aren't
                    // showing the archive — otherwise Active and Archived both highlight.
                    const isActive = jobTab === tab.key && !showArchived;
                    // Amber underline on the Accepted tab when there are active jobs
                    // sitting in it — visual nudge so the client doesn't forget about a
                    // paid job they need to release or review. The active warm underline
                    // takes precedence once the tab is selected.
                    const needsAttention = tab.key === 'accepted' && tab.count > 0;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => { setJobTab(tab.key); setShowArchived(false); }}
                        className={`pb-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                          isActive
                            ? 'border-ct-teal text-ct-amber'
                            : needsAttention
                              ? 'border-ct-amber/[0.34] text-ct-mute hover:text-ct-mute-2'
                              : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
                        }`}
                      >
                        {tab.label} {tab.count > 0 && `(${tab.count})`}
                      </button>
                    );
                  })}
                  {recentJobs.some(j => j.archived_at) && (
                    <button
                      onClick={() => { setShowArchived(!showArchived); setJobTab('active'); }}
                      className={`inline-flex items-center gap-1.5 pb-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                        showArchived
                          ? 'border-ct-teal text-ct-amber'
                          : 'border-transparent text-ct-mute hover:text-ct-mute-2 hover:border-ct-line'
                      }`}
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archived ({recentJobs.filter(j => j.archived_at).length})
                    </button>
                  )}
                </div>
              </div>

              {recentJobs.filter(j => showArchived
                ? j.archived_at
                : jobTab === 'active'
                  ? !j.archived_at && j.status === 'pending'
                  : jobTab === 'accepted'
                    ? !j.archived_at && !recurringJobIds.has(j.id) && ((j.status !== null && ['accepted', 'funded', 'in_progress'].includes(j.status)) || (j.status === 'completed' && (!releasedJobIds.has(j.id) || !reviewedJobIds.has(j.id))))
                    : !j.archived_at && j.status === 'completed' && releasedJobIds.has(j.id) && reviewedJobIds.has(j.id)
              ).length === 0 && recentJobs.length > 0 ? (
                <div className="bg-ct-surface-2 rounded-ct-lg border border-ct-line p-8 text-center">
                  <Archive className="w-10 h-10 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute-2 font-medium">
                    {showArchived ? 'No archived jobs' : jobTab === 'completed' ? 'No completed jobs yet' : jobTab === 'accepted' ? 'No accepted jobs' : 'No active jobs'}
                  </p>
                  <p className="text-sm text-ct-mute mt-1">
                    {showArchived ? 'Archived jobs will appear here' : jobTab === 'completed' ? 'Jobs will appear here once payment is released' : jobTab === 'accepted' ? 'Jobs will move here once a quote is accepted' : 'Post a job to get started'}
                  </p>
                </div>
              ) : recentJobs.length === 0 ? (
                <div className="bg-gradient-to-br from-ct-teal to-ct-surface-2 rounded-ct-lg border border-ct-amber/[0.34] p-8 sm:p-10">
                  <h3 className="text-lg font-bold text-ct-paper mb-2">Get started</h3>
                  <p className="text-ct-mute-2 mb-6 max-w-lg">
                    Post a job to get quotes from verified tradies, or browse and save tradies you like.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <Link
                      to="/post-lead"
                      data-tour="post-job"
                      className="flex items-center gap-4 p-4 bg-ct-surface rounded-ct-lg border border-ct-line hover:border-ct-teal/30 hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 bg-ct-amber/[0.13] rounded-ct-md flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-ct-amber">1</span>
                      </div>
                      <div>
                        <p className="font-semibold text-ct-paper">Post a Job</p>
                        <p className="text-sm text-ct-mute">Describe what you need — takes 60 seconds</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ct-mute ml-auto flex-shrink-0" />
                    </Link>
                    <Link
                      to="/search"
                      className="flex items-center gap-4 p-4 bg-ct-surface rounded-ct-lg border border-ct-line hover:border-ct-teal/30 hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 bg-ct-surface-2 rounded-ct-md flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-ct-mute-2">2</span>
                      </div>
                      <div>
                        <p className="font-semibold text-ct-paper">Find a Tradie</p>
                        <p className="text-sm text-ct-mute">Find and save tradies near you</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-ct-mute ml-auto flex-shrink-0" />
                    </Link>
                  </div>
                  <p className="text-xs text-ct-mute">
                    Once you post a job, tradies will send you quotes. Compare them side by side, then accept the best one and message the tradie to confirm details.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const filtered = recentJobs
                      .filter(j => showArchived
                        ? j.archived_at
                        : jobTab === 'active'
                          ? !j.archived_at && j.status === 'pending'
                          : jobTab === 'accepted'
                            ? !j.archived_at && !recurringJobIds.has(j.id) && ((j.status !== null && ['accepted', 'funded', 'in_progress'].includes(j.status)) || (j.status === 'completed' && (!releasedJobIds.has(j.id) || !reviewedJobIds.has(j.id))))
                            : !j.archived_at && j.status === 'completed' && releasedJobIds.has(j.id) && reviewedJobIds.has(j.id)
                      )
                      .slice(0, jobTab === 'completed' ? 200 : 20);

                    // For completed tab: group by month with collapsible sections
                    if (jobTab === 'completed' && filtered.length > 0) {
                      const monthGroups = new Map<string, typeof filtered>();
                      for (const j of filtered) {
                        const d = new Date(j.created_at);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        if (!monthGroups.has(key)) monthGroups.set(key, []);
                        monthGroups.get(key)!.push(j);
                      }
                      const sortedMonths = [...monthGroups.keys()].sort((a, b) => b.localeCompare(a));
                      return (<>{sortedMonths.map((monthKey, idx) => {
                        const monthJobs = monthGroups.get(monthKey)!;
                        const [yr, mo] = monthKey.split('-');
                        const monthLabel = new Date(Number(yr), Number(mo) - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                        return (
                          <details key={monthKey} open={idx === 0} className="group/month">
                            <summary className="flex items-center justify-between px-4 py-2.5 bg-ct-surface-2 rounded-ct-md cursor-pointer hover:bg-ct-surface-2 transition-colors select-none list-none mb-2">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="w-4 h-4 text-ct-mute transition-transform group-open/month:rotate-0 -rotate-90" />
                                <span className="text-sm font-semibold text-ct-paper">{monthLabel}</span>
                              </div>
                              <span className="text-xs text-ct-mute">{monthJobs.length} job{monthJobs.length !== 1 ? 's' : ''}</span>
                            </summary>
                            <div className="space-y-3 mb-4">
                              {monthJobs.map((job) => {
                                const categoryMatch = job.description.match(/^\[([^\]]+)\]/);
                                const categoryRaw = categoryMatch ? categoryMatch[1] : null;
                                const category = categoryRaw ? categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : null;
                                const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
                                const isReleased = releasedJobIds.has(job.id);
                                const isReviewed = reviewedJobIds.has(job.id);
                                const statusLabel = 'Paid';
                                const statusColor = 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30';
                                const accentColor = 'bg-ct-teal';
                                return (
                                  <Link key={job.id} to={recurringJobIds.has(job.id) ? `/leads?tab=ongoing&job=${job.id}` : `/leads?job=${job.id}`} className="group block rounded-ct-lg overflow-hidden border bg-ct-surface shadow-sm hover:shadow-lg hover:border-ct-line transition-all">
                                    <div className="flex">
                                      <div className={`w-1.5 flex-shrink-0 ${accentColor}`} />
                                      <div className="flex-1 min-w-0">
                                        <div className="px-5 py-4">
                                          <div className="flex items-start justify-between gap-3 mb-2">
                                            <h3 className="text-base font-bold text-ct-paper leading-snug capitalize line-clamp-2">{(job.title || category || 'Untitled Job').replace(/_/g, ' ')}</h3>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${statusColor}`}>{statusLabel}</span>
                                          </div>
                                          <p className="text-sm text-ct-mute line-clamp-3">{desc}</p>
                                        </div>
                                        {isReleased && isReviewed && (
                                          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-ct-line-soft">
                                            <span className="text-xs text-ct-mute">Payment released to tradie</span>
                                            <div className="flex items-center gap-2 flex-wrap">
                                              {!recurringJobIds.has(job.id) && (
                                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBonusTarget({ jobId: job.id, jobLabel: (job.title || category || 'the job').toString() }); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface border border-ct-amber/[0.34] text-ct-amber text-xs font-semibold rounded-ct-sm hover:bg-ct-amber/[0.13] transition-colors">
                                                  <Gift className="w-3.5 h-3.5" /> Give extra
                                                </button>
                                              )}
                                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-semibold rounded-ct-sm"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}</>);
                    }

                    return filtered.map((job) => {

                    const categoryMatch = job.description.match(/^\[([^\]]+)\]/);
                    const categoryRaw = categoryMatch ? categoryMatch[1] : null;
                    const category = categoryRaw ? categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
                    const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
                    const isArchived = !!job.archived_at;

                    const isReleased = releasedJobIds.has(job.id);
                    const isReviewed = reviewedJobIds.has(job.id);
                    const statusLabel = isArchived ? 'Archived'
                      : job.status === 'completed' && isReleased ? 'Paid'
                      : job.status === 'completed' ? 'Awaiting Release'
                      : job.status === 'in_progress' ? 'In Progress'
                      : job.status === 'funded' ? 'Paid — Tradie Assigned'
                      : job.status === 'accepted' ? 'Accepted'
                      : job.quoting_status === 'awarded' ? 'Awarded'
                      : job.quote_count > 0 ? `${job.quote_count} Quote${job.quote_count !== 1 ? 's' : ''}`
                      : 'Waiting';

                    const statusColor = isArchived ? 'bg-ct-surface-2 text-ct-mute-2 border-ct-line'
                      : job.status === 'completed' && isReleased ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30'
                      : job.status === 'completed' ? 'bg-ct-amber/[0.13] text-ct-amber border-ct-amber/[0.34]'
                      : job.status === 'in_progress' ? 'bg-ct-surface-2 text-ct-mute-2 border-ct-line'
                      : job.status === 'funded' ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30'
                      : job.quoting_status === 'awarded' ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30'
                      : job.quote_count > 0 ? 'bg-ct-surface-2 text-ct-mute-2 border-ct-line'
                      : 'bg-ct-surface-2 text-ct-mute-2 border-ct-line';

                    const accentColor = isArchived ? 'bg-ct-line'
                      : job.status === 'completed' && isReleased ? 'bg-ct-teal'
                      : job.status === 'completed' ? 'bg-ct-amber'
                      : job.status === 'in_progress' ? 'bg-ct-surface-2'
                      : job.status === 'funded' ? 'bg-ct-teal'
                      : job.quoting_status === 'awarded' ? 'bg-ct-teal'
                      : job.quote_count > 0 ? 'bg-ct-surface-2'
                      : 'bg-ct-teal';

                    const SLOT_LABELS: Record<string, string> = { morning: '7-9 AM', midday: '10 AM-12 PM', afternoon: '1-5 PM' };

                    return (
                      <React.Fragment key={job.id}>
                        <Link
                          to={recurringJobIds.has(job.id) ? `/leads?tab=ongoing&job=${job.id}` : `/leads?job=${job.id}`}
                          className={`group block rounded-ct-lg overflow-hidden border bg-ct-surface shadow-sm hover:shadow-lg hover:border-ct-line transition-all ${isArchived ? 'opacity-75' : ''}`}
                        >
                        <div className="flex">
                          {/* Left accent bar */}
                          <div className={`w-1.5 flex-shrink-0 ${accentColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="px-4 sm:px-5 py-4">
                              {/* Header: title + status badge + archive icon */}
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="text-base font-bold text-ct-paper leading-snug capitalize line-clamp-2">
                                  {(job.title || category || 'Untitled Job').replace(/_/g, ' ')}
                                </h3>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                                    {statusLabel}
                                  </span>
                                  {!isArchived && job.status === 'pending' && !job.tradie_id && (
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCancelJobTarget(job); }}
                                      className="p-1.5 text-ct-mute hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                      title="Cancel job"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {!isArchived && (
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveJob(job.id); }}
                                      className="p-1.5 text-ct-mute hover:text-ct-mute hover:bg-ct-surface-2 rounded-ct-sm transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                      title="Archive job"
                                    >
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {isArchived && (
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); unarchiveJob(job.id); }}
                                      className="p-1.5 text-ct-mute hover:text-ct-mute hover:bg-ct-surface-2 rounded-ct-sm transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                      title="Restore job"
                                    >
                                      <ArchiveRestore className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Description */}
                              <p className="text-sm text-ct-mute mb-3 line-clamp-3 leading-relaxed">{desc}</p>

                              {/* Details row */}
                              <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap text-xs text-ct-mute">
                                {category && (
                                  <span className="inline-flex items-center gap-1 text-ct-mute-2 font-medium">
                                    <Briefcase className="w-3 h-3 text-ct-mute" />
                                    {category}
                                  </span>
                                )}
                                {job.location_address && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-ct-mute" />
                                    {job.location_address.split(',')[0]}
                                  </span>
                                )}
                                {job.scheduled_date && (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarClock className="w-3 h-3 text-ct-mute-2" />
                                    <span className="text-ct-mute-2 font-medium">
                                      {new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                    </span>
                                  </span>
                                )}
                                {job.preferred_time_slot && SLOT_LABELS[job.preferred_time_slot] && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-ct-mute" />
                                    {SLOT_LABELS[job.preferred_time_slot]}
                                  </span>
                                )}
                                {job.budget_amount ? (
                                  <span className="inline-flex items-center font-bold text-ct-teal">
                                    ${job.budget_amount.toLocaleString()}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* Footer with action */}
                            {job.status === 'completed' && !isReleased && (
                              <div className="flex items-center justify-between px-5 py-3 border-t border-ct-line-soft">
                                <span className="text-xs text-ct-mute">Tradie finished the work</span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleReleasePayment(job.id);
                                  }}
                                  disabled={releasingJobId === job.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-semibold rounded-ct-sm hover:bg-ct-teal disabled:opacity-60 transition-colors"
                                >
                                  {releasingJobId === job.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  Release & Review
                                </button>
                              </div>
                            )}
                            {job.status === 'completed' && isReleased && !isReviewed && (
                              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-ct-line-soft">
                                <span className="text-xs text-ct-mute">Payment released — how was the job?</span>
                                <div className="flex items-center gap-2">
                                  {!recurringJobIds.has(job.id) && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setBonusTarget({
                                          jobId: job.id,
                                          jobLabel: (job.title || category || 'the job').toString(),
                                        });
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface border border-ct-amber/[0.34] text-ct-amber text-xs font-semibold rounded-ct-sm hover:bg-ct-amber/[0.13] transition-colors"
                                    >
                                      <Gift className="w-3.5 h-3.5" />
                                      Give extra
                                    </button>
                                  )}
                                  <Link
                                    to={`/review/${job.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-semibold rounded-ct-sm hover:brightness-110 transition-colors"
                                  >
                                    <Star className="w-3.5 h-3.5" />
                                    Leave a Review
                                  </Link>
                                </div>
                              </div>
                            )}
                            {job.status === 'completed' && isReleased && isReviewed && (
                              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-ct-line-soft">
                                <span className="text-xs text-ct-mute">Payment released to tradie</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {!recurringJobIds.has(job.id) && (
                                    <button
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setBonusTarget({
                                          jobId: job.id,
                                          jobLabel: (job.title || category || 'the job').toString(),
                                        });
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface border border-ct-amber/[0.34] text-ct-amber text-xs font-semibold rounded-ct-sm hover:bg-ct-amber/[0.13] transition-colors"
                                    >
                                      <Gift className="w-3.5 h-3.5" />
                                      Give extra
                                    </button>
                                  )}
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-semibold rounded-ct-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Paid
                                  </span>
                                </div>
                              </div>
                            )}
                            {pendingIncreases[job.id] && (job.status !== null && ['funded', 'in_progress', 'completed'].includes(job.status)) && (
                              <div className="px-5 py-3 border-t border-ct-amber/[0.34] bg-ct-amber/[0.13]">
                                <div className="flex items-center gap-2 text-sm font-medium text-ct-paper mb-2">
                                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                  <span>Price adjusted after site visit</span>
                                </div>
                                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-ct-amber mb-3 ml-6">
                                  <span>Original: <span className="font-semibold">${pendingIncreases[job.id].originalAmount.toFixed(2)}</span></span>
                                  <span className="text-ct-amber">→</span>
                                  <span>Final: <span className="font-semibold">${pendingIncreases[job.id].finalAmount.toFixed(2)}</span></span>
                                  <span className="text-ct-amber">|</span>
                                  <span>Additional: <span className="font-semibold text-ct-paper">${pendingIncreases[job.id].amount.toFixed(2)}</span></span>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const inc = pendingIncreases[job.id];
                                      setPayingIncreaseJobId(job.id);
                                      payPriceIncrease(inc.paymentId, job.id)
                                        .then(({ url }) => { window.location.href = url; })
                                        .catch((err) => {
                                          console.error('Pay price increase failed:', err);
                                          showToast(err instanceof Error ? err.message : 'Failed to start payment', true);
                                          setPayingIncreaseJobId(null);
                                        });
                                    }}
                                    disabled={payingIncreaseJobId === job.id}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-amber/[0.13]0 text-ct-ink text-sm font-medium rounded-ct-sm hover:bg-ct-amber transition-colors disabled:opacity-60"
                                  >
                                    {payingIncreaseJobId === job.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <CreditCard className="w-3.5 h-3.5" />
                                    )}
                                    Pay Difference — ${pendingIncreases[job.id].amount.toFixed(2)}
                                  </button>
                                </div>
                              </div>
                            )}
                            {job.status === 'in_progress' && !pendingIncreases[job.id] && (
                              <div className="flex items-center justify-between px-5 py-3 border-t border-ct-line-soft">
                                <span className="text-xs text-ct-mute">Click to check progress</span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-surface-2 !text-ct-ink text-xs font-semibold rounded-ct-sm">
                                  <Eye className="w-3.5 h-3.5 text-ct-ink" />
                                  In Progress
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        </Link>
                      </React.Fragment>
                    );
                  });
                  })()}

                  <Link
                    to="/post-lead"
                    className="flex items-center justify-center gap-2 p-2.5 rounded-ct-md border-2 border-dashed border-ct-line text-sm font-medium text-ct-mute hover:border-ct-teal/30 hover:text-ct-amber transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Post Another Job
                  </Link>

                </div>
              )}
            </div>


            {/* Ongoing Services */}
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
              <div className="flex items-center justify-between mb-4">
                <Link to="/leads?tab=services" className="font-semibold text-ct-paper flex items-center gap-2 hover:text-ct-mute-2 transition-colors">
                  <Repeat className="w-4 h-4 text-ct-mute-2" />
                  Ongoing Services
                </Link>
                <button
                  onClick={() => setShowRecurringForm(!showRecurringForm)}
                  className="p-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-ct-sm text-ct-mute-2 hover:bg-ct-surface-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {!showRecurringForm && recurringJobs.length > 0 && (
                <button
                  onClick={() => setShowRecurringForm(true)}
                  className="w-full text-center text-xs text-ct-mute-2 hover:text-ct-mute-2 font-medium py-1.5 mb-3 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                >
                  + Set up a new ongoing service
                </button>
              )}

              {showRecurringForm && (
                <RecurringJobForm
                  onSave={async (data) => {
                    const { budget, preferred_time, allows_site_inspection, ...rest } = data;
                    const serviceLabel = rest.service_subtype || rest.trade_category.replace(/_/g, ' ');
                    // 1. Create a jobs record so it enters the quote pipeline (same as one-off)
                    const { data: job, error: jobErr } = await supabase
                      .from('jobs')
                      .insert({
                        client_id: user!.id,
                        title: serviceLabel,
                        description: `[${rest.trade_category}] ${rest.description}`,
                        status: 'pending',
                        location_address: rest.location || null,
                        budget_type: budget ? 'fixed_budget' : 'request_quote',
                        budget_amount: budget ?? null,
                        is_emergency: false,
                        priority: 'normal',
                        max_quotes: 3,
                        scheduled_date: rest.next_due_date,
                        preferred_time_slot: preferred_time || null,
                        allows_site_inspection: allows_site_inspection ?? true,
                      })
                      .select('id')
                      .single();
                    if (jobErr) throw new Error(jobErr.message);
                    // 2. Create the recurring job linked to the jobs record
                    const recurring = await createRecurringJob({ ...rest, agreed_price: budget, preferred_time, original_job_id: job.id });
                    // 3. Backlink the job to the recurring service so acceptance can sync the agreed price
                    if (recurring?.id) {
                      await supabase.from('jobs').update({ recurring_job_id: recurring.id }).eq('id', job.id);
                    }
                  }}
                  onCancel={() => setShowRecurringForm(false)}
                  onDone={() => { setShowRecurringForm(false); fetchRecurring(); showToast('Ongoing service scheduled'); }}
                  onSendQuote={async (job) => {
                    await sendQuoteRequest(job, 'saved');
                  }}
                  savedTradies={savedTradies}
                />
              )}

              {recurringJobs.filter(j => j.is_active).length === 0 && !showRecurringForm ? (
                <div className="bg-ct-surface-2 rounded-ct-md p-5 border border-ct-line-soft text-center">
                  <RefreshCw className="w-7 h-7 text-ct-mute mx-auto mb-2" />
                  <p className="text-sm font-semibold text-ct-paper">Set up an ongoing service</p>
                  <p className="text-xs text-ct-mute mt-1">Schedule regular cleaning, lawn mowing, pool service and more. One setup, automatic reminders every cycle.</p>
                  <button
                    onClick={() => setShowRecurringForm(true)}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-medium hover:brightness-110 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Schedule a Service
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const activeRecurring = recurringJobs.filter(j => j.is_active);
                    const visibleRecurring = activeRecurring.slice(0, 3);
                    const hiddenRecurringCount = activeRecurring.length - visibleRecurring.length;
                    return <>
                  {visibleRecurring.map(job => {
                    const dueDate = new Date(job.next_due_date);
                    const now = new Date();
                    const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
                    const isOverdue = daysUntil < 0;
                    const isDueSoon = daysUntil >= 0 && daysUntil <= job.reminder_days_before;
                    const isEditing = editingJobId === job.id;

                    if (isEditing) {
                      return (
                        <RecurringJobEditForm
                          key={job.id}
                          job={job}
                          savedTradies={savedTradies}
                          onSave={async (updates) => {
                            try {
                              await updateRecurringJob(job.id, updates);
                              setEditingJobId(null);
                              fetchRecurring();
                              showToast('Ongoing service updated');
                            } catch {
                              showToast('Failed to update service', true);
                            }
                          }}
                          onCancel={() => setEditingJobId(null)}
                        />
                      );
                    }


                    return (
                      <div key={job.id} className={`rounded-ct-md border transition-all ${isOverdue ? 'border-ct-rose/[0.34] bg-ct-rose/[0.13]/50' : isDueSoon ? 'border-ct-amber/[0.34] bg-ct-amber/[0.13]/30' : 'border-ct-line bg-ct-surface'}`}>
                        <div className="p-3 cursor-pointer hover:bg-ct-surface/50 transition-colors rounded-t-ct-lg" onClick={() => navigate('/leads?tab=services')} role="button" tabIndex={0}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ct-paper truncate capitalize">
                                {job.service_subtype || job.trade_category.replace(/_/g, ' ')}
                                <span className="text-xs text-ct-mute font-normal ml-1">
                                  {job.service_subtype && <>{' · '}<span className="capitalize">{job.trade_category.replace(/_/g, ' ')}</span></>}
                                  {' · '}{job.frequency_months === -3 ? 'Daily' : job.frequency_months === -1 ? 'Weekly' : job.frequency_months === -2 ? 'Fortnightly' : job.frequency_months === 1 ? 'Monthly' : job.frequency_months === 3 ? 'Quarterly' : job.frequency_months === 6 ? 'Every 6mo' : job.frequency_months === 12 ? 'Annually' : `Every ${job.frequency_months}mo`}
                                </span>
                              </p>
                              <p className="text-xs text-ct-mute truncate">{job.description}</p>
                              {job.location && (
                                <p className="text-xs text-ct-mute mt-1 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {job.location}
                                </p>
                              )}
                              {job.tradie?.full_name ? (
                                <p className="text-xs text-ct-mute-2 mt-1">
                                  Assigned: <span className="font-medium text-ct-paper">{job.tradie.full_name}</span>
                                </p>
                              ) : (
                                <p className="text-xs text-ct-mute mt-1 italic">No tradie assigned</p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-xs ${isOverdue ? 'font-medium text-ct-rose' : isDueSoon ? 'text-ct-amber' : 'text-ct-mute'}`}>
                                  {isOverdue ? `Overdue by ${Math.abs(daysUntil)} days` : isDueSoon ? `Due in ${daysUntil} days` : `Next: ${dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setEditingJobId(job.id)}
                                className="p-2 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                                title="Edit ongoing service"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await pauseRecurringJob(job.id, 'client');
                                    fetchRecurring();
                                    showToast('Service paused — you can resume it anytime');
                                  } catch {
                                    showToast('Failed to pause service', true);
                                  }
                                }}
                                className="p-2 text-ct-mute hover:text-ct-amber hover:bg-ct-amber/[0.13] rounded-ct-sm transition-colors"
                                title="Pause ongoing service"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Smart CTA */}
                        <div className="px-3 pb-2.5 pt-0.5" onClick={e => e.stopPropagation()}>
                          {(() => {
                            const sessions = jobSessions[job.id] ?? [];
                            const pendingSession = sessions.find(s => s.status === 'pending_confirmation');
                            const nextSession = sessions.find(s => s.status === 'scheduled');
                            const nextSessionDays = nextSession
                              ? Math.ceil((new Date(nextSession.scheduled_date).getTime() - new Date().getTime()) / 86400000)
                              : null;

                            // Check if tradie has already completed jobs for this service
                            const hasCompletedWork = job.times_completed > 0;

                            if (sentRecurringIds.has(job.id)) {
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-surface-2 text-ct-mute rounded-ct-sm text-xs font-medium border border-ct-line cursor-not-allowed">
                                  <Clock className="w-3.5 h-3.5" />
                                  Awaiting Quote...
                                </div>
                              );
                            }
                            if (pendingSession) {
                              const pendingDate = new Date(pendingSession.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-amber/[0.13] text-ct-amber rounded-ct-sm text-xs font-medium border border-ct-amber/[0.34]">
                                  <Clock className="w-3.5 h-3.5" />
                                  Next: {pendingDate} — awaiting tradie confirmation
                                </div>
                              );
                            }
                            if (nextSessionDays !== null && nextSessionDays <= 3 && nextSessionDays >= 0) {
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-amber/[0.13] text-ct-amber rounded-ct-sm text-xs font-medium border border-ct-amber/[0.34]">
                                  <CalendarClock className="w-3.5 h-3.5" />
                                  Session in {nextSessionDays === 0 ? 'today' : `${nextSessionDays} day${nextSessionDays !== 1 ? 's' : ''}`}
                                </div>
                              );
                            }
                            if (nextSession) {
                              const nextDate = new Date(nextSession.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-teal/[0.14] text-ct-teal rounded-ct-sm text-xs font-medium border border-ct-teal/30">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Next session: {nextDate}
                                </div>
                              );
                            }
                            if (sessions.length > 0) {
                              const isExpanded = expandedSessions.has(job.id);
                              return (
                                <button
                                  onClick={() => setExpandedSessions(prev => {
                                    const next = new Set(prev);
                                    if (next.has(job.id)) next.delete(job.id);
                                    else next.add(job.id);
                                    return next;
                                  })}
                                  className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 border border-ct-teal/30 text-ct-teal rounded-ct-sm text-xs font-medium hover:bg-ct-teal/[0.14] transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  {isExpanded ? 'Hide Sessions' : `View ${sessions.length} Sessions`}
                                </button>
                              );
                            }
                            // Service has completed work — next session will be auto-created
                            if (hasCompletedWork && job.tradie?.full_name) {
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-teal/[0.14] text-ct-teal rounded-ct-sm text-xs font-medium border border-ct-teal/30">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Active with {job.tradie.full_name.split(' ')[0]} — next session auto-scheduled
                                </div>
                              );
                            }
                            // Tradie assigned AND a price already agreed (e.g. via an
                            // accepted quote) — the service is set up, no quote needed.
                            // The first session is auto-scheduled by the recurring cron.
                            if (job.tradie?.full_name && job.agreed_price && job.agreed_price > 0) {
                              return (
                                <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-teal/[0.14] text-ct-teal rounded-ct-sm text-xs font-medium border border-ct-teal/30">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Active with {job.tradie.full_name.split(' ')[0]} · ${job.agreed_price.toFixed(0)}/visit
                                </div>
                              );
                            }
                            // Tradie assigned but no price yet — request a quote to set the rate.
                            if (job.tradie?.full_name) {
                              return (
                                <button
                                  onClick={() => sendQuoteRequest(job, 'saved')}
                                  className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 transition-colors"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Send to {job.tradie.full_name.split(' ')[0]} & Request Quote
                                </button>
                              );
                            }
                            return (
                              <Link
                                to={`/search?trade=${encodeURIComponent(job.trade_category)}`}
                                className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 transition-colors"
                              >
                                <Briefcase className="w-3.5 h-3.5" />
                                Find a Tradie
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            );
                          })()}
                        </div>
                        {/* Sessions list — upcoming + grouped history */}
                        {!sessionsLoading.has(job.id) && (jobSessions[job.id] ?? []).length > 0 && (() => {
                          const allSessions = jobSessions[job.id] ?? [];
                          const today = new Date().toISOString().split('T')[0];
                          const upcoming = allSessions.filter(s => (s.actual_date || s.scheduled_date) >= today && s.status !== 'completed' && s.status !== 'skipped');
                          const past = allSessions.filter(s => !upcoming.includes(s));

                          // Group past sessions by month
                          const monthGroups: Record<string, RecurringSession[]> = {};
                          past.forEach(s => {
                            const d = s.actual_date || s.scheduled_date;
                            const key = d.slice(0, 7); // "2026-03"
                            if (!monthGroups[key]) monthGroups[key] = [];
                            monthGroups[key].push(s);
                          });
                          const sortedMonths = Object.keys(monthGroups).sort().reverse();

                          // Find matching invoice for a month
                          const getInvoiceForMonth = (monthKey: string) => {
                            return invoices.find(inv => {
                              if (!inv.billing_period_start) return false;
                              return inv.billing_period_start.slice(0, 7) === monthKey;
                            });
                          };

                          const isExpanded = expandedSessions.has(job.id);
                          const upcomingKey = `${job.id}_upcoming`;
                          const isUpcomingExpanded = expandedSessions.has(upcomingKey);
                          const visibleUpcoming = isUpcomingExpanded ? upcoming : upcoming.slice(0, 1);
                          const hiddenUpcomingCount = upcoming.length - visibleUpcoming.length;

                          return (
                            <div className="px-3 pb-3">
                              {/* Upcoming sessions — next one shown, rest behind toggle */}
                              {upcoming.length > 0 && (
                                <>
                                  <p className="text-xs font-medium text-ct-mute mb-2">Upcoming Sessions</p>
                                  <div className="space-y-2 mb-2">
                                    {visibleUpcoming.map(session => (
                                      <RecurringSessionCard
                                        key={session.id}
                                        session={session}
                                        recurringJobId={job.id}
                                        userRole="client"
                                        tradieId={job.tradie_id}
                                        clientId={user?.id}
                                        preferredTime={job.preferred_time}
                                        agreedPrice={job.agreed_price}
                                        serviceName={job.service_subtype || job.trade_category.replace(/_/g, ' ')}
                                        onUpdate={fetchRecurring}
                                      />
                                    ))}
                                  </div>
                                  {upcoming.length > 1 && (
                                    <button
                                      onClick={() => setExpandedSessions(prev => {
                                        const next = new Set(prev);
                                        if (next.has(upcomingKey)) next.delete(upcomingKey);
                                        else next.add(upcomingKey);
                                        return next;
                                      })}
                                      className="w-full text-center text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2 py-1.5 mb-3 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                                    >
                                      {isUpcomingExpanded ? 'Show less' : `View ${hiddenUpcomingCount} more upcoming`}
                                    </button>
                                  )}
                                  {upcoming.length === 1 && <div className="mb-3" />}
                                </>
                              )}

                              {/* Past sessions — grouped by month */}
                              {sortedMonths.length > 0 && (
                                <>
                                  {!isExpanded ? (
                                    <button
                                      onClick={() => setExpandedSessions(prev => new Set([...prev, job.id]))}
                                      className="w-full text-center text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2 py-1.5 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                                    >
                                      View past sessions ({past.length}) &rarr;
                                    </button>
                                  ) : (
                                    <>
                                      <p className="text-xs font-medium text-ct-mute mb-2">Past Sessions</p>
                                      <div className="space-y-2">
                                        {sortedMonths.map(monthKey => {
                                          const sessions = monthGroups[monthKey];
                                          const completed = sessions.filter(s => s.status === 'completed');
                                          const skipped = sessions.filter(s => s.status === 'skipped');
                                          const extras = sessions.filter(s => s.status === 'extra');
                                          const monthLabel = new Date(monthKey + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                                          const totalCost = completed.reduce((sum, s) => sum + (s.extra_cost ? Number(s.extra_cost) : (job.agreed_price ?? 0)), 0) + extras.reduce((sum, s) => sum + (s.extra_cost ? Number(s.extra_cost) : 0), 0);
                                          const invoice = getInvoiceForMonth(monthKey);
                                          const isMonthExpanded = expandedSessions.has(`${job.id}_${monthKey}`);

                                          return (
                                            <div key={monthKey} className="border border-ct-line-soft rounded-ct-sm overflow-hidden">
                                              <button
                                                onClick={() => setExpandedSessions(prev => {
                                                  const next = new Set(prev);
                                                  const key = `${job.id}_${monthKey}`;
                                                  if (next.has(key)) next.delete(key);
                                                  else next.add(key);
                                                  return next;
                                                })}
                                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-ct-surface-2 transition-colors"
                                              >
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span className="text-xs font-semibold text-ct-paper">{monthLabel}</span>
                                                  <span className="text-xs text-ct-mute">
                                                    {completed.length} session{completed.length !== 1 ? 's' : ''}
                                                    {extras.length > 0 ? ` + ${extras.length} extra` : ''}
                                                    {skipped.length > 0 ? ` · ${skipped.length} skipped` : ''}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                  {totalCost > 0 && (
                                                    <span className="text-xs font-semibold text-ct-mute-2">${totalCost.toFixed(2)}</span>
                                                  )}
                                                  {invoice && (
                                                    invoice.status === 'sent' && invoice.stripe_payment_url ? (
                                                      <a
                                                        href={invoice.stripe_payment_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-ct-teal text-ct-ink hover:brightness-110 transition-colors"
                                                      >
                                                        Pay Now
                                                        <ExternalLink className="w-2.5 h-2.5" />
                                                      </a>
                                                    ) : invoice.status === 'sent' ? (
                                                      <Link
                                                        to="/payments"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-ct-teal text-ct-ink hover:brightness-110 transition-colors"
                                                      >
                                                        Pay Now
                                                      </Link>
                                                    ) : (
                                                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                                        invoice.status === 'paid' ? 'bg-ct-teal/[0.14] text-ct-teal' :
                                                        'bg-ct-surface-2 text-ct-mute-2'
                                                      }`}>
                                                        {invoice.status === 'paid' ? 'Paid' : invoice.status.replace(/_/g, ' ')}
                                                      </span>
                                                    )
                                                  )}
                                                  <svg className={`w-3.5 h-3.5 text-ct-mute transition-transform ${isMonthExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                                </div>
                                              </button>
                                              {isMonthExpanded && (
                                                <div className="px-3 pb-3 space-y-1.5 border-t border-ct-line-soft pt-2">
                                                  {sessions.map(s => {
                                                    const sDate = new Date((s.actual_date || s.scheduled_date) + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
                                                    const statusMap: Record<string, { text: string; label: string }> = {
                                                      completed: { text: 'text-ct-teal', label: 'Completed' },
                                                      scheduled: { text: 'text-ct-mute-2', label: 'Scheduled' },
                                                      skipped: { text: 'text-ct-mute', label: 'Skipped' },
                                                      extra: { text: 'text-ct-amber', label: 'Extra' },
                                                      rescheduled: { text: 'text-ct-amber', label: 'Rescheduled' },
                                                      pending_confirmation: { text: 'text-ct-amber', label: 'Pending' },
                                                    };
                                                    const sStyle = statusMap[s.status] || { text: 'text-ct-mute', label: s.status };
                                                    return (
                                                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 rounded-ct-sm hover:bg-ct-surface-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                          <span className="text-xs text-ct-mute-2">{sDate}</span>
                                                          {s.notes && <span className="text-xs text-ct-mute truncate max-w-[120px]">— {s.notes}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                          {s.status === 'extra' && s.extra_cost ? (
                                                            <span className="text-xs font-medium text-ct-amber">${Number(s.extra_cost).toFixed(2)}</span>
                                                          ) : s.status === 'completed' && job.agreed_price ? (
                                                            <span className="text-xs font-medium text-ct-mute-2">${job.agreed_price.toFixed(2)}</span>
                                                          ) : null}
                                                          <span className={`text-[10px] font-medium ${sStyle.text}`}>{sStyle.label}</span>
                                                        </div>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => setExpandedSessions(prev => {
                                          const next = new Set(prev);
                                          next.delete(job.id);
                                          // Also collapse any expanded months
                                          sortedMonths.forEach(m => next.delete(`${job.id}_${m}`));
                                          return next;
                                        })}
                                        className="w-full text-center text-xs font-medium text-ct-mute hover:text-ct-mute-2 py-1.5 mt-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                                      >
                                        Show less
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
                        {sessionsLoading.has(job.id) && (
                          <div className="px-3 pb-3 flex items-center justify-center py-3">
                            <Loader2 className="w-4 h-4 animate-spin text-ct-mute" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {hiddenRecurringCount > 0 && (
                    <Link
                      to="/leads?tab=services"
                      className="block w-full text-center text-xs font-semibold text-ct-mute-2 hover:text-ct-mute-2 py-2.5 hover:bg-ct-surface-2 rounded-ct-sm transition-colors"
                    >
                      View all {activeRecurring.length} ongoing services →
                    </Link>
                  )}
                    </>;
                  })()}
                </div>
              )}
            </div>

              {/* Invoices */}
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
                <Link to="/payments" className="font-semibold text-ct-paper flex items-center gap-2 mb-4 hover:text-ct-mute-2 transition-colors">
                  <DollarSign className="w-4 h-4 text-ct-mute-2" />
                  Invoices
                </Link>
                {/* Pending job payments — abandoned or stale checkouts */}
                {pendingPayments.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-ct-amber uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Awaiting payment
                    </p>
                    <div className="space-y-2">
                      {pendingPayments.map(pp => (
                        <div key={pp.id} className="flex items-center gap-3 p-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ct-paper truncate">{pp.jobTitle}</p>
                            <p className="text-xs text-ct-mute">${(pp.amount / 100).toFixed(2)}</p>
                          </div>
                          <button
                            onClick={async () => {
                              setPayingPendingId(pp.id);
                              try {
                                const { url } = await createJobPaymentCheckout(pp.id);
                                if (url) window.location.href = url;
                              } catch (err) {
                                showToast(err instanceof Error ? err.message : 'Failed to start payment', true);
                              } finally {
                                setPayingPendingId(null);
                              }
                            }}
                            disabled={payingPendingId === pp.id}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-medium rounded-ct-sm hover:brightness-110 disabled:opacity-60 transition-colors"
                          >
                            {payingPendingId === pp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                            Pay Now
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {invoices.length > 0 ? (
                  <div className="space-y-3">
                    {invoices.map((inv) => (
                      <RecurringInvoiceCard
                        key={inv.id}
                        invoice={inv}
                        userRole="client"
                        onApprove={async (invoiceId) => {
                          try {
                            const result = await callEdgeFunction<{ status: string; checkout_url?: string }>(
                              'approve-invoice',
                              { invoiceId, action: 'approve', forceCheckout: true },
                            );
                            if (result.checkout_url) {
                              window.location.href = result.checkout_url;
                            } else {
                              showToast('Invoice approved — payment is processing');
                              fetchInvoices();
                            }
                          } catch (err) {
                            console.error('Approve invoice error:', err);
                            showToast(err instanceof Error ? err.message : 'Something went wrong — please try again', true);
                          }
                        }}
                        onDecline={async (invoiceId, reason) => {
                          try {
                            await callEdgeFunction('approve-invoice', { invoiceId, action: 'decline', disputeReason: reason });
                            showToast('Invoice disputed — the tradie has been notified');
                            fetchInvoices();
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Failed to dispute invoice', true);
                          }
                        }}
                        onAcceptResponse={async (invoiceId) => {
                          try {
                            await callEdgeFunction('respond-to-dispute', { invoiceId, action: 'accept_response' });
                            showToast('Response accepted — invoice is ready for approval');
                            fetchInvoices();
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Failed to accept response', true);
                          }
                        }}
                        onEscalate={async (invoiceId) => {
                          try {
                            await callEdgeFunction('respond-to-dispute', { invoiceId, action: 'escalate' });
                            showToast('Dispute escalated to admin for review');
                            fetchInvoices();
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Failed to escalate dispute', true);
                          }
                        }}
                      />
                    ))}
                  </div>
                ) : pendingPayments.length === 0 ? (
                  <div className="text-center py-4">
                    <DollarSign className="w-8 h-8 text-ct-mute mx-auto mb-2" />
                    <p className="text-sm text-ct-mute">No invoices yet</p>
                    <p className="text-xs text-ct-mute mt-1">Generated at the end of each billing cycle</p>
                  </div>
                ) : null}
              </div>

            {/* Paused Services — only show most recent resumable one */}
            {(() => {
              const inactive = recurringJobs.filter(j => !j.is_active && !j.cancelled_at);
              if (inactive.length === 0) return null;
              // Sort by next_due_date descending — most recent first
              const sorted = [...inactive].sort((a, b) =>
                new Date(b.next_due_date).getTime() - new Date(a.next_due_date).getTime()
              );
              // Only the most recent is resumable if its due date is in the future or recent (within 30 days)
              const now = new Date();
              const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
              const resumable = sorted.filter(j => new Date(j.next_due_date) >= cutoff);
              const pastCount = inactive.length - resumable.length;

              return (
                <details className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden group">
                  <summary className="px-5 py-4 border-b border-ct-line-soft cursor-pointer list-none flex items-center justify-between hover:bg-ct-surface-2 transition-colors">
                    <h3 className="font-semibold text-ct-paper flex items-center gap-2">
                      <Pause className="w-4 h-4 text-ct-amber" />
                      Paused Services
                      <span className="text-xs font-normal text-ct-mute">({resumable.length})</span>
                    </h3>
                    <ChevronDown className="w-4 h-4 text-ct-mute transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="divide-y divide-ct-line-soft">
                    {resumable.map(job => {
                      const tradeLabel = (job.service_subtype || job.trade_category || '').replace(/_/g, ' ');
                      const freqLabel = job.frequency_months === 1 ? 'Monthly' : job.frequency_months === 3 ? 'Quarterly' : job.frequency_months === 6 ? 'Half-yearly' : job.frequency_months === 12 ? 'Yearly' : job.frequency_months < 0 ? (job.frequency_months === -1 ? 'Monthly' : job.frequency_months === -2 ? 'Fortnightly' : 'Weekly') : `Every ${job.frequency_months}mo`;
                      return (
                        <details key={job.id} className="group/paused">
                          <summary className="px-5 py-3 flex items-center justify-between cursor-pointer list-none hover:bg-ct-surface-2 transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ct-paper capitalize">{tradeLabel}</p>
                              {job.tradie && (
                                <p className="text-xs text-ct-mute-2 mt-0.5">
                                  {(job.tradie as { full_name?: string }).full_name}
                                  {job.agreed_price ? ` · $${job.agreed_price.toFixed(2)}/visit` : ''}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  try {
                                    await resumeRecurringJob(job.id, 'client');
                                    fetchRecurring();
                                    showToast('Service resumed');
                                  } catch {
                                    showToast('Failed to resume service', true);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal hover:brightness-110 text-ct-ink rounded-ct-sm text-xs font-medium transition-colors"
                              >
                                <Play className="w-3 h-3" />
                                Resume
                              </button>
                              <ChevronDown className="w-3.5 h-3.5 text-ct-mute transition-transform group-open/paused:rotate-180" />
                            </div>
                          </summary>
                          <div className="px-5 pb-4 pt-2">
                            {job.description && (
                              <div className="mb-2.5">
                                <div className={`text-xs text-ct-paper ${expandedDescs.has(job.id) ? '' : 'line-clamp-2'}`}>
                                  {job.description.split(/(?=\d+\.\s)/).filter(Boolean).map((line, i) => (
                                    <p key={i}>{line.trim()}</p>
                                  ))}
                                </div>
                                {job.description.length > 100 && (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setExpandedDescs(prev => {
                                        const next = new Set(prev);
                                        if (next.has(job.id)) next.delete(job.id);
                                        else next.add(job.id);
                                        return next;
                                      });
                                    }}
                                    className="text-[11px] text-ct-mute-2 hover:text-ct-mute-2 font-medium mt-0.5"
                                  >
                                    {expandedDescs.has(job.id) ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 mb-2.5">
                              <div className="bg-ct-surface-2 rounded-ct-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-ct-mute leading-tight">Frequency</p>
                                <p className="text-xs font-medium text-ct-paper">{freqLabel}</p>
                              </div>
                              {job.location && (
                                <div className="bg-ct-surface-2 rounded-ct-sm px-2.5 py-1.5 min-w-0">
                                  <p className="text-[10px] text-ct-mute leading-tight">Location</p>
                                  <p className="text-xs font-medium text-ct-paper truncate">{job.location}</p>
                                </div>
                              )}
                              {job.times_completed > 0 && (
                                <div className="bg-ct-surface-2 rounded-ct-sm px-2.5 py-1.5">
                                  <p className="text-[10px] text-ct-mute leading-tight">Sessions</p>
                                  <p className="text-xs font-medium text-ct-paper">{job.times_completed}</p>
                                </div>
                              )}
                              <div className="bg-ct-surface-2 rounded-ct-sm px-2.5 py-1.5">
                                <p className="text-[10px] text-ct-mute leading-tight">Created</p>
                                <p className="text-xs font-medium text-ct-paper">{new Date(job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCancelServiceTarget({ id: job.id, label: tradeLabel }); setCancelReason(''); }}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs text-ct-rose hover:text-ct-rose hover:bg-ct-rose/[0.13] font-medium rounded-ct-sm transition-colors min-h-[44px]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Cancel Service
                            </button>
                          </div>
                        </details>
                      );
                    })}
                    {pastCount > 0 && (
                      <div className="px-5 py-3">
                        <p className="text-xs text-ct-mute">
                          {pastCount} past service{pastCount !== 1 ? 's' : ''} ended · <Link to="/leads?tab=services" className="text-ct-mute-2 hover:text-ct-mute-2">View all</Link>
                        </p>
                      </div>
                    )}
                    {resumable.length === 0 && (
                      <div className="px-5 py-3">
                        <p className="text-xs text-ct-mute">
                          {inactive.length} past service{inactive.length !== 1 ? 's' : ''} · <Link to="/leads?tab=services" className="text-ct-mute-2 hover:text-ct-mute-2">View all</Link>
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              );
            })()}

            {/* Saved Tradies */}
            {savedTradies.length > 0 && (
              <div>
                <div className="flex items-center justify-center sm:justify-between mb-4 gap-2" data-tour="saved-tradies">
                  <h2 className="text-lg font-semibold text-ct-paper">Saved Tradies</h2>
                  <span className="text-sm text-ct-mute-2">{savedTradies.length} saved</span>
                </div>
                {loading ? (
                  <div className="space-y-6">
                    <DashboardStatsSkeleton />
                    <ListSkeleton rows={4} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {savedTradies.map((tradie) => (
                      <TradieCard
                        key={tradie.id}
                        tradie={tradie}
                        onChat={handleOpenChat}
                        onViewCalendar={setCalendarTradie}
                        onSave={handleRemoveTradie}
                        isSaved={true}
                        onRequestQuote={handleRequestQuote}
                        unreadCount={unreadByTradie.get(tradie.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Three-up summary row — pulled out of the sidebar so the boxes
                aren't buried below the fold on tall screens. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* This Week — personal upcoming-events feed (replaced the old
                  global Platform Activity widget). */}
              <SectionErrorBoundary fallbackTitle="Timeline failed to load">
                <UpcomingTimeline />
              </SectionErrorBoundary>

              {/* Recommended Tradies — ranked, trade-aware, postcode-proximate.
                  Replaced the old .limit(4) of all tradies that pretended to be
                  "near" the client. */}
              <RecommendedTradies />
            </div>
          </div>

          <div className="lg:col-span-1 min-w-0 space-y-6">
            {trainingModeEnabled && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className={`w-full rounded-ct-lg border p-5 text-left transition-all hover:shadow-lg ${
                  isClientPro
                    ? 'bg-gradient-to-br from-ct-teal to-ct-amber border-ct-teal/30'
                    : 'bg-gradient-to-br from-ct-surface-2 to-ct-teal border-ct-line hover:border-ct-teal/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-ct-md flex items-center justify-center ${
                    isClientPro ? 'bg-ct-teal/[0.14]' : 'bg-ct-line'
                  }`}>
                    <Crown className={`w-5 h-5 ${isClientPro ? 'text-ct-amber' : 'text-ct-mute'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isClientPro ? 'text-ct-teal' : 'text-ct-paper'}`}>
                      {isClientPro ? 'Pro Member' : 'Upgrade to Pro'}
                    </p>
                    <p className="text-xs text-ct-mute-2">
                      {isClientPro ? 'All features unlocked' : 'Get premium features'}
                    </p>
                  </div>
                </div>
              </button>
            )}
            {/* Spending Summary */}
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
              <h3 className="font-semibold text-ct-paper flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-ct-teal" />
                Spending Summary
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ct-mute-2">This Month</span>
                  <span className="text-sm font-semibold text-ct-paper">${(spendingSummary.thisMonth / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ct-mute-2">All Time</span>
                  <span className="text-sm font-semibold text-ct-paper">${(spendingSummary.total / 100).toFixed(2)}</span>
                </div>
                <Link to="/leads" className="flex items-center justify-between min-h-[44px] pt-2 border-t border-ct-line-soft hover:bg-ct-surface-2 -mx-2 px-2 rounded-ct-sm transition-colors">
                  <span className="text-sm text-ct-mute-2">Active Jobs</span>
                  <span className="text-sm font-semibold text-ct-amber">{spendingSummary.pendingJobs}</span>
                </Link>
                <Link to="/leads?tab=services" className="flex items-center justify-between min-h-[44px] hover:bg-ct-surface-2 -mx-2 px-2 rounded-ct-sm transition-colors">
                  <span className="text-sm text-ct-mute-2">Ongoing Services</span>
                  <span className="text-sm font-semibold text-ct-mute-2">{spendingSummary.activeServices}</span>
                </Link>
              </div>
              <Link to="/payments" className="mt-4 block text-center text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2">
                View Payment History
              </Link>
            </div>
            {(profile?.onboarding_stage ?? 4) < 4 && (
              <div data-tour="onboarding-checklist">
                <SectionErrorBoundary fallbackTitle="Onboarding checklist failed to load">
                  <OnboardingChecklist />
                </SectionErrorBoundary>
              </div>
            )}
          </div>
        </div>
      </div>

      <ChatDrawer
        isOpen={!!chatTradie}
        onClose={() => setChatTradie(null)}
        tradie={chatTradie}
      />

      <AvailabilityCalendar
        isOpen={!!calendarTradie}
        onClose={() => setCalendarTradie(null)}
        tradie={calendarTradie}
      />

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />

      {/* Cancel Service Modal */}
      {cancelServiceTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setCancelServiceTarget(null)} />
          <div className="relative bg-ct-surface rounded-t-ct-xl sm:rounded-ct-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <button onClick={() => setCancelServiceTarget(null)} className="absolute top-4 right-4 p-2 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-ct-rose/[0.13] rounded-full flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-ct-rose" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ct-paper">Cancel Service</h2>
                <p className="text-sm text-ct-mute capitalize">{cancelServiceTarget.label}</p>
              </div>
            </div>
            <p className="text-sm text-ct-mute-2 mb-4">This will permanently cancel this service. It cannot be resumed after cancellation.</p>
            <label className="block text-sm font-medium text-ct-mute-2 mb-1.5">Reason for cancellation</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {['No longer needed', 'Found another provider', 'Too expensive', 'Poor quality', 'Moving house', 'Other'].map(reason => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setCancelReason(reason)}
                  className={`px-3 py-2 rounded-full text-xs font-medium border transition-all ${
                    cancelReason === reason
                      ? 'bg-ct-rose/[0.13]0 text-ct-ink border-ct-rose'
                      : 'bg-ct-surface text-ct-mute-2 border-ct-line hover:border-ct-rose/40'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            {cancelReason === 'Other' && (
              <textarea {...proseInputProps}
                value={cancelReason === 'Other' ? '' : cancelReason}
                onChange={(e) => setCancelReason(e.target.value || 'Other')}
                placeholder="Please describe the reason..."
                rows={2}
                className="w-full px-3 py-2 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-rose0 resize-none mb-3"
              />
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setCancelServiceTarget(null)}
                className="flex-1 px-4 py-2.5 border border-ct-line text-ct-mute-2 rounded-ct-md text-sm font-medium hover:bg-ct-surface-2 transition-colors"
              >
                Keep Service
              </button>
              <button
                onClick={async () => {
                  if (!cancelReason) return;
                  setCancellingService(true);
                  try {
                    await cancelRecurringJob(cancelServiceTarget.id);
                    fetchRecurring();
                    showToast('Service cancelled');
                    setCancelServiceTarget(null);
                  } catch {
                    showToast('Failed to cancel service', true);
                  }
                  setCancellingService(false);
                }}
                disabled={!cancelReason || cancellingService}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-ct-rose text-ct-ink rounded-ct-md text-sm font-semibold hover:brightness-110 transition-colors disabled:opacity-50"
              >
                {cancellingService ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Cancel Service
              </button>
            </div>
          </div>
        </div>
      )}

      {quoteRequestTradie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setQuoteRequestTradie(null)} />
          <div className="relative bg-ct-surface rounded-ct-lg shadow-xl max-w-md w-full p-6">
            <button onClick={() => setQuoteRequestTradie(null)} className="absolute top-4 right-4 p-1 text-ct-mute hover:text-ct-mute-2 rounded-ct-sm">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-ct-teal/[0.14] rounded-full flex items-center justify-center">
                <FileText className="w-5 h-5 text-ct-teal" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ct-paper">Request Quote</h2>
                <p className="text-sm text-ct-mute">from {quoteRequestTradie.tradie_details?.business_name || quoteRequestTradie.full_name}</p>
              </div>
            </div>

            {loadingQuoteJobs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-ct-teal animate-spin" />
              </div>
            ) : clientPendingJobs.length > 0 ? (
              <div>
                <p className="text-sm font-medium text-ct-mute-2 mb-3">Select a job to invite them to quote on:</p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {clientPendingJobs.map(job => {
                    const categoryMatch = job.description?.match(/^\[([^\]]+)\]/);
                    const category = categoryMatch ? categoryMatch[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
                    const desc = job.description?.replace(/^\[[^\]]+\]\s*/, '') || '';
                    return (
                      <button
                        key={job.id}
                        onClick={() => sendQuoteInvitation(job.id)}
                        disabled={sendingInvite}
                        className="w-full text-left p-3 rounded-ct-md border border-ct-line hover:border-ct-teal/30 hover:bg-ct-teal/[0.14]/50 transition-colors disabled:opacity-50"
                      >
                        <p className="text-sm font-semibold text-ct-paper capitalize truncate">
                          {(job.title || category || 'Untitled Job').replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-ct-mute truncate mt-0.5">{desc}</p>
                        {job.location_address && (
                          <p className="text-xs text-ct-mute mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {job.location_address.split(',')[0]}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-ct-line-soft">
                  <button
                    onClick={() => { setQuoteRequestTradie(null); navigate(`/post-lead?category=${encodeURIComponent(quoteRequestTradie.tradie_details?.trade_category || quoteRequestTradie.tradie_details?.trade_type || '')}&tradie=${quoteRequestTradie.id}`); }}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-ct-line text-ct-mute-2 text-sm font-medium rounded-ct-md hover:bg-ct-surface-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Post a New Job Instead
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-ct-mute-2 mb-4">You don't have any open jobs yet. Post one and this tradie will be invited to quote.</p>
                <button
                  onClick={() => { setQuoteRequestTradie(null); navigate(`/post-lead?category=${encodeURIComponent(quoteRequestTradie.tradie_details?.trade_category || quoteRequestTradie.tradie_details?.trade_type || '')}&tradie=${quoteRequestTradie.id}`); }}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-ct-teal text-ct-ink text-sm font-medium rounded-ct-md hover:brightness-110 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Post a Job
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {bonusTarget && (
        <BonusModal
          isOpen={!!bonusTarget}
          onClose={() => setBonusTarget(null)}
          jobId={bonusTarget.jobId}
          tradieName={bonusTarget.tradieName}
          jobLabel={bonusTarget.jobLabel}
        />
      )}

      {toast.show && (
        <div className={`fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm ${toast.isError ? 'bg-ct-rose' : 'bg-ct-teal'} text-ct-ink px-6 py-3 rounded-ct-md shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
          <div className={`w-2 h-2 ${toast.isError ? 'bg-ct-rose/[0.13]' : 'bg-ct-teal/[0.14]'} rounded-full animate-pulse`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {cancelJobTarget && (
        <ConfirmModal
          title="Cancel Job?"
          message={`Are you sure you want to cancel "${(cancelJobTarget.title || 'this job').replace(/_/g, ' ')}"?${cancelJobTarget.quote_count > 0 ? ' Any quotes received will be removed.' : ''} This action cannot be undone.`}
          confirmText="Cancel Job"
          cancelText="Keep Job"
          onConfirm={handleCancelJob}
          onCancel={() => setCancelJobTarget(null)}
          type="danger"
        />
      )}

      {cancelRecurringTarget && (
        <ConfirmModal
          title="Permanently Cancel Service?"
          message={`This will permanently cancel "${cancelRecurringTarget.service_subtype || cancelRecurringTarget.trade_category.replace(/_/g, ' ')}" — all upcoming sessions will be cancelled and the service agreement will be ended. The tradie will be notified. This cannot be undone.`}
          confirmText="Cancel Permanently"
          cancelText="Keep Service"
          onConfirm={async () => {
            try {
              await cancelRecurringJob(cancelRecurringTarget.id, 'client');
              setCancelRecurringTarget(null);
              fetchRecurring();
              showToast('Ongoing service cancelled');
            } catch {
              showToast('Failed to cancel service', true);
            }
          }}
          onCancel={() => setCancelRecurringTarget(null)}
          type="danger"
        />
      )}
    </DashboardLayout>
  );
}

function RecurringJobForm({ onSave, onCancel, onDone, onSendQuote, savedTradies }: {
  onSave: (data: { tradie_id: string | null; trade_category: string; service_subtype?: string; description: string; frequency_months: number; next_due_date: string; reminder_days_before: number; location: string; budget?: number; preferred_time?: string; allows_site_inspection?: boolean }) => Promise<void>;
  onCancel: () => void;
  onDone: () => void;
  onSendQuote: (job: RecurringJob) => Promise<void>;
  savedTradies: TradieWithDetails[];
}) {
  const [category, setCategory] = useState('');
  const [serviceSubtype, setServiceSubtype] = useState('');
  const [customSubtype, setCustomSubtype] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedTradieId, setSelectedTradieId] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [budgetType, setBudgetType] = useState<'quote' | 'set'>('quote');
  const [keywords, setKeywords] = useState<KeywordSuggestion[]>([]);
  const [descFocused, setDescFocused] = useState(false);
  const [successState, setSuccessState] = useState<{ category: string; subtype: string; frequency: number; tradieId: string; tradieName: string } | null>(null);
  const [quoteSent, setQuoteSent] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [allowsSiteInspection, setAllowsSiteInspection] = useState(true);

  const tradeKeys = Object.keys(RECURRING_SERVICE_SUBCATEGORIES);
  const subcategories = category ? (RECURRING_SERVICE_SUBCATEGORIES[category] ?? null) : null;
  const hasSubcategories = subcategories !== null && subcategories.length > 0;

  const suggestion = category ? suggestRecurringJob(category) : null;
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState(12);
  const [preferredTime, setPreferredTime] = useState('');
  const [nextDate, setNextDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    if (suggestion) {
      setFrequency(suggestion.frequencyMonths);
    }
    // Reset subtype and description when category changes
    setServiceSubtype('');
    setCustomSubtype('');
    setDescription('');
  }, [category]);

  // Auto-populate description when service subtype is selected
  useEffect(() => {
    if (serviceSubtype && RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]) {
      setDescription(RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype]);
    } else if (serviceSubtype) {
      setDescription('');
    }
  }, [serviceSubtype]);

  // Fetch keyword suggestions when service subtype changes
  useEffect(() => {
    if (!serviceSubtype) {
      setKeywords([]);
      return;
    }
    let cancelled = false;
    getKeywordSuggestions(serviceSubtype).then(result => {
      if (!cancelled) setKeywords(result);
    });
    return () => { cancelled = true; };
  }, [serviceSubtype]);

  const resolvedSubtype = hasSubcategories ? serviceSubtype : customSubtype.trim();

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    if (hasSubcategories && !serviceSubtype) return;
    if (!hasSubcategories && !customSubtype.trim() && category) return;
    setSaving(true);
    try {
      await onSave({
        tradie_id: selectedTradieId || null,
        trade_category: category,
        service_subtype: resolvedSubtype || undefined,
        description: description.trim(),
        frequency_months: frequency,
        next_due_date: nextDate,
        reminder_days_before: 14,
        location: location.trim(),
        budget: budget ? Number(budget) : undefined,
        preferred_time: preferredTime || undefined,
        allows_site_inspection: allowsSiteInspection,
      });
      const selectedTradie = savedTradies.find(t => t.id === selectedTradieId);
      setSuccessState({
        category,
        subtype: resolvedSubtype || category,
        frequency,
        tradieId: selectedTradieId,
        tradieName: selectedTradie?.full_name || '',
      });
    } catch (err) {
      console.error('createRecurringJob error:', err);
    }
    setSaving(false);
  };

  const formatFrequency = (months: number) => {
    if (months === -3) return 'Daily';
    if (months === -1) return 'Weekly';
    if (months === -2) return 'Fortnightly';
    if (months === 1) return 'Monthly';
    if (months === 2) return 'Every 2 months';
    if (months === 3) return 'Quarterly';
    if (months === 6) return 'Every 6 months';
    if (months === 12) return 'Annually';
    if (months === 24) return 'Every 2 years';
    if (months === 36) return 'Every 3 years';
    if (months === 60) return 'Every 5 years';
    return `Every ${months} months`;
  };

  // Success state panel
  if (successState) {
    const tradeLabel = successState.subtype || successState.category.replace(/_/g, ' ');
    const freqLabel = formatFrequency(successState.frequency);

    return (
      <div className="border border-ct-teal/30 rounded-ct-md p-4 mb-3 bg-ct-teal/[0.14]/50 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-ct-teal/[0.14] rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-ct-teal" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ct-paper capitalize">{tradeLabel}</p>
            <p className="text-xs text-ct-mute">{successState.category.replace(/_/g, ' ')} &middot; {freqLabel}</p>
          </div>
        </div>

        {quoteSent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-ct-teal font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Quote request sent to {successState.tradieName.split(' ')[0]}
            </div>
            <p className="text-xs text-ct-mute">We'll notify you when they respond.</p>
            <button
              onClick={onDone}
              className="px-4 py-1.5 border border-ct-line text-ct-mute-2 rounded-ct-sm text-xs font-medium hover:bg-ct-surface-2 transition-colors"
            >
              Done
            </button>
          </div>
        ) : successState.tradieId && successState.tradieName ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-ct-surface rounded-ct-sm border border-ct-line-soft">
              <div className="w-7 h-7 bg-ct-surface-2 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-ct-mute-2">{successState.tradieName.charAt(0)}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-ct-paper">{successState.tradieName}</p>
                <p className="text-xs text-ct-mute capitalize">{successState.category.replace(/_/g, ' ')}</p>
              </div>
            </div>
            <button
              onClick={async () => {
                setSendingQuote(true);
                try {
                  // Build a minimal RecurringJob-like object for sendQuoteRequest
                  const fakeJob = {
                    id: '',
                    client_id: '',
                    tradie_id: successState.tradieId,
                    trade_category: successState.category,
                    service_subtype: successState.subtype,
                    description: description.trim(),
                    frequency_months: successState.frequency,
                    next_due_date: '',
                    reminder_days_before: 14,
                    is_active: true,
                    original_job_id: null,
                    times_completed: 0,
                    created_at: '',
                    updated_at: '',
                    location: location.trim(),
                    tradie: { id: successState.tradieId, full_name: successState.tradieName, email: '' },
                  } as RecurringJob;
                  await onSendQuote(fakeJob);
                  setQuoteSent(true);
                } catch {
                  // handled by parent
                }
                setSendingQuote(false);
              }}
              disabled={sendingQuote}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-medium hover:brightness-110 disabled:opacity-50 transition-colors"
            >
              {sendingQuote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send to {successState.tradieName.split(' ')[0]} & Request Quote
            </button>
            <Link
              to={`/search?trade=${encodeURIComponent(successState.category)}`}
              className="block text-center text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2"
            >
              Or find other tradies &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <Link
              to={`/search?trade=${encodeURIComponent(successState.category)}`}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-ct-teal text-ct-ink rounded-ct-sm text-sm font-medium hover:brightness-110 transition-colors"
            >
              Find a Tradie for this Job
              <ArrowRight className="w-4 h-4" />
            </Link>
            <button
              onClick={onDone}
              className="w-full px-4 py-1.5 border border-ct-line text-ct-mute-2 rounded-ct-sm text-xs font-medium hover:bg-ct-surface-2 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-ct-line rounded-ct-md p-3 mb-3 bg-ct-surface-2/30 space-y-2">
      <div>
        <label className="block text-xs font-medium text-ct-mute-2 mb-1">Trade</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
        >
          <option value="">Select a trade...</option>
          {tradeKeys.map(trade => (
            <option key={trade} value={trade}>{trade}</option>
          ))}
        </select>
      </div>

      {category && (
        <div>
          <label className="block text-xs font-medium text-ct-mute-2 mb-1">Service Type</label>
          {hasSubcategories ? (
            <select
              value={serviceSubtype}
              onChange={e => setServiceSubtype(e.target.value)}
              className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
            >
              <option value="">Select a service type...</option>
              {subcategories.map(sub => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customSubtype}
              onChange={e => setCustomSubtype(e.target.value)}
              placeholder="e.g., Annual roof inspection"
              className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal"
            />
          )}
        </div>
      )}

      {category && (hasSubcategories ? serviceSubtype : customSubtype.trim()) && (
        <>
          <div>
            <label className="block text-xs font-medium text-ct-mute-2 mb-1">Description</label>
            <div className="relative">
              <textarea {...proseInputProps}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What needs to be done..."
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
                className={`w-full px-3 py-2 border rounded-ct-sm text-sm resize-none transition-all duration-200 ${
                  descFocused
                    ? 'min-h-[200px] ring-2 ring-ct-teal0 ring-offset-1 border-ct-teal'
                    : 'min-h-[120px] border-ct-line'
                }`}
              />
              <span className={`absolute bottom-1.5 right-2.5 text-xs ${
                description.length > 500 ? 'text-ct-rose font-medium' : description.length > 400 ? 'text-ct-amber' : 'text-ct-mute'
              }`}>
                {description.length} / 500
              </span>
            </div>
            {serviceSubtype && RECURRING_SERVICE_DESCRIPTIONS[serviceSubtype] && (
              <p className="text-xs text-ct-mute mt-1">Pre-filled based on your service type — edit as needed</p>
            )}
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className="text-xs text-ct-mute mr-0.5 self-center">Popular:</span>
                {keywords.map(kw => {
                  const isIncluded = description.toLowerCase().includes(kw.keyword.toLowerCase());
                  return (
                    <button
                      key={kw.keyword}
                      type="button"
                      onClick={() => {
                        if (!isIncluded) {
                          setDescription(prev => prev.trim() ? `${prev.trim()}\n• ${kw.keyword}` : `• ${kw.keyword}`);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        isIncluded
                          ? 'bg-ct-teal/[0.14] text-ct-teal border-ct-teal/30 cursor-default'
                          : 'bg-ct-surface text-ct-mute-2 border-ct-line hover:border-ct-teal/30 hover:text-ct-mute-2 cursor-pointer'
                      }`}
                    >
                      {kw.keyword}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-ct-mute-2 mb-1">Budget</label>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <button
                type="button"
                onClick={() => { setBudgetType('quote'); setBudget(''); }}
                className={`px-2.5 py-1.5 rounded-ct-sm text-xs font-medium border transition-colors ${
                  budgetType === 'quote'
                    ? 'bg-ct-surface-2 border-ct-teal/30 text-ct-mute-2'
                    : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:border-ct-line'
                }`}
              >
                Require a Quote
              </button>
              <button
                type="button"
                onClick={() => setBudgetType('set')}
                className={`px-2.5 py-1.5 rounded-ct-sm text-xs font-medium border transition-colors ${
                  budgetType === 'set'
                    ? 'bg-ct-surface-2 border-ct-teal/30 text-ct-mute-2'
                    : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:border-ct-line'
                }`}
              >
                Set a Budget
              </button>
            </div>
            {budgetType === 'set' && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ct-mute text-sm">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder={suggestion?.priceRange ? `${suggestion.priceRange.min} – ${suggestion.priceRange.max}` : 'Enter budget'}
                  className="w-full pl-7 pr-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-ct-mute-2 mb-1">Location / Address</label>
            <AddressAutocomplete
              value={location}
              onChange={(val) => setLocation(val)}
              placeholder="Start typing an address..."
              className="!py-1.5 !text-sm !rounded-ct-sm"
            />
          </div>

          {(() => {
            const matchingTradies = savedTradies.filter(t =>
              t.tradie_details?.trade_category?.toLowerCase() === category.toLowerCase()
            );
            const otherTradies = savedTradies.filter(t =>
              t.tradie_details?.trade_category?.toLowerCase() !== category.toLowerCase()
            );
            return savedTradies.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-ct-mute-2 mb-1">
                  Preferred Tradie
                  {matchingTradies.length > 0 && (
                    <span className="text-ct-amber ml-1">({matchingTradies.length} matching)</span>
                  )}
                </label>
                <select
                  value={selectedTradieId}
                  onChange={e => setSelectedTradieId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
                >
                  <option value="">Any available tradie</option>
                  {matchingTradies.length > 0 && (
                    <optgroup label={`Matching ${category.replace(/_/g, ' ')} tradies`}>
                      {matchingTradies.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} — {t.tradie_details?.trade_category || 'Tradie'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {otherTradies.length > 0 && (
                    <optgroup label="Other saved tradies">
                      {otherTradies.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.full_name} — {t.tradie_details?.trade_category || 'Tradie'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            ) : null;
          })()}

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-ct-mute-2 mb-1.5">How often?</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { value: -3, label: 'Daily' },
                { value: -1, label: 'Weekly' },
                { value: -2, label: 'Fortnightly' },
                { value: 1, label: 'Monthly' },
                { value: 3, label: 'Quarterly' },
                { value: 6, label: '6 Monthly' },
                { value: 12, label: 'Annually' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFrequency(opt.value)}
                  className={`px-2.5 py-1.5 rounded-ct-sm text-xs font-medium border transition-colors ${
                    frequency === opt.value
                      ? 'bg-ct-surface-2 border-ct-teal/30 text-ct-mute-2'
                      : 'bg-ct-surface border-ct-line text-ct-mute-2 hover:border-ct-line'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ct-mute-2 mb-1">First date</label>
              <input
                type="date"
                value={nextDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setNextDate(e.target.value)}
                className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ct-mute-2 mb-1">Preferred time</label>
              <select
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
              >
                <option value="">Flexible</option>
                <option value="07:00">7:00 AM</option>
                <option value="08:00">8:00 AM</option>
                <option value="09:00">9:00 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="11:00">11:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="13:00">1:00 PM</option>
                <option value="14:00">2:00 PM</option>
                <option value="15:00">3:00 PM</option>
                <option value="16:00">4:00 PM</option>
              </select>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-ct-md border border-ct-line hover:border-ct-teal/30 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={allowsSiteInspection}
              onChange={e => setAllowsSiteInspection(e.target.checked)}
              className="mt-0.5 rounded-ct-xs border-ct-line text-ct-teal focus:ring-ct-teal"
            />
            <div>
              <span className="text-sm font-medium text-ct-mute-2">Allow on-site quote</span>
              <p className="text-xs text-ct-mute mt-0.5">Let the tradie visit before giving a firm price.</p>
            </div>
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 px-3 py-1.5 bg-ct-surface border border-ct-line text-ct-mute-2 rounded-ct-sm text-xs font-medium hover:bg-ct-surface-2 transition-colors">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !description.trim() || (hasSubcategories ? !serviceSubtype : !customSubtype.trim())}
              className="flex-1 px-3 py-1.5 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Schedule Service
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RecurringJobEditForm({ job, savedTradies, onSave, onCancel }: {
  job: RecurringJob;
  savedTradies: TradieWithDetails[];
  onSave: (updates: { description?: string; location?: string; tradie_id?: string | null; frequency_months?: number; next_due_date?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(job.description || '');
  const [location, setLocation] = useState(job.location || '');
  const [selectedTradieId, setSelectedTradieId] = useState(job.tradie_id || '');
  const [frequency, setFrequency] = useState(job.frequency_months);
  const [nextDate, setNextDate] = useState(job.next_due_date?.slice(0, 10) || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      description: description.trim(),
      location: location.trim() || undefined,
      tradie_id: selectedTradieId || null,
      frequency_months: frequency,
      next_due_date: nextDate,
    });
    setSaving(false);
  };

  return (
    <div className="p-3 rounded-ct-md border border-ct-teal/30 bg-ct-surface-2/40 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ct-mute-2 uppercase tracking-wide">
          Edit: {job.service_subtype || job.trade_category.replace(/_/g, ' ')}
        </p>
        <button onClick={onCancel} className="p-1 text-ct-mute hover:text-ct-mute-2">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-ct-mute-2 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-ct-mute-2 mb-1">Location / Address</label>
        <AddressAutocomplete
          value={location}
          onChange={(val) => setLocation(val)}
          placeholder="Start typing an address..."
          className="!py-1.5 !text-sm !rounded-ct-sm"
        />
      </div>

      {(() => {
        const matchingTradies = savedTradies.filter(t =>
          t.tradie_details?.trade_category?.toLowerCase() === job.trade_category.toLowerCase()
        );
        const otherTradies = savedTradies.filter(t =>
          t.tradie_details?.trade_category?.toLowerCase() !== job.trade_category.toLowerCase()
        );
        return (
          <div>
            <label className="block text-xs font-medium text-ct-mute-2 mb-1">
              Assigned Tradie
              {matchingTradies.length > 0 && (
                <span className="text-ct-amber ml-1">({matchingTradies.length} matching)</span>
              )}
            </label>
            <select
              value={selectedTradieId}
              onChange={e => setSelectedTradieId(e.target.value)}
              className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
            >
              <option value="">No tradie assigned</option>
              {matchingTradies.length > 0 && (
                <optgroup label={`Matching ${job.trade_category.replace(/_/g, ' ')} tradies`}>
                  {matchingTradies.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {t.tradie_details?.trade_category || 'Tradie'}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherTradies.length > 0 && (
                <optgroup label="Other saved tradies">
                  {otherTradies.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name} — {t.tradie_details?.trade_category || 'Tradie'}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-ct-mute-2 mb-1">Frequency</label>
          <select
            value={frequency}
            onChange={e => setFrequency(Number(e.target.value))}
            className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal bg-ct-surface"
          >
            <option value={-3}>Daily</option>
            <option value={-1}>Weekly</option>
            <option value={-2}>Fortnightly</option>
            <option value={1}>Monthly</option>
            <option value={2}>Every 2 months</option>
            <option value={3}>Quarterly</option>
            <option value={6}>Every 6 months</option>
            <option value={12}>Annually</option>
            <option value={24}>Every 2 years</option>
            <option value={36}>Every 3 years</option>
            <option value={60}>Every 5 years</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ct-mute-2 mb-1">Next due date</label>
          <input
            type="date"
            value={nextDate}
            onChange={e => setNextDate(e.target.value)}
            className="w-full px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-teal"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 bg-ct-surface border border-ct-line text-ct-mute-2 rounded-ct-sm text-xs font-medium hover:bg-ct-surface-2 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !description.trim()}
          className="flex-1 px-3 py-1.5 bg-ct-teal text-ct-ink rounded-ct-sm text-xs font-medium hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}
