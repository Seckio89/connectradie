import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
import SmartInsightsWidget from '../components/SmartInsightsWidget';
import EmptyState from '../components/EmptyState';
import SubscriptionModal from '../components/SubscriptionModal';
import CollapsibleSection from '../components/CollapsibleSection';
import { isPro } from '../lib/subscription';
import UserTradeBadges from '../components/UserTradeBadges';
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

type TabType = 'overview' | 'jobs' | 'messages';

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
      return <Clock className="w-5 h-5 text-blue-600" />;
    case 'cancelled':
      return <XCircle className="w-5 h-5 text-red-600" />;
    default:
      return <AlertCircle className="w-5 h-5 text-amber-600" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'cancelled':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'accepted':
      return 'bg-teal-100 text-teal-700 border-teal-200';
    default:
      return 'bg-amber-100 text-amber-700 border-amber-200';
  }
}

// ─── Main Component ───────────────────────────────────────

export default function TradieDashboard() {
  // Auth & derived
  const { user, tradieDetails, profile } = useAuth();
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
    deleting,
    fetchJobs,
    fetchUnlockedJobs,
    deleteJob,
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
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
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

  // Push notifications
  const [pushStatus, setPushStatus] = useState<'loading' | 'granted' | 'denied' | 'default' | 'unsupported'>('loading');
  const [pushEnabling, setPushEnabling] = useState(false);

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
    setCalendarIntegration(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ─── Effects ──────────────────────────────────────────────

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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Business Hub</h1>
          <p className="text-gray-700">Manage your schedule, jobs, and conversations in one place</p>
          {profile && (
            <div className="mt-3">
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

        {/* Quick Stats */}
        <CollapsibleSection
          title="Quick Stats"
          defaultOpen={true}
          icon={<div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center"><Clock className="w-4 h-4 text-primary-600" /></div>}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-primary-50 to-primary-100/30 rounded-2xl border border-primary-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-200 rounded-xl flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary-700" />
                </div>
                <div>
                  <p className="text-sm text-primary-700 font-medium">Available Hours</p>
                  <p className="text-3xl font-bold text-primary-900">{totalAvailableHours.toFixed(0)}</p>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100/30 rounded-2xl border border-green-200 p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-200 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-green-700" />
                </div>
                <div>
                  <p className="text-sm text-green-700 font-medium">Booked Slots</p>
                  <p className="text-3xl font-bold text-green-900">{bookedSlots}</p>
                </div>
              </div>
            </div>

            <Link to="/jobs" className="bg-gradient-to-br from-amber-50 to-amber-100/30 rounded-2xl border border-amber-200 p-6 hover:border-amber-300 hover:shadow-lg transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-200 rounded-xl flex items-center justify-center">
                  <Users className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <p className="text-sm text-amber-700 font-medium">Active Jobs</p>
                  <p className="text-3xl font-bold text-amber-900">{activeJobCount}</p>
                </div>
              </div>
            </Link>

            <button
              onClick={() => setShowSubscriptionModal(true)}
              className={`rounded-2xl border p-6 hover:shadow-lg transition-all cursor-pointer text-left ${
                isProUser
                  ? 'bg-gradient-to-br from-amber-50 to-yellow-100/30 border-amber-300'
                  : 'bg-gradient-to-br from-gray-50 to-gray-100/30 border-gray-200 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isProUser ? 'bg-amber-200' : 'bg-gray-200'}`}>
                  <Crown className={`w-6 h-6 ${isProUser ? 'text-amber-700' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isProUser ? 'text-amber-700' : 'text-gray-600'}`}>Your Plan</p>
                  <p className={`text-xl font-bold ${isProUser ? 'text-amber-900' : 'text-gray-900'}`}>
                    {isProUser ? 'Pro' : 'Free'}
                  </p>
                  {!isProUser && <p className="text-xs text-amber-600 font-medium mt-1">Upgrade for more</p>}
                </div>
              </div>
            </button>
          </div>
        </CollapsibleSection>

        <div className="mt-6"><SmartInsightsWidget /></div>

        <div className="mt-6 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-green-800">100% Payout (Zero Platform Fees)</span>
          <span className="text-sm text-green-600">- You keep every dollar you earn.</span>
        </div>

        <div className="mt-6 space-y-6">
          <QuoteInsightsWidget />
          <OnboardingChecklist />
        </div>

        {/* Push Notification Banner */}
        {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
          <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-2xl border border-blue-200 p-5 mb-6 mt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BellRing className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Never Miss an Urgent Lead</h3>
                  <p className="text-sm text-gray-600 mt-0.5">Get instant desktop alerts when high-priority jobs are posted in your area.</p>
                </div>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushEnabling || pushStatus === 'denied'}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex-shrink-0 ${
                  pushStatus === 'denied'
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md active:scale-95'
                }`}
              >
                {pushEnabling ? <Loader2 className="w-4 h-4 animate-spin" /> : pushStatus === 'denied' ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {pushStatus === 'denied' ? 'Blocked in Browser' : 'Enable Desktop Alerts'}
              </button>
            </div>
          </div>
        )}

        {pushStatus === 'granted' && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-4 mb-6 mt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-green-800">Desktop alerts are active. You'll be notified of urgent leads instantly.</p>
            </div>
          </div>
        )}

        {/* Tabbed Content */}
        <div className="bg-white rounded-2xl border border-gray-200 mb-6 shadow-sm mt-8">
          <div className="border-b border-gray-200">
            <div className="flex gap-2 p-4">
              {(['overview', 'jobs', 'messages'] as TabType[]).map((tab) => {
                const icons = { overview: Calendar, jobs: Briefcase, messages: MessageSquare };
                const labels = { overview: 'Overview', jobs: 'Jobs', messages: 'Messages' };
                const Icon = icons[tab];
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all min-h-[44px] ${
                      activeTab === tab
                        ? 'bg-primary-600 text-white shadow-md'
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
            {/* ─── OVERVIEW TAB ─── */}
            {activeTab === 'overview' && (
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
                    </div>

                    <div className="flex items-center gap-2">
                      {isProUser ? (
                        <button onClick={() => setShowAddSlot(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-colors min-h-[44px]">
                          <Plus className="w-4 h-4" />Bulk Add Slots
                        </button>
                      ) : (
                        <button onClick={() => setShowSubscriptionModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white font-medium rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all min-h-[44px]">
                          <Crown className="w-4 h-4" />Bulk Add Slots<span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">PRO</span>
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
                        <button onClick={() => setShowSubscriptionModal(true)} className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-700 font-medium rounded-xl hover:bg-amber-50 transition-colors min-h-[44px]">
                          <Calendar className="w-4 h-4" />Google Calendar<span className="text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">PRO</span>
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
                  ) : (
                    <>
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {dayNames.map((day) => (
                          <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">{day}</div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-1">
                        {[...Array(startingDay)].map((_, i) => <div key={`empty-${i}`} className="aspect-square" />)}
                        {[...Array(daysInMonth)].map((_, i) => {
                          const day = i + 1;
                          const daySlots = getSlotsForDate(day);
                          const hasAvailable = daySlots.some((s) => s.status === 'available');
                          const hasBooked = daySlots.some((s) => s.status === 'booked');
                          const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                          const isSelected = selectedDay === day;

                          return (
                            <button
                              key={day}
                              onClick={() => setSelectedDay(day)}
                              className={`aspect-square rounded-lg p-1 text-sm transition-all min-w-[40px] min-h-[40px] ${
                                isSelected ? 'bg-primary-600 text-white ring-2 ring-primary-600 ring-offset-2'
                                : hasAvailable && hasBooked ? 'bg-gradient-to-br from-green-50 to-blue-50 hover:from-green-100 hover:to-blue-100'
                                : hasAvailable ? 'bg-green-50 hover:bg-green-100'
                                : hasBooked ? 'bg-blue-50 hover:bg-blue-100'
                                : isToday ? 'ring-2 ring-primary-500 hover:bg-gray-100'
                                : 'hover:bg-gray-100'
                              }`}
                            >
                              <div className="flex flex-col items-center">
                                <span className={`font-medium ${isSelected ? 'text-white' : isToday ? 'text-primary-600 font-bold' : 'text-gray-700'}`}>{day}</span>
                                <div className="flex gap-1 mt-0.5">
                                  {hasAvailable && <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-green-300' : 'bg-green-500'}`} />}
                                  {hasBooked && <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-primary-500'}`} />}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 flex items-center gap-5 text-sm text-gray-700">
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-green-100 border-2 border-green-500 rounded" /><span className="font-medium">Available</span></div>
                        <div className="flex items-center gap-2"><span className="w-4 h-4 bg-blue-100 border-2 border-primary-500 rounded" /><span className="font-medium">Booked</span></div>
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
                      <div key={slot.id} className={`p-3 rounded-xl border ${slot.status === 'available' ? 'bg-green-50 border-green-200' : slot.status === 'booked' ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'}`}>
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
                              <button onClick={() => startEditingSlot(slot)} className="p-2.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Edit time">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteSlot(slot.id)} className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Delete slot">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        <span className={`mt-2 inline-block text-xs px-2 py-0.5 rounded-full ${slot.status === 'available' ? 'bg-green-100 text-green-700' : slot.status === 'booked' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-700'}`}>
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
                      <div className="text-center py-6 bg-amber-50 rounded-lg border border-amber-200">
                        <p className="text-amber-900 text-sm font-medium mb-2">No upcoming availability</p>
                        <p className="text-amber-800 text-xs">Add slots to your calendar so clients can book you</p>
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
            )}

            {/* ─── JOBS TAB ─── */}
            {activeTab === 'jobs' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Jobs</h2>
                {jobs.length === 0 ? (
                  <EmptyState
                    icon={Briefcase}
                    title="No Active Jobs"
                    description="Set up your calendar so clients can find and book you for their next project."
                    actionLabel="Set Your Availability"
                    onAction={() => setActiveTab('overview')}
                  />
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job: DashboardJob) => (
                      <div
                        key={job.id}
                        className={`border rounded-xl p-4 transition-all ${job.priority === 'urgent' ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-primary-300'}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(job.status)}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-gray-900">{job.profiles?.full_name || 'Client'}</h3>
                                {job.priority === 'urgent' && (
                                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />URGENT
                                  </span>
                                )}
                                {job.is_delayed && (
                                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full border border-yellow-200 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />Delayed
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {redactSensitiveInfo(job.profiles?.email || '', isJobUnlocked(job.id))}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(job.status)}`}>
                              {job.status.replace(/_/g, ' ')}
                            </span>
                            <button
                              onClick={() => { if (!isLicenseExpired) { setSelectedJob(job.id); setShowJobManagement(true); } }}
                              disabled={isLicenseExpired}
                              className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${isLicenseExpired ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                              title={isLicenseExpired ? 'License expired - renew to manage jobs' : 'Manage job'}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-gray-700 mb-3">{redactSensitiveInfo(job.description, isJobUnlocked(job.id))}</p>
                        {job.notes && (
                          <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-700"><span className="font-semibold">Note:</span> {job.notes}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          {job.scheduled_time && <div className="flex items-center gap-2"><Clock className="w-4 h-4" />{new Date(job.scheduled_time).toLocaleString()}</div>}
                          {job.is_delayed && job.delayed_until && <div className="flex items-center gap-2 text-yellow-700"><Clock className="w-4 h-4" />Until {new Date(job.delayed_until).toLocaleString()}</div>}
                          <div className="flex items-center gap-2 text-xs text-gray-400"><Calendar className="w-3 h-3" />Created {new Date(job.created_at).toLocaleDateString()}</div>
                        </div>
                        {job.status === 'declined' && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <button onClick={() => { setJobToDelete(job.id); setShowDeleteConfirm(true); }} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2">
                              <Trash2 className="w-4 h-4" />Delete
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── MESSAGES TAB ─── */}
            {activeTab === 'messages' && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Conversations</h2>
                {conversations.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No Messages Yet"
                    description="When clients message you about jobs, their conversations will appear here."
                    actionLabel="Set Your Availability"
                    onAction={() => setActiveTab('overview')}
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
      </div>

      {/* ─── MODALS ─── */}

      <BulkAvailabilityModal isOpen={showAddSlot} onClose={() => setShowAddSlot(false)} onSave={handleAddSlot} currentMonth={currentDate} />

      {/* Edit Slot Modal */}
      {editingSlot && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setEditingSlot(null)} />
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
              <button onClick={handleUpdateSlot} className="flex-1 px-4 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors">Save Changes</button>
            </div>
          </div>
        </>
      )}

      {/* Clear All Confirm Modal */}
      {confirmClearAll && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setConfirmClearAll(false)} />
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
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowAddSlotForDay(false)} />
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
              <button onClick={handleAddSlotForDay} disabled={newSlotStartTime >= newSlotEndTime || addingSlot} className="flex-1 px-4 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
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
