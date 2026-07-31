import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, ArrowRight, Loader2 } from 'lucide-react';
import { getConnectAccountDetails, type ConnectAccountDetails } from '../lib/stripe';

const fmtAud = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDay = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

const STATUS_STYLE: Record<string, string> = {
  paid: 'bg-ct-teal/[0.14] text-ct-teal',
  in_transit: 'bg-ct-surface-2 text-ct-mute-2',
  pending: 'bg-ct-amber/[0.13] text-ct-amber',
  failed: 'bg-ct-rose/[0.13] text-ct-rose',
  canceled: 'bg-ct-surface-2 text-ct-mute-2',
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
      <div className="bg-ct-surface rounded-ct-lg border border-ct-line shadow-sm p-5 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-ct-mute animate-spin" />
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
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-medium text-ct-mute uppercase tracking-wide flex items-center gap-1.5">
          <Banknote className="w-3.5 h-3.5" /> Payouts
        </p>
        <Link to="/payouts" className="inline-flex items-center gap-1 text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2">
          View all <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Next payout, or available balance heading to the bank.
          mute-2, not mute: this panel is a teal tint, where --mute measures
          3.95:1 and fails AA. See the tinted-fill table in CLAUDE.md. */}
      <div className="rounded-ct-sm bg-ct-teal/[0.14] border border-ct-teal/30 p-3 mb-3">
        {upcoming ? (
          <p className="text-sm text-ct-paper">
            <span className="font-semibold">Next payout: {fmtAud(upcoming.amount)}</span>
            {last4 && <span className="text-ct-mute-2"> → •••• {last4}</span>}
            <span className="text-ct-mute-2"> on {fmtDay(upcoming.arrival_date)}</span>
          </p>
        ) : (
          <p className="text-sm text-ct-paper">
            <span className="font-semibold">{fmtAud(details.balance?.available ?? 0)} available</span>
            {last4 && <span className="text-ct-mute-2"> → •••• {last4}</span>}
          </p>
        )}
      </div>

      {/* Recent payout history */}
      {recent.length > 0 ? (
        <div className="space-y-1.5">
          {recent.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ct-mute">{fmtDay(p.arrival_date)}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-ct-paper tabular-nums">{fmtAud(p.amount)}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_STYLE[p.status] ?? 'bg-ct-surface-2 text-ct-mute-2'}`}>
                  {p.status.replace('_', ' ')}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ct-mute">No payouts yet — they’ll appear here once you’re paid for completed jobs.</p>
      )}
    </div>
  );
}
