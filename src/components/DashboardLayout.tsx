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
  Wallet,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { markNotificationRead, markAllNotificationsRead } from '../lib/notificationService';
import type { LucideIcon } from 'lucide-react';
import type { Notification } from '../types/database';
import SubscriptionModal from './SubscriptionModal';

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  state?: Record<string, unknown>;
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
  const notificationRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, tradieDetails, signOut } = useAuth();

  const isTradie = profile?.role === 'tradie';

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

    setNotifications(data || []);
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

    if (notification.type === 'booking_request') {
      if (notification.metadata?.job_id) {
        // New job notification - navigate to jobs page (for tradies)
        navigate('/jobs');
        setNotificationsOpen(false);
      } else if (notification.metadata?.conversation_id) {
        // Message-based booking request - navigate to messages
        navigate(`/messages?conversation=${notification.metadata.conversation_id}`);
        setNotificationsOpen(false);
      }
    } else if (notification.type === 'job_update') {
      // Job variation or other job update - navigate to jobs page
      if (isTradie) {
        navigate('/jobs');
      } else {
        navigate('/leads');
      }
      setNotificationsOpen(false);
    } else if (notification.type === 'project_update') {
      navigate('/jobs');
      setNotificationsOpen(false);
    } else if (notification.type === 'vacancy_application') {
      navigate('/trade-careers');
      setNotificationsOpen(false);
    }
  };

  const clientNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Jobs', href: '/leads', icon: Briefcase },
    { name: 'Projects', href: '/projects', icon: Package },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const tradieNavItems: NavItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'My Profile', href: '/my-profile', icon: UserCircle },
    { name: 'Team Management & Scheduling', href: '/schedule', icon: CalendarDays },
    { name: 'Leads, Jobs & Recruitment', href: '/work', icon: ClipboardList },
    { name: 'Performance Insights', href: '/performance', icon: TrendingUp },
    { name: 'Payouts', href: '/payouts', icon: Wallet },
    { name: 'Messages', href: '/messages', icon: MessageCircle },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const adminNavItems: NavItem[] = [
    { name: 'Overview', href: '/admin/overview', icon: BarChart3 },
    { name: 'User Management', href: '/admin/users', icon: Users },
    { name: 'Verifications', href: '/admin/verifications', icon: ShieldCheck },
    { name: 'Payments', href: '/admin/payments', icon: DollarSign },
    { name: 'Moderation', href: '/admin/moderation', icon: Flag },
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
    <div className="min-h-screen bg-gray-50">
      <div
        className={`fixed inset-0 bg-black/30 z-40 lg:hidden transition-opacity ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">
                Connec<span className="text-blue-600">Tradie</span>
              </span>
            </Link>
            <button
              className="lg:hidden p-2 text-gray-400 hover:text-gray-600"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {!isTradie && !isAdmin && (
              <Link
                to="/post-lead"
                className="flex items-center justify-center gap-2 px-4 py-3 mb-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                <Zap className="w-5 h-5" />
                Get a Quote
              </Link>
            )}
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.state
                ? location.pathname === item.href && (location.state as Record<string, string>)?.tab === item.state.tab
                : location.pathname === item.href && !(location.state as Record<string, string>)?.tab;

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  state={item.state}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100">
            {isTradie && tradieDetails?.subscription_tier !== 'pro' && (
              <button
                onClick={() => setShowSubscriptionModal(true)}
                className="w-full flex items-center gap-3 px-4 py-3 mb-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-800 rounded-xl font-medium hover:from-amber-100 hover:to-orange-100 transition-all"
              >
                <Crown className="w-5 h-5 text-amber-600" />
                Upgrade to Pro
              </button>
            )}

            {isTradie && tradieDetails?.subscription_tier === 'pro' && (
              <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-green-50 border border-green-200 rounded-xl">
                <BadgeCheck className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">Pro Member</span>
              </div>
            )}

            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-primary-600">
                  {profile?.full_name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{profile?.full_name}</p>
                <p className="text-xs text-gray-600 capitalize">
                  {profile?.role}{isTradie && tradieDetails?.trade_category ? ` \u00B7 ${tradieDetails.trade_category}` : ''}
                </p>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-xl font-medium transition-colors min-h-[44px]"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              className="lg:hidden flex items-center gap-1.5 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg min-h-[44px]"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
              <span className="text-sm font-medium">Menu</span>
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="relative p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <Bell className="w-5 h-5" />
                  {(() => {
                    const unreadCount = notifications.filter(n => !n.read_at).length;
                    if (unreadCount === 0) return null;
                    return (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 ring-2 ring-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    );
                  })()}
                </button>

                {notificationsOpen && (
                  <div className="fixed inset-x-0 top-14 mx-2 sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:mx-0 sm:w-96 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-[80vh] sm:max-h-96 overflow-y-auto">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                      {notifications.some(n => !n.read_at) && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {notifications.length === 0 ? (
                      <div className="p-8 text-center">
                        <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No new notifications</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                              !notification.read_at ? 'bg-blue-50/60' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                notification.read_at ? 'bg-gray-300' : 'bg-blue-600'
                              }`} />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-gray-900 text-sm">
                                  {notification.title}
                                </h4>
                                <p className="text-sm text-gray-700 mt-1">
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

              <div className="relative hidden sm:block pl-3 border-l border-gray-200" ref={profileDropdownRef}>
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
                >
                  <span className="font-medium text-gray-900">{profile?.full_name}</span>
                </button>

                {profileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 z-50 py-2">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="font-medium text-gray-900">{profile?.full_name}</p>
                      <p className="text-sm text-gray-500 capitalize">{profile?.role}</p>
                    </div>

                    <div className="py-2">
                      {isTradie ? (
                        <>
                          <Link
                            to="/dashboard"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Home className="w-4 h-4" />
                            Dashboard
                          </Link>
                          <Link
                            to="/my-profile"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <UserCircle className="w-4 h-4" />
                            My Profile
                          </Link>
                          <Link
                            to="/schedule"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <CalendarDays className="w-4 h-4" />
                            Team Management & Scheduling
                          </Link>
                          <Link
                            to="/work"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <ClipboardList className="w-4 h-4" />
                            Leads, Jobs & Recruitment
                          </Link>
                          <Link
                            to="/performance"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <TrendingUp className="w-4 h-4" />
                            Performance Insights
                          </Link>
                          <Link
                            to="/payouts"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Wallet className="w-4 h-4" />
                            Payouts
                          </Link>
                          <Link
                            to="/messages"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
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
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Home className="w-4 h-4" />
                            Dashboard
                          </Link>
                          <Link
                            to="/leads"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <Briefcase className="w-4 h-4" />
                            My Jobs
                          </Link>
                          <Link
                            to="/messages"
                            onClick={() => setProfileDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            Messages
                          </Link>
                        </>
                      )}
                      <Link
                        to="/settings"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </Link>
                    </div>

                    <div className="border-t border-gray-100 pt-2">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
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

        <main className="p-4 sm:p-6 lg:p-8">
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
