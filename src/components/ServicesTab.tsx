import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw, FileText, Inbox, Loader2, CheckCircle2, CheckCheck, Shield, MapPin, User, Clock, ClipboardList, ChevronDown, ChevronRight, Plus, Calendar, Phone, Mail, MessageCircle, Send, Package, AlertTriangle, X, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/edgeFn';
import { getTradieUpcomingSessions, getTradieRecurringJobs, cancelRecurringJob, pauseRecurringJob, resumeRecurringJob, generateFutureSessions } from '../lib/recurringJobs';
import { getSupplySuggestions, SUPPLY_DEFAULT_UNITS } from '../lib/tradeCategories';
import type { RecurringSession, RecurringJob, CancellationCategory } from '../lib/recurringJobs';
import CancelServiceModal from './CancelServiceModal';
import { getActiveAgreements } from '../lib/ongoingServices';
import type { ServiceAgreement, SupplyItem } from '../types/database';
import RecurringSessionCard from './RecurringSessionCard';
import LogVisitModal from './LogVisitModal';
import RecurringInvoiceCard from './RecurringInvoiceCard';
import type { RecurringInvoice } from './RecurringInvoiceCard';
import { useToast } from '../hooks/useToast';

type RecurringSessionWithJob = RecurringSession & {
  recurring_job?: {
    trade_category: string;
    service_subtype: string | null;
    description: string;
    client_id: string;
    preferred_time: string | null;
    agreed_price?: number | null;
    auto_accept?: boolean | null;
    location?: string | null;
    frequency_months?: number;
    billing_cycle?: string | null;
    last_invoiced_at?: string | null;
    supplies?: SupplyItem[] | null;
    consumables_provider?: 'client' | 'tradie_billed' | null;
    client?: { full_name: string; phone?: string | null; email?: string | null } | null;
    is_active?: boolean;
    cancelled_at?: string | null;
  };
};

// Pause / Resume / Stop controls for an ongoing service
function ServiceControls({ jobId, jobLabel, isActive, isCancelled, onChanged }: { jobId: string; jobLabel: string; isActive: boolean; isCancelled: boolean; onChanged: () => void }) {
  const [confirming, setConfirming] = useState<'pause' | 'stop' | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handlePause = async () => {
    setLoading(true);
    try {
      await pauseRecurringJob(jobId, 'tradie');
      onChanged();
      showToast('Service paused — you can resume anytime');
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setLoading(false);
      setConfirming(null);
    }
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      await resumeRecurringJob(jobId, 'tradie');
      onChanged();
      showToast('Service resumed');
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (payload?: { category?: CancellationCategory; reason?: string }) => {
    setLoading(true);
    try {
      await cancelRecurringJob(jobId, 'tradie', payload);
      onChanged();
      showToast('Ongoing service cancelled');
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setLoading(false);
      setConfirming(null);
    }
  };

  if (isCancelled) {
    return (
      <span className="text-xs text-gray-400 font-medium">Service ended</span>
    );
  }

  // The cancel modal is rendered alongside every interactive branch so the
  // "Cancel permanently" link on paused services and the "End Service" link
  // on active services both open the same flow.
  const cancelModal = (
    <CancelServiceModal
      isOpen={confirming === 'stop'}
      serviceLabel={jobLabel}
      otherPartyRole="client"
      onCancel={() => setConfirming(null)}
      onConfirm={(payload) => handleStop(payload)}
    />
  );

  if (!isActive) {
    return (
      <>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResume}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Resume Service'}
          </button>
          <button
            onClick={() => setConfirming('stop')}
            className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
          >
            Cancel permanently
          </button>
        </div>
        {cancelModal}
      </>
    );
  }

  if (confirming === 'pause') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">Put this service on hold? Upcoming sessions will be paused.</span>
        <button
          onClick={handlePause}
          disabled={loading}
          className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(null)}
          className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirming('pause')}
          className="text-xs text-amber-600 hover:text-amber-700 font-medium transition-colors"
        >
          Put on Hold
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setConfirming('stop')}
          className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
        >
          End Service
        </button>
      </div>
      {cancelModal}
    </>
  );
}

// Auto-accept / Manual-accept toggle for an ongoing service
function AcceptModeToggle({ jobId, currentAutoAccept, onToggled }: { jobId: string; currentAutoAccept: boolean; onToggled: () => void }) {
  const [toggling, setToggling] = useState(false);
  const { showToast } = useToast();

  const handleToggle = async (newValue: boolean) => {
    if (newValue === currentAutoAccept) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from('recurring_jobs')
        .update({ auto_accept: newValue })
        .eq('id', jobId);
      if (error) throw error;

      // When switching to auto-accept, pre-generate future sessions
      if (newValue) {
        try {
          // Also upgrade any pending_confirmation sessions to scheduled
          await supabase
            .from('recurring_sessions')
            .update({ status: 'scheduled', confirmation_deadline: null })
            .eq('recurring_job_id', jobId)
            .eq('status', 'pending_confirmation');

          const created = await generateFutureSessions(jobId);
          showToast(created > 0
            ? `Auto-confirm on — ${created} future session${created !== 1 ? 's' : ''} scheduled`
            : 'Auto-confirm on — sessions are up to date'
          );
        } catch {
          showToast('Auto-confirm on');
        }
      } else {
        showToast('Switched to manual review');
      }
      onToggled();
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => handleToggle(true)}
        disabled={toggling}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
          currentAutoAccept
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <CheckCircle2 className="w-3 h-3" />
        Auto-Schedule
      </button>
      <button
        onClick={() => handleToggle(false)}
        disabled={toggling}
        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
          !currentAutoAccept
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <Shield className="w-3 h-3" />
        Manual
      </button>
      {toggling && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
    </div>
  );
}

