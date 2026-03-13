import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Plus, Loader2, MapPin, ArrowRight, Crown, RefreshCw, Repeat, Trash2, CalendarClock, DollarSign, Briefcase, Clock, Zap, Eye, CheckCircle2, Archive, ArchiveRestore, Pencil, X, Check, Send, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { TradieWithDetails, AvailabilitySlot, Job } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import TradieCard from '../components/TradieCard';
import ChatDrawer from '../components/ChatDrawer';
import AvailabilityCalendar from '../components/AvailabilityCalendar';
import ActivityFeed from '../components/ActivityFeed';
import OnboardingChecklist from '../components/OnboardingChecklist';
import ServiceRemindersWidget from '../components/ServiceRemindersWidget';
import { redactName } from '../lib/contactGating';
import SubscriptionModal from '../components/SubscriptionModal';
// TooltipHint available for future use
import UserTradeBadges from '../components/UserTradeBadges';
import WelcomeGuide from '../components/WelcomeGuide';
import { DashboardStatsSkeleton, ListSkeleton } from '../components/SkeletonLoader';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import AddressAutocomplete from '../components/AddressAutocomplete';
import { getRecurringJobs, createRecurringJob, cancelRecurringJob, updateRecurringJob, suggestRecurringJob, getUpcomingSessions, type RecurringJob, type RecurringSession } from '../lib/recurringJobs';
import RecurringSessionCard from '../components/RecurringSessionCard';

