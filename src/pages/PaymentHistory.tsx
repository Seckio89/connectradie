import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  DollarSign,
  Download,
  Filter,
  Loader2,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  FileText,
  Wallet,
  Star,
  Gift,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { friendlyError } from '../lib/utils';
import { ListSkeleton } from '../components/SkeletonLoader';
import { releaseEscrow, processRefund, createJobPaymentCheckout, verifyPayment, payPriceIncrease, requestPriceReduction } from '../lib/stripePayments';
import { callEdgeFunction } from '../lib/edgeFn';
import DashboardLayout from '../components/DashboardLayout';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import RecurringInvoiceCard, { type RecurringInvoice } from '../components/RecurringInvoiceCard';

interface PaymentRow {
  id: string;
  profile_id: string;
  job_id: string | null;
  payment_type: string;
  amount: number;
  processing_fee: number | null;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
  invoice_number: number | null;
  invoice_ref: string | null;
  jobs: { description: string } | null;
}

/** Use pre-formatted invoice_ref from payments table, falling back to UUID-based format */
function fmtInvoiceRef(ref: string | null | undefined, paymentId?: string): string {
  return ref || (paymentId ? 'INV-' + paymentId.slice(0, 8).toUpperCase() : '');
}

type StatusFilter = 'all' | 'pending' | 'completed' | 'refunded' | 'failed';

const PAGE_SIZE = 20;

/**
 * Reconcile sent invoices — when the client returns from Stripe checkout with
 * invoice_paid=true, verify their checkout session and mark as paid.
 */
async function reconcileSentInvoices(userId: string) {
  try {
    const { data: sentInvoices } = await supabase
      .from('recurring_invoices')
      .select('id, stripe_checkout_session_id')
      .eq('homeowner_id', userId)
      .eq('status', 'sent')
      .not('stripe_checkout_session_id', 'is', null);

    if (!sentInvoices || sentInvoices.length === 0) return;

    // Call verify-payment for each sent invoice's checkout session
    for (const inv of sentInvoices) {
      try {
        const result = await callEdgeFunction<{ paid: boolean }>('verify-payment', {
          checkoutSessionId: inv.stripe_checkout_session_id,
          invoiceId: inv.id,
          type: 'recurring_invoice',
        });
        if (result.paid) {
          console.info(`Invoice ${inv.id} reconciled as paid`);
        }
      } catch {
        // Non-critical — webhook should handle this eventually
      }
    }
  } catch {
    // Non-critical
  }
}

