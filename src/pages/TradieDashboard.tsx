import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Briefcase,
  RefreshCw,
  Pencil,
  Trash2,
  MoreVertical,
  Copy,
  Settings,
  Crown,
  Bell,
  BellOff,
  BellRing,
  ShieldAlert,
  TrendingUp,
  Star,
  MapPin,
  Archive,
  Zap,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAuthHeaders } from '../lib/edgeFn';
import { useAuth } from '../contexts/AuthContext';
import { redactSensitiveInfo } from '../lib/redaction';
import { checkLicenseExpired } from '../lib/utils';
import type { AvailabilitySlot, CalendarIntegration, Job } from '../types/database';
import DashboardLayout from '../components/DashboardLayout';
import BulkAvailabilityModal from '../components/BulkAvailabilityModal';
import ConversationSettingsModal from '../components/ConversationSettingsModal';
import JobManagementModal from '../components/JobManagementModal';
import OnboardingChecklist from '../components/OnboardingChecklist';
import QuoteInsightsWidget from '../components/QuoteInsightsWidget';
import EmptyState from '../components/EmptyState';
import SubscriptionModal from '../components/SubscriptionModal';
import CollapsibleSection from '../components/CollapsibleSection';
import { isPro, FREE_LIMITS, getMonthlyJobAccepts, getMonthlyLeadUnlocks } from '../lib/subscription';
import UserTradeBadges from '../components/UserTradeBadges';
import WelcomeGuide from '../components/WelcomeGuide';
import { getTradieUpcomingSessions } from '../lib/recurringJobs';
import type { RecurringSession } from '../lib/recurringJobs';
import { getActiveAgreements } from '../lib/ongoingServices';
import type { ServiceAgreement } from '../types/database';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import {
  requestPushPermission,
  subscribeToPush,
  savePushPreferences,
  getPushPermissionStatus,
  showUrgentLeadNotification,
} from '../lib/notifications';

// Custom hooks
import { useToast } from '../hooks/useToast';
import { useAvailabilitySlots } from '../hooks/useAvailabilitySlots';
import { useDashboardJobs, type DashboardJob } from '../hooks/useDashboardJobs';
import { useDashboardConversations, type DashboardConversation } from '../hooks/useDashboardConversations';

type TabType = 'jobs' | 'messages';

// ─── Helpers ──────────────────────────────────────────────

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  return { daysInMonth: lastDay.getDate(), startingDay: firstDay.getDay() };
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    case 'in_progress':
      return <Clock className="w-5 h-5 text-secondary-600" />;
    case 'cancelled':
      return <XCircle className="w-5 h-5 text-red-600" />;
    default:
      return <AlertCircle className="w-5 h-5 text-warm-600" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'in_progress':
      return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    case 'cancelled':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'accepted':
      return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    default:
      return 'bg-warm-100 text-warm-700 border-warm-200';
  }
}

// ─── Main Component ───────────────────────────────────────

