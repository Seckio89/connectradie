import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FileText, Inbox, Loader2, CheckCircle2, Shield, MapPin, User, Clock, ClipboardList, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/edgeFn';
import { getTradieUpcomingSessions, cancelRecurringJob, pauseRecurringJob, resumeRecurringJob } from '../lib/recurringJobs';
import type { RecurringSession } from '../lib/recurringJobs';
import { getActiveAgreements } from '../lib/ongoingServices';
import type { ServiceAgreement } from '../types/database';
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
    client?: { full_name: string } | null;
  };
};

// Pause / Resume / Stop controls for an ongoing service
function ServiceControls({ jobId, isActive, onChanged }: { jobId: string; isActive: boolean; onChanged: () => void }) {
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

  const handleStop = async () => {
    setLoading(true);
    try {
      await cancelRecurringJob(jobId, 'tradie');
      onChanged();
      showToast('Ongoing service cancelled');
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setLoading(false);
      setConfirming(null);
    }
  };

  if (!isActive) {
    return (
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

  if (confirming === 'stop') {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">End this service? All sessions will be cancelled.</span>
        <button
          onClick={handleStop}
          disabled={loading}
          className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
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
      onToggled();
      showToast(newValue ? 'Switched to auto accept' : 'Switched to manual accept');
    } catch {
      showToast('Something went wrong', true);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Session Confirmation</p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleToggle(true)}
          disabled={toggling}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
            currentAutoAccept
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <CheckCircle2 className="w-3 h-3" />
          Auto-Confirm
        </button>
        <button
          onClick={() => handleToggle(false)}
          disabled={toggling}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 ${
            !currentAutoAccept
              ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          <Shield className="w-3 h-3" />
          Review First
        </button>
        {toggling && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
      </div>
      {currentAutoAccept && (
        <p className="text-xs text-amber-600 flex items-start gap-1.5">
          <Shield className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>Sessions are auto-confirmed. Switch to <span className="font-medium">Review First</span> to approve each one manually.</span>
        </p>
      )}
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
  const [cycle, setCycle] = useState<'fortnightly' | 'monthly'>(
    billingCycle === 'fortnightly' ? 'fortnightly' : 'monthly'
  );
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [sendDay, setSendDay] = useState(1);
  const [sendTime, setSendTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewSessions, setPreviewSessions] = useState<{ id: string; scheduled_date: string; status: string; extra_cost?: number; invoiceStatus?: string }[]>([]);
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
        if (row.billing_cycle) setCycle(row.billing_cycle as 'fortnightly' | 'monthly');
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
        ? `Auto-invoicing set — ${cycle === 'fortnightly' ? 'every 2 weeks' : 'monthly'} on day ${sendDay} at ${sendTime}`
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

      // 2. Find unpaid invoices (sent/overdue) to mark their sessions
      const { data: unpaidInvoices } = await supabase
        .from('recurring_invoices')
        .select('billing_period_start, billing_period_end, status')
        .eq('recurring_job_id', jobId)
        .in('status', ['sent', 'overdue']);

      // 3. Fetch completed sessions AFTER paid cutoff
      const startDate = paidCutoff
        ? fmt((() => { const d = new Date(paidCutoff); d.setDate(d.getDate() + 1); return d; })())
        : '2020-01-01';

      const { data } = await supabase
        .from('recurring_sessions')
        .select('id, scheduled_date, status, extra_cost')
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
      onSent();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      showToast(msg.includes('No billable') ? 'No completed sessions to invoice yet' : msg, true);
    } finally {
      setSending(false);
    }
  };

  const cycleLabel = cycle === 'fortnightly' ? 'Fortnightly' : 'Monthly';
  const dayLabel = cycle === 'monthly'
    ? `${sendDay}${sendDay === 1 ? 'st' : sendDay === 2 ? 'nd' : sendDay === 3 ? 'rd' : 'th'} of each month`
    : `every 2 weeks`;

  const periodStartLabel = billingStart ? new Date(billingStart + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const periodEndLabel = billingEnd ? new Date(billingEnd + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const uninvoicedSessions = previewSessions.filter(s => !s.invoiceStatus);
  const awaitingPaymentSessions = previewSessions.filter(s => s.invoiceStatus === 'sent' || s.invoiceStatus === 'overdue');
  const completedCount = uninvoicedSessions.filter(s => s.status === 'completed').length;
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
                  <p className="text-xs font-medium text-amber-700 mb-1.5">Awaiting Payment ({awaitingPaymentSessions.length})</p>
                  <div className="space-y-1">
                    {awaitingPaymentSessions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-amber-50 rounded text-xs">
                        <span className="text-gray-700">
                          {new Date(s.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.invoiceStatus === 'overdue'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {s.invoiceStatus === 'overdue' ? 'Overdue' : 'Invoiced'}
                        </span>
                      </div>
                    ))}
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
                        <span className="text-gray-500">Session completed</span>
                      </div>
                    ))}
                  </div>
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
              <button
                onClick={() => setCycle('fortnightly')}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  cycle === 'fortnightly'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:bg-white'
                }`}
              >
                Fortnightly
              </button>
              <button
                onClick={() => setCycle('monthly')}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                  cycle === 'monthly'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:bg-white'
                }`}
              >
                Monthly
              </button>
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
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>
                        {d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}
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
                : ` every 2 weeks`
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

