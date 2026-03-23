import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wallet,
  DollarSign,
  Clock,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Download,
  ChevronDown,
  Banknote,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getConnectAccountDetails, createConnectOnboardingSession } from '../lib/stripe';
import type { ConnectAccountDetails } from '../lib/stripe';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Payouts() {
  const { session, user } = useAuth();
  const [accountDetails, setAccountDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [totalEarned, setTotalEarned] = useState<{ amount: number; count: number }>({ amount: 0, count: 0 });
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingWarning, setOnboardingWarning] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const fetchEarnings = useCallback(async () => {
    if (!user) return;
    try {
      const [{ data: payData }, { data: invData }] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, jobs!inner(tradie_id)')
          .eq('jobs.tradie_id', user.id)
          .eq('status', 'completed')
          .in('payment_type', ['job_funding', 'price_adjustment']),
        supabase
          .from('recurring_invoices')
          .select('total')
          .eq('tradie_id', user.id)
          .eq('status', 'paid'),
      ]);
      const payRows = payData || [];
      const invRows = invData || [];
      const payTotal = payRows.reduce((s, r) => s + (r.amount || 0), 0);
      const invTotal = invRows.reduce((s, r) => s + Number(r.total || 0) * 100, 0);
      setTotalEarned({ amount: payTotal + invTotal, count: payRows.length + invRows.length });
    } catch (err) {
      console.error('fetchEarnings error:', err);
    }
  }, [user]);

  const fetchOnboardingStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('stripe_connect_onboarding_complete')
      .eq('id', user.id)
      .maybeSingle();
    setOnboardingComplete(data?.stripe_connect_onboarding_complete ?? false);
  }, [user]);

  const isAuthenticated = !!session;
  useEffect(() => {
    if (isAuthenticated) {
      fetchDetails();
      fetchEarnings();
      fetchOnboardingStatus();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const fetchDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const details = await getConnectAccountDetails();
      setAccountDetails(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payout details');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSetup = async () => {
    setConnectLoading(true);
    try {
      await createConnectOnboardingSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start onboarding');
      setConnectLoading(false);
    }
  };

  // Group payouts by month
  const payoutGroups = useMemo(() => {
    const payouts = accountDetails?.payouts || [];
    if (payouts.length === 0) return [];

    const groups: { key: string; label: string; payouts: typeof payouts; total: number }[] = [];
    const monthMap = new Map<string, typeof payouts>();

    for (const p of payouts) {
      const d = new Date(p.created * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      if (!monthMap.has(key)) {
        monthMap.set(key, []);
        groups.push({ key, label, payouts: monthMap.get(key)!, total: 0 });
      }
      monthMap.get(key)!.push(p);
    }

    for (const g of groups) {
      g.total = g.payouts.reduce((s, p) => s + p.amount, 0);
    }

    return groups;
  }, [accountDetails?.payouts]);

  const toggleMonth = (key: string) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // CSV export
  const handleExportCSV = () => {
    const payouts = accountDetails?.payouts || [];
    if (payouts.length === 0) return;

    const rows = [
      ['Date', 'Amount (AUD)', 'Status', 'Arrival Date'],
      ...payouts.map(p => [
        new Date(p.created * 1000).toLocaleDateString('en-AU'),
        (p.amount / 100).toFixed(2),
        p.status,
        new Date(p.arrival_date * 1000).toLocaleDateString('en-AU'),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPayoutCount = accountDetails?.payouts?.length ?? 0;
  const totalPaidOut = useMemo(() => {
    return (accountDetails?.payouts || []).reduce((s, p) => s + p.amount, 0);
  }, [accountDetails?.payouts]);
  const escrowAmount = Math.max(0, (totalEarned.amount) - totalPaidOut - (accountDetails?.balance?.available ?? 0) - (accountDetails?.balance?.pending ?? 0));

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Loading payout details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col items-center justify-center py-24">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-gray-900 font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button
              onClick={fetchDetails}
              className="px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const account = accountDetails?.account;
  const isFullyActive = account?.chargesEnabled && account?.payoutsEnabled && account?.detailsSubmitted;
  const hasRequirements = account && (
    account.requirements.currentlyDue.length > 0 || account.requirements.pastDue.length > 0
  );

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Wallet className="w-5 h-5 text-primary-700" />
              </div>
              <h1 className="text-2xl font-bold text-navy-900">Payouts</h1>
            </div>
            <p className="text-sm text-navy-400 ml-12">
              View your balance, payout history, and manage bank details
            </p>
          </div>
          {accountDetails?.connected && (accountDetails.payouts?.length ?? 0) > 0 && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm font-medium text-navy-700 hover:bg-surface-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>

        {/* Not Connected state */}
        {!accountDetails?.connected && (
          <div className="bg-gradient-to-r from-secondary-50 to-primary-50 rounded-2xl border border-secondary-200 p-8 text-center">
            <div className="w-16 h-16 bg-secondary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-secondary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Payouts</h2>
            <p className="text-gray-600 mb-2 max-w-md mx-auto">
              Connect your bank account to receive payments directly from completed jobs.
            </p>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg mb-6 max-w-md mx-auto text-left">
              <Shield className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 leading-relaxed">
                You'll need your <strong>BSB, account number, and ABN</strong>. Setup takes about 2 minutes. Payments processed securely by Stripe.
              </p>
            </div>
            <button
              onClick={handleConnectSetup}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-60 transition-colors"
            >
              {connectLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Set Up Payouts'
              )}
            </button>
          </div>
        )}

        {/* Connected state */}
        {accountDetails?.connected && (
          <>
            {/* Account Status banner */}
            {isFullyActive ? (
              <div className="bg-gradient-to-r from-green-50 to-secondary-50 rounded-2xl border border-green-200 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Account Active</p>
                    <p className="text-sm text-green-700">Your bank account is connected and ready to receive payouts.</p>
                  </div>
                </div>
              </div>
            ) : hasRequirements ? (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-900">Setup Incomplete</p>
                      <p className="text-sm text-amber-700">
                        We need a few more details (e.g. bank account or identity info) before you can receive payouts.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSetup}
                    disabled={connectLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 disabled:opacity-60 transition-colors text-sm"
                  >
                    {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Setup'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Summary — total earned as headline, 3 simple cards for money flow */}
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-sm text-navy-400">Total earned:</p>
              <p className="text-lg font-bold text-navy-900">{formatCurrency(totalEarned.amount)}</p>
              <p className="text-xs text-navy-300">({totalEarned.count} payments)</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-gray-500">Waiting for Client</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(escrowAmount)}</p>
                <p className="text-xs text-gray-400 mt-1">Held in escrow until client releases</p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-gray-500">On Its Way</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency((accountDetails.balance?.available ?? 0) + (accountDetails.balance?.pending ?? 0))}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {(accountDetails.balance?.available ?? 0) > 0
                    ? `${formatCurrency(accountDetails.balance?.available ?? 0)} ready now`
                    : 'Transferring to your bank (2-3 days)'}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">Paid to Bank</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPaidOut)}</p>
                <p className="text-xs text-gray-400 mt-1">{totalPayoutCount} transfer{totalPayoutCount !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Stripe Connect onboarding warning */}
            {onboardingWarning && onboardingComplete === false && (
              <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-2xl border border-red-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-900">Stripe Connect Setup Required</p>
                      <p className="text-sm text-red-700">
                        You must complete your Stripe Connect setup before you can manage payouts or access your payout dashboard. Please complete onboarding first.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSetup}
                    disabled={connectLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors text-sm"
                  >
                    {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Setup'}
                  </button>
                </div>
              </div>
            )}

            {/* Stripe Dashboard link */}
            {accountDetails.dashboardUrl && (
              <div>
                {onboardingComplete === false ? (
                  <button
                    onClick={() => setOnboardingWarning(true)}
                    className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Bank Details & Payout Schedule
                  </button>
                ) : (
                  <a
                    href={accountDetails.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Bank Details & Payout Schedule
                  </a>
                )}
              </div>
            )}

            {/* Payout History — month-grouped like client page */}
            <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-navy-300" />
                  <h2 className="text-sm font-semibold text-navy-800">Payout History</h2>
                  {totalPayoutCount > 0 && (
                    <span className="text-xs text-navy-300 font-medium">({totalPayoutCount})</span>
                  )}
                </div>
              </div>

              {payoutGroups.length > 0 ? (
                <>
                  {payoutGroups.map((group) => {
                    const isCollapsed = collapsedMonths.has(group.key);
                    return (
                      <div key={group.key}>
                        {/* Month header */}
                        <button
                          onClick={() => toggleMonth(group.key)}
                          className="w-full flex items-center justify-between px-5 py-3 bg-surface-50 border-b border-surface-200 hover:bg-surface-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                            <h3 className="text-sm font-semibold text-navy-800">{group.label}</h3>
                            <span className="text-xs text-navy-300">
                              {group.payouts.length} payout{group.payouts.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-navy-700 tabular-nums">
                            {formatCurrency(group.total)}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <>
                            {/* Desktop rows */}
                            <div className="hidden md:block">
                              <table className="w-full">
                                <tbody className="divide-y divide-surface-100">
                                  {group.payouts.map((payout) => (
                                    <tr key={payout.id} className="hover:bg-surface-50 transition-colors">
                                      <td className="px-5 py-3.5 w-32">
                                        <span className="text-sm text-navy-400">
                                          {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            payout.status === 'paid' ? 'bg-warm-50' :
                                            payout.status === 'in_transit' ? 'bg-accent-50' :
                                            payout.status === 'pending' ? 'bg-accent-50' : 'bg-surface-100'
                                          }`}>
                                            <Banknote className={`w-3.5 h-3.5 ${
                                              payout.status === 'paid' ? 'text-warm-600' :
                                              payout.status === 'in_transit' ? 'text-accent-600' :
                                              payout.status === 'pending' ? 'text-accent-600' : 'text-navy-400'
                                            }`} />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-navy-900">Bank Transfer</p>
                                            <span className="text-xs text-navy-300">
                                              Arrives {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-5 py-3.5 text-right w-28">
                                        <span className="text-sm font-semibold text-navy-900 tabular-nums">
                                          {formatCurrency(payout.amount)}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3.5 text-center w-32">
                                        <PayoutStatusBadge status={payout.status} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile rows */}
                            <div className="md:hidden divide-y divide-surface-100">
                              {group.payouts.map((payout) => (
                                <div key={payout.id} className="flex items-center gap-3 px-5 py-3.5">
                                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    payout.status === 'paid' ? 'bg-warm-50' :
                                    payout.status === 'in_transit' ? 'bg-accent-50' : 'bg-surface-100'
                                  }`}>
                                    <Banknote className={`w-4 h-4 ${
                                      payout.status === 'paid' ? 'text-warm-600' :
                                      payout.status === 'in_transit' ? 'text-accent-600' : 'text-navy-400'
                                    }`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-navy-900">Bank Transfer</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs text-navy-300">
                                        {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                      <span className="text-xs text-navy-200">
                                        → {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(payout.amount)}</p>
                                    <div className="mt-1"><PayoutStatusBadge status={payout.status} /></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-navy-200" />
                  </div>
                  <h3 className="text-lg font-semibold text-navy-800 mb-1">No Payouts Yet</h3>
                  <p className="text-sm text-navy-400 max-w-sm mx-auto">
                    When clients release funds for completed jobs, your payouts will appear here. Payments typically arrive in your bank within 2-3 business days.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    in_transit: 'bg-secondary-100 text-secondary-700',
    canceled: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
  };

  const labels: Record<string, string> = {
    paid: 'Paid',
    pending: 'Pending',
    in_transit: 'On its way',
    canceled: 'Canceled',
    failed: 'Failed',
  };

  const tooltips: Record<string, string> = {
    paid: 'Money has arrived in your bank account',
    pending: 'Payment is being processed',
    in_transit: 'Money is being transferred to your bank — usually 1-2 business days',
    canceled: 'This payout was cancelled',
    failed: 'Payout failed — check your bank details in settings',
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
        styles[status] || 'bg-gray-100 text-gray-300'
      }`}
      title={tooltips[status] || ''}
    >
      {labels[status] || status}
    </span>
  );
}
