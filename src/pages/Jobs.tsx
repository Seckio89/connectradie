import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Clock, Calendar, CheckCircle2, AlertCircle, Loader2, User, Star, Check, X as XIcon, ClipboardList, Zap, WifiOff, ShieldAlert, Settings, Users, MapPin, Repeat, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { offlineAcceptJob } from '../lib/offlineSync';
import { autoNameProject } from '../lib/projectAutoName';
import { formatDate, checkLicenseExpired } from '../lib/utils';
import { redactSensitiveInfo } from '../lib/redaction';
import { descriptionPreview } from '../lib/jobDescription';
import { sendNotification } from '../lib/notificationService';
import { NOTIFICATION_TYPES } from '../lib/notificationTypes';
import { useToast } from '../hooks/useToast';
import type { JobWithRelations, Quote } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import JobDetailModal from '../components/JobDetailModal';
import ReviewModal from '../components/ReviewModal';
import DeclineJobModal from '../components/DeclineJobModal';
import EmptyState from '../components/EmptyState';
import VerificationGateModal from '../components/VerificationGateModal';
import JobCompletionModal from '../components/JobCompletionModal';
import ConfirmModal from '../components/ConfirmModal';
import { calculateDistance, getCurrentPositionOnce } from '../hooks/useGeolocation';
import SubmitQuoteModal from '../components/SubmitQuoteModal';
import { ListSkeleton } from '../components/SkeletonLoader';


function FlashCountdown({ expiry }: { expiry: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(expiry).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiry]);

  return <span className="font-bold tabular-nums">{timeLeft}</span>;
}

