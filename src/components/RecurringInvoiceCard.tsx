import { proseInputProps } from '../lib/proseInput';
import { useState } from 'react';
import { FileText, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, AlertTriangle, MessageSquare, ArrowUpCircle } from 'lucide-react';

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
  supplies_total?: number;
  total: number;
  status: 'draft' | 'pending_approval' | 'disputed' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'processing';
  payment_method?: 'card' | 'au_becs_debit' | null;
  becs_charge_status?: 'pending' | 'succeeded' | 'failed' | null;
  stripe_payment_intent_id: string | null;
  stripe_payment_url: string | null;
  due_date: string | null;
  paid_at: string | null;
  approval_requested_at?: string | null;
  approved_at?: string | null;
  scheduled_charge_at?: string | null;
  dispute_reason?: string | null;
  disputed_at?: string | null;
  tradie_response?: string | null;
  tradie_responded_at?: string | null;
  escalated_at?: string | null;
  resolved_at?: string | null;
  resolution_note?: string | null;
  created_at: string;
  updated_at: string;
  recurring_job?: {
    trade_category: string;
    service_subtype?: string | null;
    agreed_price: number | null;
    description?: string | null;
    location?: string | null;
  } | null;
  tradie?: {
    full_name: string;
    business_name?: string | null;
  } | null;
}

interface RecurringInvoiceCardProps {
  invoice: RecurringInvoice;
  userRole: 'client' | 'tradie';
  paymentMethod?: 'card' | 'becs';
  onApprove?: (invoiceId: string) => Promise<void>;
  onDecline?: (invoiceId: string, reason: string) => Promise<void>;
  onRespondToDispute?: (invoiceId: string, response: string) => Promise<void>;
  onAcceptResponse?: (invoiceId: string) => Promise<void>;
  onEscalate?: (invoiceId: string) => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ct-surface-2 text-ct-mute-2',
  pending_approval: 'bg-ct-amber/[0.13] text-ct-amber',
  sent: 'bg-ct-amber/[0.13] text-ct-amber',
  paid: 'bg-ct-teal/[0.14] text-ct-teal',
  overdue: 'bg-ct-rose/[0.13] text-ct-rose',
  cancelled: 'bg-ct-surface-2 text-ct-mute-2',
  processing: 'bg-ct-surface-2 text-ct-mute-2',
  disputed: 'bg-ct-rose/[0.13] text-ct-rose',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting your approval',
  sent: 'Awaiting payment',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  processing: 'Processing',
  disputed: 'Disputed',
};

