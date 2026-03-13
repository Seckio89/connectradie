import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Calendar, CheckCircle2, AlertCircle, XCircle, Loader2, User, Star, Check, X as XIcon, Play, Package, ClipboardList, Zap, WifiOff, ShieldAlert, Settings, Users, MapPin } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { offlineAcceptJob } from '../lib/offlineSync';
import { autoNameProject } from '../lib/projectAutoName';
import { formatDate, checkLicenseExpired } from '../lib/utils';
import { redactSensitiveInfo } from '../lib/redaction';
import type { JobWithRelations } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import JobDetailModal from '../components/JobDetailModal';
import ReviewModal from '../components/ReviewModal';
import DeclineJobModal from '../components/DeclineJobModal';
import EmptyState from '../components/EmptyState';
import VerificationGateModal from '../components/VerificationGateModal';
import JobCompletionModal from '../components/JobCompletionModal';
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
  type JobStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'all';
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
  const [teamMembers, setTeamMembers] = useState<{ id: string; invite_name: string; role: string }[]>([]);
  const [assignJobId, setAssignJobId] = useState<string | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState(false);
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({});
  const [paidJobIds, setPaidJobIds] = useState<Set<string>>(new Set());
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

  // Client-side filtering when filter or allJobs change
  useEffect(() => {
    if (allJobs.length === 0 && !loading) {
      setJobs([]);
      return;
    }
    if (filter === 'all') {
      setJobs(allJobs);
    } else if (filter === 'accepted') {
      setJobs(allJobs.filter(j => j.status === 'accepted' || j.status === 'funded'));
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

    const query = supabase
      .from('jobs')
      .select('*, profiles!jobs_client_id_fkey(full_name, email, phone), projects(id, title)')
      .eq(isTradie ? 'tradie_id' : 'client_id', user.id)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (!error && data) {
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
              if (meta?.transfer_id) {
                paid.add(p.job_id);
              }
            }
            if (paid.size > 0) setPaidJobIds(paid);
          }
        } catch (err) {
          console.error('Error checking payment status:', err);
        }
      }

      // Compute counts from fetched data
      const counts: Record<string, number> = {};
      for (const j of filteredJobs) {
        const key = j.status === 'funded' ? 'accepted' : j.status;
        counts[key] = (counts[key] || 0) + 1;
      }
      counts.all = filteredJobs.length;
      setJobCounts(counts);
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
      setMonthlyAccepts((prev) => prev + 1);
      setFilter('accepted');
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

    try {
      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'declined',
          decline_reason: reason,
          declined_at: new Date().toISOString()
        })
        .eq('id', jobToDecline.id);

      if (error) {
        console.error('handleDeclineJob error:', error);
        setOperationError('Failed to decline job. Please try again.');
        return;
      }

      // Also mark the tradie's quote as declined so analytics picks it up
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

      await fetchJobs();

      if (filter === 'pending') {
        setFilter('declined');
      }
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

    // Normalize profiles to undefined if null
    const normalizedJob = { ...job, profiles: job.profiles ?? undefined };
    setActionLoading(normalizedJob.id);

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'in_progress' })
        .eq('id', normalizedJob.id);

      if (!error) {
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
            <p className="text-xs text-green-700 ml-8">Next: Contact the client via Messages to confirm the details, then hit "Start Job" when you're ready to begin work.</p>
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
        <div className="flex items-center gap-6 border-b border-gray-200 mb-6 overflow-x-auto">
          {([
            { key: 'pending', label: 'Pending' },
            { key: 'accepted', label: 'Accepted' },
            { key: 'in_progress', label: 'In Progress' },
            { key: 'completed', label: 'Completed' },
            { key: 'declined', label: 'Declined' },
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
                filter === 'accepted' ? CheckCircle2 :
                filter === 'in_progress' ? Play :
                filter === 'completed' ? Check :
                filter === 'declined' ? XCircle :
                ClipboardList
              }
              title={
                filter === 'pending' ? 'No pending jobs' :
                filter === 'accepted' ? 'No accepted jobs' :
                filter === 'in_progress' ? 'No jobs in progress' :
                filter === 'completed' ? 'No completed jobs yet' :
                filter === 'declined' ? 'No declined jobs' :
                'No jobs yet'
              }
              description={
                isTradie
                  ? filter === 'pending'
                    ? 'When clients book your services, their job requests will show up here.'
                    : filter === 'accepted'
                    ? 'Jobs you accept will appear here. Accept a pending job to get started.'
                    : filter === 'in_progress'
                    ? 'Jobs move here once you start working on them.'
                    : filter === 'completed'
                    ? 'Completed jobs will appear here after you mark them as done.'
                    : filter === 'declined'
                    ? 'Jobs you decline will appear here temporarily.'
                    : 'When clients book your services, their job requests will show up here.'
                  : 'You haven\'t posted any jobs yet. Post a job and tradies in your area will send you quotes.'
              }
              actionLabel={
                isTradie
                  ? filter === 'pending' ? 'Set Your Availability'
                  : filter === 'accepted' ? 'View Pending Jobs'
                  : undefined
                  : 'Post a Job'
              }
              onAction={() =>
                isTradie
                  ? filter === 'accepted' ? setFilter('pending')
                  : navigate('/dashboard')
                  : navigate('/post-lead')
              }
            />
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
                  onClick={() => setSelectedJob(normalizedJob)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedJob(normalizedJob);
                    }
                  }}
                  className={`w-full text-left rounded-xl p-6 transition-all cursor-pointer ${
                    isFlashActive && isTradie
                      ? 'border-2 border-warm-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] bg-gradient-to-r from-warm-50/50 to-white'
                      : 'border border-gray-200 hover:border-primary-300 hover:shadow-md'
                  }`}
                >
                  {/* ── Card Header: Category + Status ── */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      {(() => {
                        const cat = job.description.match(/^\[([^\]]+)\]/)?.[1];
                        return cat ? (
                          <span className="px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-sm font-semibold border border-secondary-200 capitalize">
                            {cat.replace(/_/g, ' ')}
                          </span>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <h3 className="font-semibold text-gray-900">
                            {job.profiles?.full_name || 'Client'}
                          </h3>
                        </div>
                      </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          job.status
                        )}`}
                      >
                        {job.status === 'funded' ? 'Paid — Ready to Start' : job.status === 'accepted' ? 'Awaiting Payment' : job.status.replace(/_/g, ' ')}
                      </span>
                      {isFlashActive && isTradie && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-warm-400 to-warm-400 text-white rounded-full text-xs font-bold shadow-sm animate-pulse">
                          <Zap className="w-3 h-3" />
                          Flash Deal
                        </span>
                      )}
                      {!isTradie && isFlashActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-warm-50 text-warm-700 rounded-full text-xs font-medium border border-warm-200">
                          <Zap className="w-3 h-3" />
                          Boosted
                        </span>
                      )}
                      {job.projects && (
                        <div className="flex items-center gap-1 px-3 py-1 bg-secondary-50 text-secondary-700 rounded-full text-xs font-medium border border-secondary-200">
                          <Package className="w-3 h-3" />
                          {job.projects.title}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Job Description (cleaned) ── */}
                  <p className="text-gray-700 mb-3 line-clamp-2">
                    {redactSensitiveInfo(job.description.replace(/^\[[^\]]+\]\s*/, ''), true)}
                  </p>

                  {/* ── Key Details Row ── */}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    {job.location_address && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        <span className="truncate max-w-[200px]">{job.location_address}</span>
                      </div>
                    )}
                    {job.budget_amount && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <span className="text-gray-400 font-medium text-xs">$</span>
                        <span>${job.budget_amount.toLocaleString()}</span>
                      </div>
                    )}
                    {job.estimated_duration && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>{job.estimated_duration}</span>
                      </div>
                    )}
                  </div>

                  {isFlashActive && isTradie && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-warm-50 to-warm-50 border border-warm-200 rounded-lg">
                      <Zap className="w-4 h-4 text-warm-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-warm-800">
                        Flash Deal! Priority pickup. Ends in <FlashCountdown expiry={job.flash_expiry!} />
                      </span>
                    </div>
                  )}

                  {!isTradie && isFlashActive && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-warm-50 border border-warm-200 rounded-lg">
                      <Zap className="w-4 h-4 text-warm-500 flex-shrink-0" />
                      <span className="text-sm text-warm-700">
                        We are boosting your job to find a Tradie faster.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Created {formatDate(job.created_at)}
                    </div>
                    {job.scheduled_time && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Scheduled: {formatDate(job.scheduled_time)} at{' '}
                        {new Date(job.scheduled_time).toLocaleTimeString('en-AU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    )}
                  </div>

                  {job.status === 'declined' && job.decline_reason && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-red-900 mb-2">Decline Reason:</h4>
                      <p className="text-sm text-red-700">{job.decline_reason}</p>
                    </div>
                  )}

                  {isTradie && job.status === 'pending' && (
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {job.budget_type === 'to_be_quoted' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuoteJob(job);
                          }}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg transition-colors text-sm font-medium bg-warm-500 text-white hover:bg-warm-600"
                        >
                          <ClipboardList className="w-4 h-4" />
                          Quote Now
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptJob(job);
                          }}
                          disabled={actionLoading === job.id}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium bg-green-600 text-white hover:bg-green-700"
                        >
                          {actionLoading === job.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Accepting...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              Accept Job
                            </>
                          )}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setJobToDecline(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        <XIcon className="w-4 h-4" />
                        Decline
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'accepted' && (
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm font-medium">
                        <Clock className="w-4 h-4" />
                        Awaiting Client Payment
                      </div>
                    </div>
                  )}

                  {isTradie && job.status === 'funded' && (
                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartJob(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-warm-500 text-white rounded-lg hover:bg-warm-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        {actionLoading === job.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4" />
                            Start Job
                          </>
                        )}
                      </button>
                      {teamMembers.length > 0 && (
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

                  {isTradie && job.status === 'in_progress' && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteJob(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        {actionLoading === job.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Completing...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Mark Complete
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'completed' && !job.completion_notes && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteJob(job);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        Request Payment
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'completed' && job.completion_notes && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <div className={`flex items-center gap-2 justify-center text-sm font-medium py-2 ${paidJobIds.has(job.id) ? 'text-emerald-700' : 'text-green-600'}`}>
                        <CheckCircle2 className="w-4 h-4" />
                        {paidJobIds.has(job.id) ? 'Paid' : 'Payment Requested'}
                      </div>
                    </div>
                  )}

                  {!isTradie && job.status === 'completed' && job.tradie_id && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      {reviewedJobIds.includes(job.id) ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Review submitted</span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/review/${job.id}`);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-warm-500 text-white rounded-lg hover:bg-warm-600 transition-colors text-sm font-medium"
                        >
                          <Star className="w-4 h-4" />
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
      />

      <VerificationGateModal
        isOpen={showVerificationGate}
        onClose={() => setShowVerificationGate(false)}
        reason={gateReason}
      />

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
          onClose={() => setQuoteJob(null)}
          job={quoteJob}
          onQuoteSubmitted={() => {
            setQuoteJob(null);
            fetchJobs();
          }}
        />
      )}
    </>
  );

  if (embedded) return content;
  return <DashboardLayout><SectionErrorBoundary>{content}</SectionErrorBoundary></DashboardLayout>;
}