export default function Jobs({ embedded = false }: { embedded?: boolean }) {
  const { user, profile, tradieDetails } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, showToast } = useToast();
  type JobStatus = 'pending' | 'active' | 'completed' | 'all';
  const [allJobs, setAllJobs] = useState<JobWithRelations[]>([]);
  const [jobs, setJobs] = useState<JobWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const isTradie_ = profile?.role === 'tradie';
  const [filter, setFilter] = useState<JobStatus>(isTradie_ ? 'pending' : 'all');
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobWithRelations | null>(null);
  const [reviewJob, setReviewJob] = useState<JobWithRelations | null>(null);
  const [reviewedJobIds, setReviewedJobIds] = useState<string[]>([]);
  const [jobToDecline, setJobToDecline] = useState<JobWithRelations | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showVerificationGate, setShowVerificationGate] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [gateReason, setGateReason] = useState<'unverified' | 'expired'>('unverified');
  const [completionJob, setCompletionJob] = useState<JobWithRelations | null>(null);
  const [quoteJob, setQuoteJob] = useState<JobWithRelations | null>(null);
  // Pending off-site job start awaiting the worker's "start anyway" confirmation.
  const [offSiteStart, setOffSiteStart] = useState<
    { job: JobWithRelations; distanceM: number; pos: { lat: number; lng: number } } | null
  >(null);
  const [proposedStartDate, setProposedStartDate] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; invite_name: string; role: string }[]>([]);
  const [assignJobId, setAssignJobId] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState(false);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});
  const [paidJobIds, setPaidJobIds] = useState<Set<string>>(new Set());
  const [myQuotes, setMyQuotes] = useState<Map<string, Quote>>(new Map());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [tradieNames, setTradieNames] = useState<Map<string, string>>(new Map());
  const isTradie = profile?.role === 'tradie';
  const isVerified = profile?.verification_status === 'verified';
  const isLicenseExpired = checkLicenseExpired(profile?.verification_status, profile?.license_expiry);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const paymentType = params.get('type');

    if (payment === 'success' && paymentType) {
      const label = 'Job access granted!';
      setPaymentSuccess(label);
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => setPaymentSuccess(null), 5000);
    } else if (payment === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (profile && !isInitialized) {
      if (isTradie) {
        setFilter('pending');
      }
      setIsInitialized(true);
    }
  }, [profile, isInitialized, isTradie]);

  useEffect(() => {
    if (user) {
      if (isTradie) {
        fetchTeamMembers();
      } else {
        fetchReviewedJobs();
      }
      fetchJobs();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isTradie]);

  // Auto-open a specific job when arriving with ?job=<id> (e.g. from
  // PaymentHistory "View job" link). Once opened, strip the param so refreshes
  // don't re-pop the modal.
  useEffect(() => {
    const jobParam = searchParams.get('job');
    if (!jobParam || allJobs.length === 0) return;
    const match = allJobs.find(j => j.id === jobParam);
    if (match) {
      setSelectedJob(match);
      searchParams.delete('job');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, allJobs, setSearchParams]);

  // Client-side filtering when filter or allJobs change
  useEffect(() => {
    if (allJobs.length === 0 && !loading) {
      setJobs([]);
      return;
    }
    if (filter === 'all') {
      setJobs(allJobs);
    } else if (filter === 'active') {
      // Active = accepted + funded + in_progress (merged)
      const active = allJobs.filter(j => ['accepted', 'funded', 'in_progress'].includes(j.status));
      // Sort: today/past jobs first (ready to complete), then future by date
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      active.sort((a, b) => {
        const dateA = a.scheduled_date ? new Date(a.scheduled_date) : null;
        const dateB = b.scheduled_date ? new Date(b.scheduled_date) : null;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        const aReady = new Date(dateA).setHours(0, 0, 0, 0) <= today.getTime();
        const bReady = new Date(dateB).setHours(0, 0, 0, 0) <= today.getTime();
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        return dateA.getTime() - dateB.getTime();
      });
      setJobs(active);
    } else {
      setJobs(allJobs.filter(j => j.status === filter));
    }
  }, [filter, allJobs, loading]);


  const fetchTeamMembers = async () => {
    if (!user || !isTradie) return;
    try {
      const { data } = await supabase
        .from('business_team_members')
        .select('id, invite_name, role')
        .eq('business_owner_id', user.id)
        .eq('status', 'active');
      if (data) setTeamMembers(data);
    } catch (err) {
      console.error('fetchTeamMembers error:', err);
    }
  };

  const handleAssignToTeam = async (jobId: string, memberId: string) => {
    if (!user) return;
    setAssignLoading(true);
    try {
      await supabase.from('job_team_assignments').insert({
        job_id: jobId,
        team_member_id: memberId,
        business_owner_id: user.id,
        role_on_job: 'assigned',
        status: 'scheduled',
        notes: '',
      });
      setAssignJobId(null);
    } catch (err) {
      console.error('Failed to assign team member:', err);
    } finally {
      setAssignLoading(false);
    }
  };

  const fetchReviewedJobs = async () => {
    if (!user || isTradie) return;
    try {
      const { data } = await supabase
        .from('reviews')
        .select('job_id')
        .eq('client_id', user.id);

      if (data) {
        setReviewedJobIds(data.map((r) => r.job_id).filter((id): id is string => id !== null));
      }
    } catch (err) {
      console.error('fetchReviewedJobs error:', err);
    }
  };

  const fetchJobs = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const query = supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email, phone), projects(id, title)')
        .eq(isTradie ? 'tradie_id' : 'client_id', user.id)
        .order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const filteredJobs = (data as JobWithRelations[]).filter((job: JobWithRelations) => {
          if (job.status === 'declined' && job.declined_at) {
            const declinedDate = new Date(job.declined_at);
            return declinedDate > twoDaysAgo;
          }
          return true;
        });

        if (isTradie) {
          filteredJobs.sort((a, b) => {
            const aFlash = a.is_flash_boost && a.flash_expiry && new Date(a.flash_expiry) > new Date();
            const bFlash = b.is_flash_boost && b.flash_expiry && new Date(b.flash_expiry) > new Date();
            if (aFlash && !bFlash) return -1;
            if (!aFlash && bFlash) return 1;
            return 0;
          });

          // Exclude jobs linked to recurring services — managed via Ongoing Services tab.
          // Cover both the original placeholder (recurring_jobs.original_job_id) and any
          // quote-request jobs (jobs.recurring_job_id).
          const { data: recurringLinked } = await supabase
            .from('recurring_jobs')
            .select('original_job_id')
            .eq('tradie_id', user.id)
            .not('original_job_id', 'is', null);
          const recurringJobIds = new Set<string>();
          for (const r of recurringLinked || []) {
            if (r.original_job_id) recurringJobIds.add(r.original_job_id);
          }
          for (const j of filteredJobs as { id: string; recurring_job_id?: string | null }[]) {
            if (j.recurring_job_id) recurringJobIds.add(j.id);
          }
          if (recurringJobIds.size > 0) {
            const beforeCount = filteredJobs.length;
            const remaining = filteredJobs.filter(j => !recurringJobIds.has(j.id));
            if (remaining.length < beforeCount) {
              filteredJobs.length = 0;
              filteredJobs.push(...remaining);
            }
          }
        }

        setAllJobs(filteredJobs as JobWithRelations[]);

        // Check which completed jobs have been paid (escrow released)
        const completedJobIds = filteredJobs.filter(j => j.status === 'completed').map(j => j.id);
        if (completedJobIds.length > 0) {
          try {
            const { data: payments } = await supabase
              .from('payments')
              .select('job_id, metadata')
              .in('job_id', completedJobIds);
            if (payments) {
              const paid = new Set<string>();
              for (const p of payments) {
                const meta = p.metadata as Record<string, unknown> | null;
                if (meta?.transfer_id || meta?.released_at) {
                  paid.add(p.job_id);
                }
              }
              if (paid.size > 0) setPaidJobIds(paid);
            }
          } catch (err) {
            console.error('Error checking payment status:', err);
          }
        }

        // Fetch tradie names for client's completed jobs
        if (!isTradie) {
          const tradieIds = [...new Set(filteredJobs.filter(j => j.tradie_id).map(j => j.tradie_id!))];
          if (tradieIds.length > 0) {
            try {
              const { data: tradieProfiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', tradieIds);
              if (tradieProfiles) {
                const names = new Map<string, string>();
                for (const tp of tradieProfiles) {
                  names.set(tp.id, tp.full_name);
                }
                setTradieNames(names);
              }
            } catch (err) {
              console.error('Error fetching tradie names:', err);
            }
          }
        }

        // Fetch tradie's own quotes for these jobs
        if (isTradie) {
          const pendingJobIds = filteredJobs.filter(j => ['pending', 'funded', 'in_progress'].includes(j.status)).map(j => j.id);
          if (pendingJobIds.length > 0) {
            try {
              const { data: quotes, error: quotesError } = await supabase
                .from('quotes')
                .select('*')
                .eq('tradie_id', user.id)
                .in('job_id', pendingJobIds);
              if (quotesError) throw quotesError;
              if (quotes) {
                const map = new Map<string, Quote>();
                for (const q of quotes as Quote[]) {
                  map.set(q.job_id, q);
                }
                setMyQuotes(map);
              }
            } catch (err) {
              console.error('Error fetching quotes:', err);
            }
          }
        }

        // Compute counts from fetched data
        const counts: Record<string, number> = {};
        for (const j of filteredJobs) {
          // Merge accepted + funded + in_progress into 'active'
          if (['accepted', 'funded', 'in_progress'].includes(j.status)) {
            counts.active = (counts.active || 0) + 1;
          } else {
            counts[j.status] = (counts[j.status] || 0) + 1;
          }
        }
        counts.all = filteredJobs.length;
        setJobCounts(counts);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
    setLoading(false);
  };

  // Job counts are now computed within fetchJobs to avoid extra DB queries

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in_progress':
        return 'bg-secondary-100 text-secondary-700 border-secondary-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'declined':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'accepted':
        return 'bg-secondary-100 text-secondary-700 border-secondary-200';
      case 'funded':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-warm-100 text-warm-700 border-warm-200';
    }
  };

  const [operationError, setOperationError] = useState<string | null>(null);

  const [offlineQueued, setOfflineQueued] = useState(false);

  const handleAcceptJob = async (job: JobWithRelations) => {
    if (!user) return;

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

    setActionLoading(job.id);

    // Normalize profiles to undefined if null
    const normalizedJob = { ...job, profiles: job.profiles ?? undefined };

    const result = await offlineAcceptJob(normalizedJob.id, user.id);

    if (result.online) {
      if (normalizedJob.slot_id) {
        await supabase
          .from('availability_slots')
          .update({ status: 'booked' })
          .eq('id', normalizedJob.slot_id);
      }
      if (normalizedJob.project_id) {
        autoNameProject(normalizedJob.project_id, {
          description: normalizedJob.description,
          location_address: normalizedJob.location_address,
        });
      }

      // Notify client that their job was accepted
      if (normalizedJob.client_id) {
        const tradieName = profile?.full_name || 'A tradie';
        const category = normalizedJob.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || '';
        const jobTitle = normalizedJob.title || category || 'your job';
        try {
          await supabase.rpc('create_notification', {
            p_user_id: normalizedJob.client_id,
            p_title: 'Job Accepted',
            p_message: `${tradieName} has accepted ${jobTitle}. Next step: fund the payment to secure the booking.`,
            p_type: 'JOB_ACCEPTED',
            p_channel: 'in_app',
            p_read: false,
            p_link: null,
            p_job_id: normalizedJob.id,
            p_metadata: {},
          });
        } catch {
          // Non-critical
        }
      }

      setFilter('active');
      setAcceptSuccess(true);
      setTimeout(() => setAcceptSuccess(false), 8000);
    } else {
      setOfflineQueued(true);
      setTimeout(() => setOfflineQueued(false), 4000);
    }

    setActionLoading(null);
  };

  const handleDeclineJob = async (reason: string) => {
    if (!jobToDecline || !user) return;

    const isDirectJob = jobToDecline.tradie_id === user.id;
    const clientName = jobToDecline.profiles?.full_name || 'Client';

    try {
      if (isDirectJob) {
        // Direct job: set to declined
        const { error } = await supabase
          .from('jobs')
          .update({
            status: 'declined',
            decline_reason: reason,
            declined_at: new Date().toISOString(),
          })
          .eq('id', jobToDecline.id);

        if (error) {
          console.error('handleDeclineJob error:', error);
          setOperationError('Failed to decline job. Please try again.');
          return;
        }
      } else {
        // Marketplace job: unassign tradie so the job remains open for others
        const { error } = await supabase
          .from('jobs')
          .update({
            decline_reason: reason,
            declined_at: new Date().toISOString(),
          })
          .eq('id', jobToDecline.id);

        if (error) {
          console.error('handleDeclineJob error:', error);
          setOperationError('Failed to decline job. Please try again.');
          return;
        }
      }

      // Mark the tradie's quote as declined so analytics picks it up
      await supabase
        .from('quotes')
        .update({ status: 'declined' as const })
        .eq('job_id', jobToDecline.id)
        .eq('tradie_id', user.id);

      if (jobToDecline.slot_id) {
        await supabase
          .from('availability_slots')
          .update({ status: 'available' })
          .eq('id', jobToDecline.slot_id);
      }

      // Notify the homeowner
      if (jobToDecline.client_id) {
        const tradieName = tradieDetails?.business_name || profile?.full_name || 'A tradie';
        sendNotification({
          type: NOTIFICATION_TYPES.JOB_DECLINED,
          userId: jobToDecline.client_id,
          title: 'Job Declined',
          message: `${tradieName} has declined your job. Reason: "${reason}"`,
          jobId: jobToDecline.id,
          link: `/dashboard`,
          metadata: {
            job_id: jobToDecline.id,
            tradie_id: user.id,
            decline_reason: reason,
          },
        }).catch(() => {
          // Non-critical — decline was recorded, notification is best-effort
        });
      }

      // Auto-dismiss so the lead doesn't reappear on dashboard or Leads page
      try {
        const stored = localStorage.getItem('dismissed_leads');
        const dismissed: string[] = stored ? JSON.parse(stored) : [];
        if (!dismissed.includes(jobToDecline.id)) {
          dismissed.push(jobToDecline.id);
          localStorage.setItem('dismissed_leads', JSON.stringify(dismissed));
        }
      } catch { /* ignore localStorage errors */ }

      showToast(`Job declined — ${clientName} has been notified`);
      await fetchJobs();
    } catch (err) {
      console.error('handleDeclineJob error:', err);
      setOperationError('Failed to decline job. Please try again.');
    }
  };

  const handleStartJob = async (job: JobWithRelations) => {
    if (!user) return;

    if (isTradie && isLicenseExpired) {
      setGateReason('expired');
      setShowVerificationGate(true);
      return;
    }

    // Warn-but-allow on-site check — only for workers assigned by an employer
    // (the flag is for employer oversight; solo tradies start normally). Fails
    // open: no job coords or no GPS fix just proceeds without a warning.
    const isEmployedWorker = !!profile?.employer_id && profile?.employer_status === 'active';
    if (isEmployedWorker && job.latitude != null && job.longitude != null) {
      setActionLoading(job.id);
      const pos = await getCurrentPositionOnce();
      setActionLoading(null);
      if (pos) {
        const distanceM = calculateDistance(pos.lat, pos.lng, job.latitude, job.longitude) * 1000;
        const radiusM = job.geofence_radius_m ?? 150;
        if (distanceM > radiusM) {
          setOffSiteStart({ job, distanceM, pos });
          return;
        }
      }
    }

    await proceedStartJob(job);
  };

  const proceedStartJob = async (
    job: JobWithRelations,
    offSite?: { distanceM: number; pos: { lat: number; lng: number } },
  ) => {
    if (!user) return;
    const normalizedJob = { ...job, profiles: job.profiles ?? undefined };
    setActionLoading(normalizedJob.id);

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'in_progress' })
        .eq('id', normalizedJob.id);

      if (!error) {
        // Log the off-site start so the employer sees it in Site Activity.
        // Best-effort — never fail the start on this.
        if (offSite) {
          const { error: logError } = await supabase.from('site_visit_events').insert({
            tradie_id: user.id,
            job_id: normalizedJob.id,
            action: 'START_OFFSITE',
            latitude: offSite.pos.lat,
            longitude: offSite.pos.lng,
            distance_m: offSite.distanceM,
          });
          if (logError) console.error('proceedStartJob: off-site log failed', logError);
        }
        await fetchJobs();
      } else {
        console.error('handleStartJob error:', error);
        setOperationError('Failed to start job. Please try again.');
      }
    } catch (err) {
      console.error('handleStartJob error:', err);
      setOperationError('Failed to start job. Please try again.');
    }

    setActionLoading(null);
  };

  const handleCompleteJob = (job: JobWithRelations) => {
    if (!user) return;

    if (isTradie && isLicenseExpired) {
      setGateReason('expired');
      setShowVerificationGate(true);
      return;
    }

    // Normalize profiles to undefined if null
    const normalizedJob = { ...job, profiles: job.profiles ?? undefined };
    setCompletionJob(normalizedJob);
  };

  const content = (
    <>
      <div className={`${embedded ? '' : 'max-w-5xl'} mx-auto`}>
        {paymentSuccess && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">{paymentSuccess}</p>
          </div>
        )}
        {acceptSuccess && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-bold text-green-800">Job accepted!</p>
            </div>
            <p className="text-xs text-green-700 ml-8">Next: Contact the client via Messages to confirm the details. Once payment is secured, you can mark the job complete when finished.</p>
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
        {operationError && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm font-medium text-red-800">{operationError}</p>
            <button onClick={() => setOperationError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}
        {!embedded && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{isTradie ? 'My Jobs' : 'Active Jobs'}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {isTradie ? 'Jobs you\'ve been assigned or accepted — track progress and mark complete' : 'Track your posted jobs, view quotes, and manage active work'}
              </p>
            </div>
          </div>
        )}

        {isTradie && !profile?.stripe_connect_onboarding_complete && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Payouts not set up</p>
                <p className="text-xs text-amber-700 mt-0.5">You won&apos;t receive payments for completed jobs until your bank account is connected.</p>
              </div>
              <button
                onClick={() => navigate('/payouts')}
                className="flex-shrink-0 px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-xl hover:bg-amber-700 transition-colors"
              >
                Set Up Payouts
              </button>
            </div>
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
                  Your trade license has expired. You cannot accept, start, or complete jobs until your license is renewed.
                </p>
                <button
                  onClick={() => navigate('/settings')}
                  className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Upload Renewed License
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-3 sm:gap-6 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          {([
            { key: 'pending', label: 'Pending' },
            { key: 'active', label: 'Active' },
            { key: 'completed', label: 'Completed' },
            { key: 'all', label: 'All Jobs' },
          ] as { key: JobStatus; label: string }[]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`pb-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                filter === tab.key
                  ? 'border-warm-500 text-warm-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {(jobCounts[tab.key] ?? 0) > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  filter === tab.key
                    ? 'bg-warm-100 text-warm-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {jobCounts[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div>

          {loading ? (
            <ListSkeleton rows={5} />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={
                filter === 'pending' ? Clock :
                filter === 'active' ? CheckCircle2 :
                filter === 'completed' ? Check :
                ClipboardList
              }
              title={
                filter === 'pending' ? 'No pending jobs' :
                filter === 'active' ? 'No active jobs' :
                filter === 'completed' ? 'No completed jobs yet' :
                'No jobs yet'
              }
              description={
                isTradie
                  ? filter === 'pending'
                    ? 'When clients book your services, their job requests will show up here.'
                    : filter === 'active'
                    ? 'Jobs you\'ve won will appear here. Check Pending for new leads.'
                    : filter === 'completed'
                    ? 'Completed jobs will appear here after you mark them as done.'
                    : 'When clients book your services, their job requests will show up here.'
                  : 'You haven\'t posted any jobs yet. Post a job and tradies in your area will send you quotes.'
              }
              actionLabel={
                isTradie
                  ? filter === 'pending' ? 'Set Your Availability'
                  : filter === 'active' ? 'View Pending Jobs'
                  : undefined
                  : 'Post a Job'
              }
              onAction={() =>
                isTradie
                  ? filter === 'active' ? setFilter('pending')
                  : navigate('/dashboard')
                  : navigate('/post-lead')
              }
            />
          ) : filter === 'completed' ? (
            (() => {
              // Group completed jobs by month
              const monthGroups = new Map<string, JobWithRelations[]>();
              jobs.forEach((job) => {
                const dateStr = job.completed_at || job.updated_at || job.created_at;
                const date = new Date(dateStr);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthGroups.has(monthKey)) monthGroups.set(monthKey, []);
                monthGroups.get(monthKey)!.push(job);
              });
              // Sort months newest first
              const sortedMonths = [...monthGroups.entries()].sort((a, b) => b[0].localeCompare(a[0]));

              return (
                <div className="space-y-4">
                  {sortedMonths.map(([monthKey, monthJobs]) => {
                    const [year, month] = monthKey.split('-');
                    const monthLabel = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
                    const isCollapsed = collapsedMonths.has(monthKey);

                    return (
                      <div key={monthKey}>
                        <button
                          onClick={() => setCollapsedMonths(prev => {
                            const next = new Set(prev);
                            if (next.has(monthKey)) next.delete(monthKey);
                            else next.add(monthKey);
                            return next;
                          })}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors mb-2"
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">{monthLabel}</h3>
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                              {monthJobs.length}
                            </span>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        </button>

                        {!isCollapsed && (
                          <div className="space-y-3 ml-1">
                            {monthJobs.map((job) => {
                              const isFlashActive = job.is_flash_boost && job.flash_expiry && new Date(job.flash_expiry) > new Date();
                              const normalizedJob = { ...job, profiles: job.profiles ?? undefined };
                              return (
                                <div
                                  key={job.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setSelectedJob(normalizedJob)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setSelectedJob(normalizedJob);
                                    }
                                  }}
                                  className="w-full text-left rounded-xl transition-all cursor-pointer border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                                >
                                  {!isTradie ? (
                                  /* ── Client completed card: clean summary ── */
                                  <div className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <h3 className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0">
                                        {job.title || job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job'}
                                      </h3>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${getStatusColor(job.status)}`}>
                                        {paidJobIds.has(job.id) ? 'paid' : job.status.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                    <div className="space-y-1.5 text-sm text-gray-600">
                                      {job.location_address && (
                                        <div className="flex items-center gap-2">
                                          <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                          <span className="truncate">{job.location_address.split(',').slice(0, 2).join(',')}</span>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                        <span>Completed {formatDate(job.completed_at || job.updated_at || job.created_at)}</span>
                                      </div>
                                      {job.tradie_id && (
                                        <div className="flex items-center gap-2">
                                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                                          <span>{tradieNames.get(job.tradie_id) || 'Tradie'}</span>
                                        </div>
                                      )}
                                    </div>
                                    {job.tradie_id && !reviewedJobIds.includes(job.id) && (
                                      <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); navigate(`/review/${job.id}`); }}
                                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors"
                                        >
                                          <Star className="w-3.5 h-3.5" />
                                          Leave a Review
                                        </button>
                                      </div>
                                    )}
                                    {reviewedJobIds.includes(job.id) && (
                                      <div className="mt-3 pt-3 border-t border-gray-100">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          Review submitted
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  /* ── Tradie completed card: existing layout ── */
                                  <>
                                  <div className="px-5 pt-4 pb-3">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                                          {job.title || job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job'}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          {job.profiles?.full_name || 'Client'}
                                        </p>
                                      </div>
                                      <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${getStatusColor(job.status)}`}>
                                        {job.status.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                      {descriptionPreview(redactSensitiveInfo(job.description, true), 60)}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                                      {(() => {
                                        const cat = job.description.match(/^\[([^\]]+)\]/)?.[1];
                                        return cat ? <span className="capitalize">{cat.replace(/_/g, ' ')}</span> : null;
                                      })()}
                                      {job.title && /ongoing|recurring/i.test(job.title) && (
                                        <span className="inline-flex items-center gap-1 text-secondary-500">
                                          <Repeat className="w-3 h-3" />
                                          Ongoing
                                        </span>
                                      )}
                                      {job.location_address && (
                                        <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                                          <MapPin className="w-3 h-3 flex-shrink-0" />
                                          {job.location_address.split(',')[0]}
                                        </span>
                                      )}
                                      {job.budget_amount ? (
                                        <span className="font-medium text-gray-900">${job.budget_amount.toLocaleString()}</span>
                                      ) : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted') ? (
                                        <span>Quote requested</span>
                                      ) : null}
                                      <span className="inline-flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {formatDate(job.completed_at || job.created_at)}
                                      </span>
                                    </div>
                                  </div>

                                  {job.status === 'completed' && !job.completion_notes && (
                                    <div className="px-5 pb-4 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleCompleteJob(job); }}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors"
                                      >
                                        Request Payment
                                      </button>
                                    </div>
                                  )}

                                  {job.status === 'completed' && job.completion_notes && (
                                    <div className="px-5 pb-3 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${paidJobIds.has(job.id) ? 'text-emerald-600' : 'text-gray-500'}`}>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        {paidJobIds.has(job.id) ? 'Paid' : 'Payment requested'}
                                      </span>
                                    </div>
                                  )}
                                  </>
                                )}

                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const isFlashActive = job.is_flash_boost && job.flash_expiry && new Date(job.flash_expiry) > new Date();

                // Normalize profiles to undefined if null
                const normalizedJob = { ...job, profiles: job.profiles ?? undefined };
                return (
                <div
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    // Pending unquoted jobs → go straight to quote modal
                    if (isTradie && job.status === 'pending' && !myQuotes.has(job.id)) {
                      setQuoteJob(normalizedJob);
                    } else {
                      setSelectedJob(normalizedJob);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isTradie && job.status === 'pending' && !myQuotes.has(job.id)) {
                        setQuoteJob(normalizedJob);
                      } else {
                        setSelectedJob(normalizedJob);
                      }
                    }
                  }}
                  className={`w-full text-left rounded-xl transition-all cursor-pointer ${
                    isFlashActive && isTradie
                      ? 'border-2 border-warm-400 shadow-[0_0_12px_rgba(251,191,36,0.2)] hover:shadow-[0_0_18px_rgba(251,191,36,0.3)] bg-white'
                      : 'border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {/* ── Header ── */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {job.title || job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {job.profiles?.full_name || 'Client'}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${
                        job.status === 'funded' && myQuotes.get(job.id)?.requires_site_inspection && myQuotes.get(job.id)?.final_price == null
                          ? 'bg-amber-100 text-amber-700 border-amber-200'
                          : getStatusColor(job.status)
                      }`}>
                        {job.status === 'funded' && myQuotes.get(job.id)?.requires_site_inspection && myQuotes.get(job.id)?.final_price == null
                          ? 'Set Price'
                          : job.status === 'funded' ? 'Paid' : job.status === 'accepted' ? 'Awaiting Payment' : job.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                      {descriptionPreview(redactSensitiveInfo(job.description, true), 60)}
                    </p>

                    {/* ── Metadata row ── */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                      {(() => {
                        const cat = job.description.match(/^\[([^\]]+)\]/)?.[1];
                        return cat ? <span className="capitalize">{cat.replace(/_/g, ' ')}</span> : null;
                      })()}
                      {job.title && /ongoing|recurring/i.test(job.title) && (
                        <span className="inline-flex items-center gap-1 text-secondary-500">
                          <Repeat className="w-3 h-3" />
                          Ongoing
                        </span>
                      )}
                      {job.location_address && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {job.location_address.split(',')[0]}
                        </span>
                      )}
                      {job.budget_amount ? (
                        <span className="font-medium text-gray-900">${job.budget_amount.toLocaleString()}</span>
                      ) : (job.budget_type === 'request_quote' || job.budget_type === 'to_be_quoted') ? (
                        <span>Quote requested</span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(job.created_at)}
                      </span>
                    </div>
                  </div>

                  {isFlashActive && isTradie && job.status === 'pending' && (
                    <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg">
                      <Zap className="w-3.5 h-3.5 text-warm-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-warm-800">
                        Flash Deal — ends in <FlashCountdown expiry={job.flash_expiry!} />
                      </span>
                    </div>
                  )}

                  {!isTradie && isFlashActive && job.status === 'pending' && (
                    <div className="mx-5 mb-3 flex items-center gap-2 px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg">
                      <Zap className="w-3.5 h-3.5 text-warm-500 flex-shrink-0" />
                      <span className="text-xs text-warm-700">Boosting your job to find a Tradie faster</span>
                    </div>
                  )}

                  {job.status === 'declined' && job.decline_reason && (
                    <div className="mx-5 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700"><span className="font-medium">Declined:</span> {job.decline_reason}</p>
                    </div>
                  )}

                  {isTradie && job.status === 'pending' && (
                    <div className="px-5 pb-4 pt-1 flex items-center gap-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {job.budget_type === 'to_be_quoted' || job.budget_type === 'request_quote' ? (
                        myQuotes.has(job.id) ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary-50 border border-secondary-200 rounded-lg">
                            <CheckCircle2 className="w-3.5 h-3.5 text-secondary-600" />
                            <span className="text-xs font-medium text-secondary-700">
                              Quoted {myQuotes.get(job.id)!.firm_price
                                ? `$${myQuotes.get(job.id)!.firm_price!.toLocaleString()}`
                                : `$${myQuotes.get(job.id)!.price_min.toLocaleString()} – $${myQuotes.get(job.id)!.price_max.toLocaleString()}`
                              }
                            </span>
                            <span className="text-xs text-secondary-400">· Awaiting response</span>
                          </div>
                        ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuoteJob(job); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors"
                        >
                          <ClipboardList className="w-3.5 h-3.5" />
                          Quote Now
                        </button>
                        )
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAcceptJob(job); }}
                          disabled={actionLoading === job.id}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium transition-colors"
                        >
                          {actionLoading === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          {actionLoading === job.id ? 'Accepting...' : 'Accept Job'}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setJobToDecline(job); }}
                        disabled={actionLoading === job.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
                      >
                        <XIcon className="w-3.5 h-3.5" />
                        Decline
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'accepted' && (
                    <div className="px-5 pb-4 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting client payment
                      </span>
                    </div>
                  )}

                  {isTradie && (job.status === 'funded' || job.status === 'in_progress') && (
                    <div className="px-5 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Site-visit job at funded: show "Set Final Price" instead of "Mark Complete" */}
                      {job.status === 'funded' && myQuotes.get(job.id)?.requires_site_inspection && myQuotes.get(job.id)?.final_price == null ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedJob(job);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium transition-colors"
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                            Set Final Price
                          </button>
                          <span className="text-xs text-amber-700">After site visit</span>
                        </div>
                      ) : (
                      <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (job.status === 'funded') {
                            await handleStartJob(job);
                            // Re-read updated job so completion modal sees 'in_progress'
                            const updatedJob = { ...job, status: 'in_progress' };
                            handleCompleteJob(updatedJob as JobWithRelations);
                            return;
                          }
                          handleCompleteJob(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 text-sm font-medium transition-colors"
                      >
                        {actionLoading === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        {actionLoading === job.id ? 'Processing...' : 'Mark Complete'}
                      </button>
                      {teamMembers.length > 0 && job.status === 'funded' && (
                        <>
                          {assignJobId === job.id ? (
                            <div className="w-full bg-gray-50 rounded-lg p-3 space-y-2">
                              <p className="text-xs font-medium text-gray-700">Assign to team member:</p>
                              {teamMembers.map((m) => (
                                <button
                                  key={m.id}
                                  onClick={(e) => { e.stopPropagation(); handleAssignToTeam(job.id, m.id); }}
                                  disabled={assignLoading}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white text-sm transition-colors disabled:opacity-50"
                                >
                                  <User className="w-4 h-4 text-gray-400" />
                                  <span className="font-medium text-gray-900">{m.invite_name}</span>
                                  <span className="text-xs text-gray-500 capitalize">{m.role}</span>
                                </button>
                              ))}
                              <button
                                onClick={(e) => { e.stopPropagation(); setAssignJobId(null); }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAssignJobId(job.id); }}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm font-medium"
                            >
                              <Users className="w-4 h-4" />
                              Assign to Team
                            </button>
                          )}
                        </>
                      )}
                      </div>
                      )}
                    </div>
                  )}

                  {isTradie && job.status === 'completed' && !job.completion_notes && (
                    <div className="px-5 pb-4 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCompleteJob(job); }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors"
                      >
                        Request Payment
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'completed' && job.completion_notes && (
                    <div className="px-5 pb-3 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${paidJobIds.has(job.id) ? 'text-emerald-600' : 'text-gray-500'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {paidJobIds.has(job.id) ? 'Paid' : 'Payment requested'}
                      </span>
                    </div>
                  )}

                  {!isTradie && job.status === 'completed' && job.tradie_id && (
                    <div className="px-5 pb-4 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {reviewedJobIds.includes(job.id) ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Review submitted
                        </span>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/review/${job.id}`); }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 text-sm font-medium transition-colors"
                        >
                          <Star className="w-3.5 h-3.5" />
                          Leave a Review
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <JobDetailModal
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
        job={selectedJob ? { ...selectedJob, profiles: selectedJob.profiles ?? undefined } : null}
        isUnlocked={true}
        onStatusChange={fetchJobs}
        onQuote={selectedJob && !myQuotes.has(selectedJob.id) ? (startDate) => {
          setProposedStartDate(startDate ?? null);
          setQuoteJob(selectedJob);
          setSelectedJob(null);
        } : undefined}
        onComplete={selectedJob ? () => handleCompleteJob(selectedJob) : undefined}
      />


      {reviewJob && reviewJob.tradie_id && (
        <ReviewModal
          isOpen={!!reviewJob}
          onClose={() => setReviewJob(null)}
          jobId={reviewJob.id}
          tradieId={reviewJob.tradie_id}
          tradieName={reviewJob.profiles?.full_name || 'Tradie'}
          onReviewSubmitted={() => {
            fetchReviewedJobs();
            fetchJobs();
          }}
        />
      )}

      <DeclineJobModal
        isOpen={!!jobToDecline}
        onClose={() => setJobToDecline(null)}
        onDecline={handleDeclineJob}
        jobDescription={jobToDecline?.description || ''}
        jobTitle={jobToDecline?.title || undefined}
      />

      <VerificationGateModal
        isOpen={showVerificationGate}
        onClose={() => setShowVerificationGate(false)}
        reason={gateReason}
      />

      {offSiteStart && (
        <ConfirmModal
          type="warning"
          title="You're not at the job site"
          message={`You appear to be about ${
            offSiteStart.distanceM >= 1000
              ? `${(offSiteStart.distanceM / 1000).toFixed(1)} km`
              : `${Math.round(offSiteStart.distanceM)} m`
          } from ${offSiteStart.job.title || 'the job site'}. Starting a job away from the site is logged and visible to your employer. Start anyway?`}
          confirmText="Start anyway"
          cancelText="Cancel"
          onConfirm={() => {
            const s = offSiteStart;
            setOffSiteStart(null);
            proceedStartJob(s.job, { distanceM: s.distanceM, pos: s.pos });
          }}
          onCancel={() => setOffSiteStart(null)}
        />
      )}

      {completionJob && user && (
        <JobCompletionModal
          isOpen={!!completionJob}
          onClose={() => setCompletionJob(null)}
          job={completionJob}
          userId={user.id}
          onCompleted={() => {
            setCompletionJob(null);
            fetchJobs();
          }}
        />
      )}

      {quoteJob && (
        <SubmitQuoteModal
          isOpen={!!quoteJob}
          onClose={() => { setQuoteJob(null); setProposedStartDate(null); }}
          job={quoteJob}
          proposedStartDate={proposedStartDate}
          onQuoteSubmitted={() => {
            setQuoteJob(null);
            setProposedStartDate(null);
            fetchJobs();
          }}
        />
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm ${toast.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
          <div className={`w-2 h-2 ${toast.isError ? 'bg-red-300' : 'bg-green-300'} rounded-full animate-pulse`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout><SectionErrorBoundary>{content}</SectionErrorBoundary></DashboardLayout>;
}