// Ongoing service job card with full task requirements
function JobCard({
  jobId, jobLabel, clientName, freqLabel, location, descLines, agreedPrice,
  isAutoAccept, isActive, billingCycle, lastInvoicedAt, sessions, userId, onUpdate,
  agreement, onAgreementRefresh,
}: {
  jobId: string;
  jobLabel: string;
  clientName: string;
  freqLabel: string | null;
  location?: string | null;
  descLines: string[];
  agreedPrice?: number | null;
  isAutoAccept: boolean;
  isActive: boolean;
  billingCycle: string;
  lastInvoicedAt: string | null;
  sessions: RecurringSessionWithJob[];
  userId?: string;
  onUpdate: () => void;
  agreement?: (ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } }) | null;
  onAgreementRefresh?: () => void;
}) {
  const [showTasks, setShowTasks] = useState(true);
  const [showLogVisit, setShowLogVisit] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Job header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 capitalize">{jobLabel}</p>
              {!isActive && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">Paused</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                <User className="w-3 h-3" />
                {clientName}
              </span>
              {freqLabel && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {freqLabel}
                </span>
              )}
              {location && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 truncate max-w-[220px]">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {location}
                </span>
              )}
            </div>
          </div>
          {agreedPrice != null && agreedPrice > 0 && (
            <span className="text-sm font-semibold text-emerald-600 flex-shrink-0">
              ${agreedPrice.toFixed(2)}
              <span className="text-xs font-normal text-gray-400 ml-0.5">per visit</span>
            </span>
          )}
        </div>
      </div>

      {/* Task requirements — collapsible */}
      {descLines.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            onClick={() => setShowTasks(!showTasks)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
              Task Requirements ({descLines.length})
            </span>
            {showTasks
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            }
          </button>
          {showTasks && (
            <div className="px-4 pb-3">
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
        </div>
      )}

      {/* Visit cards */}
      <div className="p-4 space-y-3">
        {sessions.map((s) => (
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

      {/* Invoice + Service controls */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-3">
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
        <AcceptModeToggle
          jobId={jobId}
          currentAutoAccept={isAutoAccept}
          onToggled={onUpdate}
        />
        <ServiceControls jobId={jobId} isActive={isActive} onChanged={onUpdate} />
      </div>

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

export default function ServicesTab() {
  const { user } = useAuth();

  const [agreements, setAgreements] = useState<(ServiceAgreement & { client?: { full_name: string }; tradie?: { full_name: string } })[]>([]);
  const [recurringSessions, setRecurringSessions] = useState<RecurringSessionWithJob[]>([]);
  const [tradieInvoices, setTradieInvoices] = useState<RecurringInvoice[]>([]);

  const [loading, setLoading] = useState(true);

  const fetchAgreements = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getActiveAgreements(user.id, 'tradie');
      setAgreements(data);
    } catch { /* ignore */ }
  }, [user]);

  const fetchRecurringSessions = useCallback(async () => {
    if (!user) return;
    try {
      const sessions = await getTradieUpcomingSessions(user.id, 10);
      setRecurringSessions(sessions);
    } catch { /* ignore */ }
  }, [user]);

  const fetchInvoices = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch outstanding invoices (sent/overdue/draft) — always show all
      const { data: outstanding } = await supabase
        .from('recurring_invoices')
        .select('*, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, agreed_price)')
        .eq('tradie_id', user.id)
        .in('status', ['sent', 'overdue', 'draft'])
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

  const isEmpty = agreements.length === 0 && recurringSessions.length === 0 && tradieInvoices.length === 0;

  // Group sessions by job
  const groupedByJob = recurringSessions.reduce<Record<string, RecurringSessionWithJob[]>>((acc, s) => {
    const key = s.recurring_job_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

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
        {(agreements.length > 0 || recurringSessions.length > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <RefreshCw className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Ongoing Services</h3>
              <span className="text-xs text-gray-400">{Object.keys(groupedByJob).length}</span>
            </div>

            {/* Service schedule — sessions, tasks, controls */}
            <div className="space-y-4">
              {Object.entries(groupedByJob).map(([jobId, sessions]) => {
                const jobInfo = sessions[0]?.recurring_job;
                const jobLabel = jobInfo
                  ? `${jobInfo.service_subtype || jobInfo.trade_category.replace(/_/g, ' ')}`
                  : 'Ongoing Service';
                const isAutoAccept = !!jobInfo?.auto_accept;
                const clientName = jobInfo?.client?.full_name || 'Client';
                const freqLabel = jobInfo?.frequency_months === -3 ? 'Daily'
                  : jobInfo?.frequency_months === -1 ? 'Weekly'
                  : jobInfo?.frequency_months === -2 ? 'Fortnightly'
                  : jobInfo?.frequency_months === 1 ? 'Monthly'
                  : jobInfo?.frequency_months === 3 ? 'Quarterly'
                  : jobInfo?.frequency_months === 6 ? 'Every 6 months'
                  : jobInfo?.frequency_months === 12 ? 'Annually'
                  : null;
                const descLines = (jobInfo?.description || '')
                  .split('\n')
                  .map(l => l.replace(/^\d+\.\s*/, '').trim())
                  .filter(Boolean);

                const matchingAgreement = agreements.find(
                  a => a.original_job_id === jobId
                ) || null;

                return (
                  <JobCard
                    key={jobId}
                    jobId={jobId}
                    jobLabel={jobLabel}
                    clientName={clientName}
                    freqLabel={freqLabel}
                    location={jobInfo?.location}
                    descLines={descLines}
                    agreedPrice={jobInfo?.agreed_price}
                    isAutoAccept={isAutoAccept}
                    isActive={jobInfo?.is_active !== false}
                    billingCycle={jobInfo?.billing_cycle || 'monthly'}
                    lastInvoicedAt={jobInfo?.last_invoiced_at || null}
                    sessions={sessions}
                    userId={user?.id}
                    onUpdate={fetchRecurringSessions}
                    agreement={matchingAgreement}
                    onAgreementRefresh={fetchAgreements}
                  />
                );
              })}
            </div>
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
                <RecurringInvoiceCard key={inv.id} invoice={inv} userRole="tradie" />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
