import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  DollarSign,
  Clock,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Shield,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getConnectAccountDetails, createConnectOnboardingSession } from '../lib/stripe';
import type { ConnectAccountDetails } from '../lib/stripe';

interface EarningsPeriod {
  label: string;
  amount: number;
  count: number;
}

export default function Payouts() {
  const { session, user } = useAuth();
  const [accountDetails, setAccountDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [earnings, setEarnings] = useState<EarningsPeriod[]>([]);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingWarning, setOnboardingWarning] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      const periods = [
        { label: 'This Month', start: new Date(now.getFullYear(), now.getMonth(), 1) },
        { label: 'Last Month', start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1) },
        { label: 'Last 90 Days', start: new Date(now.getTime() - 90 * 86400000) },
        { label: 'All Time', start: new Date(0) },
      ];

      const results: EarningsPeriod[] = [];
      for (const period of periods) {
        let query = supabase
          .from('payments')
          .select('amount')
          .eq('profile_id', user.id)
          .eq('status', 'completed')
          .gte('created_at', period.start.toISOString());

        if (period.end) {
          query = query.lt('created_at', period.end.toISOString());
        }

        const { data } = await query;
        const rows = data || [];
        results.push({
          label: period.label,
          amount: rows.reduce((s, r) => s + (r.amount || 0), 0),
          count: rows.length,
        });
      }
      setEarnings(results);
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

  useEffect(() => {
    if (session) {
      fetchDetails();
      fetchEarnings();
      fetchOnboardingStatus();
    } else {
      setLoading(false);
    }
  }, [session, fetchEarnings, fetchOnboardingStatus]);

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
      <div className="max-w-[1600px] mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-secondary-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-secondary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
              <p className="text-gray-500 text-sm">
                View your balance, payout history, and manage bank details
              </p>
            </div>
          </div>
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
              <div className="bg-gradient-to-r from-green-50 to-secondary-50 rounded-2xl border border-green-200 p-5 mb-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Account Active</p>
                    <p className="text-sm text-green-700">Your bank account is connected and ready to receive payouts.</p>
                  </div>
                </div>
              </div>
            ) : hasRequirements ? (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-5 mb-6">
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

            {/* Balance cards */}
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-green-50 to-secondary-50 rounded-2xl border border-green-200 p-5 hover:shadow-lg transition-all duration-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <p className="text-sm font-medium text-green-700 mb-1">Available Balance</p>
                <p className="text-3xl font-bold text-green-900">
                  ${((accountDetails.balance?.available ?? 0) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">AUD — ready for payout</p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-5 hover:shadow-lg transition-all duration-200">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
                <p className="text-sm font-medium text-amber-700 mb-1">Pending Balance</p>
                <p className="text-3xl font-bold text-amber-900">
                  ${((accountDetails.balance?.pending ?? 0) / 100).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">AUD — in transit to your balance</p>
              </div>
            </div>

            {/* Stripe Connect onboarding warning */}
            {onboardingWarning && onboardingComplete === false && (
              <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-2xl border border-red-200 p-5 mb-6">
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
              <div className="mb-6">
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

            {/* Earnings Breakdown */}
            {earnings.length > 0 && (
              <section className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-secondary-600" />
                  Earnings Breakdown
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {earnings.map(period => (
                    <div key={period.label} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <p className="text-xs font-medium text-gray-500">{period.label}</p>
                      </div>
                      <p className="text-xl font-bold text-gray-900">
                        ${(period.amount / 100).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {period.count} {period.count === 1 ? 'payment' : 'payments'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Payout History */}
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payout History</h2>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {accountDetails.payouts && accountDetails.payouts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                            Date
                          </th>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                            Amount
                          </th>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                            Status
                          </th>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                            Arrival Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {accountDetails.payouts.map((payout) => (
                          <tr key={payout.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {new Date(payout.created * 1000).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                              ${(payout.amount / 100).toFixed(2)} AUD
                            </td>
                            <td className="px-6 py-4">
                              <PayoutStatusBadge status={payout.status} />
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(payout.arrival_date * 1000).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={Wallet}
                    title="No Payouts Yet"
                    description="When you complete jobs and get paid, your payout history will appear here. Payments typically arrive in your bank within 2-3 business days."
                    compact
                  />
                )}
              </div>
            </section>
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
