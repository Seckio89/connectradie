import React, { useState, useEffect } from 'react';
import { Briefcase, Clock, Calendar, CheckCircle2, AlertCircle, XCircle, Loader2, User, Star, Check, X as XIcon, Play, Package, Search, ClipboardList, Crown, Zap, WifiOff, ShieldAlert, Settings, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { offlineAcceptJob } from '../lib/offlineSync';
import { autoNameProject } from '../lib/projectAutoName';
import { formatDate, checkLicenseExpired } from '../lib/utils';
import { redactSensitiveInfo } from '../lib/redaction';
import type { Job, JobWithRelations } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import JobDetailModal from '../components/JobDetailModal';
import JobAccessModal from '../components/JobAccessModal';
import UnlockLeadModal from '../components/UnlockLeadModal';
import ReviewModal from '../components/ReviewModal';
import DeclineJobModal from '../components/DeclineJobModal';
import EmptyState from '../components/EmptyState';
import VerificationGateModal from '../components/VerificationGateModal';
import SubscriptionModal from '../components/SubscriptionModal';
import JobCompletionModal from '../components/JobCompletionModal';
import { UpgradeBanner } from '../components/ProFeatureGate';
import { isPro, getMonthlyJobAccepts, getMonthlyLeadUnlocks, canAcceptJob, canUnlockLead, getRemainingJobAccepts, getRemainingLeadUnlocks, FREE_LIMITS } from '../lib/subscription';

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
  const [jobs, setJobs] = useState<JobWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobWithRelations | null>(null);
  const [unlockedJobIds, setUnlockedJobIds] = useState<string[]>([]);
  const [showJobAccessModal, setShowJobAccessModal] = useState(false);
  const [reviewJob, setReviewJob] = useState<JobWithRelations | null>(null);
  const [reviewedJobIds, setReviewedJobIds] = useState<string[]>([]);
  const [jobToDecline, setJobToDecline] = useState<JobWithRelations | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showVerificationGate, setShowVerificationGate] = useState(false);
  const [showUnlockLeadModal, setShowUnlockLeadModal] = useState(false);
  const [unlockTargetJob, setUnlockTargetJob] = useState<JobWithRelations | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  const [gateReason, setGateReason] = useState<'unverified' | 'expired'>('unverified');
  const [completionJob, setCompletionJob] = useState<JobWithRelations | null>(null);
  const [monthlyAccepts, setMonthlyAccepts] = useState(0);
  const [monthlyUnlocks, setMonthlyUnlocks] = useState(0);
  const isTradie = profile?.role === 'tradie';
  const isVerified = profile?.verification_status === 'verified';
  const isLicenseExpired = checkLicenseExpired(profile?.verification_status, profile?.license_expiry);
  const isProUser = isPro(tradieDetails?.subscription_tier, profile?.is_premium);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const paymentType = params.get('type');

    if (payment === 'success' && paymentType) {
      const label = paymentType === 'lead_unlock' ? 'Lead unlocked successfully!' : 'Job access granted!';
      setPaymentSuccess(label);
      window.history.replaceState({}, '', window.location.pathname);
      if (user && isTradie) {
        fetchUnlockedJobs();
      }
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
        fetchUnlockedJobs();
        fetchMonthlyAccepts();
        fetchMonthlyUnlocks();
      } else {
        fetchReviewedJobs();
      }
      fetchJobs();
    }
  }, [user, filter, isTradie]);

  const fetchMonthlyAccepts = async () => {
    if (!user || !isTradie) return;
    const count = await getMonthlyJobAccepts(user.id);
    setMonthlyAccepts(count);
  };

  const fetchMonthlyUnlocks = async () => {
    if (!user || !isTradie) return;
    const count = await getMonthlyLeadUnlocks(user.id);
    setMonthlyUnlocks(count);
  };

  const fetchReviewedJobs = async () => {
    if (!user || isTradie) return;

    const { data } = await supabase
      .from('reviews')
      .select('job_id')
      .eq('client_id', user.id);

    if (data) {
      setReviewedJobIds(data.map((r) => r.job_id));
    }
  };

  const fetchUnlockedJobs = async () => {
    if (!user || !isTradie) return;

    const { data } = await supabase
      .from('job_unlocks')
      .select('job_id')
      .eq('tradie_id', user.id);

    if (data) {
      setUnlockedJobIds(data.map((j) => j.job_id));
    }
  };

  const fetchJobs = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('jobs')
      .select('*, profiles!jobs_client_id_fkey(full_name, email, phone), projects(id, title)')
      .order('created_at', { ascending: false });

    if (isTradie) {
      query = query.eq('tradie_id', user.id);
    } else {
      query = query.eq('client_id', user.id);
    }

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (!error && data) {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const filteredJobs = data.filter(job => {
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

      setJobs(filteredJobs);
    }
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'declined':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'accepted':
        return 'bg-teal-100 text-teal-700 border-teal-200';
      default:
        return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  const [quoteLoading, setQuoteLoading] = useState(false);
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const handleQuoteNow = async () => {
    if (!selectedJob || quoteLoading) return;

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

    const isJobUnlocked = unlockedJobIds.includes(selectedJob.id);

    if (!isJobUnlocked && isTradie && user) {
      setQuoteLoading(true);
      setOperationError(null);

      try {
        const { error: unlockError } = await supabase
          .from('job_unlocks')
          .insert({
            tradie_id: user.id,
            job_id: selectedJob.id,
          });

        if (unlockError) throw new Error('Failed to unlock job. Please try again.');

        setUnlockedJobIds([...unlockedJobIds, selectedJob.id]);

        const { error: jobError } = await supabase
          .from('jobs')
          .update({ status: 'accepted', tradie_id: user.id })
          .eq('id', selectedJob.id);

        if (jobError) throw new Error('Failed to accept job. Please try again.');

        if (selectedJob.slot_id) {
          const { error: slotError } = await supabase
            .from('availability_slots')
            .update({ status: 'booked' })
            .eq('id', selectedJob.slot_id);

          if (slotError) throw new Error('Job accepted but slot booking failed.');
        }

        if (selectedJob.project_id) {
          autoNameProject(selectedJob.project_id, {
            description: selectedJob.description,
            location_address: selectedJob.location_address,
          });
        }

        await fetchJobs();
      } catch (err) {
        setOperationError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      } finally {
        setQuoteLoading(false);
      }
    }
  };

  const handleUnlockJob = async () => {
    if (!selectedJob || !user || unlockLoading) return;

    if (isTradie && !canUnlockLead(isProUser, monthlyUnlocks)) {
      setShowSubscriptionModal(true);
      return;
    }

    setUnlockLoading(true);
    setOperationError(null);

    try {
      const { error: insertError } = await supabase
        .from('job_unlocks')
        .insert({
          tradie_id: user.id,
          job_id: selectedJob.id,
        });

      if (insertError) throw new Error('Failed to unlock lead. Please try again.');

      setUnlockedJobIds([...unlockedJobIds, selectedJob.id]);
      setMonthlyUnlocks((prev) => prev + 1);

      const { error: jobError } = await supabase
        .from('jobs')
        .update({ status: 'accepted', tradie_id: user.id })
        .eq('id', selectedJob.id);

      if (jobError) throw new Error('Lead unlocked but job accept failed. Please try again.');

      if (selectedJob.slot_id) {
        const { error: slotError } = await supabase
          .from('availability_slots')
          .update({ status: 'booked' })
          .eq('id', selectedJob.slot_id);

        if (slotError) throw new Error('Job accepted but slot booking failed.');
      }

      if (selectedJob.project_id) {
        autoNameProject(selectedJob.project_id, {
          description: selectedJob.description,
          location_address: selectedJob.location_address,
        });
      }

      await fetchJobs();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setUnlockLoading(false);
    }
  };

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

    if (isTradie && !canAcceptJob(isProUser, monthlyAccepts)) {
      setShowSubscriptionModal(true);
      return;
    }

    setActionLoading(job.id);

    const result = await offlineAcceptJob(job.id, user.id);

    if (result.online) {
      if (job.slot_id) {
        await supabase
          .from('availability_slots')
          .update({ status: 'booked' })
          .eq('id', job.slot_id);
      }
      if (job.project_id) {
        autoNameProject(job.project_id, {
          description: job.description,
          location_address: job.location_address,
        });
      }
      setMonthlyAccepts((prev) => prev + 1);
      setFilter('accepted');
    } else {
      setOfflineQueued(true);
      setTimeout(() => setOfflineQueued(false), 4000);
    }

    setActionLoading(null);
  };

  const handleDeclineJob = async (reason: string) => {
    if (!jobToDecline || !user) return;

    const { error } = await supabase
      .from('jobs')
      .update({
        status: 'declined',
        decline_reason: reason,
        declined_at: new Date().toISOString()
      })
      .eq('id', jobToDecline.id);

    if (error) {
      throw error;
    }

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
  };

  const handleStartJob = async (job: JobWithRelations) => {
    if (!user) return;

    if (isTradie && isLicenseExpired) {
      setGateReason('expired');
      setShowVerificationGate(true);
      return;
    }

    setActionLoading(job.id);

    const { error } = await supabase
      .from('jobs')
      .update({ status: 'in_progress' })
      .eq('id', job.id);

    if (!error) {
      await fetchJobs();
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

    setCompletionJob(job);
  };

  const isBeforeScheduledTime = (job: JobWithRelations) => {
    if (!job.scheduled_time) return false;
    return new Date() < new Date(job.scheduled_time);
  };

  const content = (
    <>
      <div className="max-w-7xl mx-auto">
        {paymentSuccess && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium text-green-800">{paymentSuccess}</p>
          </div>
        )}
        {offlineQueued && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl animate-pulse">
            <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm font-medium text-amber-800">
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
            <p className="text-gray-600 mt-1">
              {isTradie ? 'Your jobs from clients' : 'Your service requests'}
            </p>
          </div>
        </div>

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
                  onClick={() => window.location.href = '/settings'}
                  className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Upload Renewed License
                </button>
              </div>
            </div>
          </div>
        )}

        {isTradie && !isProUser && (
          <div className="mb-6">
            <UpgradeBanner
              message={`You have ${getRemainingJobAccepts(isProUser, monthlyAccepts)} job accepts left this month. Upgrade for unlimited.`}
              remainingCount={getRemainingJobAccepts(isProUser, monthlyAccepts) ?? 0}
              totalCount={FREE_LIMITS.JOB_ACCEPTS_PER_MONTH}
              onUpgrade={() => setShowSubscriptionModal(true)}
            />
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6 overflow-x-auto">
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'pending'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setFilter('accepted')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'accepted'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Accepted
            </button>
            <button
              onClick={() => setFilter('in_progress')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'in_progress'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'completed'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Completed
            </button>
            <button
              onClick={() => setFilter('declined')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'declined'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Declined
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                filter === 'all'
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Jobs
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={filter === 'all' ? ClipboardList : Briefcase}
              title={
                filter === 'all'
                  ? 'No Active Jobs'
                  : `No ${filter.replace(/_/g, ' ')} jobs`
              }
              description={
                isTradie
                  ? 'When clients book your services, their job requests will show up here.'
                  : 'You haven\'t booked any tradies yet. Start by searching for a service.'
              }
              actionLabel={isTradie ? 'Set Your Availability' : 'Post a Job'}
              onAction={() =>
                isTradie
                  ? (window.location.href = '/dashboard')
                  : (window.location.href = '/search')
              }
            />
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const isFlashActive = job.is_flash_boost && job.flash_expiry && new Date(job.flash_expiry) > new Date();

                return (
                <div
                  key={job.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isTradie && !unlockedJobIds.includes(job.id) && user) {
                      setUnlockTargetJob(job);
                      setShowUnlockLeadModal(true);
                      return;
                    }
                    setSelectedJob(job);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isTradie && !unlockedJobIds.includes(job.id) && user) {
                        setUnlockTargetJob(job);
                        setShowUnlockLeadModal(true);
                        return;
                      }
                      setSelectedJob(job);
                    }
                  }}
                  className={`w-full text-left rounded-xl p-6 transition-all cursor-pointer ${
                    isFlashActive && isTradie
                      ? 'border-2 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] bg-gradient-to-r from-amber-50/50 to-white'
                      : 'border border-gray-200 hover:border-primary-300 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <h3 className="font-semibold text-gray-900">
                            {job.profiles?.full_name || 'Client'}
                          </h3>
                        </div>
                        {(!isTradie || unlockedJobIds.includes(job.id)) && job.profiles?.email && (
                          <p className="text-sm text-gray-500 mt-1">
                            {job.profiles.email}
                          </p>
                        )}
                        {(!isTradie || unlockedJobIds.includes(job.id)) && job.profiles?.phone && (
                          <p className="text-sm text-gray-500">
                            {job.profiles.phone}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          job.status
                        )}`}
                      >
                        {job.status.replace(/_/g, ' ')}
                      </span>
                      {isFlashActive && isTradie && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-amber-400 to-orange-400 text-white rounded-full text-xs font-bold shadow-sm animate-pulse">
                          <Zap className="w-3 h-3" />
                          Flash Deal
                        </span>
                      )}
                      {!isTradie && isFlashActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full text-xs font-medium border border-orange-200">
                          <Zap className="w-3 h-3" />
                          Boosted
                        </span>
                      )}
                      {job.projects && (
                        <div className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-200">
                          <Package className="w-3 h-3" />
                          {job.projects.title}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Description:</h4>
                    <p className="text-gray-700">
                      {redactSensitiveInfo(job.description, !isTradie || unlockedJobIds.includes(job.id))}
                    </p>
                  </div>

                  {isFlashActive && isTradie && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg">
                      <Zap className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-amber-800">
                        Flash Deal! Priority pickup. Ends in <FlashCountdown expiry={job.flash_expiry!} />
                      </span>
                    </div>
                  )}

                  {!isTradie && isFlashActive && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                      <Zap className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      <span className="text-sm text-orange-700">
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
                    <div className="mt-4 pt-4 border-t border-gray-200 flex gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptJob(job);
                        }}
                        disabled={actionLoading === job.id}
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium ${
                          !isProUser && !canAcceptJob(isProUser, monthlyAccepts)
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {actionLoading === job.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Accepting...
                          </>
                        ) : !isProUser && !canAcceptJob(isProUser, monthlyAccepts) ? (
                          <>
                            <Crown className="w-4 h-4" />
                            Upgrade to Accept
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            Accept Job
                          </>
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setJobToDecline(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        <XIcon className="w-4 h-4" />
                        Decline Job
                      </button>
                    </div>
                  )}

                  {isTradie && job.status === 'accepted' && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartJob(job);
                        }}
                        disabled={actionLoading === job.id}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
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
                    </div>
                  )}

                  {isTradie && job.status === 'in_progress' && (
                    <div className="mt-4 pt-4 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                      {isBeforeScheduledTime(job) ? (
                        <div className="relative group">
                          <button
                            disabled
                            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed text-sm font-medium"
                          >
                            <Lock className="w-4 h-4" />
                            Starts: {formatDate(job.scheduled_time!)} at{' '}
                            {new Date(job.scheduled_time!).toLocaleTimeString('en-AU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                            You cannot complete a job before its scheduled start time.
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteJob(job);
                          }}
                          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark as Complete
                        </button>
                      )}
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
                            setReviewJob(job);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
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
        job={selectedJob}
        onQuote={handleQuoteNow}
        isUnlocked={!isTradie || (selectedJob ? unlockedJobIds.includes(selectedJob.id) : true)}
      />

      <JobAccessModal
        isOpen={showJobAccessModal}
        onClose={() => setShowJobAccessModal(false)}
        onUnlock={handleUnlockJob}
        jobDescription={selectedJob?.description || ''}
        jobId={selectedJob?.id || ''}
        isProUser={isProUser}
      />

      <UnlockLeadModal
        isOpen={showUnlockLeadModal}
        onClose={() => {
          setShowUnlockLeadModal(false);
          setUnlockTargetJob(null);
        }}
        onUnlock={async () => {
          if (!unlockTargetJob || !user) return;
          await supabase
            .from('job_unlocks')
            .insert({ tradie_id: user.id, job_id: unlockTargetJob.id });
          setUnlockedJobIds([...unlockedJobIds, unlockTargetJob.id]);
          setMonthlyUnlocks((prev) => prev + 1);
          setShowUnlockLeadModal(false);
          setSelectedJob(unlockTargetJob);
          setUnlockTargetJob(null);
        }}
        clientName={unlockTargetJob?.profiles?.full_name || 'Client'}
        jobId={unlockTargetJob?.id || ''}
        isProUser={isProUser}
        remainingUnlocks={getRemainingLeadUnlocks(isProUser, monthlyUnlocks)}
        totalUnlocks={FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH}
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

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
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
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