// Invoice section — persistent settings + manual send
function InvoiceSection({ jobId, billingCycle, lastInvoicedAt, onSent }: {
  jobId: string;
  billingCycle: string;
  lastInvoicedAt: string | null;
  onSent: () => void;
}) {
  const [cycle, setCycle] = useState<'weekly' | 'fortnightly' | 'monthly'>(
    billingCycle === 'weekly' ? 'weekly' : billingCycle === 'fortnightly' ? 'fortnightly' : 'monthly'
  );
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [sendDay, setSendDay] = useState(1);
  const [sendTime, setSendTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewSessions, setPreviewSessions] = useState<{ id: string; scheduled_date: string; status: string; extra_cost?: number; supply_cost?: number; notes?: string; invoiceStatus?: string }[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { showToast } = useToast();

  // Load current settings from DB on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase
          .from('recurring_jobs')
          .select('*')
          .eq('id', jobId)
          .maybeSingle();
        if (cancelled || !data) { if (!cancelled) setLoaded(true); return; }
        const row = data as Record<string, unknown>;
        if (row.billing_cycle) setCycle(row.billing_cycle as 'weekly' | 'fortnightly' | 'monthly');
        if (row.auto_invoice != null) setAutoInvoice(!!row.auto_invoice);
        if (row.invoice_send_day != null) setSendDay(row.invoice_send_day as number);
        if (row.invoice_send_time != null) setSendTime((row.invoice_send_time as string).slice(0, 5));
      } catch { /* ignore */ }
      if (!cancelled) setLoaded(true);
    };
    load();
    return () => { cancelled = true; };
  }, [jobId]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('recurring_jobs')
        .update({
          billing_cycle: cycle,
          auto_invoice: autoInvoice,
          invoice_send_day: sendDay,
          invoice_send_time: sendTime + ':00',
        })
        .eq('id', jobId);
      if (error) throw error;
      showToast(autoInvoice
        ? `Auto-invoicing set — ${cycle === 'weekly' ? 'weekly' : cycle === 'fortnightly' ? 'every 2 weeks' : 'monthly'} on day ${sendDay} at ${sendTime}`
        : 'Invoice settings saved'
      );
      setShowSettings(false);
      onSent();
    } catch {
      showToast('Failed to save settings', true);
    } finally {
      setSaving(false);
    }
  };

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const [billingStart, setBillingStart] = useState('');
  const [billingEnd, setBillingEnd] = useState('');
  const [uninvoicedCount, setUninvoicedCount] = useState(0);

  // Load uninvoiced completed session count on mount
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const loadCount = async () => {
      try {
        // Find latest paid invoice cutoff
        const { data: paidInvoices } = await supabase
          .from('recurring_invoices')
          .select('billing_period_end')
          .eq('recurring_job_id', jobId)
          .eq('status', 'paid')
          .order('billing_period_end', { ascending: false })
          .limit(1);

        const paidCutoff = paidInvoices?.[0]?.billing_period_end ?? null;
        const startDate = paidCutoff
          ? (() => { const d = new Date(paidCutoff); d.setDate(d.getDate() + 1); return fmt(d); })()
          : '2020-01-01';

        // Find invoice date ranges already covered — including auto-generated
        // invoices sitting in pending_approval. Those sessions are done; the
        // tradie must not be prompted to re-invoice them.
        const { data: unpaidInvoices } = await supabase
          .from('recurring_invoices')
          .select('billing_period_start, billing_period_end')
          .eq('recurring_job_id', jobId)
          .in('status', ['pending_approval', 'sent', 'overdue', 'processing', 'disputed']);

        // Count completed sessions not covered by any invoice
        const { data } = await supabase
          .from('recurring_sessions')
          .select('id, scheduled_date')
          .eq('recurring_job_id', jobId)
          .gte('scheduled_date', startDate)
          .in('status', ['completed', 'extra']);

        const uninvoiced = (data ?? []).filter(s => {
          return !(unpaidInvoices ?? []).some(inv =>
            s.scheduled_date >= inv.billing_period_start && s.scheduled_date <= inv.billing_period_end
          );
        });

        if (!cancelled) setUninvoicedCount(uninvoiced.length);
      } catch { /* ignore */ }
    };
    loadCount();
    return () => { cancelled = true; };
  }, [loaded, jobId]);

  const handleShowPreview = async () => {
    setLoadingPreview(true);
    setShowInvoicePreview(true);
    try {
      // 1. Find the latest PAID invoice end date — sessions before this are done
      const { data: paidInvoices } = await supabase
        .from('recurring_invoices')
        .select('billing_period_end')
        .eq('recurring_job_id', jobId)
        .eq('status', 'paid')
        .order('billing_period_end', { ascending: false })
        .limit(1);

      const paidCutoff = paidInvoices?.[0]?.billing_period_end ?? null;

      // 2. Find invoices that already cover sessions — including auto-generated
      //    ones in pending_approval (already sent to the client for approval),
      //    so the tradie isn't prompted to re-invoice and hit a 409 conflict.
      const { data: unpaidInvoices } = await supabase
        .from('recurring_invoices')
        .select('billing_period_start, billing_period_end, status')
        .eq('recurring_job_id', jobId)
        .in('status', ['pending_approval', 'sent', 'overdue', 'processing', 'disputed']);

      // 3. Fetch completed sessions AFTER paid cutoff
      const startDate = paidCutoff
        ? fmt((() => { const d = new Date(paidCutoff); d.setDate(d.getDate() + 1); return d; })())
        : '2020-01-01';

      const { data } = await supabase
        .from('recurring_sessions')
        .select('id, scheduled_date, status, extra_cost, supply_cost, notes')
        .eq('recurring_job_id', jobId)
        .gte('scheduled_date', startDate)
        .in('status', ['completed', 'extra'])
        .order('scheduled_date', { ascending: true });

      // 4. Mark sessions that fall within an unpaid invoice's billing period
      const sessions = (data ?? []).map(s => {
        const matchingInvoice = (unpaidInvoices ?? []).find(inv =>
          s.scheduled_date >= inv.billing_period_start && s.scheduled_date <= inv.billing_period_end
        );
        return { ...s, invoiceStatus: matchingInvoice ? matchingInvoice.status : undefined };
      });

      setPreviewSessions(sessions);

      // Set billing period from uninvoiced sessions only (for the Send Invoice button)
      const uninvoicedSessions = sessions.filter(s => !s.invoiceStatus);
      if (uninvoicedSessions.length > 0) {
        setBillingStart(uninvoicedSessions[0].scheduled_date);
        setBillingEnd(uninvoicedSessions[uninvoicedSessions.length - 1].scheduled_date);
      } else if (sessions.length > 0) {
        setBillingStart(sessions[0].scheduled_date);
        setBillingEnd(sessions[sessions.length - 1].scheduled_date);
      } else {
        const now = new Date();
        const start = cycle === 'fortnightly'
          ? (() => { const d = new Date(now); d.setDate(d.getDate() - 14); return d; })()
          : new Date(now.getFullYear(), now.getMonth(), 1);
        setBillingStart(fmt(start));
        setBillingEnd(fmt(now));
      }
    } catch {
      setPreviewSessions([]);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      const result = await callEdgeFunction<{ invoiceId: string; total: number; stripePaymentUrl: string }>(
        'generate-recurring-invoice',
        { recurringJobId: jobId, billingPeriodStart: billingStart, billingPeriodEnd: billingEnd },
      );

      showToast(`Invoice sent — $${result.total?.toFixed(2) || '0.00'}`);
      setShowInvoicePreview(false);
      setUninvoicedCount(0);
      onSent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showToast(msg.includes('No billable') ? 'No completed sessions to invoice yet' : msg, true);
    } finally {
      setSending(false);
    }
  };

  const cycleLabel = cycle === 'weekly' ? 'Weekly' : cycle === 'fortnightly' ? 'Fortnightly' : 'Monthly';
  const dayLabel = cycle === 'monthly'
    ? `${sendDay}${sendDay === 1 ? 'st' : sendDay === 2 ? 'nd' : sendDay === 3 ? 'rd' : 'th'} of each month`
    : cycle === 'weekly' ? 'every week' : 'every 2 weeks';

  const periodStartLabel = billingStart ? new Date(billingStart + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const periodEndLabel = billingEnd ? new Date(billingEnd + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const uninvoicedSessions = previewSessions.filter(s => !s.invoiceStatus);
  const awaitingPaymentSessions = previewSessions.filter(s => !!s.invoiceStatus);
  const completedCount = uninvoicedSessions.filter(s => s.status === 'completed').length;
  const awaitingConfirmationCount = uninvoicedSessions.filter(s => s.status === 'awaiting_completion').length;
  const extraCount = uninvoicedSessions.filter(s => s.status === 'extra').length;

  return (
    <div className="space-y-2">
      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleShowPreview}
          disabled={loadingPreview}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          <FileText className="w-3 h-3" />
          {loadingPreview ? 'Loading...' : 'Send Invoice'}
        </button>
        <button
          onClick={() => { setShowSettings(!showSettings); setShowInvoicePreview(false); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Clock className="w-3 h-3" />
          {showSettings ? 'Hide Settings' : 'Invoice Settings'}
        </button>
        {autoInvoice && !showSettings && !showInvoicePreview && (
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            Auto — {cycleLabel} · {dayLabel} at {sendTime}
          </span>
        )}
        {!autoInvoice && !showSettings && !showInvoicePreview && (
          <span className="text-xs text-gray-400">Manual · {cycleLabel}</span>
        )}
        {uninvoicedCount > 0 && !showSettings && !showInvoicePreview && (
          <button
            onClick={handleShowPreview}
            disabled={loadingPreview}
            className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full hover:bg-amber-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            {uninvoicedCount} session{uninvoicedCount !== 1 ? 's' : ''} ready to invoice
          </button>
        )}
        {lastInvoicedAt && !showSettings && !showInvoicePreview && (
          <span className="text-xs text-gray-400">
            Last: {new Date(lastInvoicedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>

      {/* Invoice Preview */}
      {showInvoicePreview && !showSettings && (
        <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-900">Invoice Preview</p>
            <button onClick={() => setShowInvoicePreview(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>

          <div className="p-2.5 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-700 mb-1">Billing Period</p>
            <p className="text-sm font-semibold text-gray-900">{periodStartLabel} — {periodEndLabel}</p>
            <p className="text-xs text-gray-500 mt-0.5">{cycleLabel} billing cycle</p>
          </div>

          {previewSessions.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-500">No completed sessions in this period.</p>
              <p className="text-xs text-gray-400 mt-1">Complete visits first, then invoice.</p>
            </div>
          ) : (
            <>
              {/* Awaiting Payment sessions — already invoiced but unpaid */}
              {awaitingPaymentSessions.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-700 mb-1.5">Already Invoiced ({awaitingPaymentSessions.length})</p>
                  <div className="space-y-1">
                    {awaitingPaymentSessions.map((s) => {
                      const badge = ({
                        overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-700' },
                        disputed: { label: 'Disputed', cls: 'bg-red-100 text-red-700' },
                        pending_approval: { label: 'Awaiting Client Approval', cls: 'bg-amber-100 text-amber-700' },
                        processing: { label: 'Processing', cls: 'bg-secondary-100 text-secondary-700' },
                        sent: { label: 'Invoiced', cls: 'bg-amber-100 text-amber-700' },
                      } as Record<string, { label: string; cls: string }>)[s.invoiceStatus ?? 'sent']
                        ?? { label: 'Invoiced', cls: 'bg-amber-100 text-amber-700' };
                      return (
                        <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-amber-50 rounded text-xs">
                          <span className="text-gray-700">
                            {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Uninvoiced completed sessions — ready to invoice */}
              {completedCount > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Ready to Invoice ({completedCount})</p>
                  <div className="space-y-1">
                    {uninvoicedSessions.filter(s => s.status === 'completed').map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-xs">
                        <span className="text-gray-700">
                          {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Confirmed
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Awaiting tradie confirmation — opted out of auto-complete.
                  These are NOT counted toward the invoice until the tradie taps
                  Mark Complete on each one (or flips auto_complete_sessions back on). */}
              {awaitingConfirmationCount > 0 && (
                <div>
                  <p className="text-xs font-medium text-orange-700 mb-1.5">Awaiting Your Confirmation ({awaitingConfirmationCount})</p>
                  <div className="space-y-1">
                    {uninvoicedSessions.filter(s => s.status === 'awaiting_completion').map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-orange-50 rounded text-xs">
                        <span className="text-gray-700">
                          {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <span className="inline-flex items-center gap-1 text-orange-700 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          Confirm in Schedule
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    These visits won't be invoiced until you confirm them as completed.
                  </p>
                </div>
              )}

              {extraCount > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Extra Sessions ({extraCount})</p>
                  <div className="space-y-1">
                    {uninvoicedSessions.filter(s => s.status === 'extra').map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-amber-50 rounded text-xs">
                        <div className="min-w-0">
                          <span className="text-gray-700">
                            {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </span>
                          {s.notes && (
                            <span className="text-gray-400 ml-1.5">— {s.notes}</span>
                          )}
                        </div>
                        <span className="text-amber-700 font-medium flex-shrink-0 ml-2">${(s.extra_cost ?? 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Supplies total */}
              {(() => {
                const suppliesTotal = uninvoicedSessions.reduce((sum, s) => sum + ((s.supply_cost as number) ?? 0), 0);
                return suppliesTotal > 0 ? (
                  <div className="flex items-center justify-between py-2 px-2 bg-secondary-50 rounded text-xs">
                    <span className="font-medium text-secondary-700 inline-flex items-center gap-1.5">
                      <Package className="w-3 h-3" />
                      Supplies & Materials
                    </span>
                    <span className="text-secondary-700 font-semibold">${suppliesTotal.toFixed(2)}</span>
                  </div>
                ) : null;
              })()}

              {(completedCount + extraCount) > 0 ? (
                <>
                  <p className="text-xs text-gray-500">
                    The invoice will be calculated at the agreed rate and sent to the client with a Stripe payment link.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleSendNow}
                      disabled={sending}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      {sending ? 'Generating & Sending...' : `Send Invoice (${completedCount + extraCount} sessions)`}
                    </button>
                    <button
                      onClick={() => setShowInvoicePreview(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-500">
                  All completed sessions have been invoiced. Waiting for payment.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
          <p className="text-xs font-semibold text-gray-900">Invoice Schedule</p>

          {/* Billing cycle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Billing Cycle</label>
            <div className="flex gap-2">
              {(['weekly', 'fortnightly', 'monthly'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setCycle(opt)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    cycle === opt
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:bg-white'
                  }`}
                >
                  {opt === 'weekly' ? 'Weekly' : opt === 'fortnightly' ? 'Fortnightly' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-invoice toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div
              onClick={() => setAutoInvoice(!autoInvoice)}
              className={`relative w-9 h-5 rounded-full transition-colors ${autoInvoice ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoInvoice ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-xs font-medium text-gray-700">Auto-send invoices</span>
          </label>

          {/* Day & time (only when auto is on) */}
          {autoInvoice && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {cycle === 'monthly' ? 'Day of Month' : 'Send Every'}
                </label>
                {cycle === 'monthly' ? (
                  <select
                    value={sendDay}
                    onChange={(e) => setSendDay(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>
                        {d}{d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={sendDay}
                    onChange={(e) => setSendDay(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                <select
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'].map(t => (
                    <option key={t} value={t}>
                      {new Date(`2000-01-01T${t}`).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {autoInvoice && (
            <p className="text-xs text-gray-500">
              Invoice will be automatically generated and sent to the client{cycle === 'monthly'
                ? ` on the ${sendDay}${sendDay === 1 ? 'st' : sendDay === 2 ? 'nd' : sendDay === 3 ? 'rd' : 'th'} of each month`
                : cycle === 'weekly' ? ' every week' : ' every 2 weeks'
              } at {new Date(`2000-01-01T${sendTime}`).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}.
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={() => setShowSettings(false)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick inline chat for messaging a client ──
function QuickChat({ clientId, clientName, userId, recurringJobId }: { clientId: string; clientName: string; userId: string; recurringJobId: string }) {
  const [messages, setMessages] = useState<{ id: string; content: string; sender_id: string; created_at: string; read_at: string | null }[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Find conversation scoped to this specific recurring job
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoading(true);
      try {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('recurring_job_id', recurringJobId)
          .maybeSingle();

        if (cancelled) return;

        if (conv) {
          setConversationId(conv.id);
          const { data: msgs } = await supabase
            .from('messages')
            .select('id, content, sender_id, created_at, read_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(20);
          if (!cancelled && msgs) setMessages(msgs.reverse());
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [userId, clientId, recurringJobId]);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const { data: conv } = await supabase
          .from('conversations')
          .insert({ created_by: userId, title: `Chat with ${clientName}`, recurring_job_id: recurringJobId })
          .select()
          .single();
        if (!conv) throw new Error('Failed to create conversation');
        await supabase.from('conversation_participants').insert([
          { conversation_id: conv.id, user_id: userId },
          { conversation_id: conv.id, user_id: clientId },
        ]);
        convId = conv.id;
        setConversationId(convId);
      }
      const { data: msg } = await supabase
        .from('messages')
        .insert({ conversation_id: convId, sender_id: userId, receiver_id: clientId, content: newMessage.trim() })
        .select('id, content, sender_id, created_at, read_at')
        .single();
      if (msg) setMessages(prev => [...prev, msg]);
      setNewMessage('');
    } catch { /* ignore */ }
    setSending(false);
  };

  return (
    <div className="border-t border-gray-100">
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Chat with {clientName}</span>
          {conversationId && (
            <button
              onClick={() => navigate(`/messages?conversation=${conversationId}`)}
              className="text-xs text-secondary-500 hover:text-secondary-700 font-medium"
            >
              Open full chat
            </button>
          )}
        </div>
        <div ref={chatContainerRef} className="bg-gray-50 rounded-lg border border-gray-200 max-h-48 overflow-y-auto p-3 space-y-2 mb-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No messages yet. Start the conversation!</p>
          ) : (
            messages.map(msg => {
              const isOwn = msg.sender_id === userId;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] px-3 py-1.5 rounded-lg text-xs ${
                    isOwn
                      ? 'bg-secondary-500 text-white'
                      : 'bg-white border border-gray-200 text-gray-700'
                  }`}>
                    {msg.content}
                    {isOwn && (
                      <div className="flex justify-end mt-0.5">
                        <CheckCheck
                          className={`w-3 h-3 ${msg.read_at ? 'text-emerald-300' : 'text-secondary-200'}`}
                          aria-label={msg.read_at ? 'Seen' : 'Sent'}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="px-3 py-2 bg-secondary-500 text-white rounded-lg hover:bg-secondary-600 disabled:opacity-50 transition-colors"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Supplies section — tradie view: see list, add/remove, flag restock ──
function SuppliesSection({ supplies, jobId, clientId, tradeCategory, onUpdate }: {
  supplies: SupplyItem[];
  jobId: string;
  clientId?: string;
  tradeCategory?: string;
  onUpdate: () => void;
}) {
  const suggestions = getSupplySuggestions(tradeCategory || '');
  // Filter out items already added
  const availableSuggestions = suggestions.filter(s => !supplies.some(item => item.name.toLowerCase() === s.toLowerCase()));
  const [restocking, setRestocking] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newProvidedBy, setNewProvidedBy] = useState<'tradie' | 'client'>('tradie');
  const [newStock, setNewStock] = useState('');
  const [newThreshold, setNewThreshold] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const lowStockItems = supplies.filter(s =>
    s.stock_level != null && s.restock_threshold != null && s.stock_level <= s.restock_threshold
  );

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const item: SupplyItem = {
        id: crypto.randomUUID(),
        name: newName.trim(),
        unit: newUnit.trim() || undefined,
        provided_by: newProvidedBy,
        stock_level: newStock && !isNaN(Number(newStock)) ? Number(newStock) : null,
        restock_threshold: newThreshold && !isNaN(Number(newThreshold)) ? Number(newThreshold) : null,
        restock_notified_at: null,
        notes: newNotes.trim() || undefined,
      };
      const updated = [...supplies, item];
      await supabase.from('recurring_jobs').update({ supplies: updated }).eq('id', jobId);
      setNewName(''); setNewUnit(''); setNewStock(''); setNewThreshold(''); setNewNotes('');
      setShowAddForm(false);
      showToast(`${item.name} added to supplies`);
      onUpdate();
    } catch {
      showToast('Failed to add supply', true);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      const updated = supplies.filter(s => s.id !== itemId);
      await supabase.from('recurring_jobs').update({ supplies: updated }).eq('id', jobId);
      showToast('Supply removed');
      onUpdate();
    } catch {
      showToast('Failed to remove supply', true);
    }
  };

  const handleFlagRestock = async (item: SupplyItem) => {
    if (!clientId) return;
    setRestocking(item.id);
    try {
      const updatedSupplies = supplies.map(s =>
        s.id === item.id ? { ...s, restock_notified_at: new Date().toISOString() } : s
      );
      await supabase.from('recurring_jobs').update({ supplies: updatedSupplies }).eq('id', jobId);

      await supabase.rpc('create_notification', {
        p_user_id: clientId,
        p_title: 'Supply Restock Needed',
        p_message: `${item.name} is running low (${item.stock_level ?? 0} ${item.unit || 'remaining'}). Please arrange a restock.`,
        p_type: 'supply_restock_needed',
        p_channel: 'in_app',
        p_read: false,
        p_link: null,
        p_job_id: null,
        p_metadata: { recurring_job_id: jobId, supply_id: item.id, supply_name: item.name },
      });

      showToast(`Restock alert sent for ${item.name}`);
      onUpdate();
    } catch {
      showToast('Failed to send restock alert', true);
    } finally {
      setRestocking(null);
    }
  };

  const handleUpdateStock = async (itemId: string, newLevel: number) => {
    try {
      const updatedSupplies = supplies.map(s =>
        s.id === itemId ? { ...s, stock_level: newLevel, restock_notified_at: null } : s
      );
      await supabase.from('recurring_jobs').update({ supplies: updatedSupplies }).eq('id', jobId);
      onUpdate();
    } catch {
      showToast('Failed to update stock', true);
    }
  };

  const top5 = availableSuggestions.slice(0, 5);
  const isCustom = newName !== '' && !top5.includes(newName);

  return (
    <div className="border-t border-gray-100 px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide">
          <Package className="w-3.5 h-3.5 text-emerald-500" />
          Supplies
          {supplies.length > 0 && <span className="text-gray-400 font-normal normal-case">({supplies.length})</span>}
          {lowStockItems.length > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-semibold normal-case">
              {lowStockItems.length} low
            </span>
          )}
        </p>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            showAddForm
              ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }`}
        >
          {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showAddForm ? 'Close' : 'Add'}
        </button>
      </div>

      {/* Supply list */}
      {supplies.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden mb-3">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-center px-2 py-2 w-24">Stock</th>
                <th className="text-right px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {supplies.map(item => {
                const isLow = item.stock_level != null && item.restock_threshold != null && item.stock_level <= item.restock_threshold;
                const alreadyNotified = !!item.restock_notified_at;
                return (
                  <tr key={item.id} className={isLow ? 'bg-amber-50/50' : ''}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-800">{item.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                          item.provided_by === 'tradie' ? 'bg-secondary-50 text-secondary-600' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {item.provided_by === 'tradie' ? 'You' : 'Client'}
                        </span>
                      </div>
                      {item.notes && <p className="text-[10px] text-gray-400 mt-0.5">{item.notes}</p>}
                    </td>
                    <td className="px-2 py-2.5">
                      {item.stock_level != null ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleUpdateStock(item.id, Math.max(0, (item.stock_level ?? 0) - 1))}
                            className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center transition-colors"
                          >−</button>
                          <span className={`text-xs font-bold min-w-[24px] text-center ${isLow ? 'text-amber-700' : 'text-gray-800'}`}>
                            {item.stock_level}
                          </span>
                          <button
                            onClick={() => handleUpdateStock(item.id, (item.stock_level ?? 0) + 1)}
                            className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center transition-colors"
                          >+</button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300 block text-center">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isLow && !alreadyNotified && (
                          <button
                            onClick={() => handleFlagRestock(item)}
                            disabled={restocking === item.id}
                            className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-semibold rounded transition-colors disabled:opacity-50"
                          >
                            {restocking === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Restock'}
                          </button>
                        )}
                        {isLow && alreadyNotified && (
                          <span className="text-[9px] text-amber-600 font-medium">Alerted</span>
                        )}
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {supplies.length === 0 && !showAddForm && (
        <p className="text-xs text-gray-400 mb-2">No supplies listed yet.</p>
      )}

      {/* Add supply form */}
      {showAddForm && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-800">New Supply Item</p>

          {/* Item selector */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Item</label>
            <select
              value={top5.includes(newName) ? newName : newName === '' ? '' : '__other__'}
              onChange={e => {
                if (e.target.value === '__other__') {
                  setNewName('');
                  setNewUnit('');
                  setTimeout(() => document.getElementById(`custom-supply-${jobId}`)?.focus(), 50);
                } else {
                  setNewName(e.target.value);
                  setNewUnit(SUPPLY_DEFAULT_UNITS[e.target.value] || '');
                }
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value=""></option>
              {top5.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="__other__">Other</option>
            </select>
          </div>

          {/* Custom name input — shown when "Other" is selected */}
          {isCustom && (
            <input
              id={`custom-supply-${jobId}`}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Enter item name..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          )}

          {/* Details row */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Unit</label>
              <input
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                placeholder="rolls"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Supplied by</label>
              <select
                value={newProvidedBy}
                onChange={e => setNewProvidedBy(e.target.value as 'tradie' | 'client')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                <option value="tradie">Me</option>
                <option value="client">Client</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">In stock</label>
              <input
                type="number"
                value={newStock}
                onChange={e => setNewStock(e.target.value)}
                placeholder="10"
                min="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Alert at</label>
              <input
                type="number"
                value={newThreshold}
                onChange={e => setNewThreshold(e.target.value)}
                placeholder="3"
                min="0"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Notes (optional)</label>
            <input
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              placeholder="Brand preference, where to find it..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAddItem}
              disabled={!newName.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add to List
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewName(''); }}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Ongoing service job card — professional layout
function JobCard({
  jobId, jobLabel, clientName, clientPhone, clientEmail, clientId, freqLabel, location, descLines, agreedPrice,
  isAutoAccept, isActive, isCancelled, billingCycle, lastInvoicedAt, sessions, userId, onUpdate,
  agreement, onAgreementRefresh, supplies, tradeCategory, consumablesProvider,
}: {
  jobId: string;
  jobLabel: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  clientId?: string;
  freqLabel: string | null;
  location?: string | null;
  descLines: string[];
  agreedPrice?: number | null;
  isAutoAccept: boolean;
  isActive: boolean;
  isCancelled: boolean;
  billingCycle: string;
  lastInvoicedAt: string | null;
  sessions: RecurringSessionWithJob[];
  userId?: string;
  onUpdate: () => void;
  agreement?: (ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } }) | null;
  onAgreementRefresh?: () => void;
  supplies?: SupplyItem[];
  tradeCategory?: string;
  consumablesProvider?: 'client' | 'tradie_billed';
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showFutureVisits, setShowFutureVisits] = useState(false);
  const [showLogVisit, setShowLogVisit] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSetAllTime, setShowSetAllTime] = useState(false);
  const [allStart, setAllStart] = useState('');
  const [allEnd, setAllEnd] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const { showToast } = useToast();

  const handleSetAllTime = async () => {
    if (!allStart) return;
    setSavingAll(true);
    try {
      const startVal = allStart + ':00';
      const endVal = allEnd ? allEnd + ':00' : null;
      await supabase.from('recurring_jobs').update({ preferred_time: startVal }).eq('id', jobId);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
      await supabase.from('recurring_sessions')
        .update({ start_time: startVal, end_time: endVal })
        .eq('recurring_job_id', jobId)
        .in('status', ['scheduled', 'pending_confirmation'])
        .gte('scheduled_date', today);
      showToast('Time set for all upcoming visits');
      setShowSetAllTime(false);
      setAllStart('');
      setAllEnd('');
      onUpdate();
    } catch {
      showToast('Failed to update times', true);
    } finally {
      setSavingAll(false);
    }
  };

  const statusBadge = isCancelled
    ? { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Ended' }
    : !isActive
    ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Paused' }
    : { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', label: 'Active' };

  // Split sessions: next 3 visits get full cards, rest are compact
  const upcomingSessions = sessions.slice(0, 3);
  const futureSessionsList = sessions.slice(3);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ─── Header — click to collapse/expand ─── */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isCollapsed ? '-rotate-90' : ''}`} />
              <h4 className="text-sm font-bold text-gray-900 capitalize">{jobLabel}</h4>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${statusBadge.bg} ${statusBadge.text}`}>
                {statusBadge.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <User className="w-3 h-3 text-gray-400" />
                {clientName}
              </span>
              {clientPhone && (
                <a href={`tel:${clientPhone}`} className="inline-flex items-center gap-1.5 text-xs text-secondary-600 hover:text-secondary-700 font-medium">
                  <Phone className="w-3 h-3" />
                  {clientPhone}
                </a>
              )}
              {clientEmail && (
                <a href={`mailto:${clientEmail}`} className="inline-flex items-center gap-1.5 text-xs text-secondary-600 hover:text-secondary-700 font-medium">
                  <Mail className="w-3 h-3" />
                  {clientEmail}
                </a>
              )}
              {freqLabel && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <RefreshCw className="w-3 h-3 text-gray-400" />
                  {freqLabel}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 truncate max-w-[240px]">
                  <MapPin className="w-3 h-3 flex-shrink-0 text-gray-400" />
                  {location}
                </span>
              )}
              {agreedPrice != null && agreedPrice > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  ${agreedPrice.toFixed(2)}/visit
                </span>
              )}
              {isCollapsed && sessions.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-secondary-600">
                  {sessions.length} upcoming
                </span>
              )}
            </div>
          </div>
        </div>
      </button>

      {!isCollapsed && (
        <>
        {/* ─── Quick Controls ─── */}
        <div className="px-5 pb-4">
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
            <AcceptModeToggle
              jobId={jobId}
              currentAutoAccept={isAutoAccept}
              onToggled={onUpdate}
            />
            {clientId && (
              <button
                onClick={() => setShowChat(!showChat)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  showChat
                    ? 'bg-secondary-100 text-secondary-700 border border-secondary-300'
                    : 'text-secondary-600 border border-secondary-200 hover:bg-secondary-50'
                }`}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Message Client
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <ServiceControls jobId={jobId} jobLabel={jobLabel} isActive={isActive} isCancelled={isCancelled} onChanged={onUpdate} />
            </div>
          </div>
        </div>

        {/* ─── Quick Chat ─── */}
        {showChat && clientId && userId && (
          <QuickChat clientId={clientId} clientName={clientName} userId={userId} recurringJobId={jobId} />
        )}

        {/* ─── Task Requirements ─── */}
        {descLines.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
              <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
              Task Requirements ({descLines.length})
            </p>
            <ol className="space-y-1.5">
              {descLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{line}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

      {/* ─── Consumables responsibility chip ─── */}
      {/* Read-only signal so the tradie knows whether they need to bring
          household consumables (toilet paper, soap, etc.) or whether the
          client keeps them stocked. Their own working equipment is implicit. */}
      {isActive && !isCancelled && (
        <div className="border-t border-gray-100 px-5 py-3">
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            consumablesProvider === 'tradie_billed'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-gray-50 text-gray-700 border-gray-200'
          }`}>
            {consumablesProvider === 'tradie_billed'
              ? <>You supply consumables &middot; bills back on invoice</>
              : <>Client provides consumables on-site</>}
          </div>
        </div>
      )}

      {/* ─── Supplies ─── */}
      {isActive && !isCancelled && (supplies ?? []).length > 0 && (
        <SuppliesSection supplies={supplies ?? []} jobId={jobId} clientId={clientId} tradeCategory={tradeCategory} onUpdate={onUpdate} />
      )}

      {/* ─── Next Visits — full session cards (up to 3) ─── */}
      {upcomingSessions.length > 0 && (
        <div className="border-t border-gray-100">
          <div className="px-5 pt-3 pb-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {upcomingSessions.length === 1 ? 'Next Visit' : `Next ${upcomingSessions.length} Visits`}
            </p>
          </div>
          <div className="px-5 pb-4 space-y-2">
            {upcomingSessions.map((s, i) => (
              <RecurringSessionCard
                key={s.id}
                session={s}
                recurringJobId={s.recurring_job_id}
                userRole="tradie"
                tradieId={userId}
                clientId={s.recurring_job?.client_id}
                preferredTime={s.recurring_job?.preferred_time ?? undefined}
                agreedPrice={s.recurring_job?.agreed_price}
                showApplyToAll={i === 0 && !!s.start_time}
                onApplyToAll={async (start, end) => {
                  try {
                    const startVal = start.length === 5 ? start + ':00' : start;
                    const endVal = end ? (end.length === 5 ? end + ':00' : end) : null;
                    await supabase.from('recurring_jobs').update({ preferred_time: startVal }).eq('id', jobId);
                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
                    await supabase.from('recurring_sessions')
                      .update({ start_time: startVal, end_time: endVal })
                      .eq('recurring_job_id', jobId)
                      .in('status', ['scheduled', 'pending_confirmation'])
                      .gte('scheduled_date', todayStr);
                    showToast('Time applied to all upcoming visits');
                    onUpdate();
                  } catch {
                    showToast('Failed to apply time', true);
                  }
                }}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── Later Visits — collapsible ─── */}
      {futureSessionsList.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowFutureVisits(!showFutureVisits)}
            className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              {futureSessionsList.length} more scheduled visit{futureSessionsList.length !== 1 ? 's' : ''}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showFutureVisits ? '' : '-rotate-90'}`} />
          </button>
          {showFutureVisits && (
            isAutoAccept ? (
              <div className="px-5 pb-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {futureSessionsList.map((s) => {
                    const d = new Date((s.actual_date || s.scheduled_date) + 'T00:00:00');
                    return (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                        <Calendar className="w-3 h-3 text-blue-400 flex-shrink-0" />
                        <span className="text-xs text-gray-700 font-medium">
                          {d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="px-5 pb-4 space-y-2">
                {futureSessionsList.map((s) => (
                  <RecurringSessionCard
                    key={s.id}
                    session={s}
                    recurringJobId={s.recurring_job_id}
                    userRole="tradie"
                    tradieId={userId}
                    clientId={s.recurring_job?.client_id}
                    preferredTime={s.recurring_job?.preferred_time ?? undefined}
                    agreedPrice={s.recurring_job?.agreed_price}
                    onUpdate={onUpdate}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ─── Invoice & Billing ─── */}
      <div className="border-t border-gray-100 px-5 py-3 space-y-3">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <FileText className="w-3.5 h-3.5 text-gray-400" />
          Invoice & Billing
        </p>
        {agreement && (
          <button
            onClick={() => setShowLogVisit(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-50 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Log Extra Visit
          </button>
        )}
        <InvoiceSection
          jobId={jobId}
          billingCycle={billingCycle}
          lastInvoicedAt={lastInvoicedAt}
          onSent={onUpdate}
        />
      </div>
        </>
      )}

      {/* Log Extra Visit modal */}
      {agreement && (
        <LogVisitModal
          isOpen={showLogVisit}
          agreement={agreement}
          onClose={() => setShowLogVisit(false)}
          onSuccess={() => { setShowLogVisit(false); onAgreementRefresh?.(); }}
        />
      )}
    </div>
  );
}

const PROGRESSIVE_REVEAL_THRESHOLD = 10;

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || '?';
}

export default function ServicesTab() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [agreements, setAgreements] = useState<(ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } })[]>([]);
  const [recurringSessions, setRecurringSessions] = useState<RecurringSessionWithJob[]>([]);
  const [tradieJobs, setTradieJobs] = useState<RecurringJob[]>([]);
  const [tradieInvoices, setTradieInvoices] = useState<RecurringInvoice[]>([]);

  const [loading, setLoading] = useState(true);
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'past' | 'all'>('active');

  const fetchAgreements = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getActiveAgreements(user.id, 'tradie');
      setAgreements(data);
    } catch { /* ignore */ }
  }, [user]);

  const fetchRecurringSessions = useCallback(async () => {
    if (!user) return;
    // Fetch sessions and jobs independently so one failing doesn't block the other
    try {
      const sessions = await getTradieUpcomingSessions(user.id, 20);
      setRecurringSessions(sessions);
    } catch { /* ignore */ }
    try {
      const jobs = await getTradieRecurringJobs(user.id);
      setTradieJobs(jobs);
    } catch { /* ignore */ }
  }, [user]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch outstanding invoices (sent/overdue/draft) — always show all
      const { data: outstanding } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype, agreed_price)')
        .eq('tradie_id', user.id)
        .in('status', ['sent', 'overdue', 'draft', 'disputed'])
        .order('created_at', { ascending: false });

      setTradieInvoices((outstanding ?? []) as unknown as RecurringInvoice[]);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchAgreements(), fetchRecurringSessions(), fetchInvoices()])
      .finally(() => setLoading(false));
  }, [user, fetchAgreements, fetchRecurringSessions, fetchInvoices]);

  const isEmpty = agreements.length === 0 && recurringSessions.length === 0 && tradieJobs.length === 0 && tradieInvoices.length === 0;

  // Group sessions by job (memoized so it's stable for useMemo deps)
  const groupedByJob = useMemo(() => {
    const acc: Record<string, RecurringSessionWithJob[]> = {};
    for (const s of recurringSessions) {
      const key = s.recurring_job_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(s);
    }
    for (const job of tradieJobs) {
      if (!acc[job.id]) acc[job.id] = [];
    }
    return acc;
  }, [recurringSessions, tradieJobs]);

  // Build summary rows for each ongoing service (compact phone-book style)
  type JobRow = {
    jobId: string;
    sessions: RecurringSessionWithJob[];
    jobLabel: string;
    clientName: string;
    clientPhone?: string | null;
    clientEmail?: string | null;
    clientId?: string;
    freqLabel: string | null;
    location?: string | null;
    descLines: string[];
    agreedPrice?: number | null;
    isAutoAccept: boolean;
    isActive: boolean;
    isCancelled: boolean;
    billingCycle: string;
    lastInvoicedAt: string | null;
    matchingAgreement: (ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } }) | null;
    supplies: SupplyItem[];
    tradeCategory: string;
    consumablesProvider: 'client' | 'tradie_billed';
    nextVisitIso: string | null;
    nextVisitSortKey: number;
  };

  const FAR_FUTURE = Number.MAX_SAFE_INTEGER;
  const jobRows: JobRow[] = useMemo(() => Object.entries(groupedByJob).map(([jobId, sessions]) => {
    const jobInfo = sessions[0]?.recurring_job;
    const fallbackJob = tradieJobs.find(j => j.id === jobId);
    const fallbackClient = fallbackJob?.client as { full_name?: string; phone?: string; email?: string } | undefined;

    const tradeCategory = jobInfo?.trade_category || fallbackJob?.trade_category || '';
    const serviceSubtype = jobInfo?.service_subtype || fallbackJob?.service_subtype || null;
    const jobLabel = serviceSubtype || tradeCategory.replace(/_/g, ' ') || 'Ongoing Service';
    const isAutoAccept = !!(jobInfo?.auto_accept ?? fallbackJob?.auto_accept);
    const clientName = jobInfo?.client?.full_name || fallbackClient?.full_name || 'Client';
    const freq = jobInfo?.frequency_months ?? fallbackJob?.frequency_months;
    const freqLabel = freq === -3 ? 'Daily'
      : freq === -1 ? 'Weekly'
      : freq === -2 ? 'Fortnightly'
      : freq === 1 ? 'Monthly'
      : freq === 3 ? 'Quarterly'
      : freq === 6 ? 'Every 6 months'
      : freq === 12 ? 'Annually'
      : null;
    const descLines = (jobInfo?.description || fallbackJob?.description || '')
      .split('\n')
      .map(l => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean);
    const matchingAgreement = agreements.find(a => a.original_job_id === jobId) || null;
    const isActive = jobInfo?.is_active !== false && fallbackJob?.is_active !== false;
    const isCancelled = !!(jobInfo?.cancelled_at || fallbackJob?.cancelled_at);

    // Next scheduled visit
    const scheduled = sessions.find(s => s.status === 'scheduled' || s.status === 'pending_confirmation');
    const nextVisitIso = scheduled?.scheduled_date || fallbackJob?.next_due_date || null;

    return {
      jobId,
      sessions,
      jobLabel,
      clientName,
      clientPhone: jobInfo?.client?.phone || fallbackClient?.phone,
      clientEmail: jobInfo?.client?.email || fallbackClient?.email,
      clientId: jobInfo?.client_id || fallbackJob?.client_id,
      freqLabel,
      location: jobInfo?.location || fallbackJob?.location,
      descLines,
      agreedPrice: jobInfo?.agreed_price ?? fallbackJob?.agreed_price,
      isAutoAccept,
      isActive,
      isCancelled,
      billingCycle: jobInfo?.billing_cycle || fallbackJob?.billing_cycle || 'monthly',
      lastInvoicedAt: jobInfo?.last_invoiced_at || fallbackJob?.last_invoiced_at || null,
      matchingAgreement,
      supplies: (jobInfo?.supplies as SupplyItem[] | undefined) ?? (fallbackJob?.supplies as SupplyItem[] | undefined) ?? [],
      tradeCategory,
      consumablesProvider: (jobInfo?.consumables_provider ?? (fallbackJob as { consumables_provider?: 'client' | 'tradie_billed' } | undefined)?.consumables_provider ?? 'client') as 'client' | 'tradie_billed',
      nextVisitIso,
      nextVisitSortKey: nextVisitIso ? new Date(nextVisitIso + 'T00:00:00').getTime() : FAR_FUTURE,
    };
  }), [groupedByJob, tradieJobs, agreements, FAR_FUTURE]);

  const hasPast = jobRows.some(r => r.isCancelled);
  const showControls = jobRows.length > PROGRESSIVE_REVEAL_THRESHOLD || hasPast;

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    let rows = jobRows;

    if (statusFilter === 'active') rows = rows.filter(r => !r.isCancelled);
    else if (statusFilter === 'past') rows = rows.filter(r => r.isCancelled);

    if (term) {
      rows = rows.filter(r =>
        r.clientName.toLowerCase().includes(term) ||
        r.jobLabel.toLowerCase().includes(term) ||
        (r.tradeCategory || '').toLowerCase().includes(term)
      );
    }

    return [...rows].sort((a, b) => a.nextVisitSortKey - b.nextVisitSortKey);
  }, [jobRows, statusFilter, searchTerm]);

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="text-center py-12">
        <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-gray-900 mb-1">No ongoing services yet</h3>
        <p className="text-xs text-gray-500">When you set up repeat work with a client, it'll show up here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* ── Ongoing Services ── */}
        {jobRows.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-gray-900">Ongoing Services</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{jobRows.length}</span>
              </div>
            </div>

            {showControls && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search clients or services..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                {hasPast && (
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                    {(['active', 'past', 'all'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setStatusFilter(v)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          statusFilter === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {v === 'active' ? 'Active' : v === 'past' ? 'Past' : 'All'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {filteredRows.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-500">No services match your search.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRows.map(row => {
                  const isExpanded = expandedJobs.has(row.jobId);
                  const nextLabel = row.nextVisitIso
                    ? new Date(row.nextVisitIso + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
                    : null;
                  const statusPill = row.isCancelled
                    ? { label: 'Ended', cls: 'bg-gray-100 text-gray-600' }
                    : row.isActive
                    ? { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' }
                    : { label: 'Paused', cls: 'bg-amber-100 text-amber-700' };

                  return (
                    <div key={row.jobId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleExpanded(row.jobId)}
                        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center justify-center flex-shrink-0">
                            {initials(row.clientName)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-900 truncate">{row.clientName}</p>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusPill.cls}`}>{statusPill.label}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                              <span className="capitalize">{row.jobLabel}</span>
                              {row.freqLabel && (<><span className="text-gray-300">·</span><span>{row.freqLabel}</span></>)}
                              {row.agreedPrice != null && row.agreedPrice > 0 && (
                                <><span className="text-gray-300">·</span><span className="text-emerald-600 font-medium">${row.agreedPrice.toFixed(0)}/visit</span></>
                              )}
                              {nextLabel && !row.isCancelled && (
                                <><span className="text-gray-300">·</span><span className="font-medium text-gray-700">Next: {nextLabel}</span></>
                              )}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50/30 p-3">
                          <JobCard
                            jobId={row.jobId}
                            jobLabel={row.jobLabel}
                            clientName={row.clientName}
                            clientPhone={row.clientPhone}
                            clientEmail={row.clientEmail}
                            clientId={row.clientId}
                            freqLabel={row.freqLabel}
                            location={row.location}
                            descLines={row.descLines}
                            agreedPrice={row.agreedPrice}
                            isAutoAccept={row.isAutoAccept}
                            isActive={row.isActive}
                            isCancelled={row.isCancelled}
                            billingCycle={row.billingCycle}
                            lastInvoicedAt={row.lastInvoicedAt}
                            sessions={row.sessions}
                            userId={user?.id}
                            onUpdate={fetchRecurringSessions}
                            agreement={row.matchingAgreement}
                            onAgreementRefresh={fetchAgreements}
                            supplies={row.supplies}
                            tradeCategory={row.tradeCategory}
                            consumablesProvider={row.consumablesProvider}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Outstanding Invoices ── */}
        {tradieInvoices.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Outstanding Invoices</h3>
              <span className="text-xs text-gray-400">{tradieInvoices.length}</span>
            </div>
            <div className="space-y-3">
              {tradieInvoices.map((inv) => (
                <RecurringInvoiceCard
                  key={inv.id}
                  invoice={inv}
                  userRole="tradie"
                  onRespondToDispute={async (invoiceId, response) => {
                    try {
                      await callEdgeFunction('respond-to-dispute', { invoiceId, action: 'respond', response });
                      showToast('Response sent to client');
                      fetchInvoices();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Failed to send response', true);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
