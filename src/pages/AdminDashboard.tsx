import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Briefcase,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
  Settings,
  BarChart3,
  UserCheck,
  Flag,
  Activity,
  Save,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import DashboardLayout from '../components/DashboardLayout';

type Tab = 'overview' | 'users' | 'verifications' | 'disputes' | 'settings';

interface KPIStats {
  totalUsers: number;
  activeTradies: number;
  activeClients: number;
  pendingVerifications: number;
  totalJobs: number;
  totalRevenue: number;
  openReports: number;
  activeSubscriptions: number;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  verification_status: string;
  is_premium: boolean;
  created_at: string;
}

interface VerificationRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  verification_status: string;
  created_at: string;
}

interface AbuseReportRow {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  report_type: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
  reporter: { full_name: string } | null;
  reported: { full_name: string } | null;
}

interface RecentEvent {
  id: string;
  type: 'user' | 'job' | 'payment';
  description: string;
  timestamp: string;
}

interface AppSetting {
  key: string;
  value: unknown;
}

const USERS_PAGE_SIZE = 15;

export default function AdminDashboard() {
  const { toast, showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<KPIStats | null>(null);

  // Overview state
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);

  // Users state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [usersLoading, setUsersLoading] = useState(false);

  // Verifications state
  const [verifications, setVerifications] = useState<VerificationRow[]>([]);
  const [verifLoading, setVerifLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  // Disputes state
  const [disputes, setDisputes] = useState<AbuseReportRow[]>([]);
  const [disputesLoading, setDisputesLoading] = useState(false);
  const [resolveNotes, setResolveNotes] = useState<Record<string, string>>({});

  // Settings state
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [platformFee, setPlatformFee] = useState('');
  const [processingFee, setProcessingFee] = useState('');

  useEffect(() => {
    fetchKPIs();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') fetchRecentEvents();
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'verifications') fetchVerifications();
    if (activeTab === 'disputes') fetchDisputes();
    if (activeTab === 'settings') fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchKPIs = async () => {
    setLoading(true);
    const [profilesRes, jobsRes, paymentsRes, reportsRes, subsRes, pendingVerifRes] = await Promise.all([
      supabase.from('profiles').select('role'),
      supabase.from('jobs').select('id'),
      supabase.from('payments').select('amount, status').eq('status', 'completed'),
      supabase.from('abuse_reports').select('id').eq('status', 'pending'),
      supabase.from('stripe_subscriptions').select('id').eq('status', 'active'),
      supabase.from('profiles').select('id').eq('verification_status', 'pending'),
    ]);

    const profiles = profilesRes.data || [];
    setStats({
      totalUsers: profiles.length,
      activeTradies: profiles.filter(p => p.role === 'tradie').length,
      activeClients: profiles.filter(p => p.role === 'client').length,
      pendingVerifications: pendingVerifRes.data?.length || 0,
      totalJobs: jobsRes.data?.length || 0,
      totalRevenue: (paymentsRes.data || []).reduce((s, p) => s + (p.amount || 0), 0),
      openReports: reportsRes.data?.length || 0,
      activeSubscriptions: subsRes.data?.length || 0,
    });
    setLoading(false);
  };

  const fetchRecentEvents = async () => {
    const [usersRes, jobsRes, paymentsRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('jobs').select('id, description, created_at').order('created_at', { ascending: false }).limit(5),
      supabase.from('payments').select('id, amount, payment_type, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

    const events: RecentEvent[] = [
      ...(usersRes.data || []).map(u => ({ id: `u-${u.id}`, type: 'user' as const, description: `${u.full_name || 'Unknown'} registered as ${u.role}`, timestamp: u.created_at })),
      ...(jobsRes.data || []).map(j => ({ id: `j-${j.id}`, type: 'job' as const, description: `New job: ${j.description?.slice(0, 50) || 'Untitled'}`, timestamp: j.created_at })),
      ...(paymentsRes.data || []).map(p => ({ id: `p-${p.id}`, type: 'payment' as const, description: `Payment: ${(p.amount / 100).toFixed(2)} AUD (${p.payment_type})`, timestamp: p.created_at })),
    ];
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentEvents(events.slice(0, 10));
  };

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    let query = supabase
      .from('profiles')
      .select('id, email, full_name, role, verification_status, is_premium, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(usersPage * USERS_PAGE_SIZE, (usersPage + 1) * USERS_PAGE_SIZE - 1);

    if (userRoleFilter !== 'all') query = query.eq('role', userRoleFilter);
    if (userSearch) query = query.or(`full_name.ilike.%${userSearch}%,email.ilike.%${userSearch}%`);

    const { data, count } = await query;
    setUsers((data as UserRow[]) || []);
    setUsersTotal(count || 0);
    setUsersLoading(false);
  }, [usersPage, userRoleFilter, userSearch]);

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
  }, [activeTab, fetchUsers]);

  const fetchVerifications = async () => {
    setVerifLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, verification_status, created_at')
      .eq('verification_status', 'pending')
      .order('created_at', { ascending: true });
    setVerifications((data as VerificationRow[]) || []);
    setVerifLoading(false);
  };

  const handleVerify = async (id: string, approve: boolean) => {
    const status = approve ? 'verified' : 'rejected';
    const { error } = await supabase.from('profiles').update({ verification_status: status }).eq('id', id);
    if (error) {
      showToast(`Failed to ${approve ? 'approve' : 'reject'} user`, true);
    } else {
      showToast(`User ${approve ? 'approved' : 'rejected'} successfully`);
      setVerifications(prev => prev.filter(v => v.id !== id));
      fetchKPIs();
    }
  };

  const fetchDisputes = async () => {
    setDisputesLoading(true);
    const { data } = await supabase
      .from('abuse_reports')
      .select('*, reporter:profiles!abuse_reports_reporter_id_fkey(full_name), reported:profiles!abuse_reports_reported_user_id_fkey(full_name)')
      .in('status', ['pending', 'investigating'])
      .order('created_at', { ascending: false });
    setDisputes((data as unknown as AbuseReportRow[]) || []);
    setDisputesLoading(false);
  };

  const handleResolveDispute = async (id: string, dismiss: boolean) => {
    const notes = resolveNotes[id] || (dismiss ? 'Dismissed by admin' : 'Resolved by admin');
    const { error } = await supabase
      .from('abuse_reports')
      .update({ status: dismiss ? 'dismissed' : 'resolved', resolution_notes: notes })
      .eq('id', id);
    if (error) {
      showToast('Failed to update dispute', true);
    } else {
      showToast(dismiss ? 'Dispute dismissed' : 'Dispute resolved');
      setDisputes(prev => prev.filter(d => d.id !== id));
      fetchKPIs();
    }
  };

  const fetchSettings = async () => {
    setSettingsLoading(true);
    const { data } = await supabase.from('app_settings').select('key, value');
    const map: Record<string, unknown> = {};
    (data || []).forEach((s: AppSetting) => { map[s.key] = s.value; });
    setSettings(map);
    setPlatformFee(String(map.platform_fee_rate || '10'));
    setProcessingFee(String(map.processing_fee_rate || '2.9'));
    setSettingsLoading(false);
  };

  const toggleSetting = async (key: string) => {
    const current = Boolean(settings[key]);
    const { error } = await supabase.from('app_settings').upsert({ key, value: !current });
    if (error) {
      showToast(`Failed to update ${key}`, true);
    } else {
      setSettings(prev => ({ ...prev, [key]: !current }));
      showToast(`${key.replace(/_/g, ' ')} ${!current ? 'enabled' : 'disabled'}`);
    }
  };

  const saveFeeSetting = async () => {
    const updates = [
      supabase.from('app_settings').upsert({ key: 'platform_fee_rate', value: parseFloat(platformFee) }),
      supabase.from('app_settings').upsert({ key: 'processing_fee_rate', value: parseFloat(processingFee) }),
    ];
    const results = await Promise.all(updates);
    if (results.some(r => r.error)) {
      showToast('Failed to save fee settings', true);
    } else {
      showToast('Fee settings saved');
    }
  };

  const handleSetRole = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) {
      showToast('Failed to update role', true);
    } else {
      showToast('Role updated');
      fetchUsers();
    }
  };

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const severityColor: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  };

  const usersTotalPages = Math.ceil(usersTotal / USERS_PAGE_SIZE);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users', label: 'Users' },
    { key: 'verifications', label: 'Verifications' },
    { key: 'disputes', label: 'Disputes' },
    { key: 'settings', label: 'Settings' },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Platform management and monitoring</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard icon={Users} label="Total Users" value={String(stats?.totalUsers || 0)} color="blue" />
          <KPICard icon={UserCheck} label="Active Tradies" value={String(stats?.activeTradies || 0)} color="indigo" />
          <KPICard icon={Users} label="Active Clients" value={String(stats?.activeClients || 0)} color="green" />
          <KPICard icon={ShieldCheck} label="Pending Verif." value={String(stats?.pendingVerifications || 0)} color="amber" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard icon={Briefcase} label="Total Jobs" value={String(stats?.totalJobs || 0)} color="blue" />
          <KPICard icon={DollarSign} label="Total Revenue" value={formatCurrency(stats?.totalRevenue || 0)} color="green" />
          <KPICard icon={AlertTriangle} label="Open Reports" value={String(stats?.openReports || 0)} color="red" />
          <KPICard icon={CreditCard} label="Active Subs" value={String(stats?.activeSubscriptions || 0)} color="purple" />
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <Link to="/admin/verifications" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
            <ShieldCheck className="w-4 h-4" /> Verify Users
          </Link>
          <Link to="/admin/moderation" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Flag className="w-4 h-4" /> Manage Disputes
          </Link>
          <button onClick={() => setActiveTab('settings')} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <Settings className="w-4 h-4" /> Platform Settings
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.key === 'verifications' && (stats?.pendingVerifications || 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">{stats?.pendingVerifications}</span>
              )}
              {tab.key === 'disputes' && (stats?.openReports || 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">{stats?.openReports}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}

        {/* === OVERVIEW TAB === */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <HealthBar label="Registration trend" value={stats?.totalUsers || 0} max={500} color="blue" />
              <HealthBar label="Job posting trend" value={stats?.totalJobs || 0} max={200} color="indigo" />
              <HealthBar label="Conversion rate" value={stats?.totalJobs ? Math.round(((stats?.totalJobs || 0) / Math.max(stats?.totalUsers || 1, 1)) * 100) : 0} max={100} color="green" suffix="%" />
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 p-5 border-b border-gray-100">
                <Activity className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Recent Activity</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {recentEvents.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No recent activity</div>
                ) : (
                  recentEvents.map(event => (
                    <div key={event.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          event.type === 'user' ? 'bg-blue-500' : event.type === 'job' ? 'bg-indigo-500' : 'bg-green-500'
                        }`} />
                        <span className="text-sm text-gray-700 truncate">{event.description}</span>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-3">{formatTimeAgo(event.timestamp)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* === USERS TAB === */}
        {activeTab === 'users' && (
          <div>
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); setUsersPage(0); }}
                  placeholder="Search users..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                value={userRoleFilter}
                onChange={e => { setUserRoleFilter(e.target.value); setUsersPage(0); }}
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="client">Client</option>
                <option value="tradie">Tradie</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              {usersLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500">
                          <th className="px-6 py-3 font-medium">Name</th>
                          <th className="px-6 py-3 font-medium">Email</th>
                          <th className="px-6 py-3 font-medium">Role</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                          <th className="px-6 py-3 font-medium">Created</th>
                          <th className="px-6 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-gray-900 font-medium">{u.full_name || 'Unknown'}</td>
                            <td className="px-6 py-4 text-gray-600">{u.email}</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">{u.role}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                u.verification_status === 'verified' ? 'bg-green-100 text-green-700' :
                                u.verification_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{u.verification_status || 'unverified'}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(u.created_at)}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link to={`/profile/${u.id}`} className="p-1 rounded hover:bg-gray-100" title="View profile">
                                  <Eye className="w-4 h-4 text-gray-500" />
                                </Link>
                                {u.verification_status === 'pending' && (
                                  <button onClick={() => handleVerify(u.id, true)} className="p-1 rounded hover:bg-green-50" title="Verify">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  </button>
                                )}
                                <select
                                  value={u.role}
                                  onChange={e => handleSetRole(u.id, e.target.value)}
                                  className="text-xs border border-gray-200 rounded px-1 py-0.5"
                                >
                                  <option value="client">client</option>
                                  <option value="tradie">tradie</option>
                                  <option value="admin">admin</option>
                                </select>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {usersTotalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                      <p className="text-sm text-gray-500">
                        Showing {usersPage * USERS_PAGE_SIZE + 1}-{Math.min((usersPage + 1) * USERS_PAGE_SIZE, usersTotal)} of {usersTotal}
                      </p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setUsersPage(p => Math.max(0, p - 1))} disabled={usersPage === 0} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-600">Page {usersPage + 1} of {usersTotalPages}</span>
                        <button onClick={() => setUsersPage(p => Math.min(usersTotalPages - 1, p + 1))} disabled={usersPage >= usersTotalPages - 1} className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* === VERIFICATIONS TAB === */}
        {activeTab === 'verifications' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Pending Verifications</h2>
              {verifications.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">{verifications.length}</span>
              )}
            </div>

            {verifLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : verifications.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">All caught up</h3>
                <p className="text-gray-500 text-sm">No pending verification requests.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {verifications.map(v => (
                  <div key={v.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{v.full_name || 'Unknown'}</h3>
                        <p className="text-sm text-gray-500">{v.email} &middot; {v.role} &middot; Submitted {formatDate(v.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleVerify(v.id, true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleVerify(v.id, false)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <input
                        type="text"
                        value={rejectionReason[v.id] || ''}
                        onChange={e => setRejectionReason(prev => ({ ...prev, [v.id]: e.target.value }))}
                        placeholder="Rejection reason (optional)..."
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === DISPUTES TAB === */}
        {activeTab === 'disputes' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Open Abuse Reports</h2>

            {disputesLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : disputes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Flag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No open reports</h3>
                <p className="text-gray-500 text-sm">All abuse reports have been resolved.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {disputes.map(d => (
                  <div key={d.id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColor[d.severity] || severityColor.low}`}>
                            {d.severity}
                          </span>
                          <span className="text-xs text-gray-400">{d.report_type}</span>
                        </div>
                        <p className="text-sm text-gray-900 mb-1">{d.description}</p>
                        <p className="text-xs text-gray-500">
                          Reporter: <span className="font-medium">{d.reporter?.full_name || d.reporter_id.slice(0, 8)}</span>
                          {' '}&rarr;{' '}
                          Reported: <span className="font-medium">{d.reported?.full_name || d.reported_user_id.slice(0, 8)}</span>
                          {' '}&middot;{' '}{formatDate(d.created_at)}
                        </p>
                        <input
                          type="text"
                          value={resolveNotes[d.id] || ''}
                          onChange={e => setResolveNotes(prev => ({ ...prev, [d.id]: e.target.value }))}
                          placeholder="Resolution notes..."
                          className="mt-3 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleResolveDispute(d.id, false)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Resolve
                        </button>
                        <button
                          onClick={() => handleResolveDispute(d.id, true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors"
                        >
                          <XCircle className="w-4 h-4" /> Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === SETTINGS TAB === */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Platform Settings</h2>

            {settingsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>
            ) : (
              <div className="space-y-6">
                {/* Toggle switches */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
                  <h3 className="font-semibold text-gray-900">Feature Toggles</h3>
                  {[
                    { key: 'training_mode_enabled', label: 'Training Mode', desc: 'Enable demo/training mode across the platform' },
                    { key: 'maintenance_mode_enabled', label: 'Maintenance Mode', desc: 'Put the platform into maintenance mode' },
                    { key: 'registration_open', label: 'Registration Open', desc: 'Allow new user registrations' },
                  ].map(toggle => (
                    <div key={toggle.key} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{toggle.label}</p>
                        <p className="text-xs text-gray-500">{toggle.desc}</p>
                      </div>
                      <button
                        onClick={() => toggleSetting(toggle.key)}
                        className="flex-shrink-0"
                        aria-label={`Toggle ${toggle.label}`}
                      >
                        {Boolean(settings[toggle.key]) ? (
                          <ToggleRight className="w-10 h-10 text-blue-600" />
                        ) : (
                          <ToggleLeft className="w-10 h-10 text-gray-300" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Fee configuration */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Fee Configuration</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Platform Fee Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={platformFee}
                        onChange={e => setPlatformFee(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Processing Fee Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={processingFee}
                        onChange={e => setProcessingFee(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={saveFeeSetting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <Save className="w-4 h-4" /> Save Fee Settings
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Toast */}
        {toast.show && (
          <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.isError ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
          }`}>
            {toast.message}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// --- Helper components ---

function KPICard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: string }) {
  const bgMap: Record<string, string> = { blue: 'bg-blue-50', indigo: 'bg-indigo-50', green: 'bg-green-50', amber: 'bg-amber-50', red: 'bg-red-50', purple: 'bg-purple-50' };
  const iconMap: Record<string, string> = { blue: 'text-blue-600', indigo: 'text-indigo-600', green: 'text-green-600', amber: 'text-amber-600', red: 'text-red-600', purple: 'text-purple-600' };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 ${bgMap[color] || bgMap.blue} rounded-xl`}>
          <Icon className={`w-5 h-5 ${iconMap[color] || iconMap.blue}`} />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function HealthBar({ label, value, max, color, suffix = '' }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const colorMap: Record<string, string> = { blue: 'bg-blue-500', indigo: 'bg-indigo-500', green: 'bg-green-500' };
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-sm font-medium text-gray-500 mb-2">{label}</p>
      <p className="text-xl font-bold text-gray-900 mb-3">{value}{suffix}</p>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] || colorMap.blue} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
