import { useState } from 'react';
import { FileText, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

export interface RecurringInvoice {
  id: string;
  recurring_job_id: string;
  homeowner_id: string;
  tradie_id: string;
  billing_period_start: string;
  billing_period_end: string;
  regular_sessions_count: number;
  extra_sessions_count: number;
  subtotal: number;
  extras_total: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  stripe_payment_intent_id: string | null;
  stripe_payment_url: string | null;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  recurring_job?: {
    trade_category: string;
    agreed_price: number | null;
  } | null;
}

interface RecurringInvoiceCardProps {
  invoice: RecurringInvoice;
  userRole: 'client' | 'tradie';
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Awaiting Payment',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export default function RecurringInvoiceCard({ invoice, userRole }: RecurringInvoiceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const periodStart = new Date(invoice.billing_period_start + 'T00:00:00');
  const periodHeading = periodStart.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  const tradeLabel = invoice.recurring_job?.trade_category
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Service';

  const agreedPrice = invoice.recurring_job?.agreed_price ?? 0;
  const showPayButton =
    userRole === 'client' &&
    (invoice.status === 'sent' || invoice.status === 'overdue') &&
    invoice.stripe_payment_url;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-lg">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {periodHeading}
              </p>
              <p className="text-xs text-gray-500 truncate">{tradeLabel}</p>
            </div>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft}`}
          >
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </span>
        </div>

        {/* Line items summary */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>
              {invoice.regular_sessions_count} session{invoice.regular_sessions_count !== 1 ? 's' : ''} @ ${agreedPrice.toFixed(2)}
            </span>
            <span className="font-medium text-gray-900">
              ${invoice.subtotal.toFixed(2)}
            </span>
          </div>

          {invoice.extra_sessions_count > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>
                {invoice.extra_sessions_count} extra session{invoice.extra_sessions_count !== 1 ? 's' : ''}
              </span>
              <span className="font-medium">
                ${invoice.extras_total.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between pt-1.5 border-t border-gray-100">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">
              ${invoice.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Due date */}
        {invoice.due_date && invoice.status !== 'paid' && (
          <p className={`text-xs mt-2 ${invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            Due by {new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}

        {invoice.paid_at && (
          <p className="text-xs text-emerald-600 mt-2">
            Paid {new Date(invoice.paid_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {showPayButton && (
            <a
              href={invoice.stripe_payment_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Pay Now
            </a>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                Hide details
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                View details
              </>
            )}
          </button>
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-gray-100 mt-1">
          <div className="pt-3 space-y-2 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Billing period</span>
              <span className="text-gray-900">
                {new Date(invoice.billing_period_start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                {' — '}
                {new Date(invoice.billing_period_end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Regular sessions</span>
              <span className="text-gray-900">{invoice.regular_sessions_count}</span>
            </div>
            {invoice.extra_sessions_count > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Extra sessions</span>
                <span>{invoice.extra_sessions_count}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="text-gray-900">${invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.extras_total > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Extras total</span>
                <span>${invoice.extras_total.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>${invoice.total.toFixed(2)}</span>
            </div>
            {invoice.stripe_payment_intent_id && (
              <div className="flex justify-between">
                <span>Payment ref</span>
                <span className="text-gray-400 font-mono text-[10px]">
                  {invoice.stripe_payment_intent_id.slice(0, 20)}…
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
