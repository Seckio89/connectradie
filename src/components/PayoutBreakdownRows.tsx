import { Clock, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { PayoutSummary } from '../lib/payoutSummary';

// ─────────────────────────────────────────────────────────────────────────────
// "Where your money is" — three plain-language rows.
//
// Shared by the Payouts page and Settings > Payments so the two screens report
// the same money in the same words. They used to disagree completely: Settings
// showed the raw Stripe balance, Payouts showed earnings and payouts, and no
// figure appeared on both.
//
// The rows always sum to summary.earned — see src/lib/payoutSummary.ts.
// ─────────────────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface PayoutBreakdownRowsProps {
  summary: PayoutSummary;
  /** Live auto-release countdown, appended to the awaiting-approval row. */
  autoReleaseLabel?: string;
}

export default function PayoutBreakdownRows({ summary, autoReleaseLabel }: PayoutBreakdownRowsProps) {
  return (
    <div className="space-y-2">
      {/* 🟡 Waiting on the client to approve */}
      <div className="flex items-center gap-3 rounded-ct-md bg-ct-amber/[0.13] border border-ct-amber/[0.34] px-4 py-3">
        <Clock className="w-5 h-5 text-ct-amber flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ct-paper tabular-nums">
            {formatCurrency(summary.awaitingClient)} — Secured, awaiting approval
          </p>
          <p className="text-xs text-ct-amber">
            {summary.awaitingClient === 0
              ? 'Nothing waiting on a client'
              : `Held safely — released to you when your client approves${autoReleaseLabel ? ` · ${autoReleaseLabel}` : ''}`}
          </p>
        </div>
      </div>

      {/* 🔵 On its way to the bank */}
      <div className="flex items-center gap-3 rounded-ct-md bg-ct-surface-2 border border-ct-line px-4 py-3">
        <ExternalLink className="w-5 h-5 text-ct-mute-2 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ct-paper tabular-nums">
            {formatCurrency(summary.transit.amount)} — {summary.transit.title}
          </p>
          <p className="text-xs text-ct-mute-2">{summary.transit.detail}</p>
        </div>
      </div>

      {/* 🟢 Landed */}
      <div className="flex items-center gap-3 rounded-ct-md bg-ct-teal/[0.14] border border-ct-teal/30 px-4 py-3">
        <CheckCircle2 className="w-5 h-5 text-ct-teal flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ct-teal tabular-nums">
            {formatCurrency(summary.received)} — In your account
          </p>
          <p className="text-xs text-ct-teal">
            {summary.received > 0 ? '✓ Received' : 'Payouts land here once they clear'}
          </p>
        </div>
      </div>
    </div>
  );
}
