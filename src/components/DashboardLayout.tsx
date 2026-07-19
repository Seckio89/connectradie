import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Wrench,
  MessageCircle,
  Settings,
  LogOut,
  Menu,
  X,
  Home,
  BadgeCheck,
  Bell,
  Package,
  Crown,
  Zap,
  Briefcase,
  ShieldCheck,
  CalendarDays,
  Clock,
  ClipboardList,
  UserCircle,
  TrendingUp,
  BarChart3,
  Users,
  DollarSign,
  Flag,
  AlertTriangle,
  Wallet,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Star,
  FileText,
  Plus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useSiteGeofencing } from '../hooks/useSiteGeofencing';
import { hasGeofenceConsent, GEOFENCE_CONSENT_EVENT } from '../lib/siteGeofence';
import SiteGeofenceConsent from './SiteGeofenceConsent';
import GeofenceActiveToast from './GeofenceActiveToast';
import { markNotificationRead, markAllNotificationsRead } from '../lib/notificationService';
import type { LucideIcon } from 'lucide-react';
import type { Notification } from '../types/database';
import SubscriptionModal from './SubscriptionModal';
import PlatformUpdateBanner from './PlatformUpdateBanner';
import HelpButton from './help/HelpButton';
import PageHelpCard from './help/PageHelpCard';
import { isPro } from '../lib/subscription';

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

