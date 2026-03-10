import { useState, useEffect, useRef, type ReactNode } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { markNotificationRead, markAllNotificationsRead } from '../lib/notificationService';
import type { LucideIcon } from 'lucide-react';
import type { Notification } from '../types/database';
import SubscriptionModal from './SubscriptionModal';

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
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, tradieDetails, signOut } = useAuth();

  const isTradie = profile?.role === 'tradie';

  // Auto-expand nav group when navigating to a child route
  useEffect(() => {
    if (location.pathname === '/work') {
      setExpandedNav('Work Hub');
    } else if (location.pathname === '/analytics' || location.pathname === '/performance') {
      setExpandedNav('Insights');
    }
  }, [location.pathname]);

  useEffect(() => {
    if (user) {
      fetchNotifications();

      // Subscribe to new notifications in real-time
      const channel = supabase
        .channel('notifications')
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return;

    setNotifications((data || []) as Notification[]);
  };

  const markAsRead = async (notificationId: string) => {
    const success = await markNotificationRead(notificationId);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(notifications.map(n =>
        n.id === notificationId ? { ...n, read: true, read_at: now } : n
      ));
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    const success = await markAllNotificationsRead(user.id);
    if (success) {
      const now = new Date().toISOString();
      setNotifications(notifications.map(n => ({ ...n, read: true, read_at: now })));
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    await markAsRead(notification.id);
    const jobId = notification.job_id || notification.metadata?.job_id;

    if (notification.type === 'QUOTE_RECEIVED' || notification.type === 'quote_received') {
      // Client clicks quote notification → go to My Jobs with that job expanded
      navigate(jobId ? `/leads?job=${jobId}` : '/leads');
      setNotificationsOpen(false);
    } else if (notification.type === 'booking_request') {
      if (jobId) {
        navigate(isTradie ? `/work?job=${jobId}` : `/leads?job=${jobId}`);
        setNotificationsOpen(false);
      } else if (notification.metadata?.conversation_id) {
        navigate(`/messages?conversation=${notification.metadata.conversation_id}`);
        setNotificationsOpen(false);
      }
    } else if (notification.type === 'job_update') {
      if (isTradie) {
        navigate(jobId ? `/work?job=${jobId}` : '/work');
      } else {
        navigate(jobId ? `/leads?job=${jobId}` : '/leads');
      }
      setNotificationsOpen(false);
    } else if (notification.type === 'project_update') {
      navigate('/projects');
      setNotificationsOpen(false);
    } else if (notification.type === 'vacancy_application') {
      navigate('/work');
      setNotificationsOpen(false);
    } else {
      // Fallback: if there's a job_id, navigate to the relevant page
      if (jobId) {
        navigate(isTradie ? `/work?job=${jobId}` : `/leads?job=${jobId}`);
        setNotificationsOpen(false);
      }
    }
  };

  const clientNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Jobs', href: '/leads', icon: Briefcase },
    { name: 'Saved Tradies', href: '/my-trades', icon: Wrench },
    { name: 'Projects', href: '/projects', icon: Package },
    { name: 'Invoices & Payments', href: '/payments', icon: DollarSign },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const tradieNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Profile', href: '/my-profile', icon: UserCircle },
    { name: 'Work Hub', href: '/work', icon: ClipboardList, children: [
      { name: 'Leads', href: '/work', icon: ClipboardList },
      { name: 'My Jobs', href: '/work?tab=active', icon: Briefcase },
      { name: 'Hiring', href: '/work?tab=recruitment', icon: Users },
    ] },
    { name: 'Schedule', href: '/schedule', icon: CalendarDays },
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
    { name: 'Moderation', href: '/admin/moderation', icon: Flag },
    { name: 'Disputes', href: '/admin/disputes', icon: AlertTriangle },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isAdmin = profile?.role === 'admin';
  const navItems = isAdmin ? adminNavItems : isTradie ? tradieNavItems : clientNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      <div
        className={`fixed inset-0 bg-black/30 z-40 lg:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-navy-900 border-r border-navy-800 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-navy-800">
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

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto" data-tour="sidebar-nav">
            {!isTradie && !isAdmin && (
              <Link
                to="/post-lead"
                data-tour="get-quote"
                className="flex items-center justify-center gap-2 px-4 py-3 mb-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
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
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
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
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
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
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-warm-500/15 text-warm-400 border-l-[3px] border-warm-500'
                      : 'text-navy-300 hover:bg-navy-800 hover:text-white'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-navy-800">
            {isTradie && tradieDetails?.subscription_tier !== 'pro' && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3 mb-3 bg-warm-500/10 border border-warm-500/20 text-warm-400 rounded-lg font-medium hover:bg-warm-500/20 transition-all"
              >
                <Crown className="w-5 h-5 text-warm-400" />
                Upgrade to Pro
              </button>
            )}

            {isTradie && tradieDetails?.subscription_tier === 'pro' && (
              <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-warm-500/10 border border-warm-500/20 rounded-lg">
                <BadgeCheck className="w-5 h-5 text-warm-400" />
                <span className="text-sm font-medium text-warm-300">Pro Member</span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4 p-3 bg-navy-800 rounded-lg">
              <div className="w-10 h-10 bg-navy-700 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-warm-400">
                  {profile?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{profile?.full_name}</p>
                <p className="text-xs text-navy-400 capitalize">
                  {profile?.role}{isTradie && tradieDetails?.trade_category ? ` \u00B7 ${tradieDetails.trade_category}` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-navy-400 hover:bg-red-500/10 hover:text-red-400 rounded-lg font-medium transition-colors min-h-[44px]"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64 theme-aware flex-1 flex flex-col">
        <header className="sticky top-0 z-30 bg-navy-900/95 backdrop-blur-sm border-b border-navy-800">
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
              <div className="relative" ref={notificationRef} data-tour="notifications">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
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
                  <div className="fixed inset-x-0 top-14 mx-2 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:mx-0 sm:w-96 bg-navy-800 rounded-xl shadow-lg border border-navy-700 z-50 max-h-[80vh] sm:max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-navy-700 flex items-center justify-between">
                      <h3 className="font-semibold text-white">Notifications</h3>
                      {notifications.some(n => !n.read_at) && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-warm-400 hover:text-warm-300 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="w-12 h-12 text-navy-600 mx-auto mb-3" />
                        <p className="text-gray-400">No new notifications</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-navy-700">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-4 hover:bg-navy-700 transition-colors cursor-pointer ${
                              !notification.read_at ? 'bg-warm-500/5' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                notification.read_at ? 'bg-navy-600' : 'bg-warm-500'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-white text-sm">
                                  {notification.title}
                                </h4>
                                <p className="text-sm text-gray-300 mt-1">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                  {new Date(notification.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

        <main id="main-content" className="p-4 sm:p-6 lg:p-8 flex-1">
          {children}
        </main>
      </div>

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </div>
  );
}
