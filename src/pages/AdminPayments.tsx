import { useState, useEffect } from 'react';
import {
  DollarSign,
  Search,
  Loader2,
  CreditCard,
  TrendingUp,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Users,
  Briefcase,
  Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PRICING_CONFIG } from '../config/pricing';
import DashboardLayout from '../components/DashboardLayout';
import Breadcrumbs from '../components/Breadcrumbs';

interface PaymentRow {
  id: string;
  profile_id: string;
  payment_type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  profiles: { full_name: string } | null;
}

interface SubscriptionRow {
  id: string;
  profile_id: string;
  subscription_tier: string;
  subscription_started_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

type TabKey = 'client' | 'tradie' | 'revenue' | 'subscriptions';

// Fee structure — from PRICING_CONFIG (src/config/pricing.ts)
const STRIPE_FEE_RATE = PRICING_CONFIG.processing.stripePercentage; // 1.75%
const STRIPE_FEE_FIXED = Math.round(PRICING_CONFIG.processing.stripeFixed * 100); // 30 cents in cents
const PLATFORM_MARGIN_RATE = PRICING_CONFIG.processing.platformProcessingMargin; // 1.2%
const DEFAULT_PLATFORM_FEE_RATE = 0.10; // Free-tier base rate for aggregate estimates

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('client');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, [page]);

  const fetchData = async () => {
    setLoading(true);
    const [paymentsRes, subscriptionsRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*, profiles:profiles!payments_profile_id_fkey(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1),
      supabase
        .from('tradie_details')
        .select('id, profile_id, subscription_tier, subscription_started_at, stripe_subscription_id, created_at, profiles:profiles!tradie_details_profile_id_fkey(full_name)')
        .eq('subscription_tier', 'pro')
        .order('created_at', { ascending: false }),
    ]);

    setPayments((paymentsRes.data as unknown as PaymentRow[]) || []);
    setTotalCount(paymentsRes.count || 0);
    setSubscriptions((subscriptionsRes.data as unknown as SubscriptionRow[]) || []);
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

  // Calculations
  const completedPayments = payments.filter(p => p.status === 'completed');
  const totalGross = completedPayments.reduce((sum, p) => sum + p.amount, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedThisMonth = completedPayments.filter(p => new Date(p.created_at) >= monthStart);
  const grossThisMonth = completedThisMonth.reduce((sum, p) => sum + p.amount, 0);

  // Platform revenue = platform fee (varies by tier) + platform processing margin (1.2%)
  // For aggregate display, use free-tier base rate (approximate)
  const totalPlatformFees = Math.round(totalGross * DEFAULT_PLATFORM_FEE_RATE);
  const totalPlatformMargin = Math.round(totalGross * PLATFORM_MARGIN_RATE);
  const totalStripeFees = completedPayments.reduce(
    (sum, p) => sum + Math.round(p.amount * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED,
    0
  );
  const totalConnecTradieRevenue = totalPlatformFees + totalPlatformMargin;
  const totalTradiePayout = totalGross - totalPlatformFees - totalPlatformMargin - totalStripeFees;

  const monthPlatformFees = Math.round(grossThisMonth * DEFAULT_PLATFORM_FEE_RATE);
  const monthPlatformMargin = Math.round(grossThisMonth * PLATFORM_MARGIN_RATE);
  const monthStripeFees = completedThisMonth.reduce(
    (sum, p) => sum + Math.round(p.amount * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED,
    0
  );
  const monthConnecTradieRevenue = monthPlatformFees + monthPlatformMargin;
  const monthTradiePayout = grossThisMonth - monthPlatformFees - monthPlatformMargin - monthStripeFees;

  const activeSubscriptions = subscriptions; // All returned rows are Pro tier

  // Filtering
  const filteredPayments = payments.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !p.profiles?.full_name?.toLowerCase().includes(q) &&
        !p.payment_type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (dateFrom && new Date(p.created_at) < new Date(dateFrom)) return false;
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setDate(toDate.getDate() + 1);
      if (new Date(p.created_at) >= toDate) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      refunded: 'bg-gray-100 text-gray-600',
      active: 'bg-green-100 text-green-700',
      canceled: 'bg-red-100 text-red-700',
      past_due: 'bg-amber-100 text-amber-700',
      trialing: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, string> = {
      lead_unlock: 'bg-blue-50 text-blue-700',
      job_access: 'bg-purple-50 text-purple-700',
      job_funding: 'bg-green-50 text-green-700',
      job_payment: 'bg-green-50 text-green-700',
      subscription: 'bg-indigo-50 text-indigo-700',
    };
    const labels: Record<string, string> = {
      lead_unlock: 'Lead Unlock',
      job_access: 'Job Access',
      job_funding: 'Job Payment',
      job_payment: 'Job Payment',
      subscription: 'Subscription',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[type] || 'bg-gray-100 text-gray-600'}`}>
        {labels[type] || type.replace('_', ' ')}
      </span>
    );
  };

  const tabs: { key: TabKey; label: string; icon: typeof DollarSign; count?: number }[] = [
    { key: 'client', label: 'Client Payments', icon: Users, count: payments.length },
    { key: 'tradie', label: 'Tradie Payouts', icon: Briefcase, count: completedPayments.length },
    { key: 'revenue', label: 'Platform Revenue', icon: Building2 },
    { key: 'subscriptions', label: 'Pro Subscriptions', icon: CreditCard, count: subscriptions.length },
  ];

  return (
    <DashboardLayout>
      <Breadcrumbs />
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
          <p className="text-gray-600 mt-1">Track all payments flowing through ConnecTradie</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Client Payments */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-blue-50 rounded-xl">
                <ArrowDownRight className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Client Payments</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalGross)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {formatCurrency(grossThisMonth)} this month
            </p>
          </div>

          {/* Tradie Payouts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-green-50 rounded-xl">
                <ArrowUpRight className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Tradie Payouts</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(Math.max(0, totalTradiePayout))}</p>
            <p className="text-xs text-gray-400 mt-1">
              {formatCurrency(Math.max(0, monthTradiePayout))} this month
            </p>
          </div>

          {/* ConnecTradie Revenue */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-warm-50 rounded-xl">
                <TrendingUp className="w-5 h-5 text-warm-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Platform Revenue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalConnecTradieRevenue)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {formatCurrency(monthConnecTradieRevenue)} this month
            </p>
          </div>

          {/* Pro Subscriptions */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-indigo-50 rounded-xl">
                <CreditCard className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Pro Subscribers</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeSubscriptions.length}</p>
            <p className="text-xs text-gray-400 mt-1">
              Currently active
            </p>
          </div>
        </div>

        {/* Fee Breakdown Banner */}
        {completedPayments.length > 0 && (
          <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 mb-8">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Fee Breakdown (All Time)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Platform Fee (varies by tier)</p>
                <p className="text-sm font-bold text-gray-900">{formatCurrency(totalPlatformFees)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Processing Margin ({(PLATFORM_MARGIN_RATE * 100).toFixed(1)}%)</p>
                <p className="text-sm font-bold text-gray-900">{formatCurrency(totalPlatformMargin)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Stripe Fees ({(STRIPE_FEE_RATE * 100).toFixed(2)}% + $0.30)</p>
                <p className="text-sm font-bold text-gray-900">{formatCurrency(totalStripeFees)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Net to Tradies</p>
                <p className="text-sm font-bold text-green-700">{formatCurrency(Math.max(0, totalTradiePayout))}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 overflow-x-auto">
            <div className="flex min-w-max">
              {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setPage(1); }}
                    className={`flex-1 px-5 py-3.5 text-sm font-semibold transition-all relative whitespace-nowrap ${
                      isActive
                        ? 'text-primary-700 bg-primary-50/50'
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          isActive ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
            </div>
          ) : activeTab === 'client' ? (
            <>
              {/* Client Payments - what clients pay */}
              <div className="p-4 border-b border-gray-100">
                <p className="text-xs text-gray-500 mb-3">
                  All payments made by clients for jobs on the platform.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by client name or type..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                      />
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No client payments found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {searchQuery || dateFrom || dateTo
                      ? 'Try adjusting your filters'
                      : 'Payments will appear here when clients pay for jobs'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3 p-4">
                    {filteredPayments.map(payment => (
                      <div key={payment.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {payment.profiles?.full_name || 'Unknown'}
                          </span>
                          <span className="text-sm font-bold text-gray-900">
                            {formatCurrency(payment.amount)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {getTypeBadge(payment.payment_type)}
                          {getStatusBadge(payment.status)}
                        </div>
                        <p className="text-xs text-gray-400">{formatDate(payment.created_at)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Amount Paid</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredPayments.map(payment => (
                          <tr key={payment.id} className="hover:bg-gray-50/50">
                            <td className="px-5 py-4 text-sm font-medium text-gray-900">
                              {payment.profiles?.full_name || 'Unknown'}
                            </td>
                            <td className="px-5 py-4">{getTypeBadge(payment.payment_type)}</td>
                            <td className="px-5 py-4 text-sm font-bold text-gray-900 text-right">
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="px-5 py-4">{getStatusBadge(payment.status)}</td>
                            <td className="px-5 py-4 text-sm text-gray-500">{formatDate(payment.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} pageSize={pageSize} totalCount={totalCount} setPage={setPage} />
                </>
              )}
            </>
          ) : activeTab === 'tradie' ? (
            <>
              {/* Tradie Payouts */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800 leading-relaxed">
                    Estimated payouts after <strong>platform fee (varies by tier)</strong>, <strong>processing margin (1.2%)</strong>, and <strong>Stripe fee (1.75% + $0.30)</strong> are deducted.
                  </p>
                </div>
              </div>

              {completedPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No payouts yet</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Payouts are calculated from completed job payments
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Client Paid</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Gross</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Fees</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Net to Tradie</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedPayments.map(payment => {
                          const fees = Math.round(payment.amount * (DEFAULT_PLATFORM_FEE_RATE + PLATFORM_MARGIN_RATE + STRIPE_FEE_RATE)) + STRIPE_FEE_FIXED;
                          const net = payment.amount - fees;
                          return (
                            <tr key={payment.id} className="hover:bg-gray-50/50">
                              <td className="px-5 py-4 text-sm font-medium text-gray-900">
                                {payment.profiles?.full_name || 'Unknown'}
                              </td>
                              <td className="px-5 py-4">{getTypeBadge(payment.payment_type)}</td>
                              <td className="px-5 py-4 text-sm text-gray-500 text-right">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="px-5 py-4 text-sm text-red-600 text-right">
                                -{formatCurrency(fees)}
                              </td>
                              <td className="px-5 py-4 text-sm font-bold text-green-700 text-right">
                                {formatCurrency(Math.max(0, net))}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-500">{formatDate(payment.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-3 p-4">
                    {completedPayments.map(payment => {
                      const fees = Math.round(payment.amount * (DEFAULT_PLATFORM_FEE_RATE + PLATFORM_MARGIN_RATE + STRIPE_FEE_RATE)) + STRIPE_FEE_FIXED;
                      const net = payment.amount - fees;
                      return (
                        <div key={payment.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {payment.profiles?.full_name || 'Unknown'}
                            </span>
                            {getTypeBadge(payment.payment_type)}
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Gross: {formatCurrency(payment.amount)}</span>
                            <span className="font-bold text-green-700">Net: {formatCurrency(Math.max(0, net))}</span>
                          </div>
                          <p className="text-xs text-gray-400">{formatDate(payment.created_at)}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : activeTab === 'revenue' ? (
            <>
              {/* Platform Revenue */}
              <div className="p-4 border-b border-gray-100">
                <p className="text-xs text-gray-500">
                  ConnecTradie earns a platform fee (varies by subscription tier) + 1.2% processing margin on each completed payment. Stripe fees (1.75% + $0.30) are paid to Stripe, not ConnecTradie.
                </p>
              </div>

              {completedPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No revenue yet</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Revenue is earned when clients complete job payments
                  </p>
                </div>
              ) : (
                <>
                  {/* Revenue Summary */}
                  <div className="p-5 border-b border-gray-100">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-warm-50 rounded-xl p-4 border border-warm-200">
                        <p className="text-xs font-medium text-warm-700 mb-1">Platform Fees (by tier)</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPlatformFees)}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatCurrency(monthPlatformFees)} this month</p>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <p className="text-xs font-medium text-blue-700 mb-1">Processing Margin ({(PLATFORM_MARGIN_RATE * 100).toFixed(1)}%)</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPlatformMargin)}</p>
                        <p className="text-xs text-gray-500 mt-1">{formatCurrency(monthPlatformMargin)} this month</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                        <p className="text-xs font-medium text-gray-600 mb-1">Stripe Fees (not ours)</p>
                        <p className="text-xl font-bold text-gray-400">{formatCurrency(totalStripeFees)}</p>
                        <p className="text-xs text-gray-400 mt-1">{formatCurrency(monthStripeFees)} this month</p>
                      </div>
                    </div>
                  </div>

                  {/* Per-transaction breakdown */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Transaction</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Gross</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Platform (by tier)</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Margin ({(PLATFORM_MARGIN_RATE * 100).toFixed(1)}%)</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Stripe</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedPayments.map(payment => {
                          const platformFee = Math.round(payment.amount * DEFAULT_PLATFORM_FEE_RATE);
                          const processingFee = Math.round(payment.amount * PLATFORM_MARGIN_RATE);
                          const stripeFee = Math.round(payment.amount * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED;
                          return (
                            <tr key={payment.id} className="hover:bg-gray-50/50">
                              <td className="px-5 py-4 text-sm font-medium text-gray-900">
                                {payment.profiles?.full_name || 'Unknown'}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-900 text-right">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="px-5 py-4 text-sm font-semibold text-warm-700 text-right">
                                {formatCurrency(platformFee)}
                              </td>
                              <td className="px-5 py-4 text-sm font-semibold text-blue-700 text-right">
                                {formatCurrency(processingFee)}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-400 text-right">
                                {formatCurrency(stripeFee)}
                              </td>
                              <td className="px-5 py-4 text-sm text-gray-500">{formatDate(payment.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile */}
                  <div className="md:hidden space-y-3 p-4">
                    {completedPayments.map(payment => {
                      const platformFee = Math.round(payment.amount * DEFAULT_PLATFORM_FEE_RATE);
                      const processingFee = Math.round(payment.amount * PLATFORM_MARGIN_RATE);
                      return (
                        <div key={payment.id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {payment.profiles?.full_name || 'Unknown'}
                            </span>
                            <span className="text-sm text-gray-500">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-warm-700 font-semibold">Platform: {formatCurrency(platformFee)}</span>
                            <span className="text-blue-700 font-semibold">Margin: {formatCurrency(processingFee)}</span>
                          </div>
                          <p className="text-xs text-gray-400">{formatDate(payment.created_at)}</p>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          ) : (
            /* Subscriptions Tab */
            subscriptions.length === 0 ? (
              <div className="py-16 text-center">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No subscriptions yet</p>
                <p className="text-sm text-gray-400 mt-1">Pro subscriptions will appear here</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-100">
                  <p className="text-xs text-gray-500">
                    Pro subscribers pay lower platform fees (3–5% sliding scale vs 4–10% for free tier). They keep more of each payment.
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {subscriptions.map(sub => (
                    <div key={sub.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{sub.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {sub.subscription_started_at
                            ? `Pro since ${formatDate(sub.subscription_started_at)}`
                            : 'Pro subscriber'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          Pro
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Pagination({
  page,
  pageSize,
  totalCount,
  setPage,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  setPage: (fn: (p: number) => number) => void;
}) {
  if (totalCount <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
      <p className="text-sm text-gray-600">
        Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="text-sm font-medium text-gray-700">Page {page}</span>
        <button
          disabled={page * pageSize >= totalCount}
          onClick={() => setPage(p => p + 1)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
