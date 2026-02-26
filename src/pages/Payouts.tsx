import { useState, useEffect } from 'react';
import {
  Wallet,
  DollarSign,
  Clock,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import EmptyState from '../components/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import { getConnectAccountDetails, createConnectOnboardingSession } from '../lib/stripe';
import type { ConnectAccountDetails } from '../lib/stripe';

export default function Payouts() {
  const { session } = useAuth();
  const [accountDetails, setAccountDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => {
    if (session) {
      fetchDetails();
    } else {
      setLoading(false);
    }
  }, [session]);

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
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-sky-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Loading payout details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center py-24">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-gray-900 font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-600 text-sm mb-6">{error}</p>
            <button
              onClick={fetchDetails}
              className="px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors"
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
      <div className="max-w-7xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Payouts</h1>
              <p className="text-gray-600 text-sm">
                View your balance, payout history, and manage bank details
              </p>
            </div>
          </div>
        </div>

        {/* Not Connected state */}
        {!accountDetails?.connected && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-8 text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Payouts</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Connect your bank account via Stripe to receive payments directly from completed jobs.
            </p>
            <button
              onClick={handleConnectSetup}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-60 transition-colors"
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
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-5 mb-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Account Active</p>
                    <p className="text-sm text-green-700">Your Stripe account is fully set up and ready to receive payouts.</p>
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
                        Additional information is needed before you can receive payouts.
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
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-5 hover:shadow-lg transition-all duration-200">
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

            {/* Stripe Dashboard link */}
            {accountDetails.dashboardUrl && (
              <div className="mb-6">
                <a
                  href={accountDetails.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Manage Bank Details & Payout Schedule
                </a>
              </div>
            )}

            {/* Payout History */}
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-4">Payout History</h2>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {accountDetails.payouts && accountDetails.payouts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
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
                      <tbody className="divide-y divide-gray-100">
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
                            <td className="px-6 py-4 text-sm text-gray-600">
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
                    description="Once you receive payments from completed jobs, your payout history will appear here."
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
    in_transit: 'bg-blue-100 text-blue-700',
    canceled: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
  };

  const labels: Record<string, string> = {
    paid: 'Paid',
    pending: 'Pending',
    in_transit: 'In Transit',
    canceled: 'Canceled',
    failed: 'Failed',
  };

  return (
    <span
      className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
        styles[status] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
