import { useState, useEffect } from 'react';
import {
  DollarSign,
  Search,
  Loader2,
  CreditCard,
  TrendingUp,
  Calendar,
  Receipt,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../components/DashboardLayout';

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
  stripe_subscription_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  profiles: { full_name: string } | null;
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'payments' | 'subscriptions'>('payments');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [paymentsRes, subscriptionsRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*, profiles:profiles!payments_profile_id_fkey(full_name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('stripe_subscriptions')
        .select('*, profiles:profiles!stripe_subscriptions_profile_id_fkey(full_name)')
        .order('created_at', { ascending: false }),
    ]);

    setPayments((paymentsRes.data as unknown as PaymentRow[]) || []);
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

  const completedPayments = payments.filter(p => p.status === 'completed');
  const totalRevenue = completedPayments.reduce((sum, p) => sum + p.amount, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const revenueThisMonth = completedPayments
    .filter(p => new Date(p.created_at) >= monthStart)
    .reduce((sum, p) => sum + p.amount, 0);

  const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
  const avgPayment = completedPayments.length > 0
    ? totalRevenue / completedPayments.length
    : 0;

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
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, string> = {
      lead_unlock: 'bg-blue-100 text-blue-700',
      job_access: 'bg-indigo-100 text-indigo-700',
      job_funding: 'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[type] || 'bg-gray-100 text-gray-600'}`}>
        {type.replace('_', ' ')}
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Payment Reporting</h1>
          <p className="text-gray-600 mt-1">Financial overview and transaction history</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-green-50 rounded-xl">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Total Revenue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-blue-50 rounded-xl">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Revenue This Month</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(revenueThisMonth)}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-purple-50 rounded-xl">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Active Subscriptions</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeSubscriptions.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-amber-50 rounded-xl">
                <Receipt className="w-5 h-5 text-amber-600" />
              </div>
              <span className="text-sm font-medium text-gray-500">Average Payment</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(avgPayment)}</p>
          </div>
        </div>

        {/* Tabs + Content */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('payments')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'payments'
                    ? 'text-green-700 bg-green-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  <span>Payments</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'payments' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {payments.length}
                  </span>
                </div>
                {activeTab === 'payments' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-green-600" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('subscriptions')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-all relative ${
                  activeTab === 'subscriptions'
                    ? 'text-purple-700 bg-purple-50/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <span>Subscriptions</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'subscriptions' ? 'bg-purple-200 text-purple-800' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {subscriptions.length}
                  </span>
                </div>
                {activeTab === 'subscriptions' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600" />
                )}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : activeTab === 'payments' ? (
            <>
              {/* Payment Filters */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by name or type..."
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No payments found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {searchQuery || dateFrom || dateTo
                      ? 'Try adjusting your filters'
                      : 'No payments recorded yet'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
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
                          <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                            {formatCurrency(payment.amount)}
                          </td>
                          <td className="px-5 py-4">{getStatusBadge(payment.status)}</td>
                          <td className="px-5 py-4 text-sm text-gray-500">{formatDate(payment.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            /* Subscriptions Tab */
            subscriptions.length === 0 ? (
              <div className="py-16 text-center">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No subscriptions found</p>
                <p className="text-sm text-gray-400 mt-1">No active subscriptions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {subscriptions.map(sub => (
                  <div key={sub.id} className="px-5 py-4 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{sub.profiles?.full_name || 'Unknown'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {sub.current_period_start && sub.current_period_end
                          ? `${formatDate(sub.current_period_start)} - ${formatDate(sub.current_period_end)}`
                          : 'Period not available'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      {getStatusBadge(sub.status)}
                      {sub.cancel_at_period_end && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          Cancelling
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