export default function TradieDashboard() {
  // Auth & derived
  const { user, tradieDetails, profile } = useAuth();
  const navigate = useNavigate();
  const isProUser = isPro(tradieDetails?.subscription_tier, profile?.is_premium);
  const isLicenseExpired = checkLicenseExpired(profile?.verification_status, profile?.license_expiry);

  // Toast
  const { toast, showToast } = useToast();

  // Stable callback refs for hooks (prevents infinite re-fetch loops)
  const handleSuccess = useCallback((msg: string) => showToast(msg), [showToast]);
  const handleError = useCallback((msg: string) => showToast(msg, true), [showToast]);

  // Calendar month navigation state (declared before hook so it can be passed in)
  const [currentDate, setCurrentDate] = useState(new Date());

  // Data hooks
  const {
    slots,
    loading: slotsLoading,
    fetchSlots,
    addSlot: handleAddSlot,
    addSlotForDay: handleAddSlotForDayAction,
    updateSlot,
    deleteSlot: handleDeleteSlot,
    clearAllUpcoming: handleClearAllUpcoming,
    removeDuplicates: handleRemoveDuplicates,
    totalAvailableHours,
    bookedSlots,
    getSlotsForDate,
  } = useAvailabilitySlots({
    userId: user?.id,
    currentDate,
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const {
    jobs,
    quotedJobIds,
    deleting,
    fetchJobs,
    fetchUnlockedJobs,
    deleteJob,
    archiveJob,
    isJobUnlocked,
    activeJobCount,
  } = useDashboardJobs({
    userId: user?.id,
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const {
    conversations,
    fetchConversations,
    getConversationTitle,
    getConversationInitial,
  } = useDashboardConversations({
    userId: user?.id,
    onError: handleError,
  });

  // UI-only state (tabs, modals, calendar)
  const [activeTab, setActiveTab] = useState<TabType>('jobs');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [showManageMenu, setShowManageMenu] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Slot editing
  const [editingSlot, setEditingSlot] = useState<AvailabilitySlot | null>(null);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Add slot for day
  const [showAddSlotForDay, setShowAddSlotForDay] = useState(false);
  const [newSlotStartTime, setNewSlotStartTime] = useState('09:00');
  const [newSlotEndTime, setNewSlotEndTime] = useState('17:00');
  const [addingSlot, setAddingSlot] = useState(false);

  // Job modals
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [showJobManagement, setShowJobManagement] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Conversations modal
  const [selectedConversation, setSelectedConversation] = useState<DashboardConversation | null>(null);
  const [showConversationSettings, setShowConversationSettings] = useState(false);

  // Calendar integration
  const [calendarIntegration, setCalendarIntegration] = useState<CalendarIntegration | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  // Earnings
  const [earnings, setEarnings] = useState({ total: 0, thisMonth: 0, pendingJobs: 0 });

  // Recent reviews
  const [recentReviews, setRecentReviews] = useState<{ id: string; rating: number; comment: string | null; created_at: string; client_name: string }[]>([]);

  // Push notifications
  const [pushStatus, setPushStatus] = useState<'loading' | 'granted' | 'denied' | 'default' | 'unsupported'>('loading');
  const [pushEnabling, setPushEnabling] = useState(false);

  // Free tier usage
  const [monthlyJobs, setMonthlyJobs] = useState(0);
  const [monthlyUnlocks, setMonthlyUnlocks] = useState(0);

  // Dismissible banners
  const [showPayoutBanner, setShowPayoutBanner] = useState(() => !localStorage.getItem('dismissedPayoutBanner'));
  const [showPushBanner, setShowPushBanner] = useState(() => !localStorage.getItem('dismissedPushBanner'));

  // Recurring sessions
  const [recurringSessions, setRecurringSessions] = useState<(RecurringSession & { recurring_job?: { trade_category: string; service_subtype: string | null; description: string; client_id: string; preferred_time: string | null } })[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  // Ongoing service agreements
  const [agreements, setAgreements] = useState<(ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } })[]>([]);

  // New leads matching tradie's trade categories
  const [newLeads, setNewLeads] = useState<Job[]>([]);

  const fetchNewLeads = useCallback(async () => {
    if (!user || !profile) return;
    try {
      const trades = [...(profile.declared_trades || []), ...(profile.verified_trades || [])];
      if (trades.length === 0) return;
      const uniqueTrades = [...new Set(trades)];
      // Category is stored as [category] prefix in description, e.g. "[cleaner] Mop floors..."
      // Build an OR filter matching any of the tradie's trade categories
      const descriptionFilters = uniqueTrades
        .map((t) => `description.ilike.[${t}]%`)
        .join(',');
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .is('tradie_id', null)
        .is('archived_at', null)
        .or(descriptionFilters)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      if (!data || data.length === 0) { setNewLeads([]); return; }

      // Exclude jobs the tradie has already quoted on (any status incl. withdrawn)
      const jobIds = data.map(j => j.id);
      const { data: existingQuotes } = await supabase
        .from('quotes')
        .select('job_id')
        .eq('tradie_id', user.id)
        .in('job_id', jobIds);
      const quotedIds = new Set((existingQuotes || []).map(q => q.job_id));

      // Also exclude leads the tradie dismissed on the Leads page
      let dismissedIds = new Set<string>();
      try {
        const stored = localStorage.getItem('dismissed_leads');
        if (stored) dismissedIds = new Set(JSON.parse(stored));
      } catch { /* ignore */ }

      setNewLeads(data.filter(j => !quotedIds.has(j.id) && !dismissedIds.has(j.id)).slice(0, 5));
    } catch (err) {
      console.error('fetchNewLeads error:', err);
    }
  }, [user, profile]);

  const fetchRecurringSessions = useCallback(async () => {
    if (!user) return;
    setRecurringLoading(true);
    try {
      const sessions = await getTradieUpcomingSessions(user.id, 5);
      setRecurringSessions(sessions);
    } catch (err) {
      console.error('fetchRecurringSessions error:', err);
    } finally {
      setRecurringLoading(false);
    }
  }, [user]);

  // Post-onboarding scroll to calendar
  const [searchParams, setSearchParams] = useSearchParams();
  const [showOnboardedBanner, setShowOnboardedBanner] = useState(false);

  useEffect(() => {
    if (searchParams.get('onboarded') === 'tradie') {
      setShowOnboardedBanner(true);
      setSearchParams((prev) => { prev.delete('onboarded'); return prev; }, { replace: true });
      setTimeout(() => {
        const calEl = document.querySelector('[data-tour="calendar"]');
        if (calEl) calEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
      setTimeout(() => setShowOnboardedBanner(false), 12000);
    }
  }, []);

  // Calendar computed values
  const { daysInMonth, startingDay } = getDaysInMonth(currentDate);

  // ─── Handlers (declared before effects that use them) ─────

  const fetchCalendarIntegration = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('tradie_id', user.id)
      .eq('provider', 'google')
      .maybeSingle();
    setCalendarIntegration(data as CalendarIntegration | null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [totalResult, monthResult, pendingResult] = await Promise.all([
      supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed'),
      supabase.from('payments').select('amount').eq('profile_id', user.id).eq('status', 'completed').gte('created_at', monthStart),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tradie_id', user.id).in('status', ['accepted', 'in_progress']),
    ]);
    setEarnings({
      total: (totalResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
      thisMonth: (monthResult.data || []).reduce((sum, p) => sum + (p.amount || 0), 0),
      pendingJobs: pendingResult.count || 0,
    });
  }, [user]);

  // ─── Effects ──────────────────────────────────────────────

  // Fetch free tier usage counts
  useEffect(() => {
    if (!user || isProUser) return;
    Promise.all([getMonthlyJobAccepts(user.id), getMonthlyLeadUnlocks(user.id)]).then(
      ([jobs, unlocks]) => { setMonthlyJobs(jobs); setMonthlyUnlocks(unlocks); }
    );
  }, [user, isProUser]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  // Fetch recent reviews for this tradie
  useEffect(() => {
    if (!user) return;
    const fetchReviews = async () => {
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, client:profiles!reviews_client_id_fkey(full_name)')
        .eq('tradie_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);
      if (data) {
        setRecentReviews(data.map((r: Record<string, unknown>) => ({
          id: r.id as string,
          rating: r.rating as number,
          comment: r.comment as string | null,
          created_at: r.created_at as string,
          client_name: (r.client as { full_name: string } | null)?.full_name || 'Client',
        })));
      }
    };
    fetchReviews();
  }, [user]);

  useEffect(() => {
    setPushStatus(getPushPermissionStatus());
  }, []);

  useEffect(() => {
    const isAnyModalOpen = !!(editingSlot || confirmClearAll || showAddSlotForDay || showDeleteConfirm);
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [editingSlot, confirmClearAll, showAddSlotForDay, showDeleteConfirm]);

  // Realtime urgent leads
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('urgent-leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs', filter: 'is_flash_boost=eq.true' },
        (payload) => {
          const newJob = payload.new as Job;
          if (pushStatus === 'granted' && profile?.push_enabled) {
            showUrgentLeadNotification(newJob);
          }
          fetchNewLeads();
          showToast('New urgent lead posted! Check your leads.');
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pushStatus, profile?.push_enabled]);

  // Fetch all data when user, subscription tier, or calendar month changes.
  // Function refs are omitted from deps — they are stable via useCallback
  // with primitive deps (user?.id, currentDate) and would otherwise cause
  // re-fetch cascades when the auth context emits new object references.
  useEffect(() => {
    if (user) {
      fetchSlots();
      fetchJobs();
      fetchUnlockedJobs();
      fetchConversations();
      fetchCalendarIntegration();
      fetchRecurringSessions();
      fetchNewLeads();
      getActiveAgreements(user.id, 'tradie').then(setAgreements).catch(() => { /* ignore */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, tradieDetails?.subscription_tier, currentDate]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleSyncCalendar = useCallback(async () => {
    if (!user) return;
    setSyncLoading(true);

    try {
      const headers = await getAuthHeaders();

      if (!calendarIntegration) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-oauth?action=initiate`;
        const response = await fetch(apiUrl, { headers });
        const result = await response.json();

        if (result.authUrl) {
          const width = 600;
          const height = 700;
          const left = window.screenX + (window.outerWidth - width) / 2;
          const top = window.screenY + (window.outerHeight - height) / 2;
          const authWindow = window.open(
            result.authUrl,
            'Google Calendar Authorization',
            `width=${width},height=${height},left=${left},top=${top}`
          );

          if (!authWindow) {
            showToast('Popup was blocked. Please allow popups and try again.', true);
            setSyncLoading(false);
            return;
          }

          const checkWindow = setInterval(() => {
            if (authWindow.closed) {
              clearInterval(checkWindow);
              fetchCalendarIntegration();
              showToast('Calendar connected successfully!');
              setSyncLoading(false);
            }
          }, 500);

          // Safety timeout: stop polling after 5 minutes
          setTimeout(() => {
            clearInterval(checkWindow);
            setSyncLoading(false);
          }, 5 * 60 * 1000);
        } else {
          setSyncLoading(false);
        }
      } else {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-google-calendar`;
        const response = await fetch(apiUrl, { method: 'POST', headers });
        const result = await response.json();

        if (result.success) {
          showToast(`Calendar synced! ${result.slotsRemoved} conflicting slot(s) removed.`);
          fetchSlots();
        } else {
          showToast(result.error || 'Sync failed', true);
        }
        setSyncLoading(false);
      }
    } catch {
      showToast('Failed to sync calendar', true);
      setSyncLoading(false);
    }
  }, [user, calendarIntegration, fetchCalendarIntegration, fetchSlots, showToast]);

  const handleEnablePush = async () => {
    if (!user) return;
    setPushEnabling(true);
    const permission = await requestPushPermission();
    setPushStatus(permission);

    if (permission === 'granted') {
      const subscription = await subscribeToPush();
      await savePushPreferences(user.id, true, subscription);
      showToast("Desktop alerts enabled! You'll be notified of urgent leads.");
    } else if (permission === 'denied') {
      showToast('Notification permission was denied. Check your browser settings.', true);
    }
    setPushEnabling(false);
  };

  const startEditingSlot = (slot: AvailabilitySlot) => {
    setEditingSlot(slot);
    const startDate = new Date(slot.start_time);
    const endDate = new Date(slot.end_time);
    setEditStartTime(
      `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`
    );
    setEditEndTime(
      `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`
    );
  };

  const handleUpdateSlot = async () => {
    if (!editingSlot) return;
    await updateSlot(editingSlot, editStartTime, editEndTime);
    setEditingSlot(null);
  };

  const handleAddSlotForDay = async () => {
    if (selectedDay === null) return;
    setAddingSlot(true);
    await handleAddSlotForDayAction(selectedDay, newSlotStartTime, newSlotEndTime);
    setShowAddSlotForDay(false);
    setNewSlotStartTime('09:00');
    setNewSlotEndTime('17:00');
    setAddingSlot(false);
  };

  const handleDeleteJob = async () => {
    if (!jobToDelete) return;
    await deleteJob(jobToDelete);
    setShowDeleteConfirm(false);
    setJobToDelete(null);
  };

  const handleClearAll = async () => {
    await handleClearAllUpcoming();
    setConfirmClearAll(false);
    setShowManageMenu(false);
  };

  const handleRemoveDups = async () => {
    await handleRemoveDuplicates();
    setShowManageMenu(false);
  };

  // ─── Render ───────────────────────────────────────────────

  return (
    <DashboardLayout>
      <WelcomeGuide role="tradie" userName={profile?.full_name} />
      {showOnboardedBanner && (
        <div className="max-w-[1600px] mx-auto mb-4">
          <div className="bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 rounded-2xl p-5">
            <h3 className="font-bold text-primary-900 mb-1">Welcome to ConnecTradie!</h3>
            <p className="text-sm text-primary-800">Your account is set up. Set your availability below so clients can find and book you for jobs.</p>
          </div>
        </div>
      )}
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-8 bg-navy-900 rounded-lg p-6 sm:p-8 border border-navy-800">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] text-white mb-1">Your Business Hub</h1>
          <p className="text-navy-300">Manage your schedule, jobs, and conversations in one place</p>
          {profile && (
            <div className="mt-4">
              <UserTradeBadges
                verifiedTrades={profile.verified_trades || []}
                declaredTrades={profile.declared_trades || []}
              />
            </div>
          )}
        </div>

        {/* License Expired Banner */}
        {isLicenseExpired && (
          <div className="mb-6 bg-red-50 border-2 border-red-300 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-red-900 text-lg">License Expired</h3>
                <p className="text-red-800 mt-1">
                  Your trade license expired
                  {profile?.license_expiry && (
                    <> on <span className="font-semibold">{new Date(profile.license_expiry).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</span></>
                  )}
                  . Your account has been unverified and you cannot accept jobs or submit quotes until your license is renewed.
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

        {/* Free Tier Usage */}
        {!isProUser && (
          <div className="mb-6 max-w-sm bg-white rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-900">Free Plan Usage</h3>
              <button onClick={() => setShowSubscriptionModal(true)} className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                Upgrade to Pro
              </button>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Jobs accepted this month</span>
                  <span className="text-xs font-medium text-gray-900">{monthlyJobs} of {FREE_LIMITS.MAX_JOBS_PER_MONTH}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${monthlyJobs >= FREE_LIMITS.MAX_JOBS_PER_MONTH ? 'bg-red-500' : monthlyJobs >= FREE_LIMITS.MAX_JOBS_PER_MONTH - 1 ? 'bg-amber-500' : 'bg-warm-500'}`}
                    style={{ width: `${Math.min(100, (monthlyJobs / FREE_LIMITS.MAX_JOBS_PER_MONTH) * 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Lead unlocks this month</span>
                  <span className="text-xs font-medium text-gray-900">{monthlyUnlocks} of {FREE_LIMITS.MAX_LEAD_UNLOCKS_PER_MONTH}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${monthlyUnlocks >= FREE_LIMITS.MAX_LEAD_UNLOCKS_PER_MONTH ? 'bg-red-500' : monthlyUnlocks >= FREE_LIMITS.MAX_LEAD_UNLOCKS_PER_MONTH - 1 ? 'bg-amber-500' : 'bg-warm-500'}`}
                    style={{ width: `${Math.min(100, (monthlyUnlocks / FREE_LIMITS.MAX_LEAD_UNLOCKS_PER_MONTH) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Checklist */}
        <div className="mb-6" data-tour="onboarding-checklist">
          <SectionErrorBoundary fallbackTitle="Onboarding checklist failed to load">
            <OnboardingChecklist />
          </SectionErrorBoundary>
        </div>

        {/* First-Time Guidance — shown when tradie has no jobs and no availability */}
        {jobs.length === 0 && slots.length === 0 && !slotsLoading && (
          <div className="mb-6 bg-gradient-to-r from-warm-50 to-secondary-50 border border-warm-200 rounded-2xl p-5">
            <h3 className="font-bold text-gray-900 mb-1">What to do first</h3>
            <p className="text-sm text-gray-600 mb-4">Complete these three steps to start getting work — most tradies are set up in under 5 minutes.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <button
                onClick={() => {
                  const calEl = document.querySelector('[data-tour="calendar"]');
                  if (calEl) calEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-primary-300 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-green-700">1</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Set your availability</p>
                  <p className="text-xs text-gray-500">Clients can only book open slots</p>
                </div>
              </button>
              <Link
                to="/work"
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-primary-300 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-warm-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-warm-700">2</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Browse available leads</p>
                  <p className="text-xs text-gray-500">Quote on jobs near you</p>
                </div>
              </Link>
              <Link
                to="/my-profile"
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 hover:border-primary-300 transition-colors text-left"
              >
                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-700">3</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Complete your profile</p>
                  <p className="text-xs text-gray-500">Verified profiles get 3x more leads</p>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Your Next Steps */}
        {(() => {
          const pendingJobs = jobs.filter(j => j.status === 'pending' && !quotedJobIds.has(j.id));
          const inProgressJobs = jobs.filter(j => j.status === 'in_progress');
          const unreadConvos = conversations.filter(c => c.messages.some(m => m.receiver_id === user?.id && !m.read_at));
          const pendingConfirmations = recurringSessions.filter(s => s.status === 'pending_confirmation');
          if (pendingJobs.length === 0 && inProgressJobs.length === 0 && unreadConvos.length === 0 && pendingConfirmations.length === 0 && newLeads.length === 0) return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-6 mb-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">You're all caught up!</span>
              </div>
              <p className="text-xs text-emerald-600 mt-1">No pending actions. Check back later for new leads.</p>
            </div>
          );
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mt-6 mb-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  Your Next Steps
                </p>
                <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {newLeads.length + pendingJobs.length + inProgressJobs.length + unreadConvos.length + pendingConfirmations.length}
                </span>
              </div>
              <div className="space-y-2">
                {newLeads.length > 0 && (
                  <Link to="/work" className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-gray-700">{newLeads.length} new lead{newLeads.length !== 1 ? 's' : ''} matching your trades</span>
                    </div>
                    <span className="text-sm font-medium text-amber-700">View &rarr;</span>
                  </Link>
                )}
                {pendingConfirmations.length > 0 && (
                  <a href="#recurring-jobs" className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="w-4 h-4 text-purple-500" />
                      <span className="text-sm text-gray-700">{pendingConfirmations.length} ongoing service session{pendingConfirmations.length !== 1 ? 's' : ''} need{pendingConfirmations.length === 1 ? 's' : ''} confirmation</span>
                    </div>
                    <span className="text-sm font-medium text-amber-700">Confirm &rarr;</span>
                  </a>
                )}
                {pendingJobs.length > 0 && (
                  <button onClick={() => {
                    setActiveTab('jobs');
                    const firstPending = pendingJobs[0];
                    if (firstPending) {
                      setSelectedJob(firstPending.id);
                      setShowJobManagement(true);
                    }
                  }} className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-700">{pendingJobs.length} pending job{pendingJobs.length !== 1 ? 's' : ''} to review</span>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">View &rarr;</span>
                  </button>
                )}
                {inProgressJobs.length > 0 && (
                  <button onClick={() => {
                    setActiveTab('jobs');
                    const firstInProgress = inProgressJobs[0];
                    if (firstInProgress) {
                      setSelectedJob(firstInProgress.id);
                      setShowJobManagement(true);
                    }
                  }} className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-gray-700">{inProgressJobs.length} job{inProgressJobs.length !== 1 ? 's' : ''} in progress</span>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">View &rarr;</span>
                  </button>
                )}
                {unreadConvos.length > 0 && (
                  <button onClick={() => setActiveTab('messages')} className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-gray-700">{unreadConvos.length} unread message{unreadConvos.length !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">Reply &rarr;</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* New Leads */}
        {newLeads.length > 0 && (
          <div className="bg-white rounded-2xl border border-amber-200 p-5 mt-6 mb-2 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">New Leads</h3>
                  <p className="text-xs text-gray-500">Jobs matching your trades</p>
                </div>
              </div>
              <Link to="/work" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View all &rarr;
              </Link>
            </div>
            <div className="space-y-2">
              {newLeads.map(lead => {
                const isUrgent = !!(lead as Record<string, unknown>).is_flash_boost;
                return (
                  <Link
                    key={lead.id}
                    to="/work"
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      isUrgent ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isUrgent ? (
                        <Zap className="w-4 h-4 text-orange-500 flex-shrink-0" />
                      ) : (
                        <Briefcase className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 font-medium truncate">
                          {lead.title || lead.trade_category?.replace(/_/g, ' ') || 'New Job'}
                          {isUrgent && <span className="ml-2 text-xs text-orange-600 font-semibold">URGENT</span>}
                        </p>
                        {lead.location_address && (
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            {lead.location_address}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-medium text-emerald-600 flex-shrink-0">Quote &rarr;</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabbed Content */}
        <div className="bg-white rounded-2xl border border-gray-200 mb-6 shadow-sm mt-6 ring-1 ring-primary-100/50" data-tour="jobs-tab">
          <div className="border-b border-gray-200">
            <div className="flex gap-2 p-4">
              {(['jobs', 'messages'] as TabType[]).map((tab) => {
                const icons = { overview: Calendar, jobs: Briefcase, messages: MessageSquare };
                const labels = { overview: 'Overview', jobs: 'Jobs', messages: 'Messages' };
                const Icon = icons[tab];
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all min-h-[44px] ${
                      activeTab === tab
                        ? 'bg-warm-500 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-50 active:scale-95'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            {/* ─── JOBS TAB ─── */}
            {activeTab === 'jobs' && (() => {
              const activeJobs = jobs.filter((j: DashboardJob) => !['completed', 'cancelled', 'declined'].includes(j.status));
              const completedJobs = jobs.filter((j: DashboardJob) => j.status === 'completed');
              const otherJobs = jobs.filter((j: DashboardJob) => ['cancelled', 'declined'].includes(j.status));

              return (
              <div>
                {/* ─── Active Jobs ─── */}
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-900">Active Jobs</h2>
                  <Link to="/work?tab=active" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                    View all in Work Hub &rarr;
                  </Link>
                </div>
                {activeJobs.length === 0 ? (
                  <div>
                    <EmptyState
                      icon={Briefcase}
                      title="No Active Jobs"
                      description="Set up your calendar so clients can find and book you for their next project."
                      actionLabel="Set Your Availability"
                      onAction={() => navigate('/schedule')}
                    />
                    <div className="text-center mt-3 pb-2">
                      <Link to="/work?tab=recruitment" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                        Or post a vacancy to find staff &rarr;
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeJobs.map((job: DashboardJob) => {
                      const category = job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
                      const cleanDesc = job.description.replace(/^\[[^\]]+\]\s*/, '');
                      const displayTitle = job.title || category || 'Job';
                      const unlocked = isJobUnlocked(job.id);

                      return (
                        <div
                          key={job.id}
                          className={`border rounded-xl overflow-hidden transition-all hover:shadow-sm ${
                            job.priority === 'high' ? 'border-orange-200 bg-gradient-to-r from-orange-50/40 to-white' : 'border-gray-200 hover:border-primary-200'
                          }`}
                        >
                          <div className="px-4 pt-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-semibold text-gray-900 truncate capitalize">{displayTitle}</h3>
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getStatusColor(job.status)}`}>
                                    {job.status.replace(/_/g, ' ')}
                                  </span>
                                  {job.priority === 'high' && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200 flex-shrink-0">
                                      HIGH PRIORITY
                                    </span>
                                  )}
                                  {job.is_delayed && (
                                    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full border border-yellow-200 flex-shrink-0">
                                      Delayed
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2">{redactSensitiveInfo(cleanDesc, unlocked)}</p>
                              </div>
                              <button
                                onClick={() => { if (!isLicenseExpired) { setSelectedJob(job.id); setShowJobManagement(true); } }}
                                disabled={isLicenseExpired}
                                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isLicenseExpired ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                                title={isLicenseExpired ? 'License expired' : 'Manage job'}
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            {category && (
                              <span className="px-2 py-0.5 bg-secondary-50 text-secondary-700 rounded-full text-xs font-medium border border-secondary-200 capitalize">
                                {category}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 text-xs text-gray-500">
                              <Users className="w-3.5 h-3.5" />
                              {job.profiles?.full_name || 'Client'}
                            </span>
                            {job.location_address && (
                              <span className="flex items-center gap-1.5 text-xs text-gray-500 truncate max-w-[200px]">
                                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                                {job.location_address}
                              </span>
                            )}
                            {job.scheduled_time && (
                              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                <Clock className="w-3.5 h-3.5" />
                                {new Date(job.scheduled_time).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 text-xs text-gray-400">
                              <Calendar className="w-3 h-3" />
                              {new Date(job.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </span>
                            {job.budget_amount != null && job.budget_amount > 0 && (
                              <span className="text-xs font-medium text-gray-900">
                                ${job.budget_amount.toLocaleString()}
                              </span>
                            )}
                          </div>

                          {job.notes && (
                            <div className="mx-4 mb-3 px-3 py-2 bg-secondary-50 border border-secondary-100 rounded-lg">
                              <p className="text-xs text-secondary-700"><span className="font-semibold">Note:</span> {job.notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── Completed Jobs ─── */}
                {completedJobs.length > 0 && (
                  <div className="mt-8">
                    <CollapsibleSection
                      title={`Completed Jobs (${completedJobs.length})`}
                      defaultOpen={activeJobs.length === 0}
                    >
                      <div className="space-y-2 mt-3">
                        {completedJobs.map((job: DashboardJob) => {
                          const category = job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
                          const displayTitle = job.title || category || 'Job';
                          const completedDate = job.updated_at
                            ? new Date(job.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                            : null;

                          return (
                            <div
                              key={job.id}
                              onClick={() => navigate(job.title?.includes('Recurring Service') ? '/schedule' : '/work?tab=active')}
                              className="flex items-center gap-3 px-4 py-3 border border-gray-100 rounded-lg bg-gray-50/50 hover:bg-white hover:border-primary-200 cursor-pointer transition-all group"
                            >
                              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-medium text-gray-900 truncate capitalize group-hover:text-primary-700 transition-colors">{displayTitle}</h4>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-xs text-gray-500">{job.profiles?.full_name || 'Client'}</span>
                                  {completedDate && (
                                    <span className="text-xs text-gray-400">{completedDate}</span>
                                  )}
                                  {job.location_address && (
                                    <span className="text-xs text-gray-400 truncate max-w-[150px]">
                                      {job.location_address.split(',')[0]}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); archiveJob(job.id); }}
                                className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                                title="Archive job"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                              <span className="text-xs text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0">
                                View &rarr;
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>
                  </div>
                )}

                {/* ─── Cancelled / Declined Jobs ─── */}
                {otherJobs.length > 0 && (
                  <div className="mt-6">
                    <CollapsibleSection
                      title={`Cancelled / Declined (${otherJobs.length})`}
                      defaultOpen={false}
                    >
                      <div className="space-y-2 mt-3">
                        {otherJobs.map((job: DashboardJob) => {
                          const category = job.description.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || null;
                          const displayTitle = job.title || category || 'Job';

                          return (
                            <div
                              key={job.id}
                              className="flex items-center justify-between gap-3 px-4 py-3 border border-gray-100 rounded-lg bg-gray-50/50"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  job.status === 'cancelled' ? 'bg-red-50' : 'bg-orange-50'
                                }`}>
                                  <XCircle className={`w-4 h-4 ${job.status === 'cancelled' ? 'text-red-400' : 'text-orange-400'}`} />
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-sm font-medium text-gray-500 truncate capitalize">{displayTitle}</h4>
                                  <span className="text-xs text-gray-400 capitalize">{job.status} &middot; {job.profiles?.full_name || 'Client'}</span>
                                </div>
                              </div>
                              {job.status === 'declined' && (
                                <button
                                  onClick={() => { setJobToDelete(job.id); setShowDeleteConfirm(true); }}
                                  className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleSection>
                  </div>
                )}
              </div>
              );
            })()}

            {/* ─── MESSAGES TAB ─── */}
            {activeTab === 'messages' && (
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Conversations</h2>
                {conversations.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No Messages Yet"
                    description="When clients message you about jobs, their conversations will appear here."
                    actionLabel="Browse Leads"
                    onAction={() => navigate('/work')}
                  />
                ) : (
                  <div className="space-y-3">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedConversation(conv); setShowConversationSettings(true); } }}
                        onClick={() => { setSelectedConversation(conv); setShowConversationSettings(true); }}
                        className="border border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-primary-600">{getConversationInitial(conv)}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3 className="font-semibold text-gray-900">{getConversationTitle(conv)}</h3>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedConversation(conv); setShowConversationSettings(true); }}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            </div>
                            {conv.lastMessage && (
                              <>
                                <p className="text-sm text-gray-600 truncate">{redactSensitiveInfo(conv.lastMessage.content, false)}</p>
                                <span className="text-xs text-gray-400 mt-1">{new Date(conv.lastMessage.created_at).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 ring-1 ring-primary-100/50" data-tour="calendar">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Calendar */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)); setSelectedDay(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                  <button onClick={() => { setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)); setSelectedDay(null); }} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['day', 'week', 'month'] as const).map(v => (
                      <button key={v} onClick={() => setCalendarView(v)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${calendarView === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isProUser ? (
                    <button onClick={() => setShowAddSlot(true)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors min-h-[44px]">
                      <Plus className="w-4 h-4" />Bulk Add Slots
                    </button>
                  ) : (
                    <button onClick={() => setShowSubscriptionModal(true)} className="flex items-center gap-2 px-4 py-2 bg-warm-500 text-white font-medium rounded-xl hover:bg-warm-600 transition-all min-h-[44px]">
                      <Crown className="w-4 h-4" />Bulk Add Slots<span className="text-xs font-bold bg-white/20 px-1.5 py-0.5 rounded">PRO</span>
                    </button>
                  )}
                  {isProUser ? (
                    <button onClick={handleSyncCalendar} disabled={syncLoading} className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]">
                      {syncLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" />{calendarIntegration ? 'Syncing...' : 'Connecting...'}</>
                      ) : calendarIntegration ? (
                        <><RefreshCw className="w-4 h-4" />Sync Google Calendar</>
                      ) : (
                        <><Calendar className="w-4 h-4" />Connect Google Calendar</>
                      )}
                    </button>
                  ) : (
                    <button onClick={() => setShowSubscriptionModal(true)} className="flex items-center gap-2 px-4 py-2 border border-warm-300 text-warm-700 font-medium rounded-xl hover:bg-warm-50 transition-colors min-h-[44px]">
                      <Calendar className="w-4 h-4" />Google Calendar<span className="text-xs font-bold bg-warm-100 text-warm-600 px-1.5 py-0.5 rounded">PRO</span>
                    </button>
                  )}
                  <div className="relative">
                    <button onClick={() => setShowManageMenu(!showManageMenu)} className="p-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {showManageMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowManageMenu(false)} />
                        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-20 py-2">
                          <button onClick={handleRemoveDups} className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                            <Copy className="w-4 h-4 text-gray-400" />Remove Duplicates
                          </button>
                          <button onClick={() => setConfirmClearAll(true)} className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3">
                            <Trash2 className="w-4 h-4" />Clear All Upcoming
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {slotsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
                </div>
              ) : calendarView === 'day' ? (
                /* Day View */
                (() => {
                  const viewDate = selectedDay
                    ? new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay)
                    : new Date();
                  const viewDay = viewDate.getDate();
                  const daySlots = getSlotsForDate(viewDay);
                  const hours = Array.from({ length: 15 }, (_, i) => i + 6); // 6am-8pm
                  return (
                    <div>
                      <div className="text-center mb-4">
                        <p className="text-sm font-medium text-gray-700">
                          {viewDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                      <div className="border border-gray-200 rounded-xl overflow-hidden">
                        {hours.map(hour => {
                          const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                          const label = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
                          const slotsInHour = daySlots.filter(s => {
                            const startH = new Date(s.start_time).getHours();
                            const endH = new Date(s.end_time).getHours();
                            return hour >= startH && hour < endH;
                          });
                          return (
                            <div key={hourStr} className={`flex border-b border-gray-100 last:border-b-0 min-h-[44px] ${slotsInHour.length > 0 ? '' : 'bg-white'}`}>
                              <div className="w-20 flex-shrink-0 px-3 py-2 text-xs text-gray-400 font-medium border-r border-gray-100">
                                {label}
                              </div>
                              <div className="flex-1 flex gap-1 p-1">
                                {slotsInHour.map(s => (
                                  <div key={s.id} className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${s.status === 'available' ? 'bg-green-100 text-green-700 border border-green-200' : s.status === 'booked' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                                    {s.status === 'available' ? 'Available' : s.status === 'booked' ? 'Booked' : s.status}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 flex items-center gap-5 text-sm text-gray-700">
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded" /><span className="font-medium">Available</span></div>
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded" /><span className="font-medium">Booked</span></div>
                      </div>
                    </div>
                  );
                })()
              ) : calendarView === 'week' ? (
                /* Week View */
                (() => {
                  const today = selectedDay
                    ? new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay)
                    : new Date();
                  const startOfWeek = new Date(today);
                  startOfWeek.setDate(today.getDate() - today.getDay());
                  const weekDays = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(startOfWeek);
                    d.setDate(startOfWeek.getDate() + i);
                    return d;
                  });
                  const hours = Array.from({ length: 15 }, (_, i) => i + 6);
                  return (
                    <div>
                      <div className="overflow-x-auto">
                        <div className="min-w-[700px]">
                          <div className="grid grid-cols-[80px_repeat(7,1fr)] border border-gray-200 rounded-t-xl overflow-hidden">
                            <div className="bg-gray-50 border-r border-b border-gray-200 p-2" />
                            {weekDays.map(d => {
                              const isToday = d.toDateString() === new Date().toDateString();
                              return (
                                <div key={d.toISOString()} className={`text-center py-2 border-r border-b border-gray-200 last:border-r-0 text-xs font-medium ${isToday ? 'bg-primary-50 text-primary-700' : 'bg-gray-50 text-gray-600'}`}>
                                  <div>{dayNames[d.getDay()]}</div>
                                  <div className={`text-base font-semibold ${isToday ? 'text-primary-700' : 'text-gray-900'}`}>{d.getDate()}</div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="border-x border-b border-gray-200 rounded-b-xl overflow-hidden">
                            {hours.map(hour => {
                              const label = hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`;
                              return (
                                <div key={hour} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-gray-100 last:border-b-0">
                                  <div className="px-3 py-1.5 text-xs text-gray-400 font-medium border-r border-gray-100">{label}</div>
                                  {weekDays.map(d => {
                                    const isSameMonth = d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
                                    const daySlotsW = isSameMonth ? getSlotsForDate(d.getDate()) : [];
                                    const slotsInHour = daySlotsW.filter(s => {
                                      const startH = new Date(s.start_time).getHours();
                                      const endH = new Date(s.end_time).getHours();
                                      return hour >= startH && hour < endH;
                                    });
                                    return (
                                      <div key={d.toISOString()} className="border-r border-gray-100 last:border-r-0 p-0.5 min-h-[32px]">
                                        {slotsInHour.map(s => (
                                          <div key={s.id} className={`rounded px-1 py-0.5 text-xs font-medium truncate ${s.status === 'available' ? 'bg-green-100 text-green-700' : s.status === 'booked' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {s.status === 'available' ? 'Avail' : 'Bkd'}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-5 text-sm text-gray-700">
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded" /><span className="font-medium">Available</span></div>
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded" /><span className="font-medium">Booked</span></div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Month View (existing) */
                <>
                  <div className="grid grid-cols-7 gap-1 mb-2" role="row">
                    {dayNames.map((day) => (
                      <div key={day} className="text-center text-xs font-medium text-gray-500 py-2" role="columnheader">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Availability calendar">
                    {[...Array(startingDay)].map((_, i) => <div key={`empty-${i}`} className="aspect-square" />)}
                    {[...Array(daysInMonth)].map((_, i) => {
                      const day = i + 1;
                      const daySlots = getSlotsForDate(day);
                      const hasAvailable = daySlots.some((s) => s.status === 'available');
                      const hasBooked = daySlots.some((s) => s.status === 'booked');
                      const now = new Date();
                      const isToday = now.getDate() === day && now.getMonth() === currentDate.getMonth() && now.getFullYear() === currentDate.getFullYear();
                      const isPast = new Date(currentDate.getFullYear(), currentDate.getMonth(), day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
                      const isSelected = selectedDay === day;
                      const availableCount = daySlots.filter((s) => s.status === 'available').length;
                      const bookedCount = daySlots.filter((s) => s.status === 'booked').length;
                      const dateLabel = new Date(currentDate.getFullYear(), currentDate.getMonth(), day).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
                      const slotSummary = availableCount > 0 || bookedCount > 0
                        ? `, ${availableCount} available slot${availableCount !== 1 ? 's' : ''}${bookedCount > 0 ? `, ${bookedCount} booked` : ''}`
                        : ', no slots';

                      return (
                        <button
                          key={day}
                          onClick={() => setSelectedDay(day)}
                          aria-label={`${dateLabel}${slotSummary}`}
                          aria-pressed={isSelected}
                          className={`aspect-square rounded-lg p-1 text-sm transition-all min-w-[40px] min-h-[40px] ${
                            isSelected ? 'bg-warm-500 text-white ring-2 ring-primary-600 ring-offset-2'
                            : isPast ? 'opacity-50 hover:opacity-75'
                            : hasAvailable && hasBooked ? 'bg-gradient-to-br from-green-50 to-red-50 hover:from-green-100 hover:to-red-100'
                            : hasAvailable ? 'bg-green-50 hover:bg-green-100'
                            : hasBooked ? 'bg-red-50 hover:bg-red-100'
                            : isToday ? 'ring-2 ring-primary-500 hover:bg-gray-100'
                            : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className={`font-medium ${isPast ? 'text-gray-400' : isSelected ? 'text-white' : isToday ? 'text-primary-600 font-bold' : 'text-gray-700'}`}>{day}</span>
                            <div className="flex gap-1 mt-0.5">
                              {hasAvailable && <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-green-300' : 'bg-green-500'}`} />}
                              {hasBooked && <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-red-300' : 'bg-red-500'}`} />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-5 text-sm text-gray-700">
                    <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded" /><span className="font-medium">Available</span></div>
                    <div className="flex items-center gap-2"><span className="w-4 h-4 bg-red-100 border-2 border-red-500 rounded" /><span className="font-medium">Booked</span></div>
                  </div>
                </>
              )}
            </div>

            {/* Slot Sidebar */}
            <div className="bg-gray-50 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-4">
                {selectedDay
                  ? new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
                  : 'Upcoming Slots'}
              </h3>

              {selectedDay && (
                <button
                  onClick={() => !isLicenseExpired && setShowAddSlotForDay(true)}
                  disabled={isLicenseExpired}
                  className={`w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed rounded-xl transition-all ${
                    isLicenseExpired ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50' : 'border-gray-300 text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50'
                  }`}
                  title={isLicenseExpired ? 'License expired - renew to add slots' : ''}
                >
                  <Plus className="w-4 h-4" />Add time slot
                </button>
              )}

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {(selectedDay ? getSlotsForDate(selectedDay) : slots.filter((s) => new Date(s.start_time) > new Date()).slice(0, 10)).map((slot) => (
                  <div key={slot.id} className={`p-3 rounded-xl border ${slot.status === 'available' ? 'bg-green-50 border-green-200' : slot.status === 'booked' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        {!selectedDay && (
                          <p className="font-medium text-gray-900 text-sm">
                            {new Date(slot.start_time).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </p>
                        )}
                        <p className={`text-gray-600 ${selectedDay ? 'text-sm font-medium text-gray-900' : 'text-xs mt-0.5'}`}>
                          {new Date(slot.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(slot.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {slot.status === 'available' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEditingSlot(slot)} className="p-2.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Edit time" aria-label="Edit time slot">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteSlot(slot.id)} className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Delete slot" aria-label="Delete time slot">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${slot.status === 'available' ? 'bg-green-100 text-green-700' : slot.status === 'booked' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                      {slot.status}
                    </span>
                  </div>
                ))}

                {selectedDay && getSlotsForDate(selectedDay).length === 0 && (
                  <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <p className="text-gray-600 text-sm font-medium mb-2">No slots for this day</p>
                    <p className="text-gray-600 text-xs">Add one above to let clients know you're available</p>
                  </div>
                )}

                {!selectedDay && slots.filter((s) => new Date(s.start_time) > new Date()).length === 0 && (
                  <div className="text-center py-6 bg-warm-50 rounded-lg border border-warm-200">
                    <p className="text-warm-900 text-sm font-medium mb-2">No upcoming availability</p>
                    <p className="text-warm-800 text-xs">Add slots to your calendar so clients can book you</p>
                  </div>
                )}
              </div>

              {selectedDay && (
                <button onClick={() => setSelectedDay(null)} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-2">
                  Show all upcoming slots
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div data-tour="quick-stats">
        <CollapsibleSection
          title="Quick Stats"
          defaultOpen={true}
          icon={<div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center"><Clock className="w-4 h-4 text-primary-600" /></div>}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl border border-primary-200 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-navy-500 font-medium">Available Hours</p>
                  <p className="text-3xl font-bold text-navy-900">{totalAvailableHours.toFixed(0)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-primary-200 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-navy-500 font-medium">Booked Slots</p>
                  <p className="text-3xl font-bold text-navy-900">{bookedSlots}</p>
                </div>
              </div>
            </div>

            <Link to="/work?tab=active" className="bg-white rounded-2xl border border-primary-200 shadow-sm p-6 hover:shadow-md hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-navy-500 font-medium">Active Jobs</p>
                  <p className="text-3xl font-bold text-navy-900">{activeJobCount}</p>
                </div>
              </div>
            </Link>

            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="bg-white rounded-2xl border border-primary-200 shadow-sm p-6 hover:shadow-md transition-all cursor-pointer text-left"
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isProUser ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Crown className={`w-6 h-6 ${isProUser ? 'text-blue-600' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-navy-500 font-medium">Your Plan</p>
                  <p className="text-xl font-bold text-navy-900">
                    {isProUser ? 'Pro' : 'Free'}
                  </p>
                  {!isProUser && <p className="text-xs text-primary-600 font-medium mt-1">Upgrade for more</p>}
                </div>
              </div>
            </button>
          </div>
        </CollapsibleSection>
        </div>

        {/* Earnings Summary — only show when there's activity */}
        {(earnings.total > 0 || earnings.thisMonth > 0 || earnings.pendingJobs > 0) && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Earnings Summary</h3>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <Calendar className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              {earnings.thisMonth > 0 ? (
                <p className="text-xl font-bold text-blue-700">${earnings.thisMonth.toLocaleString()}</p>
              ) : (
                <p className="text-sm text-blue-600 font-medium mt-1">Quote on leads to start earning</p>
              )}
              <p className="text-xs text-blue-600 mt-1">This Month</p>
            </div>
            <div className="bg-white rounded-xl p-4 text-center border border-gray-200">
              <TrendingUp className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              {earnings.total > 0 ? (
                <p className="text-xl font-bold text-gray-800">${earnings.total.toLocaleString()}</p>
              ) : (
                <p className="text-sm text-gray-500 font-medium mt-1">Complete your first job!</p>
              )}
              <p className="text-xs text-gray-500 mt-1">All Time</p>
            </div>
            <div className="bg-white rounded-xl p-4 text-center border border-gray-200">
              <Briefcase className="w-5 h-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-bold text-gray-800">{earnings.pendingJobs}</p>
              <p className="text-xs text-gray-500 mt-1">Active Jobs</p>
            </div>
          </div>
        </div>
        )}

        {/* Recent Reviews */}
        {recentReviews.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 rounded-lg">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Recent Reviews</h3>
              </div>
              <Link to="/my-profile" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                View All
              </Link>
            </div>
            <div className="space-y-3">
              {recentReviews.map((review) => (
                <div key={review.id} className="flex items-start gap-3 p-3 bg-surface-50 border border-surface-200 rounded-lg">
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">{review.client_name || 'Client'}</span>
                      <div className="flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3 h-3 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-xs text-gray-600 line-clamp-2">{review.comment.replace(/\[Tags:.*?\]/, '').trim()}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(review.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services quick-link — full management moved to Schedule > Services */}
        {(agreements.length > 0 || recurringSessions.length > 0) && (
          <div className="mt-6">
            <Link
              to="/schedule"
              className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Ongoing Services</p>
                  <p className="text-xs text-gray-500">
                    {agreements.length > 0 && `${agreements.length} regular client${agreements.length !== 1 ? 's' : ''}`}
                    {agreements.length > 0 && recurringSessions.length > 0 && ' · '}
                    {recurringSessions.length > 0 && `${recurringSessions.length} upcoming visit${recurringSessions.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors" />
            </Link>
          </div>
        )}

        <SectionErrorBoundary fallbackTitle="Quote insights failed to load">
          <div className="mt-6" data-tour="quote-insights"><QuoteInsightsWidget /></div>
        </SectionErrorBoundary>

        {/* Push Notification Banner — dismissible */}
        {showPushBanner && pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
          <div className="bg-gradient-to-r from-primary-50 to-warm-50 rounded-2xl border border-primary-200 p-5 mb-6 mt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BellRing className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Never Miss an Urgent Lead</h3>
                  <p className="text-sm text-gray-600 mt-0.5">Get instant desktop alerts when high-priority jobs are posted in your area.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleEnablePush}
                  disabled={pushEnabling || pushStatus === 'denied'}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    pushStatus === 'denied'
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-warm-500 text-white hover:bg-warm-600 shadow-sm hover:shadow-md active:scale-95'
                  }`}
                >
                  {pushEnabling ? <Loader2 className="w-4 h-4 animate-spin" /> : pushStatus === 'denied' ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                  {pushStatus === 'denied' ? 'Blocked' : 'Enable'}
                </button>
                <button
                  onClick={() => { localStorage.setItem('dismissedPushBanner', 'true'); setShowPushBanner(false); }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {showPayoutBanner && (
          <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-green-800">Pro Member — Lowest Fees</span>
            <span className="text-sm text-green-600 flex-1">You're keeping more of every job with Pro.</span>
            <button
              onClick={() => { localStorage.setItem('dismissedPayoutBanner', 'true'); setShowPayoutBanner(false); }}
              className="p-1 text-green-500 hover:text-green-700 rounded transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}

      <BulkAvailabilityModal isOpen={showAddSlot} onClose={() => setShowAddSlot(false)} onSave={handleAddSlot} currentMonth={currentDate} />

      {/* Edit Slot Modal */}
      {editingSlot && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setEditingSlot(null)} />
          <div role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') setEditingSlot(null); }} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Edit Time Slot</h3>
              <button onClick={() => setEditingSlot(null)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                {new Date(editingSlot.start_time).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input type="time" step="300" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input type="time" step="300" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Select times in 5-minute intervals</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditingSlot(null)} className="flex-1 px-4 py-3 text-gray-700 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleUpdateSlot} className="flex-1 px-4 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors">Save Changes</button>
            </div>
          </div>
        </>
      )}

      {/* Clear All Confirm Modal */}
      {confirmClearAll && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setConfirmClearAll(false)} />
          <div role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') setConfirmClearAll(false); }} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-md p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><Trash2 className="w-6 h-6 text-red-600" /></div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Clear All Upcoming Slots</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">Are you sure you want to delete all upcoming available slots? Booked slots will not be affected.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmClearAll(false)} className="flex-1 px-4 py-3 text-gray-700 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleClearAll} className="flex-1 px-4 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors">Clear All</button>
            </div>
          </div>
        </>
      )}

      {/* Add Slot For Day Modal */}
      {showAddSlotForDay && selectedDay !== null && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowAddSlotForDay(false)} />
          <div role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape') setShowAddSlotForDay(false); }} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Add Time Slot</h3>
              <button onClick={() => setShowAddSlotForDay(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-600 mb-4">
                {new Date(currentDate.getFullYear(), currentDate.getMonth(), selectedDay).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Time</label>
                  <input type="time" step="300" value={newSlotStartTime} onChange={(e) => setNewSlotStartTime(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Time</label>
                  <input type="time" step="300" value={newSlotEndTime} onChange={(e) => setNewSlotEndTime(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Select times in 5-minute intervals</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddSlotForDay(false)} className="flex-1 px-4 py-3 text-gray-700 font-medium border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAddSlotForDay} disabled={newSlotStartTime >= newSlotEndTime || addingSlot} className="flex-1 px-4 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {addingSlot ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : 'Add Slot'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Conversation Settings Modal */}
      {selectedConversation && (
        <ConversationSettingsModal
          isOpen={showConversationSettings}
          onClose={() => { setShowConversationSettings(false); setSelectedConversation(null); }}
          conversationId={selectedConversation.id}
          currentUserId={user?.id || ''}
          isAdmin={selectedConversation.myParticipation?.is_admin || false}
          onConversationUpdated={() => { fetchConversations(); setShowConversationSettings(false); setSelectedConversation(null); }}
        />
      )}

      {/* Job Management Modal */}
      {selectedJob && (
        <JobManagementModal
          isOpen={showJobManagement}
          onClose={() => { setShowJobManagement(false); setSelectedJob(null); }}
          jobId={selectedJob}
          onJobUpdated={() => { fetchJobs(); setShowJobManagement(false); setSelectedJob(null); }}
          isLicenseExpired={isLicenseExpired}
        />
      )}

      {/* Delete Job Confirm Modal */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => !deleting && setShowDeleteConfirm(false)} />
          <div role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === 'Escape' && !deleting) setShowDeleteConfirm(false); }} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl shadow-2xl z-50 w-full max-w-md p-6">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center"><Trash2 className="w-6 h-6 text-red-600" /></div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Delete Job</h3>
            <p className="text-gray-600 text-center mb-6">Are you sure you want to delete this job? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteJob} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</> : <><Trash2 className="w-4 h-4" />Delete</>}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-4 right-4 ${toast.isError ? 'bg-red-600' : 'bg-green-600'} text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 z-50 animate-slide-up`}>
          <div className={`w-2 h-2 ${toast.isError ? 'bg-red-300' : 'bg-green-300'} rounded-full animate-pulse`} />
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <SubscriptionModal isOpen={showSubscriptionModal} onClose={() => setShowSubscriptionModal(false)} />


      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </DashboardLayout>
  );
}