export default function ClientDashboard() {
  const [savedTradies, setSavedTradies] = useState<TradieWithDetails[]>([]);
  const [recommendedTradies, setRecommendedTradies] = useState<TradieWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatTradie, setChatTradie] = useState<TradieWithDetails | null>(null);
  const [calendarTradie, setCalendarTradie] = useState<TradieWithDetails | null>(null);
  const [availableThisWeek, setAvailableThisWeek] = useState(0);
  const [unreadTradieIds, setUnreadTradieIds] = useState<Set<string>>(new Set());
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [trainingModeEnabled, setTrainingModeEnabled] = useState(false);
  const [toast, setToast] = useState<{ message: string; show: boolean; isError?: boolean }>({ message: '', show: false });
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboardedBanner, setShowOnboardedBanner] = useState(false);
  const [recurringJobs, setRecurringJobs] = useState<RecurringJob[]>([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [sentRecurringIds, setSentRecurringIds] = useState<Set<string>>(new Set());
  const [jobSessions, setJobSessions] = useState<Record<string, RecurringSession[]>>({});
  const [sessionsLoading, setSessionsLoading] = useState<Set<string>>(new Set());
  const [spendingSummary, setSpendingSummary] = useState({ total: 0, thisMonth: 0, pendingJobs: 0 });
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [releasedJobIds, setReleasedJobIds] = useState<Set<string>>(new Set());

  const { user, profile } = useAuth();
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
            sessionsMap[job.id] = sessions.slice(0, 4);
          } catch {
            sessionsMap[job.id] = [];
          }
        }),
      );
      setJobSessions(sessionsMap);
      setSessionsLoading(new Set());
    } catch { /* ignore */ }
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
      const [totalResult, monthResult, pendingResult] = await Promise.all([
        supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed'),
        supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed').gte('created_at', monthStart),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('client_id', user.id).in('status', ['pending', 'accepted', 'in_progress']),
      ]);
      setSpendingSummary({
        total: (totalResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
        thisMonth: (monthResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
        pendingJobs: pendingResult.count || 0,
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
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        const jobs = data as Job[];
        // Check payment status BEFORE rendering jobs to avoid flash
        const completedIds = jobs.filter(j => j.status === 'completed').map(j => j.id);
        let released = new Set<string>();
        if (completedIds.length > 0) {
          const { data: payments } = await supabase
            .from('payments')
            .select('job_id, metadata')
            .in('job_id', completedIds);
          if (payments) {
            for (const p of payments) {
              const meta = p.metadata as Record<string, unknown> | null;
              if (meta?.transfer_id) released.add(p.job_id);
            }
          }
        }
        // Set both at once — no flash
        setReleasedJobIds(released);
        setRecentJobs(jobs);
      }
    } catch (err) {
      console.error('fetchRecentJobs error:', err);
    }
  }, [user]);

  const archiveJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('client_id', user?.id);
      if (error) throw error;
      setRecentJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived_at: new Date().toISOString() } : j));
      showToast('Job archived');
    } catch (err) {
      console.error('archiveJob error:', err);
      showToast('Failed to archive job', true);
    }
  };

  const unarchiveJob = async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ archived_at: null })
        .eq('id', jobId)
        .eq('client_id', user?.id);
      if (error) throw error;
      setRecentJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived_at: null } : j));
      showToast('Job restored');
    } catch (err) {
      console.error('unarchiveJob error:', err);
      showToast('Failed to restore job', true);
    }
  };

  const sendQuoteRequest = async (job: RecurringJob, targetMode: 'saved' | 'all') => {
    if (!user) return;
    try {
      // Create a job from the recurring service
      const jobData: Record<string, unknown> = {
        client_id: user.id,
        title: `${job.trade_category.replace(/_/g, ' ')} — Recurring Service`,
        description: `[${job.trade_category}] ${job.description}`,
        status: 'pending',
        location_address: job.location || null,
        budget_type: 'to_be_quoted',
        is_emergency: false,
        priority: 'standard',
        is_delayed: false,
        max_quotes: 5,
      };

      // If sending to a specific saved tradie, assign them directly
      if (targetMode === 'saved' && job.tradie_id) {
        jobData.tradie_id = job.tradie_id;
      }

      const { data: insertedJob, error: insertError } = await supabase
        .from('jobs')
        .insert(jobData)
        .select()
        .maybeSingle();

      if (insertError || !insertedJob) throw insertError || new Error('Failed to create job');

      const jobId = (insertedJob as Record<string, unknown>).id;
      const tradeName = job.trade_category.replace(/_/g, ' ');
      const clientName = profile?.full_name || 'A client';

      // Notify the assigned tradie directly
      if (targetMode === 'saved' && job.tradie_id) {
        await supabase.from('notifications').insert({
          user_id: job.tradie_id,
          type: 'new_job',
          title: 'New quote request',
          message: `${clientName} sent you a recurring ${tradeName} job — review and quote now`,
          data: { job_id: jobId },
        });
      }

      // If sending to saved tradies (not just assigned one), notify all saved tradies matching the trade
      if (targetMode === 'saved' && !job.tradie_id) {
        const matchingTradies = savedTradies.filter(t =>
          t.tradie_details?.trade_category?.toLowerCase() === job.trade_category.toLowerCase()
        );
        if (matchingTradies.length > 0) {
          const notifications = matchingTradies.map(t => ({
            user_id: t.id,
            type: 'new_job',
            title: 'New quote request from a saved client',
            message: `${clientName} is looking for a ${tradeName} — recurring service`,
            data: { job_id: jobId },
          }));
          await supabase.from('notifications').insert(notifications);
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
      fetchRecommendedTradies();
      fetchUnreadTradieIds();
      fetchTrainingMode();
      fetchRecurring();
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

  const fetchUnreadTradieIds = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .is('read_at', null)
        .is('deleted_at', null);

      if (data) {
        setUnreadTradieIds(new Set(data.map((m) => m.sender_id)));
      }
    } catch (err) {
      console.error('fetchUnreadTradieIds error:', err);
    }
  };

  const handleOpenChat = (tradie: TradieWithDetails) => {
    setChatTradie(tradie);
    setUnreadTradieIds((prev) => {
      const next = new Set(prev);
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

  const fetchRecommendedTradies = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`*, tradie_details (*)`)
        .eq('role', 'tradie')
        .limit(4);

      if (error) throw error;

      if (profiles) {
        const filtered = (profiles as unknown as TradieWithDetails[]).filter((p) => p.tradie_details);
        setRecommendedTradies(filtered as TradieWithDetails[]);
      }
    } catch {
      showToast('Failed to load recommendations. Please refresh.', true);
    }
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

  return (
    <DashboardLayout>
      <WelcomeGuide role="client" userName={profile?.full_name} />
      {showOnboardedBanner && (
        <div className="max-w-[1600px] mx-auto mb-4">
          <div className="bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 rounded-2xl p-5 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-primary-900 mb-1">Welcome to ConnecTradie!</h3>
              <p className="text-sm text-primary-800">Post your first job to get quotes from verified tradies in your area.</p>
            </div>
            <Link to="/post-lead" className="flex-shrink-0 px-4 py-2 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors text-sm">
              Post a Job
            </Link>
          </div>
        </div>
      )}
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {profile?.full_name?.split(' ')[0]}!
            </h1>
            <p className="text-gray-600 mt-1">Your jobs, quotes, and personalised recommendations</p>
          </div>
          <Link
            to="/search"
            data-tour="find-tradie"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors min-h-[44px]"
          >
            <Plus className="w-5 h-5" />
            Find New Tradie
          </Link>
        </div>

        {availableThisWeek > 0 && (
          <div className="mb-8 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-300 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-amber-600 animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-amber-900">
                One of your saved tradies opened up slots this week
              </p>
              <p className="text-sm text-amber-800 mt-0.5">
                Check their calendars now — popular times fill up fast
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-8">
            {/* My Recent Jobs */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-warm-500" />
                  My Jobs
                </h2>
                <div className="flex items-center gap-3">
                  {recentJobs.some(j => j.archived_at) && (
                    <button
                      onClick={() => setShowArchived(!showArchived)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        showArchived
                          ? 'bg-warm-50 text-warm-700 border border-warm-200'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archived ({recentJobs.filter(j => j.archived_at).length})
                    </button>
                  )}
                  <Link to="/leads" className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                    View All <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              {recentJobs.filter(j => showArchived ? j.archived_at : !j.archived_at).length === 0 && recentJobs.length > 0 ? (
                <div className="bg-gray-50 rounded-2xl border border-gray-200 p-8 text-center">
                  <Archive className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium">
                    {showArchived ? 'No archived jobs' : 'All jobs archived'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {showArchived ? 'Archived jobs will appear here' : 'Toggle "Archived" to view them, or post a new job'}
                  </p>
                </div>
              ) : recentJobs.length === 0 ? (
                <div className="bg-gradient-to-br from-warm-50 to-secondary-50 rounded-2xl border border-warm-200 p-8 sm:p-10">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Get started</h3>
                  <p className="text-gray-600 mb-6 max-w-lg">
                    Post a job to get quotes from verified tradies, or browse and save tradies you like.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4 mb-6">
                    <Link
                      to="/post-lead"
                      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-warm-300 hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 bg-warm-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-warm-600">1</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Post a Job</p>
                        <p className="text-sm text-gray-500">Describe what you need — takes 60 seconds</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
                    </Link>
                    <Link
                      to="/search"
                      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all"
                    >
                      <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-primary-600">2</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Browse Tradies</p>
                        <p className="text-sm text-gray-500">Find and save tradies near you</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
                    </Link>
                  </div>
                  <p className="text-xs text-gray-500">
                    Once you post a job, tradies will send you quotes. Compare them side by side, then accept the best one and message the tradie to confirm details.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentJobs
                    .filter(j => showArchived ? j.archived_at : !j.archived_at)
                    .slice(0, showArchived ? 20 : 8)
                    .map((job) => {
                    const categoryMatch = job.description.match(/^\[([^\]]+)\]/);
                    const categoryRaw = categoryMatch ? categoryMatch[1] : null;
                    const category = categoryRaw ? categoryRaw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
                    const desc = job.description.replace(/^\[[^\]]+\]\s*/, '');
                    const isArchived = !!job.archived_at;

                    const isReleased = releasedJobIds.has(job.id);
                    const statusLabel = isArchived ? 'Archived'
                      : job.status === 'completed' && isReleased ? 'Paid'
                      : job.status === 'completed' ? 'Awaiting Release'
                      : job.status === 'in_progress' ? 'In Progress'
                      : job.status === 'funded' ? 'Paid — Tradie Assigned'
                      : job.status === 'accepted' ? 'Accepted'
                      : job.quoting_status === 'awarded' ? 'Awarded'
                      : job.quote_count > 0 ? `${job.quote_count} Quote${job.quote_count !== 1 ? 's' : ''}`
                      : 'Waiting';

                    const statusColor = isArchived ? 'bg-gray-100 text-gray-600 border-gray-200'
                      : job.status === 'completed' && isReleased ? 'bg-green-100 text-green-700 border-green-200'
                      : job.status === 'completed' ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : job.status === 'in_progress' ? 'bg-blue-100 text-blue-700 border-blue-200'
                      : job.status === 'funded' ? 'bg-green-100 text-green-700 border-green-200'
                      : job.quoting_status === 'awarded' ? 'bg-green-100 text-green-700 border-green-200'
                      : job.quote_count > 0 ? 'bg-secondary-100 text-secondary-700 border-secondary-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200';

                    const accentColor = isArchived ? 'bg-gray-300'
                      : job.status === 'completed' && isReleased ? 'bg-green-400'
                      : job.status === 'completed' ? 'bg-amber-400'
                      : job.status === 'in_progress' ? 'bg-blue-400'
                      : job.status === 'funded' ? 'bg-green-400'
                      : job.quoting_status === 'awarded' ? 'bg-green-400'
                      : job.quote_count > 0 ? 'bg-secondary-400'
                      : 'bg-primary-400';

                    const SLOT_LABELS: Record<string, string> = { morning: '7-9 AM', midday: '10 AM-12 PM', afternoon: '1-5 PM' };

                    return (
                      <Link
                        key={job.id}
                        to={`/leads?job=${job.id}`}
                        className={`group block rounded-2xl overflow-hidden border bg-white shadow-sm hover:shadow-lg hover:border-gray-300 transition-all ${isArchived ? 'opacity-75' : ''}`}
                      >
                        <div className="flex">
                          {/* Left accent bar */}
                          <div className={`w-1.5 flex-shrink-0 ${accentColor}`} />
                          <div className="flex-1 min-w-0">
                            <div className="px-5 py-4">
                              {/* Header: title + status badge + archive icon */}
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="text-base font-bold text-gray-900 leading-snug capitalize truncate">
                                  {(job.title || category || 'Untitled Job').replace(/_/g, ' ')}
                                </h3>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusColor}`}>
                                    {statusLabel}
                                  </span>
                                  {!isArchived && (
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveJob(job.id); }}
                                      className="p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                      title="Archive job"
                                    >
                                      <Archive className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {isArchived && (
                                    <button
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); unarchiveJob(job.id); }}
                                      className="p-1 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                      title="Restore job"
                                    >
                                      <ArchiveRestore className="w-3.5 h-3.5" />
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
                                {job.location_address && (
                                  <span className="inline-flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-gray-400" />
                                    {job.location_address.split(',')[0]}
                                  </span>
                                )}
                                {job.scheduled_date && (
                                  <span className="inline-flex items-center gap-1">
                                    <CalendarClock className="w-3 h-3 text-secondary-500" />
                                    <span className="text-secondary-700 font-medium">
                                      {new Date(job.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                    </span>
                                  </span>
                                )}
                                {job.preferred_time_slot && SLOT_LABELS[job.preferred_time_slot] && (
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-gray-400" />
                                    {SLOT_LABELS[job.preferred_time_slot]}
                                  </span>
                                )}
                                {job.budget_amount ? (
                                  <span className="inline-flex items-center font-bold text-emerald-700">
                                    ${job.budget_amount.toLocaleString()}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* Footer with action */}
                            {job.status === 'completed' && !isReleased && (
                              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                                <span className="text-xs text-gray-400">Click to view details</span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warm-600 text-white text-xs font-semibold rounded-lg">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Release & Review
                                </span>
                              </div>
                            )}
                            {job.status === 'completed' && isReleased && (
                              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                                <span className="text-xs text-gray-400">Payment released to tradie</span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Paid
                                </span>
                              </div>
                            )}
                            {job.status === 'in_progress' && (
                              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                                <span className="text-xs text-gray-400">Click to check progress</span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
                                  <Eye className="w-3.5 h-3.5" />
                                  View Progress
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}

                  <Link
                    to="/post-lead"
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm font-medium text-gray-500 hover:border-warm-300 hover:text-warm-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Post Another Job
                  </Link>

                </div>
              )}
            </div>

            {/* Saved Tradies */}
            {savedTradies.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4" data-tour="saved-tradies">
                  <h2 className="text-lg font-semibold text-gray-900">Saved Tradies</h2>
                  <span className="text-sm text-gray-600">{savedTradies.length} saved</span>
                </div>
                {loading ? (
                  <div className="space-y-6">
                    <DashboardStatsSkeleton />
                    <ListSkeleton rows={4} />
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {savedTradies.map((tradie) => (
                      <TradieCard
                        key={tradie.id}
                        tradie={tradie}
                        onChat={handleOpenChat}
                        onViewCalendar={setCalendarTradie}
                        onSave={handleRemoveTradie}
                        isSaved={true}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-1 space-y-6">
            {trainingModeEnabled && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className={`w-full rounded-2xl border p-5 text-left transition-all hover:shadow-lg ${
                  isClientPro
                    ? 'bg-gradient-to-br from-warm-50 to-yellow-50 border-warm-300'
                    : 'bg-gradient-to-br from-gray-50 to-primary-50 border-gray-200 hover:border-warm-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isClientPro ? 'bg-warm-200' : 'bg-gray-200'
                  }`}>
                    <Crown className={`w-5 h-5 ${isClientPro ? 'text-warm-700' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isClientPro ? 'text-warm-900' : 'text-gray-900'}`}>
                      {isClientPro ? 'Pro Member' : 'Upgrade to Pro'}
                    </p>
                    <p className="text-xs text-gray-600">
                      {isClientPro ? 'All features unlocked' : 'Get premium features'}
                    </p>
                  </div>
                </div>
              </button>
            )}
            {/* Spending Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <DollarSign className="w-4 h-4 text-green-600" />
                Spending Summary
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">This Month</span>
                  <span className="text-sm font-semibold text-gray-900">${(spendingSummary.thisMonth / 100).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">All Time</span>
                  <span className="text-sm font-semibold text-gray-900">${(spendingSummary.total / 100).toFixed(2)}</span>
                </div>
                <Link to="/leads" className="flex items-center justify-between pt-2 border-t border-gray-100 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors">
                  <span className="text-sm text-gray-600">Active Jobs</span>
                  <span className="text-sm font-semibold text-warm-600">{spendingSummary.pendingJobs}</span>
                </Link>
              </div>
              <Link to="/payments" className="mt-4 block text-center text-xs font-medium text-primary-600 hover:text-primary-700">
                View Payment History
              </Link>
            </div>

            <SectionErrorBoundary fallbackTitle="Service reminders failed to load">
              <ServiceRemindersWidget />
            </SectionErrorBoundary>

            {/* Recurring Jobs */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-secondary-600" />
                  Recurring Services
                </h3>
                <button
                  onClick={() => setShowRecurringForm(!showRecurringForm)}
                  className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {!showRecurringForm && recurringJobs.length === 0 && (
                <button
                  onClick={() => setShowRecurringForm(true)}
                  className="w-full text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-2 mb-2 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  + Set up a new recurring job
                </button>
              )}

              {!showRecurringForm && recurringJobs.length > 0 && (
                <button
                  onClick={() => setShowRecurringForm(true)}
                  className="w-full text-center text-xs text-primary-600 hover:text-primary-700 font-medium py-1.5 mb-3 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  + Set up a new recurring job
                </button>
              )}

              {showRecurringForm && (
                <RecurringJobForm
                  onSave={async (data) => {
                    try {
                      await createRecurringJob(data);
                      setShowRecurringForm(false);
                      fetchRecurring();
                      showToast('Recurring service scheduled');
                    } catch {
                      showToast('Failed to create recurring service', true);
                    }
                  }}
                  onCancel={() => setShowRecurringForm(false)}
                  savedTradies={savedTradies}
                />
              )}

              {recurringJobs.length === 0 && !showRecurringForm ? (
                <div className="text-center py-4">
                  <CalendarClock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No recurring services set up</p>
                  <p className="text-xs text-gray-400 mt-1">Schedule regular maintenance to keep your home in top shape</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recurringJobs.filter(j => j.is_active).map(job => {
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
                              showToast('Recurring service updated');
                            } catch {
                              showToast('Failed to update service', true);
                            }
                          }}
                          onCancel={() => setEditingJobId(null)}
                        />
                      );
                    }

                    {/* Count matching saved tradies for this trade */}
                    const matchingSavedCount = savedTradies.filter(t =>
                      t.tradie_details?.trade_category?.toLowerCase() === job.trade_category.toLowerCase()
                    ).length;

                    return (
                      <div key={job.id} className={`rounded-xl border transition-all ${isOverdue ? 'border-red-200 bg-red-50' : isDueSoon ? 'border-warm-200 bg-warm-50' : 'border-gray-100 bg-gray-50'}`}>
                        <div className="p-3 cursor-pointer hover:bg-white/50 transition-colors rounded-t-xl" onClick={() => setEditingJobId(job.id)} role="button" tabIndex={0}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate capitalize">
                                {job.trade_category.replace(/_/g, ' ')}
                                <span className="text-xs text-gray-400 font-normal ml-1">
                                  · {job.frequency_months === -1 ? 'Weekly' : job.frequency_months === -2 ? 'Fortnightly' : job.frequency_months === 1 ? 'Monthly' : job.frequency_months === 3 ? 'Quarterly' : job.frequency_months === 6 ? 'Every 6mo' : job.frequency_months === 12 ? 'Annually' : `Every ${job.frequency_months}mo`}
                                </span>
                              </p>
                              <p className="text-xs text-gray-500 truncate">{job.description}</p>
                              {job.location && (
                                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 truncate">
                                  <MapPin className="w-3 h-3 flex-shrink-0" />
                                  {job.location}
                                </p>
                              )}
                              {job.tradie?.full_name ? (
                                <p className="text-xs text-primary-600 mt-1 font-medium">
                                  Assigned: {job.tradie.full_name}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-400 mt-1 italic">No tradie assigned</p>
                              )}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : isDueSoon ? 'text-warm-600' : 'text-gray-500'}`}>
                                  {isOverdue ? `Overdue by ${Math.abs(daysUntil)} days` : isDueSoon ? `Due in ${daysUntil} days` : `Next: ${dueDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={() => setEditingJobId(job.id)}
                                className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Edit recurring service"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={async () => {
                                  await cancelRecurringJob(job.id);
                                  fetchRecurring();
                                  showToast('Recurring service cancelled');
                                }}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Cancel recurring service"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Quote Request Actions */}
                        <div className="px-3 pb-2.5 pt-0.5 flex gap-1.5" onClick={e => e.stopPropagation()}>
                          {sentRecurringIds.has(job.id) ? (
                            <div className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium border border-green-200">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sent
                            </div>
                          ) : (
                            <>
                              {job.tradie?.full_name ? (
                                <button
                                  onClick={() => sendQuoteRequest(job, 'saved')}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-warm-500 text-white rounded-lg text-xs font-medium hover:bg-warm-600 transition-colors"
                                >
                                  <Send className="w-3 h-3" />
                                  Send to {job.tradie.full_name.split(' ')[0]}
                                </button>
                              ) : matchingSavedCount > 0 ? (
                                <button
                                  onClick={() => sendQuoteRequest(job, 'saved')}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-warm-500 text-white rounded-lg text-xs font-medium hover:bg-warm-600 transition-colors"
                                >
                                  <Send className="w-3 h-3" />
                                  Send to Saved ({matchingSavedCount})
                                </button>
                              ) : null}
                              <button
                                onClick={() => sendQuoteRequest(job, 'all')}
                                className={`${job.tradie?.full_name || matchingSavedCount > 0 ? 'flex-1' : 'w-full'} inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors`}
                              >
                                <Briefcase className="w-3 h-3" />
                                Request Quotes
                              </button>
                            </>
                          )}
                        </div>
                        {/* Upcoming Sessions */}
                        <div className="px-3 pb-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">Upcoming Sessions</p>
                          {sessionsLoading.has(job.id) ? (
                            <div className="flex items-center justify-center py-3">
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            </div>
                          ) : (jobSessions[job.id] ?? []).length > 0 ? (
                            <div className="space-y-2">
                              {(jobSessions[job.id] ?? []).map(session => (
                                <RecurringSessionCard
                                  key={session.id}
                                  session={session}
                                  recurringJobId={job.id}
                                  userRole="client"
                                  tradieId={job.tradie_id}
                                  preferredTime={job.preferred_time}
                                  onUpdate={fetchRecurring}
                                />
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400 italic py-2">No upcoming sessions scheduled</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div data-tour="onboarding-checklist">
              <SectionErrorBoundary fallbackTitle="Onboarding checklist failed to load">
                <OnboardingChecklist />
              </SectionErrorBoundary>
            </div>
            <SectionErrorBoundary fallbackTitle="Activity feed failed to load">
              <ActivityFeed />
            </SectionErrorBoundary>

            <div className="bg-white rounded-2xl border border-gray-200 p-6" data-tour="recommended-tradies">
              <h3 className="font-semibold text-gray-900 mb-4">New & Recommended</h3>

              {profile?.postcode && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                  <MapPin className="w-4 h-4" />
                  Near {profile.postcode}
                </div>
              )}

              <div className="space-y-4">
                {recommendedTradies.map((tradie) => (
                  <div
                    key={tradie.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all duration-200 cursor-pointer active:scale-95"
                    onClick={() => handleOpenChat(tradie)}
                  >
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary-600">
                        {tradie.full_name?.charAt(0) || 'T'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {(tradie.tradie_details?.subscription_tier === 'pro' || tradie.tradie_details?.subscription_tier === 'business')
                          ? (tradie.tradie_details?.business_name || tradie.full_name)
                          : redactName(tradie.full_name)}
                      </p>
                      <p className="text-xs text-gray-600 capitalize">
                        {tradie.tradie_details?.trade_category}
                      </p>
                      <div className="mt-1">
                        <UserTradeBadges
                          verifiedTrades={tradie.verified_trades || []}
                          declaredTrades={tradie.declared_trades || []}
                          size="sm"
                        />
                      </div>
                    </div>
                    {unreadTradieIds.has(tradie.id) && (
                      <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </div>
                ))}
              </div>

              <Link
                to="/search"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 text-primary-600 font-medium hover:bg-primary-50 active:scale-95 rounded-xl transition-all duration-200 min-h-[44px]"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
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

      {toast.show && (
        <div className={`fixed bottom-4 right-4 ${toast.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
          <div className={`w-2 h-2 ${toast.isError ? 'bg-red-300' : 'bg-green-300'} rounded-full animate-pulse`} />
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
    </DashboardLayout>
  );
}

const RECURRING_SERVICES = [
  { value: 'cleaning_weekly', label: 'House Cleaning' },
  { value: 'lawn_mowing_weekly', label: 'Lawn Mowing' },
  { value: 'pool_maintenance_weekly', label: 'Pool Service' },
  { value: 'garden_maintenance', label: 'Garden Care' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'gutter_cleaning', label: 'Gutter Cleaning' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'air_conditioning', label: 'Air Conditioning' },
  { value: 'hvac', label: 'Heating' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'solar', label: 'Solar Panels' },
  { value: 'painting', label: 'Painting' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'fencing', label: 'Fencing' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'concreting', label: 'Concreting' },
  { value: 'tree_lopping', label: 'Tree Lopping' },
  { value: 'termite_inspection', label: 'Termite Inspection' },
  { value: 'hot_water_service', label: 'Hot Water Service' },
  { value: 'fire_safety', label: 'Fire Safety' },
  { value: 'security_systems', label: 'Security Systems' },
  { value: 'garage_doors', label: 'Garage Doors' },
  { value: 'appliance_service', label: 'Appliance Service' },
  { value: 'septic_tank', label: 'Septic Tank' },
  { value: 'chimney_sweep', label: 'Chimney Sweep' },
  { value: 'rendering', label: 'Rendering' },
  { value: 'waterproofing', label: 'Waterproofing' },
];

function RecurringJobForm({ onSave, onCancel, savedTradies }: {
  onSave: (data: { tradie_id: string | null; trade_category: string; description: string; frequency_months: number; next_due_date: string; reminder_days_before: number; location: string; budget?: number }) => Promise<void>;
  onCancel: () => void;
  savedTradies: TradieWithDetails[];
}) {
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedTradieId, setSelectedTradieId] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [budgetType, setBudgetType] = useState<'quote' | 'set'>('quote');

  const suggestion = category ? suggestRecurringJob(category) : null;
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState(12);
  const [nextDate, setNextDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    if (suggestion) {
      setDescription(suggestion.description);
      setFrequency(suggestion.frequencyMonths);
    }
  }, [category]);

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    setSaving(true);
    await onSave({
      tradie_id: selectedTradieId || null,
      trade_category: category,
      description: description.trim(),
      frequency_months: frequency,
      next_due_date: nextDate,
      reminder_days_before: 14,
      location: location.trim(),
      budget: budget ? Number(budget) : undefined,
    });
    setSaving(false);
  };

  const formatFrequency = (months: number) => {
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

  return (
    <div className="border border-primary-200 rounded-xl p-3 mb-3 bg-primary-50/30 space-y-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Service Type</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
        >
          <option value="">Select a service...</option>
          {RECURRING_SERVICES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {category && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done..."
              rows={2}
              onFocus={e => { e.target.rows = 4; }}
              onBlur={e => { e.target.rows = 2; }}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 resize-none transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Budget</label>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <button
                type="button"
                onClick={() => { setBudgetType('quote'); setBudget(''); }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  budgetType === 'quote'
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Require a Quote
              </button>
              <button
                type="button"
                onClick={() => setBudgetType('set')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  budgetType === 'set'
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Set a Budget
              </button>
            </div>
            {budgetType === 'set' && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  placeholder={suggestion?.priceRange ? `${suggestion.priceRange.min} – ${suggestion.priceRange.max}` : 'Enter budget'}
                  className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Location / Address</label>
            <AddressAutocomplete
              value={location}
              onChange={(val) => setLocation(val)}
              placeholder="Start typing an address..."
              className="!py-1.5 !text-sm !rounded-lg"
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
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Preferred Tradie
                  {matchingTradies.length > 0 && (
                    <span className="text-warm-600 ml-1">({matchingTradies.length} matching)</span>
                  )}
                </label>
                <select
                  value={selectedTradieId}
                  onChange={e => setSelectedTradieId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
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
            <label className="block text-xs font-medium text-gray-600 mb-1.5">How often?</label>
            <div className="flex flex-wrap gap-1.5">
              {([
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
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    frequency === opt.value
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                  {suggestion && suggestion.frequencyMonths === opt.value && (
                    <span className="ml-1 text-warm-600">★</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">First due date</label>
            <input
              type="date"
              value={nextDate}
              onChange={e => setNextDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving || !description.trim()}
              className="flex-1 px-3 py-1.5 bg-warm-500 text-white rounded-lg text-xs font-medium hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
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
    <div className="p-3 rounded-xl border border-primary-300 bg-primary-50/40 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">
          Edit: {job.trade_category.replace(/_/g, ' ')}
        </p>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Location / Address</label>
        <AddressAutocomplete
          value={location}
          onChange={(val) => setLocation(val)}
          placeholder="Start typing an address..."
          className="!py-1.5 !text-sm !rounded-lg"
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
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Assigned Tradie
              {matchingTradies.length > 0 && (
                <span className="text-warm-600 ml-1">({matchingTradies.length} matching)</span>
              )}
            </label>
            <select
              value={selectedTradieId}
              onChange={e => setSelectedTradieId(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
          <select
            value={frequency}
            onChange={e => setFrequency(Number(e.target.value))}
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 bg-white"
          >
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Next due date</label>
          <input
            type="date"
            value={nextDate}
            onChange={e => setNextDate(e.target.value)}
            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !description.trim()}
          className="flex-1 px-3 py-1.5 bg-warm-500 text-white rounded-lg text-xs font-medium hover:bg-warm-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}