export default function RecurringInvoiceCard({ invoice, userRole, paymentMethod = 'card', onApprove, onDecline, onRespondToDispute, onAcceptResponse, onEscalate }: RecurringInvoiceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [tradieResponseText, setTradieResponseText] = useState('');
  const [responding, setResponding] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const periodStart = new Date(invoice.billing_period_start + 'T00:00:00');
  const periodHeading = periodStart.toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
  });

  const tradeLabel = invoice.recurring_job?.trade_category
    ?.replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase()) ?? 'Service';

  // Pick the most identifying label for this invoice so a client with multiple
  // similar services can tell them apart at a glance. service_subtype is the
  // canonical service name used everywhere else (e.g. "Regular Domestic Clean"
  // in the Ongoing Services list), so prefer it — the description is usually a
  // numbered task list, not a title.
  const jobTitle = (() => {
    const subtype = invoice.recurring_job?.service_subtype?.trim();
    if (subtype) return subtype;
    const desc = invoice.recurring_job?.description?.trim();
    if (desc) {
      // Fallback: first line/sentence, strip any leading numbering, cap length.
      const first = desc.split(/[\n.]/)[0].replace(/^\s*\d+[).\s-]+/, '').trim();
      if (first.length > 0) return first.length > 50 ? first.slice(0, 50) + '…' : first;
    }
    return tradeLabel;
  })();

  // Suburb-only location (strip state/postcode/country tail) so the chip stays compact.
  const suburb = (() => {
    const loc = invoice.recurring_job?.location?.trim();
    if (!loc) return null;
    return loc.split(',')[0].trim() || null;
  })();

  const tradieName = invoice.tradie?.business_name?.trim() || invoice.tradie?.full_name?.trim() || null;

  const agreedPrice = invoice.recurring_job?.agreed_price ?? 0;

  // Scheduled auto-debit: the invoice will be charged automatically after a notice
  // window unless disputed. The client doesn't need to click "Approve & Pay".
  const isScheduledAutoDebit = invoice.status === 'pending_approval' && !!invoice.scheduled_charge_at;
  const scheduledChargeLabel = invoice.scheduled_charge_at
    ? new Date(invoice.scheduled_charge_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const isBecsProcessing = invoice.status === 'processing' && invoice.payment_method === 'au_becs_debit';
  const becsFailed = invoice.becs_charge_status === 'failed';
  const showPayButton =
    userRole === 'client' &&
    (invoice.status === 'sent' || invoice.status === 'overdue') &&
    invoice.stripe_payment_url &&
    !isBecsProcessing;

  return (
    <div className="bg-ct-surface rounded-ct-md shadow-sm border border-ct-line max-w-lg">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-2 mb-3">
          <FileText className="w-4 h-4 text-ct-mute flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ct-paper break-words">
              {jobTitle}
            </p>
            <p className="text-xs text-ct-mute break-words">
              {periodHeading}
              {tradieName && <> · {tradieName}</>}
              {suburb && <> · {suburb}</>}
            </p>
            <span
              className={`inline-block mt-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                isScheduledAutoDebit ? 'bg-ct-surface-2 text-ct-mute-2' : (STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft)
              }`}
            >
              {invoice.status === 'pending_approval' && userRole === 'tradie'
                ? (isScheduledAutoDebit ? 'Scheduled for direct debit' : 'Awaiting client approval')
                : isScheduledAutoDebit
                ? 'Auto-debit scheduled'
                : STATUS_LABELS[invoice.status] ?? invoice.status}
            </span>
          </div>
        </div>

        {/* Line items summary */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-ct-mute-2">
            <span>
              {invoice.regular_sessions_count} session{invoice.regular_sessions_count !== 1 ? 's' : ''} @ ${agreedPrice.toFixed(2)}
            </span>
            <span className="font-medium text-ct-paper">
              ${invoice.subtotal.toFixed(2)}
            </span>
          </div>

          {invoice.extra_sessions_count > 0 && (
            <div className="flex justify-between text-ct-amber">
              <span>
                {invoice.extra_sessions_count} extra session{invoice.extra_sessions_count !== 1 ? 's' : ''}
              </span>
              <span className="font-medium">
                ${invoice.extras_total.toFixed(2)}
              </span>
            </div>
          )}
          {(invoice.supplies_total ?? 0) > 0 && (
            <div className="flex justify-between text-ct-mute-2">
              <span>Supplies & Materials</span>
              <span className="font-medium">${(invoice.supplies_total ?? 0).toFixed(2)}</span>
            </div>
          )}

          <div className="flex justify-between pt-1.5 border-t border-ct-line-soft">
            <span className="font-semibold text-ct-paper">Total</span>
            <span className="text-lg font-bold text-ct-paper">
              ${invoice.total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Due date */}
        {invoice.due_date && invoice.status !== 'paid' && (
          <p className={`text-xs mt-2 ${invoice.status === 'overdue' ? 'text-ct-rose font-medium' : 'text-ct-mute'}`}>
            Due by {new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}

        {invoice.paid_at && (
          <p className="text-xs text-ct-teal mt-2">
            Paid {invoice.payment_method === 'au_becs_debit' ? 'via Direct Debit ' : ''}
            {new Date(invoice.paid_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        )}

        {isBecsProcessing && (
          <p className="text-xs text-ct-mute-2 mt-2">
            Direct debit initiated — processing 3-5 business days
          </p>
        )}

        {becsFailed && invoice.status === 'sent' && (
          <p className="text-xs text-ct-amber mt-2">
            Direct debit was unsuccessful — please pay by card below
          </p>
        )}

        {/* Dispute info panel */}
        {invoice.status === 'disputed' && (
          <div className="mt-3 space-y-2">
            {/* Dispute reason */}
            <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-ct-rose flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ct-paper">Dispute reason</p>
                  <p className="text-xs text-ct-rose mt-0.5">{invoice.dispute_reason}</p>
                  {invoice.disputed_at && (
                    <p className="text-[10px] text-ct-rose mt-1">
                      Disputed {new Date(invoice.disputed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Tradie response (if any) */}
            {invoice.tradie_response && (
              <div className="p-3 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-ct-mute-2 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ct-mute-2">Tradie response</p>
                    <p className="text-xs text-ct-mute-2 mt-0.5">{invoice.tradie_response}</p>
                    {invoice.tradie_responded_at && (
                      <p className="text-[10px] text-ct-mute mt-1">
                        Responded {new Date(invoice.tradie_responded_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tradie: respond to dispute */}
            {userRole === 'tradie' && !invoice.tradie_response && onRespondToDispute && (
              <div className="p-3 bg-ct-amber/[0.13] border border-ct-amber/[0.34] rounded-ct-sm space-y-2">
                <p className="text-xs font-medium text-ct-paper">Respond to this dispute</p>
                <textarea {...proseInputProps}
                  value={tradieResponseText}
                  onChange={e => setTradieResponseText(e.target.value)}
                  placeholder="Explain the charges or propose a resolution..."
                  rows={3}
                  className="w-full px-3 py-2 border border-ct-amber/[0.34] rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-amber focus:border-ct-teal resize-none"
                />
                <button
                  onClick={async () => {
                    if (!tradieResponseText.trim()) return;
                    setResponding(true);
                    try {
                      await onRespondToDispute(invoice.id, tradieResponseText.trim());
                      setTradieResponseText('');
                    } finally {
                      setResponding(false);
                    }
                  }}
                  disabled={!tradieResponseText.trim() || responding}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-teal hover:bg-ct-teal-deep text-ct-ink text-sm font-medium rounded-ct-sm transition-colors disabled:opacity-50"
                >
                  {responding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  Send Response
                </button>
              </div>
            )}

            {/* Client: accept response or escalate */}
            {userRole === 'client' && invoice.tradie_response && !invoice.escalated_at && !invoice.resolved_at && (
              <div className="flex items-center gap-2">
                {onAcceptResponse && (
                  <button
                    onClick={async () => {
                      setAccepting(true);
                      try {
                        await onAcceptResponse(invoice.id);
                      } finally {
                        setAccepting(false);
                      }
                    }}
                    disabled={accepting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-teal hover:brightness-110 text-ct-ink text-sm font-medium rounded-ct-sm transition-colors disabled:opacity-50"
                  >
                    {accepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Accept & Approve
                  </button>
                )}
                {onEscalate && (
                  <button
                    onClick={async () => {
                      setEscalating(true);
                      try {
                        await onEscalate(invoice.id);
                      } finally {
                        setEscalating(false);
                      }
                    }}
                    disabled={escalating}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ct-rose hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors disabled:opacity-50"
                  >
                    {escalating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                    Escalate to Admin
                  </button>
                )}
              </div>
            )}

            {/* Escalated notice */}
            {invoice.escalated_at && !invoice.resolved_at && (
              <p className="text-xs text-ct-amber font-medium">
                Escalated to admin — awaiting review
              </p>
            )}

            {/* Resolved notice */}
            {invoice.resolved_at && (
              <div className="p-2 bg-ct-surface-2 border border-ct-line rounded-ct-sm">
                <p className="text-xs text-ct-mute-2">
                  <span className="font-medium">Resolved</span>
                  {invoice.resolution_note && <> — {invoice.resolution_note}</>}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Approval actions for pending_approval invoices */}
        {invoice.status === 'pending_approval' && userRole === 'client' && onApprove && (
          <div className={`mt-3 p-3 border rounded-ct-sm ${isScheduledAutoDebit ? 'bg-ct-surface-2 border-ct-line' : 'bg-ct-amber/[0.13] border-ct-amber/[0.34]'}`}>
            <p className={`text-xs font-medium mb-2 ${isScheduledAutoDebit ? 'text-ct-mute-2' : 'text-ct-paper'}`}>
              {isScheduledAutoDebit
                ? `Scheduled for direct debit on ${scheduledChargeLabel}. No action needed — your linked bank account will be charged automatically. If anything looks wrong, dispute it before then, or pay now.`
                : 'Please review and approve this invoice to proceed with payment.'}
            </p>

            {/* Dispute confirmation dialog */}
            {showDisputeDialog ? (
              <div className="space-y-3">
                <div className="p-3 bg-ct-rose/[0.13] border border-ct-rose/[0.34] rounded-ct-sm">
                  <p className="text-sm font-semibold text-ct-paper mb-1">Dispute this invoice?</p>
                  <p className="text-xs text-ct-rose mb-3">
                    The tradie will be notified and the invoice will be cancelled. Please provide a reason.
                  </p>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {['Incorrect amount', 'Service not completed', 'Wrong number of sessions', 'Quality issue', 'Other'].map(reason => (
                        <button
                          key={reason}
                          onClick={() => setDisputeReason(reason)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            disputeReason === reason
                              ? 'bg-ct-rose/[0.13] border-ct-rose/40 text-ct-paper'
                              : 'bg-ct-surface border-ct-rose/[0.34] text-ct-rose hover:bg-ct-rose/[0.13]'
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    {disputeReason === 'Other' && (
                      <input
                        type="text"
                        placeholder="Describe the issue..."
                        value={disputeReason === 'Other' ? '' : disputeReason}
                        onChange={e => setDisputeReason(e.target.value || 'Other')}
                        className="w-full px-3 py-2 border border-ct-rose/[0.34] rounded-ct-sm text-sm focus:ring-2 focus:ring-ct-rose focus:border-ct-teal"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!disputeReason) return;
                      setDeclining(true);
                      await onDecline?.(invoice.id, disputeReason);
                      setDeclining(false);
                      setShowDisputeDialog(false);
                      setDisputeReason('');
                    }}
                    disabled={!disputeReason || declining}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-rose/[0.13] hover:bg-ct-rose hover:text-ct-ink text-ct-rose text-sm font-medium rounded-ct-sm transition-colors disabled:opacity-50"
                  >
                    {declining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Confirm Dispute
                  </button>
                  <button
                    onClick={() => { setShowDisputeDialog(false); setDisputeReason(''); }}
                    disabled={declining}
                    className="px-3 py-2 text-sm font-medium text-ct-mute-2 hover:text-ct-paper transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : showApproveConfirm ? (
              <div className="space-y-2">
                <div className="p-3 bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm">
                  <p className="text-sm font-semibold text-ct-teal mb-1">Confirm payment</p>
                  <p className="text-xs text-ct-teal">
                    You're approving <span className="font-semibold">${invoice.total.toFixed(2)}</span> for {tradeLabel}.{' '}
                    {paymentMethod === 'becs'
                      ? 'This will be charged to your linked bank account via Direct Debit.'
                      : 'You\'ll be directed to complete payment by card.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => { setApproving(true); try { await onApprove(invoice.id); setShowApproveConfirm(false); } finally { setApproving(false); } }}
                    disabled={approving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-ct-teal hover:brightness-110 text-ct-ink text-sm font-medium rounded-ct-sm transition-colors disabled:opacity-50"
                  >
                    {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {paymentMethod === 'becs' ? 'Confirm & Charge' : 'Confirm & Pay'}
                  </button>
                  <button
                    onClick={() => setShowApproveConfirm(false)}
                    disabled={approving}
                    className="px-3 py-2 text-sm font-medium text-ct-mute-2 hover:text-ct-paper transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowApproveConfirm(true)}
                  disabled={approving}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-ct-ink text-sm font-medium rounded-ct-sm transition-colors disabled:opacity-50 ${
                    isScheduledAutoDebit ? 'bg-ct-surface-2 hover:bg-ct-surface-2' : 'bg-ct-teal hover:brightness-110'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isScheduledAutoDebit ? 'Pay now' : 'Approve & Pay'}
                </button>
                {onDecline && (
                  <button
                    onClick={() => setShowDisputeDialog(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-ct-mute-2 hover:text-ct-rose hover:bg-ct-rose/[0.13] rounded-ct-sm transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Dispute
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          {showPayButton && (
            <a
              href={invoice.stripe_payment_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-ct-teal hover:brightness-110 text-ct-ink px-4 py-2 rounded-ct-sm text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Pay Now
            </a>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1 text-xs text-ct-mute hover:text-ct-mute-2 transition-colors"
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
        <div className="px-4 pb-4 pt-0 border-t border-ct-line-soft mt-1">
          <div className="pt-3 space-y-2 text-xs text-ct-mute-2">
            <div className="flex justify-between">
              <span>Billing period</span>
              <span className="text-ct-paper">
                {new Date(invoice.billing_period_start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                {' — '}
                {new Date(invoice.billing_period_end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Regular sessions</span>
              <span className="text-ct-paper">{invoice.regular_sessions_count}</span>
            </div>
            {invoice.extra_sessions_count > 0 && (
              <div className="flex justify-between text-ct-amber">
                <span>Extra sessions</span>
                <span>{invoice.extra_sessions_count}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="text-ct-paper">${invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.extras_total > 0 && (
              <div className="flex justify-between text-ct-amber">
                <span>Extras total</span>
                <span>${invoice.extras_total.toFixed(2)}</span>
              </div>
            )}
            {(invoice.supplies_total ?? 0) > 0 && (
              <div className="flex justify-between text-ct-mute-2">
                <span>Supplies</span>
                <span>${(invoice.supplies_total ?? 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-medium text-ct-paper pt-1 border-t border-ct-line-soft">
              <span>Total</span>
              <span>${invoice.total.toFixed(2)}</span>
            </div>
            {invoice.stripe_payment_intent_id && (
              <div className="flex justify-between">
                <span>Payment ref</span>
                <span className="text-ct-mute font-mono text-[10px]">
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
