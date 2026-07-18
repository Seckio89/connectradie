import { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  Briefcase,
  DollarSign,
  CreditCard,
  ShieldCheck,
  Loader2,
  ArrowRight,
  UserPlus,
  FileText,
  Receipt,
  Lightbulb,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import AdminRecommendations from '../components/AdminRecommendations';

interface Stats {
  totalUsers: number;
  clientCount: number;
  tradieCount: number;
  adminCount: number;
  totalJobs: number;
  pendingJobs: number;
  activeJobs: number;
  completedJobs: number;
  totalRevenue: number;
  activeSubscriptions: number;
  pendingVerifications: number;
}

interface RecentSignup {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

interface RecentJob {
  id: string;
  description: string;
  status: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface RecentPayment {
  id: string;
  amount: number;
  payment_type: string;
  status: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    try {
      const [
        profilesRes,
        jobsRes,
        paymentsRes,
        subscriptionsRes,
        pendingVerifRes,
        recentSignupsRes,
        recentJobsRes,
        recentPaymentsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('role'),
        supabase.from('jobs').select('status'),
        supabase.from('payments').select('amount, status').eq('status', 'completed'),
        supabase.from('stripe_subscriptions').select('id').eq('status', 'active'),
        supabase.from('profiles').select('id').eq('verification_status', 'pending'),
        supabase
          .from('profiles')
          .select('id, full_name, role, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('jobs')
          .select('id, description, status, created_at, profiles:profiles!jobs_client_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('payments')
          .select('id, amount, payment_type, status, created_at, profiles:profiles!payments_profile_id_fkey(full_name)')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const profiles = profilesRes.data || [];
      const jobs = jobsRes.data || [];
      const completedPayments = paymentsRes.data || [];

      setStats({
        totalUsers: profiles.length,
        clientCount: profiles.filter(p => p.role === 'client').length,
        tradieCount: profiles.filter(p => p.role === 'tradie').length,
        adminCount: profiles.filter(p => p.role === 'admin').length,
        totalJobs: jobs.length,
        pendingJobs: jobs.filter(j => j.status === 'pending').length,
        activeJobs: jobs.filter(j => ['accepted', 'in_progress', 'funded'].includes(j.status)).length,
        completedJobs: jobs.filter(j => j.status === 'completed').length,
        totalRevenue: completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
        activeSubscriptions: subscriptionsRes.data?.length || 0,
        pendingVerifications: pendingVerifRes.data?.length || 0,
      });

      setRecentSignups((recentSignupsRes.data as RecentSignup[]) || []);
      setRecentJobs((recentJobsRes.data as unknown as RecentJob[]) || []);
      setRecentPayments((recentPaymentsRes.data as unknown as RecentPayment[]) || []);
    } catch (err) {
      console.error('Failed to fetch admin overview data:', err);
    }

    setLoading(false);
  };

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-warm-100 text-warm-700',
      accepted: 'bg-secondary-100 text-secondary-700',
      in_progress: 'bg-warm-100 text-warm-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-100 text-gray-600',
      declined: 'bg-red-100 text-red-700',
      funded: 'bg-warm-100 text-warm-700',
      failed: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <SectionErrorBoundary>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
        </SectionErrorBoundary>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SectionErrorBoundary>
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Platform Overview</h1>
          <p className="text-gray-600 mt-1">Key metrics and recent activity across the platform</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-secondary-50 rounded-xl">
                <Users className="w-5 h-5 text-secondary-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Users</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.totalUsers}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.clientCount} clients, {stats?.tradieCount} tradies, {stats?.adminCount} admins
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-primary-50 rounded-xl">
                <Briefcase className="w-5 h-5 text-primary-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Jobs</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.totalJobs}</p>
            <p className="text-xs text-gray-500 mt-1">
              {stats?.pendingJobs} pending, {stats?.activeJobs} active, {stats?.completedJobs} completed
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-green-50 rounded-xl">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Revenue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats?.totalRevenue || 0)}</p>
            <p className="text-xs text-gray-500 mt-1">From completed payments</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-warm-50 rounded-xl">
                <CreditCard className="w-5 h-5 text-warm-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Active Subs</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.activeSubscriptions}</p>
            <p className="text-xs text-gray-500 mt-1">Stripe subscriptions</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-warm-50 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-warm-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Pending Verif.</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.pendingVerifications}</p>
            <p className="text-xs text-gray-500 mt-1">Awaiting review</p>
          </div>
        </div>

        {/* Platform Recommendations */}
        <SectionErrorBoundary fallbackTitle="Recommendations failed to load">
          <AdminRecommendations />
        </SectionErrorBoundary>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Signups */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-secondary-600" />
                <h3 className="font-semibold text-gray-900">Recent Signups</h3>
              </div>
              <Link to="/admin/users" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentSignups.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No signups yet</div>
              ) : (
                recentSignups.map(user => (
                  <div key={user.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{user.full_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{formatDate(user.created_at)}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                      {user.role}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Jobs */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary-600" />
                <h3 className="font-semibold text-gray-900">Recent Jobs</h3>
              </div>
              <Link to="/admin/moderation" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentJobs.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No jobs yet</div>
              ) : (
                recentJobs.map(job => (
                  <div key={job.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                        {job.description?.slice(0, 50)}{(job.description?.length || 0) > 50 ? '...' : ''}
                      </p>
                      {getStatusBadge(job.status)}
                    </div>
                    <p className="text-xs text-gray-500">
                      {job.profiles?.full_name || 'Unknown'} &middot; {formatDate(job.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-green-600" />
                <h3 className="font-semibold text-gray-900">Recent Payments</h3>
              </div>
              <Link to="/admin/payments" className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentPayments.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No payments yet</div>
              ) : (
                recentPayments.map(payment => (
                  <div key={payment.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {payment.profiles?.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {payment.payment_type.replace('_', ' ')} &middot; {formatDate(payment.created_at)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(payment.amount)}</p>
                      {getStatusBadge(payment.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Quick Links</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/admin/users"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Users className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Manage Users</span>
            </Link>
            <Link
              to="/admin/verifications"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Verifications</span>
            </Link>
            <Link
              to="/admin/payments"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <DollarSign className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Payments</span>
            </Link>
            <Link
              to="/admin/moderation"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <BarChart3 className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Moderation</span>
            </Link>
            <Link
              to="/admin/custom-tasks"
              className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Task Requests</span>
            </Link>
          </div>
        </div>
      </div>
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}