export default function PaymentHistory() {
  const { user, profile } = useAuth();
  const { toast, showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const isTradie = profile?.role === 'tradie';
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const friendlyReleaseError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('insufficient') || msg.includes('Insufficient')) {
      return 'Payment is being processed. Please try again in a few minutes.';
    }
    if (msg.includes('pending') && msg.includes('increase')) {
      return 'A price adjustment needs to be paid before this payment can be released.';
    }
    return 'Unable to release payment. Please try again later.';
  };

  const handleInlineRelease = async (e: React.MouseEvent, paymentId: string, tradieName?: string, jobId?: string) => {
    e.stopPropagation();
    setReleasingId(paymentId);
    try {
      await releaseEscrow(paymentId);
      showToast(`Payment released to ${tradieName || 'your tradie'}!`);
      fetchPayments();
      fetchSummary();
      // Navigate to review page so client can leave a review
      if (jobId) {
        navigate(`/review/${jobId}`);
      }
    } catch (err) {
      showToast(friendlyReleaseError(err), true);
    } finally {
      setReleasingId(null);
    }
  };

  // Recurring invoices (clients only)
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoice[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);

  const fetchRecurringInvoices = useCallback(async () => {
    if (!user || isTradie) return;
    setRecurringLoading(true);
    try {
      // Outstanding first
      const { data: outstanding } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price, description, location), tradie:profiles!recurring_invoices_tradie_id_fkey(full_name, business_name)')
        .eq('homeowner_id', user.id)
        .in('status', ['sent', 'overdue', 'draft'])
        .order('created_at', { ascending: false });

      // Then paid/cancelled
      const { data: completed } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price, description, location), tradie:profiles!recurring_invoices_tradie_id_fkey(full_name, business_name)')
        .eq('homeowner_id', user.id)
        .in('status', ['paid', 'cancelled'])
        .order('paid_at', { ascending: false });

      setRecurringInvoices([
        ...((outstanding as unknown as RecurringInvoice[]) || []),
        ...((completed as unknown as RecurringInvoice[]) || []),
      ]);
    } catch (err) {
      console.error('fetchRecurringInvoices error:', err);
    }
    setRecurringLoading(false);
  }, [user, isTradie]);

  useEffect(() => {
    if (user && !isTradie) fetchRecurringInvoices();
  }, [user, isTradie, fetchRecurringInvoices]);

  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const paymentId = searchParams.get('payment_id');
    const invoicePaid = searchParams.get('invoice_paid');
    const invoiceCancelled = searchParams.get('invoice_cancelled');

    if (invoicePaid === 'true') {
      showToast('Invoice payment completed successfully!');
      // Reconcile any sent invoices that may have been paid (fallback if webhook is delayed)
      if (user) reconcileSentInvoices(user.id).then(() => fetchRecurringInvoices());
      setSearchParams({}, { replace: true });
    } else if (invoiceCancelled === 'true') {
      showToast('Invoice payment was cancelled.', true);
      setSearchParams({}, { replace: true });
    } else if (paymentStatus === 'success' && paymentId) {
      // Verify the payment via Stripe (fallback in case webhook failed)
      verifyPayment(paymentId)
        .then((result) => {
          if (result.verified_via === 'fallback') {
            showToast('Payment confirmed and verified successfully!');
          } else {
            showToast('Payment completed successfully!');
          }
          // Re-fetch to get updated status
          fetchPayments();
          fetchSummary();
        })
        .catch((err) => {
          console.error('Payment verification failed:', err);
          showToast('Payment may have been processed. Please refresh if status has not updated.', true);
        });
    } else if (paymentStatus === 'success') {
      showToast('Payment completed successfully!');
    } else if (paymentStatus === 'cancelled') {
      showToast('Payment was cancelled.', true);
    }
  }, []);

  // Auto-verify any pending payments that have a Stripe checkout session.
  // Only triggers if the user is returning from a Stripe checkout (URL has ?payment=success
  // or ?invoice_paid=true) — otherwise we'd needlessly hammer verify-payment on every mount,
  // each call refreshes the auth token and cascades into UI re-renders.
  useEffect(() => {
    if (!user || isTradie) return;
    const isReturnFromStripe =
      searchParams.get('payment') === 'success' ||
      searchParams.get('invoice_paid') === 'true';
    if (!isReturnFromStripe) return;

    (async () => {
      try {
        const { data: pendingPayments } = await supabase
          .from('payments')
          .select('id, status, stripe_checkout_session_id')
          .eq('profile_id', user.id)
          .eq('status', 'pending')
          .not('stripe_checkout_session_id', 'is', null)
          .limit(5); // cap to avoid token-refresh storms when many pending rows exist

        if (pendingPayments && pendingPayments.length > 0) {
          let anyUpdated = false;
          for (const p of pendingPayments) {
            try {
              const result = await verifyPayment(p.id);
              if (result.status === 'completed') {
                anyUpdated = true;
              }
            } catch {
              // Verification failed for this payment — continue with others
            }
          }
          if (anyUpdated) {
            fetchPayments();
            fetchSummary();
          }
        }
      } catch {
        // Non-critical — don't block page load
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isTradie]);

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    // Only show the skeleton on the first load — subsequent refetches keep the existing
    // table visible to avoid flickering when auth refreshes or auto-verify triggers a refetch.
    if (!hasLoadedOnceRef.current) setLoading(true);

    try {
      let query = supabase
        .from('payments')
        .select('*, jobs:jobs!payments_job_id_fkey(description)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (!isTradie) {
        query = query.eq('profile_id', user.id);
      }

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
      if (dateTo) query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
      if (typeFilter !== '') query = query.eq('payment_type', typeFilter);

      const { data, count } = await query;
      const jobPayments = (data as unknown as PaymentRow[]) || [];

      // Merge recurring invoice payments into the timeline (client only)
      let merged = jobPayments;
      let extraCount = 0;
      if (!isTradie && user) {
        try {
          let invQuery = supabase
            .from('recurring_invoices')
            .select('id, total, status, created_at, paid_at, billing_period_start, billing_period_end, regular_sessions_count, extras_total, supplies_total, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price)')
            .eq('homeowner_id', user.id)
            .in('status', ['paid', 'sent', 'overdue']);

          if (statusFilter !== 'all') {
            const mapped = statusFilter === 'completed' ? 'paid' : statusFilter;
            invQuery = invQuery.eq('status', mapped);
          }
          if (dateFrom) invQuery = invQuery.gte('created_at', new Date(dateFrom).toISOString());
          if (dateTo) invQuery = invQuery.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());

          // Skip if filtering by a job-only type
          const skipInvoices = typeFilter !== '' && typeFilter !== 'service_invoice';

          if (!skipInvoices) {
            const { data: invData } = await invQuery;
            const invoiceRows: PaymentRow[] = (invData || []).map((inv: Record<string, unknown>) => {
              const job = inv.recurring_job as { trade_category?: string; service_subtype?: string | null } | null;
              const label = (job?.service_subtype || job?.trade_category || 'Service')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              const sessions = inv.regular_sessions_count as number || 0;
              const period = `${new Date((inv.billing_period_start as string) + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${new Date((inv.billing_period_end as string) + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;

              return {
                id: `inv_${inv.id}`,
                profile_id: user.id,
                job_id: null,
                payment_type: 'service_invoice',
                amount: Math.round(Number(inv.total) * 100),
                processing_fee: null,
                currency: 'aud',
                status: inv.status === 'paid' ? 'completed' : 'pending',
                stripe_payment_intent_id: null,
                stripe_checkout_session_id: null,
                metadata: null,
                created_at: (inv.paid_at || inv.created_at) as string,
                completed_at: (inv.paid_at as string) || null,
                invoice_number: null,
                invoice_ref: null,
                jobs: { description: `[${label}] Service Invoice — ${sessions} session${sessions !== 1 ? 's' : ''} (${period})` },
              };
            });
            extraCount = invoiceRows.length;
            merged = [...jobPayments, ...invoiceRows].sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
          }
        } catch { /* ignore */ }
      }

      setPayments(merged);
      setTotalCount((count || 0) + extraCount);
    } catch (err) {
      console.error('fetchPayments error:', err);
    }
    setLoading(false);
    hasLoadedOnceRef.current = true;
  }, [user, isTradie, page, statusFilter, dateFrom, dateTo, typeFilter]);

  useEffect(() => {
    if (user) fetchPayments();
  }, [user, fetchPayments]);

  const [summaryStats, setSummaryStats] = useState({ totalAmount: 0, pendingAmount: 0, completedCount: 0, refundedAmount: 0 });

  const fetchSummary = useCallback(async () => {
    if (!user) return;

    try {
      let query = supabase.from('payments').select('amount, status');

      if (!isTradie) {
        query = query.eq('profile_id', user.id);
      }

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
      if (dateTo) query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
      if (typeFilter !== '') query = query.eq('payment_type', typeFilter);

      const { data } = await query;
      const rows = data || [];

      let recurringPaidTotal = 0;
      let recurringPaidCount = 0;
      let recurringPendingTotal = 0;
      // Include recurring invoice totals in summary
      if (!isTradie && user) {
        try {
          const { data: paidInv } = await supabase
            .from('recurring_invoices')
            .select('total, status')
            .eq('homeowner_id', user.id);
          for (const inv of (paidInv || [])) {
            const amount = Number(inv.total) * 100; // convert to cents
            if (inv.status === 'paid') {
              recurringPaidTotal += amount;
              recurringPaidCount++;
            } else if (inv.status === 'sent' || inv.status === 'overdue') {
              recurringPendingTotal += amount;
            }
          }
        } catch { /* ignore */ }
      }

      setSummaryStats({
        totalAmount: rows.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0) + recurringPaidTotal,
        pendingAmount: rows.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0) + recurringPendingTotal,
        completedCount: rows.filter(p => p.status === 'completed').length + recurringPaidCount,
        refundedAmount: rows.filter(p => p.status === 'refunded').reduce((s, p) => s + p.amount, 0),
      });
    } catch (err) {
      console.error('fetchSummary error:', err);
    }
  }, [user, isTradie, statusFilter, dateFrom, dateTo, typeFilter]);

  useEffect(() => {
    if (user) fetchSummary();
  }, [user, fetchSummary]);

  const { totalAmount, pendingAmount, completedCount, refundedAmount } = summaryStats;

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; dot: string; label: string }> = {
      pending:   { bg: 'bg-accent-50 text-accent-700 border border-accent-200', dot: 'bg-accent-400', label: 'Pending' },
      completed: { bg: 'bg-amber-50 text-amber-700 border border-amber-200', dot: 'bg-amber-500', label: 'Completed' },
      released:  { bg: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-500', label: 'Released' },
      refunded:  { bg: 'bg-secondary-50 text-secondary-700 border border-secondary-200', dot: 'bg-secondary-500', label: 'Refunded' },
      failed:    { bg: 'bg-red-50 text-red-700 border border-red-200', dot: 'bg-red-400', label: 'Failed' },
    };
    const cfg = map[status] || { bg: 'bg-navy-50 text-navy-600 border border-navy-200', dot: 'bg-navy-400', label: status };
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cfg.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  };

  const cleanDescription = (desc: string) => desc.replace(/^\[[^\]]+\]\s*/, '');
  const getCategory = (desc: string) => desc.match(/^\[([^\]]+)\]/)?.[1] || null;

  const handleExportCSV = () => {
    if (payments.length === 0) { showToast('No payments to export', true); return; }
    const header = 'Date,Description,Amount,Processing Fee,Status,Currency\n';
    const rows = payments.map(p =>
      `"${formatDate(p.created_at)}","${p.jobs?.description || p.payment_type}","${(p.amount / 100).toFixed(2)}","${((p.processing_fee || 0) / 100).toFixed(2)}","${p.status}","${p.currency || 'AUD'}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully');
  };

  const handleExportReceiptPDF = (payment: PaymentRow) => {
    const invoiceNum = fmtInvoiceRef(payment.invoice_ref, payment.id);
    const exGst = payment.amount;
    const pdfStoredGst = (payment.metadata as Record<string, unknown>)?.gst;
    const gstAmount = pdfStoredGst != null ? Number(pdfStoredGst) : Math.round(exGst * 0.1);
    const fee = payment.processing_fee || 0;
    const jobDesc = payment.jobs?.description ? cleanDescription(payment.jobs.description) : 'Service payment';
    const jobCategory = payment.jobs?.description ? getCategory(payment.jobs.description) : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${invoiceNum} - Tax Invoice</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:680px;margin:0 auto;padding:40px 32px;color:#1a1a1a;font-size:14px}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #004d40}
.brand h1{font-size:22px;color:#004d40;letter-spacing:-0.5px}
.brand p{color:#9ca3af;font-size:11px;margin-top:2px}
.invoice-meta{text-align:right}
.invoice-meta .label{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.invoice-meta .value{font-size:14px;font-weight:600;color:#1a1a1a}
.invoice-title{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin:24px 0 8px}
.service-box{background:#f5f7f8;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px}
.service-box .cat{display:inline-block;background:#E0F2F1;color:#004d40;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-bottom:8px}
.service-box .desc{font-size:14px;font-weight:500;color:#1a1a1a}
table{width:100%;border-collapse:collapse;margin-bottom:4px}
table th{text-align:left;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;padding:8px 12px;border-bottom:1px solid #e5e7eb}
table th:last-child{text-align:right}
table td{padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6}
table td:last-child{text-align:right;font-weight:500;font-variant-numeric:tabular-nums}
.total-row{background:#004d40}
.total-row td{color:#fff;font-weight:700;font-size:15px;border:none;padding:12px}
.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin:20px 0}
.detail-item .dl{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px}
.detail-item .dv{font-size:13px;font-weight:500;color:#374151;margin-top:2px}
.badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600}
.pending{background:#FEFEF5;color:#826904}
.completed{background:#ECFDF6;color:#048163}
.refunded{background:#F2FAF8;color:#577B6E}
.failed{background:#fee2e2;color:#991b1b}
.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:11px;line-height:1.6}
@media print{body{padding:20px;margin:0}}
</style></head><body>
<div class="header">
  <div class="brand"><h1>ConnecTradie</h1><p>ABN: XX XXX XXX XXX</p></div>
  <div class="invoice-meta">
    <div class="label">Tax Invoice</div>
    <div class="value">${invoiceNum}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">${formatDate(payment.created_at)}</div>
  </div>
</div>
<p class="invoice-title">Service</p>
<div class="service-box">
  ${jobCategory ? `<span class="cat">${jobCategory}</span>` : ''}
  <div class="desc">${jobDesc}</div>
</div>
<p class="invoice-title">Amount</p>
<table>
  <thead><tr><th>Description</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>${gstAmount > 0 ? 'Subtotal (ex. GST)' : 'Job Amount'}</td><td>${formatCurrency(exGst)}</td></tr>
    ${gstAmount > 0 ? `<tr><td>GST (10%)</td><td>${formatCurrency(gstAmount)}</td></tr>` : ''}
    ${fee > 0 ? `<tr><td>Processing Fee</td><td>${formatCurrency(fee)}</td></tr>` : ''}
    <tr class="total-row"><td>${gstAmount > 0 ? 'Total (inc. GST)' : 'Total'}</td><td>${formatCurrency(exGst + gstAmount + fee)}</td></tr>
  </tbody>
</table>
<div class="details-grid">
  <div class="detail-item"><div class="dl">Invoice #</div><div class="dv">${invoiceNum}</div></div>
  <div class="detail-item"><div class="dl">Date & Time</div><div class="dv">${formatDateTime(payment.created_at)}</div></div>
  <div class="detail-item"><div class="dl">Payment Type</div><div class="dv" style="text-transform:capitalize">${payment.payment_type.replace(/_/g, ' ')}</div></div>
  <div class="detail-item"><div class="dl">Status</div><div class="dv"><span class="badge ${payment.status}">${payment.status}</span></div></div>
  <div class="detail-item"><div class="dl">Currency</div><div class="dv">${(payment.currency || 'AUD').toUpperCase()}</div></div>
</div>
<div class="footer">
  <p>This is a tax invoice issued by ConnecTradie Pty Ltd for GST purposes under Australian tax law.</p>
  <p>All prices are in AUD and include GST where applicable. Retain this document for your records.</p>
</div>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.setTimeout(() => { win.print(); }, 300); }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasActiveFilters = statusFilter !== 'all' || dateFrom || dateTo || typeFilter;

  // Identify client-side payments that still need action — either escrow waiting
  // to be released, or a pending price increase to pay before release. These
  // get pulled out of the month sections and pinned to the top.
  const needsActionFn = useMemo(() => {
    return (p: PaymentRow) => {
      if (isTradie) return false;
      if (p.payment_type === 'bonus') return false;
      if (p.status !== 'completed') return false;
      if (!p.stripe_payment_intent_id) return false;
      const meta = p.metadata as Record<string, unknown> | null;
      if (meta?.transfer_id || meta?.released_at) return false; // already released
      return true; // either Awaiting Release or has pending_increase
    };
  }, [isTradie]);

  // Group payments into three tiers, in order:
  //   1. "Action needed — release these"  → completed escrow waiting for client release
  //   2. "Pending"                        → status='pending' (BECS in flight, checkout open, etc.)
  //   3. Month groups                     → everything settled, newest month first
  // Within tier 1 we sort oldest-first (closest to the 48h auto-release deadline);
  // within Pending we sort newest-first; month groups stay date-ordered.
  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; payments: PaymentRow[]; total: number }[] = [];

    const actionPayments = payments
      .filter(needsActionFn)
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (actionPayments.length > 0) {
      const total = actionPayments.reduce((s, p) => s + p.amount, 0);
      groups.push({
        key: '__action_needed__',
        label: 'Action needed — release these',
        payments: actionPayments,
        total,
      });
    }

    const pendingPayments = payments
      .filter(p => !needsActionFn(p) && p.status === 'pending')
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (pendingPayments.length > 0) {
      const total = pendingPayments.reduce((s, p) => s + p.amount, 0);
      groups.push({
        key: '__pending__',
        label: 'Pending — in progress',
        payments: pendingPayments,
        total,
      });
    }

    const map = new Map<string, PaymentRow[]>();
    for (const p of payments) {
      if (needsActionFn(p)) continue; // already in Action needed
      if (p.status === 'pending') continue; // already in Pending
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }

    for (const [key, items] of map) {
      const [year, month] = key.split('-').map(Number);
      const label = new Date(year, month - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      const total = items.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0);
      groups.push({ key, label, payments: items, total });
    }

    return groups;
  }, [payments, needsActionFn]);

  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const toggleMonth = (key: string) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading && payments.length === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] mx-auto space-y-6">
          <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-surface-200 animate-pulse" />)}
          </div>
          <ListSkeleton rows={5} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <SectionErrorBoundary>
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Wallet className="w-5 h-5 text-primary-700" />
              </div>
              <h1 className="text-2xl font-bold text-navy-900">
                {isTradie ? 'Earnings & Payouts' : 'Invoices & Payments'}
              </h1>
            </div>
            <p className="text-sm text-navy-400 ml-12">
              {isTradie ? 'Track your earnings, pending payouts, and payment history' : 'Manage invoices, make payments, and track your spending'}
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm font-medium text-navy-700 hover:bg-surface-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-surface-200 p-5 hover:border-primary-200 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary-50"><DollarSign className="w-5 h-5 text-primary-600" /></div>
              <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">{isTradie ? 'Total Earned' : 'Total Paid'}</span>
            </div>
            <p className="text-2xl font-bold text-primary-700">{formatCurrency(totalAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-surface-200 p-5 hover:border-accent-200 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-accent-50"><Clock className="w-5 h-5 text-accent-600" /></div>
              <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Pending</span>
            </div>
            <p className="text-2xl font-bold text-accent-700">{formatCurrency(pendingAmount)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-surface-200 p-5 hover:border-warm-200 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-warm-50"><TrendingUp className="w-5 h-5 text-warm-600" /></div>
              <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Completed</span>
            </div>
            <p className="text-2xl font-bold text-navy-900">{completedCount}</p>
            <p className="text-xs text-navy-300 mt-0.5">transactions</p>
          </div>
          <div className="bg-white rounded-2xl border border-surface-200 p-5 hover:border-secondary-200 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-secondary-50"><RotateCcw className="w-5 h-5 text-secondary-600" /></div>
              <span className="text-xs font-semibold text-navy-400 uppercase tracking-wider">Refunded</span>
            </div>
            <p className="text-2xl font-bold text-secondary-700">{formatCurrency(refundedAmount)}</p>
          </div>
        </div>

        {/* Recurring / Service Invoices (Clients only) */}
        {!isTradie && (recurringLoading || recurringInvoices.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-navy-300" />
              <h2 className="text-sm font-semibold text-navy-800">Service Invoices</h2>
              {recurringInvoices.length > 0 && (
                <span className="text-xs text-navy-300 font-medium">({recurringInvoices.length})</span>
              )}
            </div>
            {recurringLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-48 bg-white rounded-xl border border-surface-200 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {recurringInvoices.filter(i => i.status === 'sent' || i.status === 'overdue' || i.status === 'draft').length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Outstanding</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recurringInvoices.filter(i => i.status === 'sent' || i.status === 'overdue' || i.status === 'draft').map(inv => (
                        <RecurringInvoiceCard key={inv.id} invoice={inv} userRole="client" />
                      ))}
                    </div>
                  </div>
                )}
                {recurringInvoices.filter(i => i.status === 'paid' || i.status === 'cancelled').length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Payment History</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recurringInvoices.filter(i => i.status === 'paid' || i.status === 'cancelled').map(inv => (
                        <RecurringInvoiceCard key={inv.id} invoice={inv} userRole="client" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Transaction Table */}
        <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-navy-300" />
              <h2 className="text-sm font-semibold text-navy-800">Transaction History</h2>
              {totalCount > 0 && <span className="text-xs text-navy-300 font-medium">({totalCount})</span>}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={() => { setStatusFilter('all'); setDateFrom(''); setDateTo(''); setTypeFilter(''); setPage(0); }}
                  className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showFilters || hasActiveFilters
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'bg-surface-100 text-navy-500 border border-surface-200 hover:bg-surface-200'
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && (
                  <span className="w-4 h-4 bg-primary-600 text-white rounded-full text-xs flex items-center justify-center font-bold">
                    {[statusFilter !== 'all', !!dateFrom, !!dateTo, !!typeFilter].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Expandable Filters */}
          {showFilters && (
            <div className="px-5 py-4 bg-surface-50 border-b border-surface-200">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-400 uppercase tracking-wider mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(0); }}
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm text-navy-700 bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="refunded">Refunded</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-400 uppercase tracking-wider mb-1">From</label>
                  <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm text-navy-700 bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-400 uppercase tracking-wider mb-1">To</label>
                  <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm text-navy-700 bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-400 uppercase tracking-wider mb-1">Type</label>
                  <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }}
                    className="px-3 py-2 border border-surface-300 rounded-lg text-sm text-navy-700 bg-white focus:ring-2 focus:ring-primary-400 focus:border-primary-400">
                    <option value="">All Types</option>
                    <option value="job_payment">Job Payment</option>
                    {!isTradie && <option value="service_invoice">Service Invoice</option>}
                    <option value="bonus">Extra Payment</option>
                    <option value="subscription">Subscription</option>
                    <option value="lead_unlock">Lead Unlock</option>
                    <option value="job_access">Job Access</option>
                    <option value="refund">Refund</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Table Content */}
          {loading ? (
            <div className="p-6"><ListSkeleton rows={3} /></div>
          ) : payments.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Receipt className="w-8 h-8 text-navy-200" />
              </div>
              <h3 className="text-lg font-semibold text-navy-800 mb-1">No transactions yet</h3>
              <p className="text-sm text-navy-400 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'No results match your filters. Try adjusting or clearing them.'
                  : isTradie
                    ? 'Your earnings will appear here once clients make payments for your jobs.'
                    : 'Your payment history will appear here once you start using the platform.'
                }
              </p>
            </div>
          ) : (
            <>
              {/* Column headings — desktop only. Widths match the data rows below.
                  pl-11 on Job pushes the label past the row icon (w-8 + gap-3) so it
                  sits over the description text rather than the icon column. */}
              <div className="hidden md:flex items-center w-full px-5 py-2.5 bg-surface-100 border-b border-surface-200 text-xs font-semibold text-navy-400 uppercase tracking-wider">
                <div className="w-32">Date</div>
                <div className="flex-1 pl-11">Job</div>
                <div className="text-right w-28">Payment</div>
                <div className="text-center w-72">Update</div>
                <div className="w-24" aria-hidden="true" />
              </div>

              {/* Grouped: Action needed → Pending → month history */}
              {monthGroups.map((group) => {
                const isCollapsed = collapsedMonths.has(group.key);
                const isActionNeeded = group.key === '__action_needed__';
                const isPending = group.key === '__pending__';
                const headerBg = isActionNeeded
                  ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                  : isPending
                    ? 'bg-secondary-50 border-secondary-200 hover:bg-secondary-100'
                    : 'bg-surface-50 border-surface-200 hover:bg-surface-100';
                const headerText = isActionNeeded
                  ? 'text-amber-800'
                  : isPending
                    ? 'text-secondary-800'
                    : 'text-navy-800';
                const subText = isActionNeeded
                  ? 'text-amber-700 font-medium'
                  : isPending
                    ? 'text-secondary-700 font-medium'
                    : 'text-navy-300';
                const chevronText = isActionNeeded
                  ? 'text-amber-700'
                  : isPending
                    ? 'text-secondary-700'
                    : 'text-navy-400';
                const totalText = isActionNeeded
                  ? 'text-amber-800'
                  : isPending
                    ? 'text-secondary-800'
                    : 'text-navy-700';
                return (
                  <div key={group.key}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleMonth(group.key)}
                      className={`w-full flex items-center justify-between px-5 py-3 border-b transition-colors ${headerBg}`}
                    >
                      <div className="flex items-center gap-2">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''} ${chevronText}`} />
                        {isActionNeeded && <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />}
                        {isPending && <span className="w-2 h-2 rounded-full bg-secondary-500 flex-shrink-0" />}
                        <h3 className={`text-sm font-semibold ${headerText}`}>{group.label}</h3>
                        <span className={`text-xs ${subText}`}>
                          {group.payments.length} {group.payments.length === 1 ? 'payment' : 'payments'}
                        </span>
                      </div>
                      {group.total > 0 && (
                        <span className={`text-sm font-semibold tabular-nums ${totalText}`}>{formatCurrency(group.total)}</span>
                      )}
                    </button>

                    {!isCollapsed && (
                      <>
                        {/* Desktop rows */}
                        <div className="hidden md:block">
                          <table className="w-full">
                            <tbody className="divide-y divide-surface-100">
                              {group.payments.map(p => {
                                const category = p.jobs?.description ? getCategory(p.jobs.description) : null;
                                const isBonus = p.payment_type === 'bonus';
                                const desc = isBonus
                                  ? (p.jobs?.description ? `Extra payment — ${cleanDescription(p.jobs.description)}` : 'Extra payment')
                                  : (p.jobs?.description ? cleanDescription(p.jobs.description) : p.payment_type.replace(/_/g, ' '));
                                return (
                                  <tr key={p.id} onClick={() => setSelectedPayment(p)}
                                    className="hover:bg-surface-50 cursor-pointer transition-colors group">
                                    <td className="px-5 py-3.5 w-32">
                                      <span className="text-sm text-navy-400">{new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                                    </td>
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                          isBonus ? 'bg-warm-50' :
                                          p.status === 'completed' ? 'bg-warm-50' :
                                          p.status === 'pending' ? 'bg-accent-50' :
                                          p.status === 'refunded' ? 'bg-secondary-50' : 'bg-surface-100'
                                        }`}>
                                          {isBonus ? (
                                            <Gift className="w-3.5 h-3.5 text-warm-600" />
                                          ) : p.payment_type === 'service_invoice' ? (
                                            <FileText className={`w-3.5 h-3.5 ${
                                              p.status === 'completed' ? 'text-secondary-600' :
                                              p.status === 'pending' ? 'text-accent-600' : 'text-navy-400'
                                            }`} />
                                          ) : p.payment_type === 'job_payment' ? (
                                            <Receipt className={`w-3.5 h-3.5 ${
                                              p.status === 'completed' ? 'text-warm-600' :
                                              p.status === 'pending' ? 'text-accent-600' : 'text-navy-400'
                                            }`} />
                                          ) : p.payment_type === 'subscription' ? (
                                            <CreditCard className="w-3.5 h-3.5 text-primary-500" />
                                          ) : (
                                            <DollarSign className="w-3.5 h-3.5 text-navy-400" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-navy-900 truncate max-w-[280px]">{desc}</p>
                                          {category && <span className="text-xs text-navy-300 font-medium">{category}</span>}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-5 py-3.5 text-right w-28">
                                      <span className={`text-sm font-semibold tabular-nums ${
                                        p.status === 'refunded' ? 'text-secondary-600' : 'text-navy-900'
                                      }`}>
                                        {p.status === 'refunded' ? '-' : ''}{formatCurrency(p.amount)}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3.5 text-center w-72">
                                      <div className="flex flex-col items-center justify-center gap-1.5">
                                        {/* Bonus payments are destination charges — no escrow, never "Awaiting Release" */}
                                        {!isTradie && !isBonus && p.status === 'completed' && p.stripe_payment_intent_id && !(p.metadata as Record<string, unknown> | null)?.transfer_id && !(p.metadata as Record<string, unknown> | null)?.released_at && !(p.metadata as Record<string, unknown> | null)?.pending_increase ? (
                                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            Awaiting Release
                                          </span>
                                        ) : (
                                          getStatusBadge(p.status)
                                        )}
                                        {!isTradie && (p.metadata as Record<string, unknown> | null)?.pending_increase && !(p.metadata as Record<string, unknown> | null)?.transfer_id && !(p.metadata as Record<string, unknown> | null)?.released_at && (() => {
                                          const inc = (p.metadata as Record<string, unknown>).pending_increase as Record<string, unknown> | undefined;
                                          const diffCents = Number(inc?.diff_cents || 0);
                                          const diffLabel = diffCents > 0 ? ` $${(diffCents / 100).toFixed(2)}` : '';
                                          return (
                                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                                              Price adjusted — pay{diffLabel} to release
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                    <td className="px-5 py-3.5 text-right w-24">
                                      <span className="text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                        View
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile rows */}
                        <div className="md:hidden divide-y divide-surface-100">
                          {group.payments.map(p => {
                            const isBonus = p.payment_type === 'bonus';
                            const desc = isBonus
                              ? (p.jobs?.description ? `Extra payment — ${cleanDescription(p.jobs.description)}` : 'Extra payment')
                              : (p.jobs?.description ? cleanDescription(p.jobs.description) : p.payment_type.replace(/_/g, ' '));
                            const category = p.jobs?.description ? getCategory(p.jobs.description) : null;
                            return (
                              <div key={p.id} onClick={() => setSelectedPayment(p)}
                                role="button" tabIndex={0}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedPayment(p); } }}
                                className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-50 transition-colors cursor-pointer">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  isBonus ? 'bg-warm-50' :
                                  p.status === 'completed' ? 'bg-warm-50' :
                                  p.status === 'pending' ? 'bg-accent-50' : 'bg-surface-100'
                                }`}>
                                  {isBonus ? (
                                    <Gift className="w-4 h-4 text-warm-600" />
                                  ) : (
                                    <Receipt className={`w-4 h-4 ${
                                      p.status === 'completed' ? 'text-warm-600' :
                                      p.status === 'pending' ? 'text-accent-600' : 'text-navy-400'
                                    }`} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-navy-900 truncate">{desc}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {category && <span className="text-xs text-navy-300">{category}</span>}
                                    <span className="text-xs text-navy-200">{new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(p.amount)}</p>
                                  <div className="mt-1 flex items-center gap-1.5 justify-end">
                                    {/* Bonus payments are destination charges — no escrow, never "Awaiting Release" */}
                                    {!isTradie && !isBonus && p.status === 'completed' && p.stripe_payment_intent_id && !(p.metadata as Record<string, unknown> | null)?.transfer_id && !(p.metadata as Record<string, unknown> | null)?.released_at && !(p.metadata as Record<string, unknown> | null)?.pending_increase ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        Awaiting Release
                                      </span>
                                    ) : (
                                      getStatusBadge(p.status)
                                    )}
                                    {!isTradie && (p.metadata as Record<string, unknown> | null)?.pending_increase && !(p.metadata as Record<string, unknown> | null)?.transfer_id && (() => {
                                      const inc = (p.metadata as Record<string, unknown>).pending_increase as Record<string, unknown> | undefined;
                                      const diffCents = Number(inc?.diff_cents || 0);
                                      const diffLabel = diffCents > 0 ? ` $${(diffCents / 100).toFixed(2)}` : '';
                                      return (
                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                                          Price adjusted — pay{diffLabel} to release
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-surface-200">
                  <p className="text-xs text-navy-300">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="p-2 rounded-lg text-navy-400 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium text-navy-400 px-2">{page + 1} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="p-2 rounded-lg text-navy-400 hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ====== Invoice Detail Modal ====== */}
        {selectedPayment && <InvoiceModal
          payment={selectedPayment}
          isTradie={isTradie}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          formatDateTime={formatDateTime}
          getStatusBadge={getStatusBadge}
          cleanDescription={cleanDescription}
          getCategory={getCategory}
          onClose={() => setSelectedPayment(null)}
          onExportPDF={() => handleExportReceiptPDF(selectedPayment)}
          onPaymentUpdate={() => { setSelectedPayment(null); fetchPayments(); fetchSummary(); }}
          showToast={showToast}
        />}

        {/* Toast */}
        {toast.show && (
          <div className={`fixed bottom-20 sm:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 flex items-center gap-2 px-5 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.isError ? 'bg-red-600 text-white' : 'bg-primary-700 text-white'
          }`}>
            {toast.isError ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {toast.message}
          </div>
        )}
      </div>
      </SectionErrorBoundary>
    </DashboardLayout>
  );
}

/* ─── Invoice Detail Modal ─── */
function InvoiceModal({ payment, isTradie, formatCurrency, formatDate, formatDateTime, getStatusBadge, cleanDescription, getCategory, onClose, onExportPDF, onPaymentUpdate, showToast }: {
  payment: PaymentRow;
  isTradie: boolean;
  formatCurrency: (c: number) => string;
  formatDate: (d: string) => string;
  formatDateTime: (d: string) => string;
  getStatusBadge: (s: string) => React.ReactNode;
  cleanDescription: (d: string) => string;
  getCategory: (d: string) => string | null;
  onClose: () => void;
  onExportPDF: () => void;
  onPaymentUpdate: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [hasReview, setHasReview] = useState(false);

  useEffect(() => {
    if (payment.job_id && user) {
      supabase
        .from('reviews')
        .select('id')
        .eq('job_id', payment.job_id)
        .eq('client_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setHasReview(true);
        });
    }
  }, [payment.job_id, user]);

  const exGst = payment.amount;
  const storedGst = (payment.metadata as Record<string, unknown>)?.gst;
  const gstAmount = storedGst != null ? Number(storedGst) : Math.round(exGst * 0.1);
  const subtotal = exGst + gstAmount;
  const fee = payment.processing_fee || 0;
  const jobDesc = payment.jobs?.description ? cleanDescription(payment.jobs.description) : 'Service payment';
  const jobCategory = payment.jobs?.description ? getCategory(payment.jobs.description) : null;
  const invoiceNum = fmtInvoiceRef(payment.invoice_ref, payment.id);
  const tradieName = (payment.metadata as Record<string, unknown>)?.tradie_name as string || null;
  const tradieAbn = (payment.metadata as Record<string, unknown>)?.tradie_abn as string || null;

  const handleVerifyPayment = async () => {
    setActionLoading(true);
    try {
      const result = await verifyPayment(payment.id);
      if (result.status === 'completed') {
        showToast('Payment verified and confirmed!');
        onPaymentUpdate();
      } else {
        showToast(result.message || 'Payment has not been completed yet. Please try paying again.', true);
      }
    } catch (err) {
      showToast(friendlyError(err, 'Unable to verify payment. Please try again.'), true);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePayNow = async () => {
    setActionLoading(true);
    try {
      const { url } = await createJobPaymentCheckout(payment.id);
      window.location.href = url;
    } catch (err) {
      showToast(friendlyError(err, 'Unable to start checkout. Please try again.'), true);
      setActionLoading(false);
    }
  };

  const handleReleaseEscrow = async () => {
    setActionLoading(true);
    try {
      await releaseEscrow(payment.id);
      showToast(`Payment released to ${tradieName || 'your tradie'} successfully`);
      onPaymentUpdate();
      // Navigate to review page if this payment is linked to a job
      if (payment.job_id) {
        navigate(`/review/${payment.job_id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('insufficient') || msg.includes('Insufficient')) {
        showToast('Payment is being processed. Please try again in a few minutes.', true);
      } else if (msg.includes('pending') && msg.includes('increase')) {
        showToast('A price adjustment needs to be paid before this payment can be released.', true);
      } else {
        showToast(friendlyError(err, 'Unable to release payment. Please try again.'), true);
      }
      setActionLoading(false);
    }
  };

  const isPendingJobPayment = payment.status === 'pending' && payment.payment_type === 'job_payment';
  const isCompletedWithStripe = payment.status === 'completed' && !!payment.stripe_payment_intent_id;
  const transferDone = !!(payment.metadata as Record<string, unknown>)?.transfer_id;
  const hasPendingIncrease = !!(payment.metadata as Record<string, unknown>)?.pending_increase;
  const pendingReduction = (payment.metadata as Record<string, unknown>)?.pending_reduction as
    | { proposed_amount_cents?: number; original_amount_cents?: number; diff_cents?: number; reason?: string | null }
    | undefined;
  const hasPendingReduction = !!pendingReduction;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-primary-700">ConnecTradie</h2>
              <p className="text-xs text-navy-300 mt-0.5">ABN: XX XXX XXX XXX</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 -mt-1 -mr-1 transition-colors">
              <X className="w-5 h-5 text-navy-300" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div>
              <p className="text-xs font-bold text-navy-300 uppercase tracking-widest">Tax Invoice</p>
              <p className="text-sm font-bold text-navy-900 mt-0.5">{invoiceNum}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-navy-300 uppercase tracking-wider">Issue Date</p>
              <p className="text-sm font-medium text-navy-800">{formatDate(payment.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-surface-200 mx-6" />

        <div className="px-6 py-5 space-y-5">
          {/* Service Details */}
          <div className="bg-surface-50 rounded-lg p-4 border border-surface-200">
            <p className="text-xs font-bold text-navy-300 uppercase tracking-widest mb-2.5">Service Details</p>
            <div className="flex items-center gap-2 mb-1.5">
              {jobCategory && (
                <span className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs font-semibold">{jobCategory}</span>
              )}
              {getStatusBadge(payment.status)}
            </div>
            <p className="text-sm font-medium text-navy-900">{jobDesc}</p>
            {payment.job_id && (
              <div className="flex items-center gap-3 mt-2">
                <Link to={`${isTradie ? '/jobs' : '/leads'}?job=${payment.job_id}`} className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
                  View job <ExternalLink className="w-3 h-3" />
                </Link>
                {!payment.id.startsWith('inv_') && (
                  <Link to={`/invoice/${payment.id}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
                    <Receipt className="w-3 h-3" /> Tax invoice
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Provider Info */}
          {(tradieName || tradieAbn) && (
            <div>
              <p className="text-xs font-bold text-navy-300 uppercase tracking-widest mb-2">Service Provider</p>
              <div className="text-sm space-y-0.5">
                {tradieName && <p className="font-medium text-navy-900">{tradieName}</p>}
                {tradieAbn && <p className="text-navy-400">ABN: {tradieAbn}</p>}
              </div>
            </div>
          )}

          {/* Financial Breakdown */}
          <div>
            <p className="text-xs font-bold text-navy-300 uppercase tracking-widest mb-2.5">Amount Breakdown</p>
            <div className="border border-surface-200 rounded-lg overflow-hidden">
              <div className="divide-y divide-surface-100">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-navy-500">{gstAmount > 0 ? 'Subtotal (ex. GST)' : 'Job Amount'}</span>
                  <span className="text-sm font-medium text-navy-900 tabular-nums">{formatCurrency(exGst)}</span>
                </div>
                {gstAmount > 0 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-navy-500">GST (10%)</span>
                    <span className="text-sm font-medium text-navy-900 tabular-nums">{formatCurrency(gstAmount)}</span>
                  </div>
                )}
                {fee > 0 && (
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-navy-400">Processing fee</span>
                    <span className="text-sm font-medium text-navy-400 tabular-nums">{formatCurrency(fee)}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3.5 bg-primary-700">
                <span className="text-sm font-bold text-white">{gstAmount > 0 ? 'Total (inc. GST)' : 'Total'}</span>
                <span className="text-lg font-bold text-white tabular-nums">{formatCurrency(exGst + gstAmount + fee)}</span>
              </div>
            </div>
          </div>

          {/* Reference Details */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div><p className="text-xs text-navy-300 uppercase tracking-wider mb-0.5">Invoice #</p><p className="text-sm font-medium text-navy-900">{invoiceNum}</p></div>
            <div><p className="text-xs text-navy-300 uppercase tracking-wider mb-0.5">Date & Time</p><p className="text-sm font-medium text-navy-900">{formatDateTime(payment.created_at)}</p></div>
            <div><p className="text-xs text-navy-300 uppercase tracking-wider mb-0.5">Payment Type</p><p className="text-sm font-medium text-navy-900 capitalize">{payment.payment_type === 'bonus' ? 'Extra payment' : payment.payment_type.replace(/_/g, ' ')}</p></div>
            <div><p className="text-xs text-navy-300 uppercase tracking-wider mb-0.5">Currency</p><p className="text-sm font-medium text-navy-900">{(payment.currency || 'AUD').toUpperCase()}</p></div>
          </div>

          {/* Document Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onExportPDF}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-surface-300 text-navy-700 rounded-lg text-sm font-medium hover:bg-surface-50 transition-colors">
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button onClick={onExportPDF}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-navy-800 text-white rounded-lg text-sm font-medium hover:bg-navy-900 transition-colors">
              <Receipt className="w-4 h-4" />
              Print Invoice
            </button>
          </div>

          {/* ─── Payment Actions (Client Only) ─── */}

          {/* Pay Now (pending, no Stripe charge yet) */}
          {!isTradie && isPendingJobPayment && !payment.stripe_payment_intent_id && (
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <CreditCard className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-accent-800">
                    {payment.stripe_checkout_session_id ? 'Payment Processing' : 'Payment Required'}
                  </p>
                  <p className="text-xs text-accent-700 mt-0.5">
                    {payment.stripe_checkout_session_id
                      ? 'You may have already completed this payment. Click "Verify Payment" to check, or pay again if needed.'
                      : 'Your tradie has completed the work and requested payment. Review the invoice above, then pay securely via Stripe.'}
                  </p>
                </div>
              </div>
              {payment.stripe_checkout_session_id ? (
                <div className="flex gap-2">
                  <button onClick={handleVerifyPayment} disabled={actionLoading}
                    className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Verify Payment
                  </button>
                  <button onClick={handlePayNow} disabled={actionLoading}
                    className="flex-1 px-4 py-2.5 bg-white border border-surface-300 text-navy-700 rounded-lg text-sm font-semibold hover:bg-surface-50 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Pay Again
                  </button>
                </div>
              ) : (
                <button onClick={handlePayNow} disabled={actionLoading}
                  className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Pay Now — {formatCurrency(subtotal)}
                </button>
              )}
            </div>
          )}

          {/* Escrow — auto-releases after 48h, client can release early */}
          {!isTradie && isCompletedWithStripe && !transferDone && !hasPendingIncrease && !hasPendingReduction && (
            <div className="bg-warm-50 border border-warm-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <ShieldCheck className="w-5 h-5 text-warm-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-warm-800">Payment Secured with Stripe</p>
                  <p className="text-xs text-warm-700 mt-0.5">
                    Funds will be automatically released to your tradie within 48 hours. You can release early if you're happy with the work.
                  </p>
                </div>
              </div>
              <button onClick={handleReleaseEscrow} disabled={actionLoading}
                className="w-full px-4 py-2.5 bg-warm-600 text-white rounded-lg text-sm font-semibold hover:bg-warm-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Release Now
              </button>
            </div>
          )}

          {/* Client-initiated price reduction (overpayment correction) */}
          {!isTradie && isCompletedWithStripe && !transferDone && !hasPendingIncrease && !hasPendingReduction && (
            <ReductionRequestSection
              paymentId={payment.id}
              currentAmount={exGst}
              onSuccess={onPaymentUpdate}
              onError={(msg) => showToast(msg, true)}
            />
          )}

          {/* Pending reduction — waiting for tradie response */}
          {!isTradie && hasPendingReduction && pendingReduction && (
            <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-secondary-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-secondary-800">Reduction Request Pending</p>
                  <p className="text-xs text-secondary-700 mt-0.5">
                    You've asked to reduce this payment from ${((pendingReduction.original_amount_cents ?? 0) / 100).toFixed(2)} to ${((pendingReduction.proposed_amount_cents ?? 0) / 100).toFixed(2)}.
                    Waiting for the tradie to approve. You'll be refunded ${((pendingReduction.diff_cents ?? 0) / 100).toFixed(2)} once they do.
                  </p>
                  {pendingReduction.reason && (
                    <p className="text-xs text-secondary-600 mt-1 italic">Your note: "{pendingReduction.reason}"</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pending price increase — must pay difference before release */}
          {!isTradie && isCompletedWithStripe && !transferDone && hasPendingIncrease && (() => {
            const inc = (payment.metadata as Record<string, unknown>).pending_increase as Record<string, unknown> | undefined;
            const diffCents = Number(inc?.diff_cents || 0);
            const diffLabel = diffCents > 0 ? `$${(diffCents / 100).toFixed(2)}` : '';
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Price Increase Pending</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Your tradie has requested a price adjustment{diffLabel ? ` of ${diffLabel}` : ''}. Please pay the additional amount before the payment can be released.
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      setActionLoading(true);
                      const { url } = await payPriceIncrease(payment.id, payment.job_id || '');
                      window.location.href = url;
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Failed to start payment', true);
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                  Pay Increase{diffLabel ? ` — ${diffLabel}` : ''}
                </button>
              </div>
            );
          })()}

          {/* Transfer completed */}
          {!isTradie && isCompletedWithStripe && transferDone && (
            <div className={`${hasReview ? 'bg-green-50 border-green-200' : 'bg-warm-50 border-warm-200'} border rounded-lg p-3 space-y-2`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${hasReview ? 'text-green-600' : 'text-warm-600'} flex-shrink-0`} />
                <p className={`text-sm ${hasReview ? 'text-green-700' : 'text-warm-700'} font-medium`}>
                  {hasReview ? 'Completed — Payment released & reviewed' : 'Payment released to tradie'}
                </p>
              </div>
              {payment.job_id && !hasReview && (
                <Link
                  to={`/review/${payment.job_id}`}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-warm-500 text-white rounded-lg text-sm font-semibold hover:bg-warm-600 transition-colors"
                >
                  <Star className="w-4 h-4" />
                  Leave a Review
                </Link>
              )}
            </div>
          )}

          {/* Legacy: pending with stripe intent */}
          {!isTradie && payment.status === 'pending' && payment.stripe_payment_intent_id && (
            <div className="bg-warm-50 border border-warm-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-3">
                <ShieldCheck className="w-5 h-5 text-warm-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-warm-800">Ready to Release</p>
                  <p className="text-xs text-warm-700 mt-0.5">Funds are secured. Release payment once you're happy with the work.</p>
                </div>
              </div>
              <button onClick={handleReleaseEscrow} disabled={actionLoading}
                className="w-full px-4 py-2.5 bg-warm-600 text-white rounded-lg text-sm font-semibold hover:bg-warm-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Release Payment
              </button>
            </div>
          )}

          {/* Refund (client, completed) */}
          {!isTradie && payment.status === 'completed' && (
            <RefundSection paymentId={payment.id} onSuccess={onPaymentUpdate} onError={(msg) => showToast(msg, true)} />
          )}

          {/* Tradie views */}
          {isTradie && payment.status === 'completed' && (
            <div className="bg-warm-50 border border-warm-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-warm-600 flex-shrink-0" />
              <p className="text-sm text-warm-700 font-medium">Payment received</p>
            </div>
          )}
          {isTradie && payment.status === 'pending' && (
            <div className="bg-accent-50 border border-accent-200 rounded-lg p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-600 flex-shrink-0" />
              <p className="text-sm text-accent-700 font-medium">Awaiting client payment</p>
            </div>
          )}

          {/* GST Note */}
          <p className="text-xs text-navy-300 text-center pt-2 border-t border-surface-200 leading-relaxed">
            Tax invoice issued by ConnecTradie Pty Ltd for GST purposes under Australian tax law.
            All prices in AUD include GST where applicable. Retain for your records.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Reduction Request Section (client reduces overpayment) ─── */
function ReductionRequestSection({
  paymentId,
  currentAmount,
  onSuccess,
  onError,
}: {
  paymentId: string;
  currentAmount: number; // cents, ex-GST
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newTotalInput, setNewTotalInput] = useState('');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const currentDollars = currentAmount / 100;
  const newTotal = parseFloat(newTotalInput);
  const validNumber = !isNaN(newTotal) && newTotal >= 1;
  const isLower = validNumber && newTotal < currentDollars;
  const refundAmount = isLower ? currentDollars - newTotal : 0;

  const handleSubmit = async () => {
    if (!validNumber) {
      onError('Please enter a valid amount of at least $1.');
      return;
    }
    if (!isLower) {
      onError('New total must be less than the current amount paid.');
      return;
    }
    setProcessing(true);
    try {
      await requestPriceReduction(paymentId, newTotal, reason.trim() || undefined);
      onSuccess();
    } catch (err) {
      onError(friendlyError(err, 'Unable to submit reduction request. Please try again.'));
    } finally {
      setProcessing(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full px-4 py-2.5 text-secondary-700 border border-secondary-200 rounded-lg text-sm font-medium hover:bg-secondary-50 transition-colors flex items-center justify-center gap-2"
      >
        <RotateCcw className="w-4 h-4" /> Adjust amount paid
      </button>
    );
  }

  return (
    <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-secondary-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-secondary-800">Reduce the amount you paid</p>
          <p className="text-xs text-secondary-700 mt-0.5">
            Enter the total you meant to pay. The tradie will approve the change, and the difference is refunded to your card. Current amount: ${currentDollars.toFixed(2)}.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={newTotalInput}
            onChange={(e) => setNewTotalInput(e.target.value)}
            placeholder="New total you meant to pay"
            className="w-full pl-7 pr-3 py-2 border border-secondary-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-secondary-400 bg-white"
          />
        </div>
        {isLower && (
          <p className="text-xs text-secondary-700">
            Refund amount: <span className="font-semibold">${refundAmount.toFixed(2)}</span>
          </p>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Optional: explain what happened (e.g. accidentally entered $310 instead of $190)"
          rows={2}
          maxLength={500}
          className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary-400 bg-white resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => { setShowForm(false); setNewTotalInput(''); setReason(''); }}
            className="flex-1 px-3 py-2 bg-white border border-surface-300 text-navy-700 rounded-lg text-sm font-medium hover:bg-surface-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={processing || !isLower}
            className="flex-1 px-3 py-2 bg-secondary-600 text-white rounded-lg text-sm font-medium hover:bg-secondary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Send to tradie
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Refund Section ─── */
function RefundSection({ paymentId, onSuccess, onError }: { paymentId: string; onSuccess: () => void; onError: (msg: string) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleRefund = async () => {
    if (!reason.trim()) { onError('Please provide a reason for the refund request.'); return; }
    setProcessing(true);
    try {
      await processRefund(paymentId, reason.trim());
      onSuccess();
    } catch (err) {
      onError(friendlyError(err, 'Unable to process refund. Please try again or contact support.'));
    } finally {
      setProcessing(false);
    }
  };

  if (!showForm) {
    return (
      <button onClick={() => setShowForm(true)}
        className="w-full px-4 py-2.5 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
        <RotateCcw className="w-4 h-4" /> Request Refund
      </button>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Request a refund</p>
          <p className="text-xs text-red-600 mt-0.5">Please explain why. Our team will review within 2–3 business days.</p>
        </div>
      </div>
      <textarea value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Describe the reason for your refund..." rows={3}
        className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white mb-3 resize-none" />
      <div className="flex gap-2">
        <button onClick={() => setShowForm(false)}
          className="flex-1 px-3 py-2 bg-white border border-surface-300 text-navy-700 rounded-lg text-sm font-medium hover:bg-surface-50 transition-colors">
          Cancel
        </button>
        <button onClick={handleRefund} disabled={processing || !reason.trim()}
          className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5">
          {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Submit
        </button>
      </div>
    </div>
  );
}
