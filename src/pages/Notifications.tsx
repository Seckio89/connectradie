import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Briefcase,
  MessageCircle,
  Users,
  DollarSign,
  CheckCheck,
  CheckCircle2,
  XCircle,
  Star,
  FileText,
  CalendarDays,
  Clock,
  Loader2,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { markNotificationRead, markAllNotificationsRead } from '../lib/notificationService';
import type { Notification } from '../types/database';

type FilterTab = 'all' | 'unread' | 'job' | 'message' | 'team' | 'payment';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'job', label: 'Jobs' },
  { key: 'message', label: 'Messages' },
  { key: 'team', label: 'Team' },
  { key: 'payment', label: 'Payments' },
];

const PAGE_SIZE = 20;

function getNotifStyle(type: string): { icon: LucideIcon; bgClass: string; iconClass: string } {
  switch (type) {
    case 'QUOTE_RECEIVED':
    case 'quote_received':
      return { icon: MessageCircle, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'JOB_ACCEPTED':
    case 'job_update':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'new_job':
    case 'new_lead':
    case 'booking_request':
      return { icon: Briefcase, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    case 'quote_reminder':
      return { icon: Clock, bgClass: 'bg-amber-100', iconClass: 'text-amber-600' };
    case 'payment':
    case 'PAYMENT_RECEIVED':
    case 'invoice_ready':
    case 'invoice_approval_required':
    case 'invoice_approval_reminder':
    case 'invoice_approved':
    case 'invoice_disputed':
    case 'invoice_generated':
    case 'INVOICE_RECEIVED':
    case 'payment_auto_released':
    case 'payment_received':
    case 'payment_sent':
    case 'becs_charge_initiated':
      return { icon: DollarSign, bgClass: 'bg-emerald-500', iconClass: 'text-white' };
    case 'session_reminder':
    case 'session_rescheduled':
    case 'session_skipped':
    case 'extra_session_added':
    case 'BOOKING_REMINDER':
      return { icon: CalendarDays, bgClass: 'bg-purple-100', iconClass: 'text-purple-600' };
    case 'recurring_job_auto_confirmed':
    case 'recurring_job_confirmed':
    case 'session_completed':
    case 'recurring_resumed':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'recurring_job_confirmation_required':
      return { icon: Clock, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    case 'recurring_paused':
      return { icon: Clock, bgClass: 'bg-amber-100', iconClass: 'text-amber-600' };
    case 'session_overdue':
    case 'recurring_session_not_completed':
      return { icon: AlertTriangle, bgClass: 'bg-red-100', iconClass: 'text-red-600' };
    case 'vacancy_application':
    case 'team':
      return { icon: Users, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    case 'JOB_DECLINED':
      return { icon: XCircle, bgClass: 'bg-red-100', iconClass: 'text-red-600' };
    case 'JOB_COMPLETED':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'REVIEW_RECEIVED':
      return { icon: Star, bgClass: 'bg-amber-100', iconClass: 'text-amber-600' };
    case 'project_update':
      return { icon: FileText, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    case 'job_reminder_day_before':
      return { icon: CalendarDays, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    case 'job_reminder_two_hours':
    case 'tradie_en_route':
      return { icon: Clock, bgClass: 'bg-amber-100', iconClass: 'text-amber-600' };
    case 'quote_accepted':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'job_completed':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-100', iconClass: 'text-emerald-600' };
    case 'recurring_cancelled':
      return { icon: XCircle, bgClass: 'bg-red-100', iconClass: 'text-red-600' };
    case 'becs_setup_complete':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500', iconClass: 'text-white' };
    case 'supply_restock_needed':
      return { icon: AlertTriangle, bgClass: 'bg-amber-100', iconClass: 'text-amber-600' };
    case 'message':
    case 'new_message':
      return { icon: MessageCircle, bgClass: 'bg-secondary-100', iconClass: 'text-secondary-600' };
    default:
      return { icon: Bell, bgClass: 'bg-gray-100', iconClass: 'text-gray-500' };
  }
}

function getFilterCategory(type: string): FilterTab {
  switch (type) {
    case 'job_update':
    case 'booking_request':
    case 'job':
    case 'new_lead':
    case 'new_job':
    case 'project_update':
    case 'JOB_ACCEPTED':
    case 'JOB_DECLINED':
    case 'JOB_COMPLETED':
    case 'job_reminder_day_before':
    case 'job_reminder_two_hours':
    case 'tradie_en_route':
    case 'quote_accepted':
    case 'job_completed':
    case 'recurring_cancelled':
    case 'quote_reminder':
    case 'supply_restock_needed':
      return 'job';
    case 'message':
    case 'new_message':
      return 'message';
    case 'team':
    case 'vacancy_application':
      return 'team';
    case 'payment':
    case 'invoice':
    case 'invoice_ready':
    case 'PAYMENT_RECEIVED':
    case 'INVOICE_RECEIVED':
    case 'payment_auto_released':
    case 'payment_sent':
      return 'payment';
    default:
      return 'all';
  }
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;

  return new Date(dateStr).toLocaleDateString();
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="p-4 flex items-start gap-3 animate-pulse">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Notifications() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    if (!user) return;

    if (offset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE);

      if (error) {
        console.error('Failed to fetch notifications:', error.message);
        return;
      }

      const rows = (data || []) as Notification[];
      setNotifications(prev => append ? [...prev, ...rows] : rows);
      setHasMore(rows.length > PAGE_SIZE);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('notifications-page')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleMarkAsRead = async (notification: Notification) => {
    if (notification.read_at) return;

    const success = await markNotificationRead(notification.id);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read: true, read_at: now } : n)
      );
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    setMarkingAll(true);
    const success = await markAllNotificationsRead(user.id);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: now })));
    }
    setMarkingAll(false);
  };

  const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (!error) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
      }
    } catch {
      console.error('Failed to delete notification');
    }
  };

  const handleClearAll = async () => {
    if (!user) return;
    setClearingAll(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user.id);

      if (!error) {
        setNotifications([]);
      }
    } catch {
      console.error('Failed to clear notifications');
    } finally {
      setClearingAll(false);
    }
  };

  const handleClick = async (notification: Notification) => {
    await handleMarkAsRead(notification);

    if (notification.link) {
      navigate(notification.link);
      return;
    }

    const jobId = notification.job_id || notification.metadata?.job_id;

    // Un-dismiss job from leads list when clicking job-related notifications
    if (jobId && ['new_lead', 'new_job', 'quote_reminder'].includes(notification.type)) {
      try {
        const stored = localStorage.getItem('dismissed_leads');
        if (stored) {
          const dismissed: string[] = JSON.parse(stored);
          const updated = dismissed.filter((id: string) => id !== jobId);
          localStorage.setItem('dismissed_leads', JSON.stringify(updated));
        }
      } catch { /* ignore */ }
    }

    const isTradie = profile?.role === 'tradie';

    // BECS payment notifications → Payments page
    const becsPaymentTypes = ['becs_charge_initiated', 'becs_payment_failed', 'payment_auto_released'];

    // BECS setup notifications → Services/Schedule
    const becsSetupTypes = ['becs_setup_complete', 'becs_setup_failed', 'becs_mandate_revoked'];

    // Ongoing service notification types → Ongoing Services tab
    const ongoingTypes = [
      'session_reminder', 'session_rescheduled', 'session_skipped', 'session_completed',
      'extra_session_added', 'invoice_ready',
      'recurring_job_confirmation_required', 'recurring_job_auto_confirmed',
      'recurring_job_confirmed', 'recurring_job_declined',
      'recurring_paused', 'recurring_resumed', 'recurring_cancelled',
      'recurring_price_updated', 'price_increase_requested', 'price_adjusted',
      'reschedule_proposal', 'reschedule_accepted', 'time_proposal',
    ];

    // Fallback navigation based on type / metadata
    if (becsPaymentTypes.includes(notification.type)) {
      navigate('/payments');
    } else if (becsSetupTypes.includes(notification.type)) {
      navigate(isTradie ? '/work?tab=services' : '/leads?tab=services');
    } else if (ongoingTypes.includes(notification.type)) {
      navigate(isTradie ? '/work?tab=services' : '/leads?tab=services');
    } else if (notification.type === 'booking_request') {
      if (notification.metadata?.conversation_id) {
        navigate(`/messages?conversation=${notification.metadata.conversation_id}`);
      } else {
        navigate(isTradie ? '/work?tab=active' : '/leads');
      }
    } else if (notification.type === 'job_update' || notification.type === 'project_update') {
      navigate(isTradie ? '/work?tab=active' : '/leads');
    } else if (notification.type === 'vacancy_application') {
      navigate('/work');
    } else if (notification.type === 'message' || notification.type === 'new_message') {
      navigate('/messages');
    } else if (notification.type === 'payment' || notification.type === 'invoice') {
      navigate('/payments');
    } else if (jobId) {
      navigate(profile?.role === 'tradie' ? `/work?job=${jobId}` : `/leads?job=${jobId}`);
    } else {
      // Fallback: send to main hub
      navigate(profile?.role === 'tradie' ? '/work' : '/leads');
    }
  };

  const handleLoadMore = () => {
    fetchNotifications(notifications.length, true);
  };

  // Apply filter
  const filtered = notifications.filter(n => {
    if (activeTab === 'all') return true;
    if (activeTab === 'unread') return !n.read_at;
    return getFilterCategory(n.type) === activeTab;
  });

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCheck className="w-4 h-4" />
                )}
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {clearingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-hide scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
          {FILTER_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`pb-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-warm-500 text-warm-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={activeTab === 'unread' ? BellOff : Bell}
              title={activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
              description={
                activeTab === 'unread'
                  ? 'You have no unread notifications.'
                  : activeTab === 'all'
                    ? "You don't have any notifications yet."
                    : `No ${FILTER_TABS.find(t => t.key === activeTab)?.label.toLowerCase()} notifications.`
              }
            />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {filtered.map(notification => {
                  const style = getNotifStyle(notification.type);
                  const NotifIcon = style.icon;
                  const isUnread = !notification.read_at;

                  return (
                    <div
                      key={notification.id}
                      onClick={() => handleClick(notification)}
                      className={`group w-full text-left p-4 hover:bg-gray-50 transition-colors flex items-start gap-3 cursor-pointer ${
                        isUnread ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${style.bgClass}`}
                      >
                        <NotifIcon className={`w-5 h-5 ${style.iconClass}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4
                            className={`text-sm truncate ${
                              isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                            }`}
                          >
                            {notification.title}
                          </h4>
                          {isUnread && (
                            <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                          )}
                          <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                            {relativeTime(notification.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>

                      <button
                        onClick={(e) => handleDelete(e, notification.id)}
                        className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 rounded hover:bg-red-50"
                        aria-label="Delete notification"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {hasMore && activeTab === 'all' && (
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="w-full py-2.5 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load more'
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
