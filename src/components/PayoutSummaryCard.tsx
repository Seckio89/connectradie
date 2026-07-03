import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, ArrowRight, Loader2 } from 'lucide-react';
import { getConnectAccountDetails, type ConnectAccountDetails } from '../lib/stripe';

const fmtAud = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDay = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  in_transit: 'bg-secondary-100 text-secondary-700',
  pending: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
};

/**
 * Compact payout summary for the tradie dashboard: the upcoming payout (or the
 * available balance heading to the bank) plus the last few payouts. Renders
 * nothing until we know the tradie has a connected payout account, so it never
 * clutters the dashboard for non-connected users.
 */
export default function PayoutSummaryCard() {
  const [details, setDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getConnectAccountDetails()
      .then((d) => { if (!cancelled) setDetails(d); })
      .catch(() => { /* dashboard widget stays silent on failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
      </div>
    );
  }

  // Only show for connected accounts.
  if (!details?.connected) return null;

  const last4 = details.bankAccount?.last4;
  const payouts = details.payouts ?? [];
  const upcoming = payouts.find((p) => p.status === 'pending' || p.status === 'in_transit');
  const recent = payouts.slice(0, 4);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5" /> Payouts
        </p>
        <Link to="/payouts" className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Next payout, or available balance heading to the bank */}
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 mb-3">
        {upcoming ? (
          <p className="text-sm text-gray-800">
            <span className="font-semibold">Next payout: {fmtAud(upcoming.amount)}</span>
            {last4 && <span className="text-gray-500"> → •••• {last4}</span>}
            <span className="text-gray-500"> on {fmtDay(upcoming.arrival_date)}</span>
          </p>
        ) : (
          <p className="text-sm text-gray-800">
            <span className="font-semibold">{fmtAud(details.balance?.available ?? 0)} available</span>
            {last4 && <span className="text-gray-500"> → •••• {last4}</span>}
          </p>
        )}
      </div>

      {/* Recent payout history */}
      {recent.length > 0 ? (
        <div className="space-y-1.5">
          {recent.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-500">{fmtDay(p.arrival_date)}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-gray-900 tabular-nums">{fmtAud(p.amount)}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {p.status.replace('_', ' ')}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No payouts yet — they’ll appear here once you’re paid for completed jobs.</p>
      )}
    </div>
  );
}
