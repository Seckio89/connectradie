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
import { processRefund } from '../lib/stripePayments';
import { friendlyError } from '../lib/utils';
import { useToast } from '../hooks/useToast';
import ConfirmModal from '../components/ConfirmModal';
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
  created_at: string;
  profiles: { full_name: string; subscription_started_at: string | null } | null;
}

type TabKey = 'client' | 'tradie' | 'revenue' | 'subscriptions';

// Fee structure — from PRICING_CONFIG (src/config/pricing.ts)
const STRIPE_FEE_RATE = PRICING_CONFIG.processing.stripePercentage; // 1.75%
const STRIPE_FEE_FIXED = Math.round(PRICING_CONFIG.processing.stripeFixed * 100); // 30 cents in cents
const PLATFORM_MARGIN_RATE = PRICING_CONFIG.processing.platformProcessingMargin;
const PLATFORM_MARGIN_LABEL = `${(PLATFORM_MARGIN_RATE * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const STRIPE_FEE_LABEL = `${(STRIPE_FEE_RATE * 100).toFixed(2).replace(/\.?0+$/, '')}% + $${PRICING_CONFIG.processing.stripeFixed.toFixed(2)}`;
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

  // Admin refund. process-refund already grants admins full refund power and
  // handles destination charges correctly (reverse_transfer +
  // refund_application_fee) — but until now NOTHING in the app called it as an
  // admin. A client whose payment had already been released was refused (by
  // design) and told to raise a dispute, and there was no screen anywhere that
  // could resolve it. This is that screen.
  const { showToast } = useToast();
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refunding, setRefunding] = useState(false);

  const handleRefund = async () => {
    // Guard against a double-tap: ConfirmModal has no disabled state, and a
    // second refund on the same payment would be a second real Stripe call.
    if (!refundTarget || refunding) return;
    setRefunding(true);
    try {
      await processRefund(refundTarget.id, 'Refunded by admin from Admin → Payments');
      showToast(`Refunded ${formatCurrency(refundTarget.amount)}`);
      setRefundTarget(null);
      await fetchData();
    } catch (err) {
      // friendlyError now passes through the server's own 4xx message, so a
      // refusal explains itself instead of becoming a generic payment error.
      showToast(friendlyError(err, 'Refund failed. Please try again.'), true);
    } finally {
      setRefunding(false);
    }
  };

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
        // subscription_started_at lives on PROFILES, not tradie_details, and
        // stripe_subscription_id doesn't exist on either — selecting them here
        // made PostgREST reject the whole query with
        // 42703 "column tradie_details.subscription_started_at does not exist",
        // so the Subscriptions tab silently rendered empty. Pull the start date
        // through the profiles embed this query already has.
        .select('id, profile_id, subscription_tier, created_at, profiles:profiles!tradie_details_profile_id_fkey(full_name, subscription_started_at)')
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

  // Platform revenue = platform fee (varies by tier) + platform processing margin.
  // For aggregate display, use free-tier base rate (approximate).
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
      pending: 'bg-ct-amber/[0.13] text-ct-amber',
      completed: 'bg-ct-teal/[0.14] text-ct-teal',
      failed: 'bg-ct-rose/[0.13] text-ct-rose',
      refunded: 'bg-ct-surface-2 text-ct-mute-2',
      active: 'bg-ct-teal/[0.14] text-ct-teal',
      canceled: 'bg-ct-rose/[0.13] text-ct-rose',
      past_due: 'bg-ct-amber/[0.13] text-ct-amber',
      trialing: 'bg-ct-surface-2 text-ct-mute-2',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-ct-surface-2 text-ct-mute-2'}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const map: Record<string, string> = {
      lead_unlock: 'bg-ct-surface-2 text-ct-mute-2',
      job_access: 'bg-ct-surface-2 text-ct-mute-2',
      job_funding: 'bg-ct-teal/[0.14] text-ct-teal',
      job_payment: 'bg-ct-teal/[0.14] text-ct-teal',
      subscription: 'bg-ct-surface-2 text-ct-mute-2',
    };
    const labels: Record<string, string> = {
      lead_unlock: 'Lead Unlock',
      job_access: 'Job Access',
      job_funding: 'Job Payment',
      job_payment: 'Job Payment',
      subscription: 'Subscription',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${map[type] || 'bg-ct-surface-2 text-ct-mute-2'}`}>
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
    <DashboardLayout wide>
      <Breadcrumbs />
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ct-paper">Financial Overview</h1>
          <p className="text-ct-mute-2 mt-1">Track all payments flowing through ConnecTradie</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Client Payments */}
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-ct-surface-2 rounded-ct-md">
                <ArrowDownRight className="w-5 h-5 text-ct-mute-2" />
              </div>
              <span className="text-sm font-medium text-ct-mute">Client Payments</span>
            </div>
            <p className="text-2xl font-bold text-ct-paper">{formatCurrency(totalGross)}</p>
            <p className="text-xs text-ct-mute mt-1">
              {formatCurrency(grossThisMonth)} this month
            </p>
          </div>

          {/* Tradie Payouts */}
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-ct-teal/[0.14] rounded-ct-md">
                <ArrowUpRight className="w-5 h-5 text-ct-teal" />
              </div>
              <span className="text-sm font-medium text-ct-mute">Tradie Payouts</span>
            </div>
            <p className="text-2xl font-bold text-ct-paper">{formatCurrency(Math.max(0, totalTradiePayout))}</p>
            <p className="text-xs text-ct-mute mt-1">
              {formatCurrency(Math.max(0, monthTradiePayout))} this month
            </p>
          </div>

          {/* ConnecTradie Revenue */}
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-ct-amber/[0.13] rounded-ct-md">
                <TrendingUp className="w-5 h-5 text-ct-amber" />
              </div>
              <span className="text-sm font-medium text-ct-mute">Platform Revenue</span>
            </div>
            <p className="text-2xl font-bold text-ct-paper">{formatCurrency(totalConnecTradieRevenue)}</p>
            <p className="text-xs text-ct-mute mt-1">
              {formatCurrency(monthConnecTradieRevenue)} this month
            </p>
          </div>

          {/* Pro Subscriptions */}
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-ct-surface-2 rounded-ct-md">
                <CreditCard className="w-5 h-5 text-ct-mute-2" />
              </div>
              <span className="text-sm font-medium text-ct-mute">Pro Subscribers</span>
            </div>
            <p className="text-2xl font-bold text-ct-paper">{activeSubscriptions.length}</p>
            <p className="text-xs text-ct-mute mt-1">
              Currently active
            </p>
          </div>
        </div>

        {/* Fee Breakdown Banner */}
        {completedPayments.length > 0 && (
          <div className="bg-ct-surface-2 rounded-ct-lg border border-ct-line p-5 mb-8">
            <h3 className="text-sm font-semibold text-ct-mute-2 mb-3">Fee Breakdown (All Time)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-ct-mute">Platform Fee (varies by tier)</p>
                <p className="text-sm font-bold text-ct-paper">{formatCurrency(totalPlatformFees)}</p>
              </div>
              <div>
                <p className="text-xs text-ct-mute">Processing Margin ({PLATFORM_MARGIN_LABEL})</p>
                <p className="text-sm font-bold text-ct-paper">{formatCurrency(totalPlatformMargin)}</p>
              </div>
              <div>
                <p className="text-xs text-ct-mute">Stripe Fees ({STRIPE_FEE_LABEL})</p>
                <p className="text-sm font-bold text-ct-paper">{formatCurrency(totalStripeFees)}</p>
              </div>
              <div>
                <p className="text-xs text-ct-mute">Net to Tradies</p>
                <p className="text-sm font-bold text-ct-teal">{formatCurrency(Math.max(0, totalTradiePayout))}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
          <div className="border-b border-ct-line overflow-x-auto">
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
                        ? 'text-ct-mute-2 bg-ct-surface-2/50'
                        : 'text-ct-mute hover:text-ct-paper hover:bg-ct-surface-2'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          isActive ? 'bg-ct-surface-2 text-ct-mute-2' : 'bg-ct-line text-ct-mute-2'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-ct-teal" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-ct-mute-2 animate-spin" />
            </div>
          ) : activeTab === 'client' ? (
            <>
              {/* Client Payments - what clients pay */}
              <div className="p-4 border-b border-ct-line-soft">
                <p className="text-xs text-ct-mute mb-3">
                  All payments made by clients for jobs on the platform.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by client name or type..."
                      className="w-full pl-10 pr-4 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm bg-ct-surface"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm bg-ct-surface"
                      />
                    </div>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ct-mute" />
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="pl-10 pr-3 py-2.5 border border-ct-line rounded-ct-sm focus:outline-none focus:ring-2 focus:ring-ct-teal text-sm bg-ct-surface"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {filteredPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <DollarSign className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute font-medium">No client payments found</p>
                  <p className="text-sm text-ct-mute mt-1">
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
                      <div key={payment.id} className="bg-ct-surface border border-ct-line rounded-ct-md p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-ct-paper">
                            {payment.profiles?.full_name || 'Unknown'}
                          </span>
                          <span className="text-sm font-bold text-ct-paper">
                            {formatCurrency(payment.amount)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {getTypeBadge(payment.payment_type)}
                          {getStatusBadge(payment.status)}
                        </div>
                        <p className="text-xs text-ct-mute">{formatDate(payment.created_at)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-ct-surface-2">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Client</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Type</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Amount Paid</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Status</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Date</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ct-line-soft">
                        {filteredPayments.map(payment => (
                          <tr key={payment.id} className="hover:bg-ct-surface-2/50">
                            <td className="px-5 py-4 text-sm font-medium text-ct-paper">
                              {payment.profiles?.full_name || 'Unknown'}
                            </td>
                            <td className="px-5 py-4">{getTypeBadge(payment.payment_type)}</td>
                            <td className="px-5 py-4 text-sm font-bold text-ct-paper text-right">
                              {formatCurrency(payment.amount)}
                            </td>
                            <td className="px-5 py-4">{getStatusBadge(payment.status)}</td>
                            <td className="px-5 py-4 text-sm text-ct-mute">{formatDate(payment.created_at)}</td>
                            <td className="px-5 py-4 text-right">
                              {/* Only money that was actually collected can be sent back.
                                  A 'released' payment IS refundable by an admin — that is
                                  the whole point of this control — but it claws the funds
                                  back off the tradie's Connect balance, so the confirm
                                  copy says so. */}
                              {['completed', 'released'].includes(payment.status) ? (
                                <button
                                  onClick={() => setRefundTarget(payment)}
                                  className="text-ct-rose hover:text-ct-rose text-sm font-medium"
                                >
                                  Refund
                                </button>
                              ) : (
                                <span className="text-xs text-ct-mute">—</span>
                              )}
                            </td>
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
              <div className="p-4 border-b border-ct-line-soft">
                <div className="flex items-start gap-2 px-3 py-2.5 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
                  <Info className="w-4 h-4 text-ct-mute-2 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ct-mute-2 leading-relaxed">
                    Estimated payouts after <strong>platform fee (varies by tier)</strong>, <strong>processing margin ({PLATFORM_MARGIN_LABEL})</strong>, and <strong>Stripe fee ({STRIPE_FEE_LABEL})</strong> are deducted.
                  </p>
                </div>
              </div>

              {completedPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <Briefcase className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute font-medium">No payouts yet</p>
                  <p className="text-sm text-ct-mute mt-1">
                    Payouts are calculated from completed job payments
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-ct-surface-2">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Client Paid</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Type</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Gross</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Fees</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Net to Tradie</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ct-line-soft">
                        {completedPayments.map(payment => {
                          const fees = Math.round(payment.amount * (DEFAULT_PLATFORM_FEE_RATE + PLATFORM_MARGIN_RATE + STRIPE_FEE_RATE)) + STRIPE_FEE_FIXED;
                          const net = payment.amount - fees;
                          return (
                            <tr key={payment.id} className="hover:bg-ct-surface-2/50">
                              <td className="px-5 py-4 text-sm font-medium text-ct-paper">
                                {payment.profiles?.full_name || 'Unknown'}
                              </td>
                              <td className="px-5 py-4">{getTypeBadge(payment.payment_type)}</td>
                              <td className="px-5 py-4 text-sm text-ct-mute text-right">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="px-5 py-4 text-sm text-ct-rose text-right">
                                -{formatCurrency(fees)}
                              </td>
                              <td className="px-5 py-4 text-sm font-bold text-ct-teal text-right">
                                {formatCurrency(Math.max(0, net))}
                              </td>
                              <td className="px-5 py-4 text-sm text-ct-mute">{formatDate(payment.created_at)}</td>
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
                        <div key={payment.id} className="bg-ct-surface border border-ct-line rounded-ct-md p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-ct-paper">
                              {payment.profiles?.full_name || 'Unknown'}
                            </span>
                            {getTypeBadge(payment.payment_type)}
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-ct-mute">Gross: {formatCurrency(payment.amount)}</span>
                            <span className="font-bold text-ct-teal">Net: {formatCurrency(Math.max(0, net))}</span>
                          </div>
                          <p className="text-xs text-ct-mute">{formatDate(payment.created_at)}</p>
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
              <div className="p-4 border-b border-ct-line-soft">
                <p className="text-xs text-ct-mute">
                  ConnecTradie earns a platform fee (varies by subscription tier) + {PLATFORM_MARGIN_LABEL} processing margin on each completed payment. Stripe fees ({STRIPE_FEE_LABEL}) are paid to Stripe, not ConnecTradie.
                </p>
              </div>

              {completedPayments.length === 0 ? (
                <div className="py-16 text-center">
                  <Building2 className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                  <p className="text-ct-mute font-medium">No revenue yet</p>
                  <p className="text-sm text-ct-mute mt-1">
                    Revenue is earned when clients complete job payments
                  </p>
                </div>
              ) : (
                <>
                  {/* Revenue Summary */}
                  <div className="p-5 border-b border-ct-line-soft">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-ct-amber/[0.13] rounded-ct-md p-4 border border-ct-amber/[0.34]">
                        <p className="text-xs font-medium text-ct-amber mb-1">Platform Fees (by tier)</p>
                        <p className="text-xl font-bold text-ct-paper">{formatCurrency(totalPlatformFees)}</p>
                        <p className="text-xs text-ct-mute mt-1">{formatCurrency(monthPlatformFees)} this month</p>
                      </div>
                      <div className="bg-ct-surface-2 rounded-ct-md p-4 border border-ct-line">
                        <p className="text-xs font-medium text-ct-mute-2 mb-1">Processing Margin ({PLATFORM_MARGIN_LABEL})</p>
                        <p className="text-xl font-bold text-ct-paper">{formatCurrency(totalPlatformMargin)}</p>
                        <p className="text-xs text-ct-mute mt-1">{formatCurrency(monthPlatformMargin)} this month</p>
                      </div>
                      <div className="bg-ct-surface-2 rounded-ct-md p-4 border border-ct-line">
                        <p className="text-xs font-medium text-ct-mute-2 mb-1">Stripe Fees (not ours)</p>
                        <p className="text-xl font-bold text-ct-mute">{formatCurrency(totalStripeFees)}</p>
                        <p className="text-xs text-ct-mute mt-1">{formatCurrency(monthStripeFees)} this month</p>
                      </div>
                    </div>
                  </div>

                  {/* Per-transaction breakdown */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-ct-surface-2">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Transaction</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Gross</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Platform (by tier)</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Margin ({(PLATFORM_MARGIN_RATE * 100).toFixed(1)}%)</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Stripe</th>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-ct-mute uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ct-line-soft">
                        {completedPayments.map(payment => {
                          const platformFee = Math.round(payment.amount * DEFAULT_PLATFORM_FEE_RATE);
                          const processingFee = Math.round(payment.amount * PLATFORM_MARGIN_RATE);
                          const stripeFee = Math.round(payment.amount * STRIPE_FEE_RATE) + STRIPE_FEE_FIXED;
                          return (
                            <tr key={payment.id} className="hover:bg-ct-surface-2/50">
                              <td className="px-5 py-4 text-sm font-medium text-ct-paper">
                                {payment.profiles?.full_name || 'Unknown'}
                              </td>
                              <td className="px-5 py-4 text-sm text-ct-paper text-right">
                                {formatCurrency(payment.amount)}
                              </td>
                              <td className="px-5 py-4 text-sm font-semibold text-ct-amber text-right">
                                {formatCurrency(platformFee)}
                              </td>
                              <td className="px-5 py-4 text-sm font-semibold text-ct-mute-2 text-right">
                                {formatCurrency(processingFee)}
                              </td>
                              <td className="px-5 py-4 text-sm text-ct-mute text-right">
                                {formatCurrency(stripeFee)}
                              </td>
                              <td className="px-5 py-4 text-sm text-ct-mute">{formatDate(payment.created_at)}</td>
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
                        <div key={payment.id} className="bg-ct-surface border border-ct-line rounded-ct-md p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-ct-paper">
                              {payment.profiles?.full_name || 'Unknown'}
                            </span>
                            <span className="text-sm text-ct-mute">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-ct-amber font-semibold">Platform: {formatCurrency(platformFee)}</span>
                            <span className="text-ct-mute-2 font-semibold">Margin: {formatCurrency(processingFee)}</span>
                          </div>
                          <p className="text-xs text-ct-mute">{formatDate(payment.created_at)}</p>
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
                <CreditCard className="w-12 h-12 text-ct-mute mx-auto mb-3" />
                <p className="text-ct-mute font-medium">No subscriptions yet</p>
                <p className="text-sm text-ct-mute mt-1">Pro subscriptions will appear here</p>
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-ct-line-soft">
                  <p className="text-xs text-ct-mute">
                    Pro subscribers pay a lower platform fee (5% of labour, 4% for repeat clients) vs 8%/5% on the free tier. Commission applies to labour only — never to materials. They keep more of each payment.
                  </p>
                </div>
                <div className="divide-y divide-ct-line-soft">
                  {subscriptions.map(sub => (
                    <div key={sub.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ct-paper">{sub.profiles?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-ct-mute mt-0.5">
                          {sub.profiles?.subscription_started_at
                            ? `Pro since ${formatDate(sub.profiles.subscription_started_at)}`
                            : 'Pro subscriber'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-ct-teal/[0.14] text-ct-teal">
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

      {refundTarget && (
        <ConfirmModal
          type="danger"
          title={`Refund ${formatCurrency(refundTarget.amount)}?`}
          message={
            refundTarget.status === 'released'
              ? `This payment has already been released to the tradie, so refunding it will claw the funds back off their Stripe balance. The platform commission is reversed too. This cannot be undone.`
              : `This refunds ${formatCurrency(refundTarget.amount)} to ${refundTarget.profiles?.full_name || 'the client'}. The platform commission is reversed too. This cannot be undone.`
          }
          confirmText={refunding ? 'Refunding…' : 'Refund'}
          cancelText="Cancel"
          onConfirm={handleRefund}
          onCancel={() => { if (!refunding) setRefundTarget(null); }}
        />
      )}
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
    <div className="flex items-center justify-between px-5 py-4 border-t border-ct-line-soft">
      <p className="text-sm text-ct-mute-2">
        Showing {((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
          className="px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm disabled:opacity-50 hover:bg-ct-surface-2"
        >
          Previous
        </button>
        <span className="text-sm font-medium text-ct-mute-2">Page {page}</span>
        <button
          disabled={page * pageSize >= totalCount}
          onClick={() => setPage(p => p + 1)}
          className="px-3 py-1.5 border border-ct-line rounded-ct-sm text-sm disabled:opacity-50 hover:bg-ct-surface-2"
        >
          Next
        </button>
      </div>
    </div>
  );
}