function getNotifStyle(type: string): { icon: LucideIcon; bgClass: string; iconClass: string } {
  switch (type) {
    case 'QUOTE_RECEIVED':
    case 'quote_received':
      return { icon: MessageCircle, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'JOB_ACCEPTED':
    case 'job_update':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'new_job':
    case 'new_lead':
    case 'booking_request':
      return { icon: Briefcase, bgClass: 'bg-secondary-500/15', iconClass: 'text-secondary-400' };
    case 'quote_reminder':
      return { icon: Clock, bgClass: 'bg-amber-500/15', iconClass: 'text-amber-400' };
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
      return { icon: CalendarDays, bgClass: 'bg-purple-500/15', iconClass: 'text-purple-400' };
    case 'vacancy_application':
    case 'team':
      return { icon: Users, bgClass: 'bg-secondary-500/15', iconClass: 'text-secondary-400' };
    case 'vacancy_match':
      return { icon: Briefcase, bgClass: 'bg-warm-500/15', iconClass: 'text-warm-400' };
    case 'service_assignment':
      return { icon: Users, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'price_increase_requested':
      return { icon: DollarSign, bgClass: 'bg-amber-500/15', iconClass: 'text-amber-400' };
    case 'price_adjusted':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'JOB_DECLINED':
      return { icon: XCircle, bgClass: 'bg-red-500/15', iconClass: 'text-red-400' };
    case 'JOB_COMPLETED':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'REVIEW_RECEIVED':
      return { icon: Star, bgClass: 'bg-amber-500/15', iconClass: 'text-amber-400' };
    case 'project_update':
      return { icon: FileText, bgClass: 'bg-secondary-500/15', iconClass: 'text-secondary-400' };
    case 'job_reminder_day_before':
      return { icon: CalendarDays, bgClass: 'bg-secondary-500/15', iconClass: 'text-secondary-400' };
    case 'job_reminder_two_hours':
    case 'tradie_en_route':
      return { icon: Clock, bgClass: 'bg-amber-500/15', iconClass: 'text-amber-400' };
    case 'quote_accepted':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'job_completed':
      return { icon: CheckCircle2, bgClass: 'bg-emerald-500/15', iconClass: 'text-emerald-400' };
    case 'recurring_cancelled':
      return { icon: XCircle, bgClass: 'bg-red-500/15', iconClass: 'text-red-400' };
    default:
      return { icon: Bell, bgClass: 'bg-navy-700', iconClass: 'text-navy-300' };
  }
}

interface NavSubItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  state?: Record<string, unknown>;
  children?: NavSubItem[];
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const [pendingReleaseCount, setPendingReleaseCount] = useState(0);
  const [toastNotification, setToastNotification] = useState<Notification | null>(null);

  // ── Bottom-nav visibility (mobile) ─────────────────────────────
  // Hide on scroll-down / reveal on scroll-up (standard mobile UX), and hide
  // whenever a modal/overlay is open so the fixed bar never covers modal
  // content or action buttons. Applies app-wide (the nav is lg:hidden).
  const [scrollHidden, setScrollHidden] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 24) setScrollHidden(false);            // always show near the top
        else if (y - lastY > 8) setScrollHidden(true);  // scrolling down → hide
        else if (lastY - y > 8) setScrollHidden(false); // scrolling up → show
        lastY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const check = () => setOverlayOpen(
      document.body.style.overflow === 'hidden' ||
      !!document.querySelector('.fixed.inset-0.z-50, [role="dialog"]')
    );
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    return () => obs.disconnect();
  }, []);

  const bottomNavHidden = scrollHidden || overlayOpen;
  const lastNotificationIdRef = useRef<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, tradieDetails, signOut } = useAuth();

  const isTradie = profile?.role === 'tradie';

  // Keep native site geofences in sync with scheduled visits (no-op on web).
  // Gated on the in-app background-location disclosure being accepted first;
  // resyncs when consent changes anywhere (disclosure modal or Settings toggle).
  const [geoConsent, setGeoConsent] = useState(hasGeofenceConsent());
  useSiteGeofencing(geoConsent);
  useEffect(() => {
    const resync = () => setGeoConsent(hasGeofenceConsent());
    window.addEventListener(GEOFENCE_CONSENT_EVENT, resync);
    return () => window.removeEventListener(GEOFENCE_CONSENT_EVENT, resync);
  }, []);

  // Auto-expand nav group when navigating to a child route
  useEffect(() => {
    if (location.pathname === '/analytics' || location.pathname === '/performance') {
      setExpandedNav('Insights');
    }
  }, [location.pathname]);

  // Listen for WelcomeGuide requesting sidebar open (for tour steps targeting sidebar elements).
  // Skip the CSS transition so the sidebar snaps open instantly — this prevents the tour
  // highlight from calculating a stale bounding rect during the slide animation.
  useEffect(() => {
    const handler = (e: Event) => {
      const { open } = (e as CustomEvent).detail;
      // Disable the transition before React re-renders with the new state
      if (sidebarRef.current) {
        sidebarRef.current.style.transition = 'none';
      }
      setSidebarOpen(open);
      // Re-enable transitions after the browser has painted the sidebar in its final position
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (sidebarRef.current) {
            sidebarRef.current.style.transition = '';
          }
        });
      });
    };
    window.addEventListener('welcomeguide:sidebar', handler);
    return () => window.removeEventListener('welcomeguide:sidebar', handler);
  }, []);

  // Count ALL items needing the client's attention — releases, pending
  // quotes, incomplete payments, invoices. This drives the sidebar dot
  // and matches the "Needs your attention" card on the dashboard.
  const refreshPendingReleaseCount = async () => {
    if (!user || profile?.role !== 'client') return;
    try {
      let total = 0;

      // 1. Completed jobs awaiting release
      const { data: completedJobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('client_id', user.id)
        .eq('status', 'completed')
        .is('archived_at', null);

      if (completedJobs && completedJobs.length > 0) {
        // Fetch all job_funding payments (completed or released) for these jobs
        const { data: payments } = await supabase
          .from('payments')
          .select('id, job_id, status, metadata')
          .in('job_id', completedJobs.map(j => j.id))
          .in('status', ['completed', 'released'])
          .eq('payment_type', 'job_funding');

        const releasedIds = new Set<string>();
        for (const p of payments || []) {
          // status = 'released' means it's done. Also check metadata for legacy releases.
          const meta = p.metadata as Record<string, unknown> | null;
          if (p.status === 'released' || meta?.transfer_id || meta?.released_at) {
            releasedIds.add(p.job_id);
          }
        }
        total += completedJobs.filter(j => !releasedIds.has(j.id)).length;
      }

      // 2. Pending jobs with quotes to review
      const { data: quotedJobs } = await supabase
        .from('jobs')
        .select('id, quote_count')
        .eq('client_id', user.id)
        .eq('status', 'pending')
        .is('archived_at', null)
        .gt('quote_count', 0);
      total += (quotedJobs || []).length;

      // 3. Incomplete payments (abandoned checkouts)
      const { data: pendingPay } = await supabase
        .from('payments')
        .select('id')
        .eq('profile_id', user.id)
        .eq('status', 'pending')
        .eq('payment_type', 'job_funding');
      total += (pendingPay || []).length;

      // 4. Invoices needing approval
      const { data: pendingInv } = await supabase
        .from('recurring_invoices')
        .select('id')
        .eq('homeowner_id', user.id)
        .in('status', ['pending_approval', 'sent', 'overdue']);
      total += (pendingInv || []).length;

      setPendingReleaseCount(total);
    } catch (err) {
      console.error('fetchPendingReleaseCount error:', err);
    }
  };

  // Re-fetch pending release count on every route change so the badge
  // clears after the client releases a payment and navigates back.
  useEffect(() => {
    refreshPendingReleaseCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    // Fetch initial notifications and set the latest ID ref
    const initNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        const notifs = data as Notification[];
        setNotifications(notifs);
        if (notifs.length > 0) {
          lastNotificationIdRef.current = notifs[0].id;
        }
      }
    };
    initNotifications();

    // Count payments awaiting release — runs on mount only.
    // A separate effect re-fetches on route change (below).
    if (profile?.role === 'client') {
      refreshPendingReleaseCount();
    }

    // Subscribe to notification changes in real-time
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          if (newNotif.id === lastNotificationIdRef.current) return;
          lastNotificationIdRef.current = newNotif.id;
          setNotifications(prev => {
            if (prev.some(n => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          showToast(newNotif);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications(prev =>
            prev.map(n => n.id === updated.id ? updated : n)
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const deleted = payload.old as Notification;
          setNotifications(prev => prev.filter(n => n.id !== deleted.id));
        }
      )
      .subscribe();

    // Poll every 10s as fallback — full refresh to catch read status changes
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        const notifs = data as Notification[];
        setNotifications(notifs);
        if (notifs.length > 0) {
          lastNotificationIdRef.current = notifs[0].id;
        }
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function showToast(notif: Notification) {
    setToastNotification(notif);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastNotification(null), 10000);
  }

  const handleMarkAllRead = useCallback(async () => {
    if (!user) return;
    const success = await markAllNotificationsRead(user.id);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: now })));
    }
  }, [user]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        // Mark all as read when closing by clicking outside
        if (notificationsOpen && notifications.some(n => !n.read_at)) {
          handleMarkAllRead();
        }
        setNotificationsOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleMarkAllRead, notifications, notificationsOpen]);

  const markAsRead = async (notificationId: string) => {
    const success = await markNotificationRead(notificationId);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, read: true, read_at: now } : n
      ));
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);
    const jobId = notification.job_id || notification.metadata?.job_id;

    // Jobs past the lead stage (accepted / funded / in-progress / completed-awaiting-release) —
    // tradie lands on WorkHub "My Jobs" tab, client lands on Leads "Active" filter
    // (which now includes accepted / funded / in-progress / awaiting-release).
    const activeJobHref = (id?: string) =>
      isTradie
        ? `/work?tab=active${id ? `&job=${id}` : ''}`
        : `/leads?filter=active${id ? `&job=${id}` : ''}`;

    if (notification.type === 'QUOTE_RECEIVED' || notification.type === 'quote_received') {
      // Client clicks quote notification → go to My Jobs with that job expanded (Active tab — job is still pending a client decision)
      navigate(jobId ? `/leads?job=${jobId}` : '/leads');
      setNotificationsOpen(false);
    } else if (notification.type === 'booking_request') {
      if (jobId) {
        navigate(activeJobHref(jobId));
        setNotificationsOpen(false);
      } else if (notification.metadata?.conversation_id) {
        navigate(`/messages?conversation=${notification.metadata.conversation_id}`);
        setNotificationsOpen(false);
      }
    } else if (
      notification.type === 'job_update' ||
      notification.type === 'job_completed' ||
      notification.type === 'payment_released' ||
      notification.type === 'payment_confirmed' ||
      notification.type === 'price_reduction_requested' ||
      notification.type === 'price_reduction_approved' ||
      notification.type === 'price_reduction_declined'
    ) {
      navigate(activeJobHref(jobId));
      setNotificationsOpen(false);
    } else if (notification.type === 'project_update') {
      navigate('/projects');
      setNotificationsOpen(false);
    } else if (notification.type === 'vacancy_application') {
      navigate('/work');
      setNotificationsOpen(false);
    } else if (notification.type === 'vacancy_match') {
      navigate('/work?tab=recruitment');
      setNotificationsOpen(false);
    } else if (notification.type === 'new_lead' || notification.type === 'quote_reminder' || notification.type === 'new_job') {
      // Un-dismiss the job so it shows in the leads list
      if (jobId) {
        try {
          const stored = localStorage.getItem('dismissed_leads');
          if (stored) {
            const dismissed: string[] = JSON.parse(stored);
            const updated = dismissed.filter((id: string) => id !== jobId);
            localStorage.setItem('dismissed_leads', JSON.stringify(updated));
          }
        } catch { /* ignore */ }
      }
      navigate(jobId ? `/work?job=${jobId}` : '/work');
      setNotificationsOpen(false);
    } else if ([
      'becs_charge_initiated', 'becs_payment_failed', 'payment_auto_released',
    ].includes(notification.type)) {
      navigate('/payments');
      setNotificationsOpen(false);
    } else if ([
      'session_reminder', 'session_rescheduled', 'session_skipped', 'session_completed',
      'extra_session_added', 'invoice_ready',
      'invoice_approval_required', 'invoice_approval_reminder', 'invoice_approved', 'invoice_disputed', 'invoice_generated',
      'recurring_job_confirmation_required', 'recurring_job_auto_confirmed',
      'recurring_job_confirmed', 'recurring_job_declined',
      'recurring_paused', 'recurring_resumed', 'recurring_cancelled',
      'recurring_price_updated', 'price_increase_requested', 'price_adjusted',
      'reschedule_proposal', 'reschedule_accepted', 'time_proposal',
      'becs_setup_complete', 'becs_setup_failed', 'becs_mandate_revoked',
    ].includes(notification.type)) {
      navigate(isTradie ? '/work?tab=services' : '/leads?tab=services');
      setNotificationsOpen(false);
    } else {
      // Fallback: notifications with a jobId likely concern a job already in the pipeline,
      // so route to the active-work tab rather than the default Leads view.
      if (jobId) {
        navigate(activeJobHref(jobId));
      } else {
        navigate(isTradie ? '/work' : '/leads');
      }
      setNotificationsOpen(false);
    }
  };

  const clientNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Jobs', href: '/leads', icon: Briefcase },
    { name: 'Saved Tradies', href: '/my-trades', icon: Wrench },
    { name: 'Projects', href: '/projects', icon: Package },
    { name: 'Schedule', href: '/schedule', icon: CalendarDays },
    { name: 'Invoices & Payments', href: '/payments', icon: DollarSign },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const tradieNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Profile', href: '/my-profile', icon: UserCircle },
    { name: 'Work Hub', href: '/work', icon: ClipboardList },
    { name: 'Clients', href: '/clients', icon: Users },
    { name: 'Teams & Schedule', href: '/schedule', icon: CalendarDays },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Insights', href: '/analytics', icon: BarChart3, children: [
      { name: 'My Stats', href: '/analytics', icon: BarChart3 },
      { name: 'Performance', href: '/performance', icon: TrendingUp },
    ] },
    { name: 'Payouts', href: '/payouts', icon: Wallet },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const adminNavItems: NavItem[] = [
    { name: 'Overview', href: '/admin/overview', icon: BarChart3 },
    { name: 'User Management', href: '/admin/users', icon: Users },
    { name: 'Verifications', href: '/admin/verifications', icon: ShieldCheck },
    { name: 'Payments', href: '/admin/payments', icon: DollarSign },
    { name: 'Financials', href: '/admin/financials', icon: TrendingUp },
    { name: 'Moderation', href: '/admin/moderation', icon: Flag },
    { name: 'Disputes', href: '/admin/disputes', icon: AlertTriangle },
    { name: 'Updates', href: '/admin/updates', icon: Zap },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isAdmin = profile?.role === 'admin';
  const navItems = isAdmin ? adminNavItems : isTradie ? tradieNavItems : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col max-w-[100vw]">
      {/* Native background-location disclosure — no-op on web / for non-tradies. */}
      <SiteGeofenceConsent />
      {/* One-time reassurance when geofencing first goes live for a job. */}
      <GeofenceActiveToast />

      <div
        className={`fixed inset-0 bg-black/30 z-40 lg:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        ref={sidebarRef}
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-navy-900 border-r border-navy-800 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-navy-800 flex-shrink-0">
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-extrabold tracking-tight">
                <span className="text-white">Connec</span><span className="text-warm-500">Tradie</span>
              </span>
            </Link>
            <button
              className="lg:hidden p-2 text-navy-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-2 overflow-y-auto min-h-0">
            <div data-tour="sidebar-nav" className="space-y-0.5">
            {!isTradie && !isAdmin && (
              <Link
                to="/post-lead"
                data-tour="get-quote"
                className="flex items-center justify-center gap-2 px-4 py-2.5 mb-2 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Zap className="w-5 h-5" />
                Post a Job
              </Link>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.state
                ? location.pathname === item.href && (location.state as Record<string, string>)?.tab === item.state.tab
                : item.children
                  ? location.pathname === item.href || location.pathname + location.search === item.href
                  : location.pathname === item.href && !(location.state as Record<string, string>)?.tab;
              const isExpanded = expandedNav === item.name;
              const hasChildren = item.children && item.children.length > 0;

              if (hasChildren) {
                const childActive = item.children!.some(
                  (c) => location.pathname + location.search === c.href || (location.pathname === c.href && !location.search)
                );
                return (
                  <div key={item.name}>
                    <button
                      onClick={() => setExpandedNav(isExpanded ? null : item.name)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors min-h-[40px] ${
                        childActive
                          ? 'bg-warm-500/15 text-warm-400 border-l-[3px] border-warm-500'
                          : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="ml-5 pl-4 border-l border-navy-700 space-y-0.5 mt-0.5">
                        {item.children!.map((child) => {
                          const ChildIcon = child.icon;
                          const isChildActive = location.pathname + location.search === child.href || (location.pathname === child.href && !location.search);
                          return (
                            <Link
                              key={child.name}
                              to={child.href}
                              className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px] ${
                                isChildActive
                                  ? 'bg-warm-500/15 text-warm-400'
                                  : 'text-navy-400 hover:bg-navy-800 hover:text-white'
                              }`}
                              onClick={() => setSidebarOpen(false)}
                            >
                              <ChildIcon className="w-4 h-4" />
                              {child.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  state={item.state}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors min-h-[40px] ${
                    isActive
                      ? 'bg-warm-500/15 text-warm-400 border-l-[3px] border-warm-500'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                  {item.name === 'Dashboard' && pendingReleaseCount > 0 && (
                    <span
                      className={`ml-auto w-2 h-2 rounded-full transition-colors ${isActive ? 'bg-amber-400 animate-pulse' : 'bg-amber-400/70'}`}
                      onClick={(e) => {
                        if (isActive) {
                          e.preventDefault();
                          e.stopPropagation();
                          document.getElementById('attention-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                    />
                  )}
                </Link>
              );
            })}
            </div>
          </nav>

          <div className="px-3 py-2 border-t border-navy-800 flex-shrink-0">
            {isTradie && !isPro(tradieDetails?.subscription_tier, profile?.is_premium) && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className="w-full flex items-center gap-2 px-3 py-2 mb-2 bg-warm-500/10 border border-warm-500/20 text-warm-400 rounded-lg text-sm font-medium hover:bg-warm-500/20 transition-all min-h-[40px]"
              >
                <Crown className="w-4 h-4 text-warm-400" />
                Upgrade to Pro
              </button>
            )}

            {isTradie && isPro(tradieDetails?.subscription_tier, profile?.is_premium) && (
              <div className="flex items-center gap-2 px-3 py-1.5 mb-2 bg-warm-500/10 border border-warm-500/20 rounded-lg">
                <BadgeCheck className="w-4 h-4 text-warm-400" />
                <span className="text-xs font-medium text-warm-300">Pro Member</span>
              </div>
            )}

            <div className="flex items-center gap-2.5 p-2 bg-navy-800 rounded-lg">
              <div className="w-8 h-8 bg-navy-700 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-warm-400">
                  {profile?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{profile?.full_name}</p>
                <p className="text-[11px] text-navy-400 capitalize truncate">
                  {profile?.role}{isTradie && tradieDetails?.trade_category ? ` \u00B7 ${tradieDetails.trade_category}` : ''}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors flex-shrink-0"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64 theme-aware flex-1 flex flex-col">
        <header className="sticky top-0 z-30 bg-navy-900/95 backdrop-blur-sm border-b border-navy-800" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <button
              className="lg:hidden flex items-center gap-1.5 p-2 text-gray-300 hover:text-white hover:bg-navy-800 rounded-lg min-h-[44px]"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
              <span className="text-sm font-medium">Menu</span>
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <HelpButton />
              <div className="relative" ref={notificationRef} data-tour="notifications">
                <button
                  onClick={() => {
                    const wasOpen = notificationsOpen;
                    setNotificationsOpen(!notificationsOpen);
                    // Mark all as read when closing the dropdown
                    if (wasOpen && notifications.some(n => !n.read_at)) {
                      handleMarkAllRead();
                    }
                  }}
                  className="relative p-2.5 text-gray-300 hover:text-white hover:bg-navy-800 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                  aria-label="Open notifications"
                >
                  <Bell className="w-5 h-5" />
                  {(() => {
                    const unreadCount = notifications.filter(n => !n.read_at).length;
                    if (unreadCount === 0) return null;
                    return (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-navy-900">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    );
                  })()}
                </button>

                {notificationsOpen && (
                  <div role="dialog" aria-label="Notifications" className="fixed inset-x-0 top-14 mx-2 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:mx-0 sm:w-96 bg-navy-800 rounded-xl shadow-lg border border-navy-700 z-50 max-h-[80vh] sm:max-h-96 flex flex-col">
                    <div className="p-3 px-4 border-b border-navy-700 flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">Notifications</h3>
                        {(() => {
                          const unread = notifications.filter(n => !n.read_at).length;
                          if (unread === 0) return null;
                          return (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          );
                        })()}
                      </div>
                      {notifications.some(n => !n.read_at) && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-warm-400 hover:text-warm-300 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="overflow-y-auto flex-1">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-10 h-10 text-navy-600 mx-auto mb-2" />
                          <p className="text-sm font-medium text-gray-400">You're all caught up!</p>
                          <p className="text-xs text-gray-500 mt-1">No new notifications</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-navy-700/50">
                          {notifications.map((notification) => {
                            const style = getNotifStyle(notification.type);
                            const NotifIcon = style.icon;
                            const isUnread = !notification.read_at;

                            return (
                              <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`flex items-start gap-3 p-3 px-4 hover:bg-navy-700/50 transition-colors cursor-pointer ${
                                  isUnread ? 'bg-warm-500/5' : ''
                                }`}
                              >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${style.bgClass}`}>
                                  <NotifIcon className={`w-4 h-4 ${style.iconClass}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm leading-tight truncate ${isUnread ? 'font-semibold text-white' : 'font-medium text-gray-300'}`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">
                                    {notification.message}
                                  </p>
                                  <p className="text-[11px] text-gray-500 mt-1">
                                    {relativeTime(notification.created_at)}
                                  </p>
                                </div>
                                {isUnread && (
                                  <div className="w-2 h-2 bg-warm-500 rounded-full flex-shrink-0 mt-2" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <Link
                      to="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                      className="block p-2.5 text-center text-xs font-medium text-warm-400 hover:text-warm-300 hover:bg-navy-700/50 border-t border-navy-700 transition-colors flex-shrink-0"
                    >
                      View all notifications
                    </Link>
                  </div>
                )}
              </div>

              <div className="relative hidden sm:block pl-3 border-l border-navy-700" ref={profileDropdownRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-3 hover:bg-navy-800 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="font-medium text-white">{profile?.full_name}</span>
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-navy-800 rounded-xl shadow-lg border border-navy-700 z-50 py-2">
                    <div className="px-4 py-3 border-b border-navy-700">
                      <p className="font-medium text-white">{profile?.full_name}</p>
                      <p className="text-sm text-gray-400 capitalize">{profile?.role}</p>
                    </div>

                    <div className="py-2">
                      {isTradie ? (
                        <>
                          <Link
                            to="/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <Home className="w-4 h-4" />
                            Dashboard
                          </Link>
                          <Link
                            to="/my-profile"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <UserCircle className="w-4 h-4" />
                            My Profile
                          </Link>
                          <Link
                            to="/work"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <ClipboardList className="w-4 h-4" />
                            Work Hub
                          </Link>
                          <Link
                            to="/schedule"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <CalendarDays className="w-4 h-4" />
                            Schedule
                          </Link>
                          <Link
                            to="/analytics"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <BarChart3 className="w-4 h-4" />
                            My Stats
                          </Link>
                          <Link
                            to="/performance"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <TrendingUp className="w-4 h-4" />
                            Performance
                          </Link>
                          <Link
                            to="/payouts"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <Wallet className="w-4 h-4" />
                            Payouts
                          </Link>
                          <Link
                            to="/messages"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Messages
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link
                            to="/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <Home className="w-4 h-4" />
                            Dashboard
                          </Link>
                          <Link
                            to="/leads"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <Briefcase className="w-4 h-4" />
                            My Jobs
                          </Link>
                          <Link
                            to="/messages"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Messages
                          </Link>
                        </>
                      )}
                      <Link
                        to="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-gray-300 hover:bg-navy-700 hover:text-white transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    </div>

                    <div className="border-t border-navy-700 pt-2">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:bg-red-900/20 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main id="main-content" className="px-4 py-3 sm:p-6 lg:p-8 flex-1 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
          <PlatformUpdateBanner />
          <PageHelpCard />
          {children}
        </main>

        {/* Mobile bottom navigation bar — hidden when sidebar is open */}
        {!isAdmin && !sidebarOpen && (
          <nav className={`fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-navy-900 border-t border-navy-800 pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ${bottomNavHidden ? 'translate-y-full' : 'translate-y-0'}`}>
            <div className="grid grid-cols-5 h-16">
              {isTradie ? (
                <>
                  <Link
                    to="/dashboard"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/dashboard' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <Home className="w-5 h-5" />
                    <span className="text-[10px]">Dashboard</span>
                  </Link>
                  <Link
                    to="/work"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/work' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <Briefcase className="w-5 h-5" />
                    <span className="text-[10px]">Work Hub</span>
                  </Link>
                  <Link
                    to="/schedule"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/schedule' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <CalendarDays className="w-5 h-5" />
                    <span className="text-[10px]">Schedule</span>
                  </Link>
                  <Link
                    to="/messages"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/messages' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-[10px]">Messages</span>
                  </Link>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 text-gray-400"
                  >
                    <Menu className="w-5 h-5" />
                    <span className="text-[10px]">More</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/dashboard"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/dashboard' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <Home className="w-5 h-5" />
                    <span className="text-[10px]">Dashboard</span>
                  </Link>
                  <Link
                    to="/leads"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/leads' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <Briefcase className="w-5 h-5" />
                    <span className="text-[10px]">My Jobs</span>
                  </Link>
                  <Link
                    to="/post-lead"
                    className="flex flex-col items-center justify-center gap-1"
                  >
                    <div className="bg-[#1D9E75] text-white rounded-full w-14 h-14 flex items-center justify-center -mt-6 shadow-xl ring-4 ring-navy-900">
                      <Plus className="w-7 h-7" strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-semibold text-[#1D9E75] -mt-1">Post Job</span>
                  </Link>
                  <Link
                    to="/messages"
                    className={`flex flex-col items-center justify-center gap-1 ${
                      location.pathname === '/messages' ? 'text-[#1D9E75]' : 'text-gray-400'
                    }`}
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span className="text-[10px]">Messages</span>
                  </Link>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 text-gray-400"
                  >
                    <Menu className="w-5 h-5" />
                    <span className="text-[10px]">More</span>
                  </button>
                </>
              )}
            </div>
          </nav>
        )}
      </div>

      {/* Toast notification banner — positioned below header, right side */}
      {toastNotification && (
        <div className="fixed top-16 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)]"
          style={{ animation: 'slideDown 0.3s ease-out' }}
        >
          <div
            className="flex items-start gap-3 px-4 py-3.5 bg-navy-800 border border-navy-600 rounded-lg shadow-lg cursor-pointer hover:bg-navy-750 transition-colors"
            onClick={() => {
              handleNotificationClick(toastNotification);
              setToastNotification(null);
            }}
          >
            {(() => {
              const ts = getNotifStyle(toastNotification.type);
              const ToastIcon = ts.icon;
              return (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${ts.bgClass}`}>
                  <ToastIcon className={`w-4 h-4 ${ts.iconClass}`} />
                </div>
              );
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white leading-tight">{toastNotification.title}</p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{toastNotification.message}</p>
              <p className="text-[10px] text-warm-400 font-medium mt-1">Click to view</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToastNotification(null); }}
              className="p-0.5 text-gray-500 hover:text-gray-300 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </div>
  );
}
