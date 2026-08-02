import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { COMPANY_ABN } from '../config/company';
import { RELEASE_WINDOW_MS, RELEASE_WINDOW_LABEL } from '../lib/releaseWindow';
import {
  Wallet,
  DollarSign,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Download,
  ChevronDown,
  ChevronRight,
  Banknote,
  Briefcase,
  FileText,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import JobManagementModal from '../components/JobManagementModal';
import PaymentRequestsSection from '../components/PaymentRequestsSection';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import PayoutBreakdownRows from '../components/PayoutBreakdownRows';
import { useTradieEarnings } from '../hooks/useTradieEarnings';
import { Capacitor } from '@capacitor/core';
import { getConnectAccountDetails, createConnectOnboardingSession } from '../lib/stripe';
import type { ConnectAccountDetails } from '../lib/stripe';
import { escapeHtml } from '../lib/escapeHtml';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * A row in the "recent payments" list. Two sources feed it: real `payments`
 * rows joined to their job, and synthesised rows built from paid
 * `recurring_invoices`. Nullability matches the underlying columns.
 */
type RecentPaymentRow = {
  id: string;
  job_id: string;
  amount: number;
  status: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  invoice_number: number | null;
  invoice_ref: string | null;
  jobs: { title: string | null; description: string; status: string | null; client_id: string | null } | null;
  client_name: string;
  jobStatus: string;
  isRecurring: boolean;
};

export default function Payouts() {
  const { session, user } = useAuth();
  const [accountDetails, setAccountDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

  // ── Instant payout (opt-in; standard stays free + default) ────────────────
  const [instantStatus, setInstantStatus] = useState<{
    eligible: boolean; reason: string | null; instantAvailable: number;
    availableCents?: number; pendingCents?: number;
    feeCents: number; netCents: number; cardLast4: string | null;
    destinationLabel?: string | null;
    // Smallest balance we'll offer instant on, and the tier's fee config —
    // read from the response so the UI can't drift from pricing_tiers.
    minBaseCents?: number; feeBps?: number; feeMinCents?: number;
  } | null>(null);
  const [instantBusy, setInstantBusy] = useState(false);
  const [instantDone, setInstantDone] = useState<string | null>(null);
  const [instantError, setInstantError] = useState('');
  const [payoutPref, setPayoutPref] = useState<'standard' | 'instant' | 'ask'>('standard');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: st }, { data: td }] = await Promise.all([
          supabase.functions.invoke('instant-payout', { body: { action: 'status' } }),
          supabase.from('tradie_details').select('payout_speed_preference').eq('profile_id', user?.id ?? '').maybeSingle(),
        ]);
        if (cancelled) return;
        if (st && !st.error) setInstantStatus(st);
        const pref = (td as { payout_speed_preference?: string } | null)?.payout_speed_preference;
        if (pref === 'standard' || pref === 'instant' || pref === 'ask') setPayoutPref(pref);
      } catch { /* instant stays hidden */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const runInstantPayout = async () => {
    setInstantBusy(true); setInstantError('');
    try {
      const { data: res, error } = await supabase.functions.invoke('instant-payout', { body: { action: 'payout' } });
      if (error || res?.error) {
        let msg = res?.error as string | undefined;
        if (!msg && error) { try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* opaque */ } }
        setInstantError(msg || 'Could not send the instant payout.');
      } else {
        setInstantDone(`$${(res.amountCents / 100).toFixed(2)} sent to your card${res.cardLast4 ? ` ••••${res.cardLast4}` : ''} — arrives within minutes.`);
        setInstantStatus(null); // balance changed — hide until next load
      }
    } catch { setInstantError('Could not send the instant payout.'); }
    setInstantBusy(false);
  };

  const savePayoutPref = async (value: 'standard' | 'instant' | 'ask') => {
    setPayoutPref(value);
    try { await supabase.functions.invoke('instant-payout', { body: { action: 'preference', value } }); } catch { /* keep local */ }
  };
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingWarning, setOnboardingWarning] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [collapsedPaymentMonths, setCollapsedPaymentMonths] = useState<Set<string>>(new Set());
  const [collapsedPaymentWeeks, setCollapsedPaymentWeeks] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [customInvoiceTemplate, setCustomInvoiceTemplate] = useState<string | null>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPaymentRow[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'stripe' | 'external'>('all');

  // Escrow, off-platform invoices and the summary all come from the one hook
  // Settings > Payments uses, so the two screens can't report different money.
  // `externalPayments` also feeds the payments list below.
  const { summary, escrowReleaseAt, externalPayments } = useTradieEarnings(user?.id, accountDetails);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;
    try {
      // Escrow and off-platform invoices are fetched by useTradieEarnings, which
      // Settings > Payments shares — this callback only loads the payments list.

      // Fetch recent job payments for this tradie (last 5 days)
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const { data: jobPayments } = await supabase
        .from('payments')
        .select('id, job_id, amount, status, created_at, metadata, invoice_number, invoice_ref, jobs!inner(title, description, status, client_id)')
        .eq('jobs.tradie_id', user.id)
        .eq('payment_type', 'job_funding')
        .gte('created_at', fiveDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (jobPayments && jobPayments.length > 0) {
        // Fetch client names
        const clientIds = [...new Set(jobPayments.flatMap(p => p.jobs.client_id ? [p.jobs.client_id] : []))];
        const { data: clients } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', clientIds);
        const clientMap = new Map((clients || []).map(c => [c.id, c.full_name || 'Client']));

        // Collect recurring_job_ids from metadata to check their status
        const recurringJobIds = jobPayments
          .map(p => (p.metadata as Record<string, unknown> | null)?.recurring_job_id as string | undefined)
          .filter((id): id is string => !!id);

        const recurringStatusMap = new Map<string, string>();
        if (recurringJobIds.length > 0) {
          const uniqueIds = [...new Set(recurringJobIds)];
          // `recurring_jobs` has no `status` column — it tracks is_active +
          // cancelled_at. Selecting `status` made PostgREST reject the query, so
          // this map stayed empty and cancelled services rendered as active.
          const { data: recurringJobs } = await supabase
            .from('recurring_jobs')
            .select('id, is_active, cancelled_at')
            .in('id', uniqueIds);
          if (recurringJobs) {
            for (const rj of recurringJobs) {
              const cancelled = rj.cancelled_at !== null || rj.is_active === false;
              recurringStatusMap.set(rj.id, cancelled ? 'cancelled' : 'active');
            }
          }
        }

        const mapped: RecentPaymentRow[] = jobPayments.map(p => {
          const job = p.jobs;
          const meta = p.metadata as Record<string, unknown> | null;
          const recurringId = meta?.recurring_job_id as string | undefined;
          const isRecurring = !!recurringId || /recurring|ongoing/i.test(job.title || '') || /recurring|ongoing/i.test(job.description || '');

          // Determine recurring service status
          let recurringStatus = '';
          if (recurringId && recurringStatusMap.has(recurringId)) {
            recurringStatus = recurringStatusMap.get(recurringId)!;
          }
          const isCancelledRecurring = recurringStatus === 'cancelled' || recurringStatus === 'ended';

          // A dispute split refunds part of this payment to the client, so
          // `amount` stops being what the tradie received. Show the net, or the
          // list and the week/month totals derived from it overstate earnings by
          // the refunded portion. The escrow-held figures above need no such
          // adjustment: they filter status='completed' and a split is
          // 'released', so it drops out of them entirely.
          const splitRefund = Number(meta?.split_refund_cents ?? 0) || 0;

          return {
            id: p.id,
            job_id: p.job_id ?? '',
            amount: p.amount - splitRefund,
            status: p.status,
            created_at: p.created_at,
            metadata: meta,
            invoice_number: p.invoice_number,
            invoice_ref: p.invoice_ref,
            jobs: job,
            client_name: (job.client_id && clientMap.get(job.client_id)) || 'Client',
            jobStatus: isCancelledRecurring ? 'cancelled' : (job.status ?? 'pending'),
            isRecurring,
          };
        });

        // Fetch recurring invoice payments for this tradie
        try {
          const { data: invData } = await supabase
            .from('recurring_invoices')
            .select('id, total, status, created_at, paid_at, homeowner_id, billing_period_start, billing_period_end, regular_sessions_count, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype)')
            .eq('tradie_id', user.id)
            .eq('status', 'paid')
            .neq('payment_method', 'external')
            .order('paid_at', { ascending: false });

          if (invData && invData.length > 0) {
            // Fetch client names for invoices
            const invClientIds = [...new Set(invData.flatMap(inv => inv.homeowner_id ? [inv.homeowner_id] : []))];
            const { data: invClients } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', invClientIds);
            const invClientMap = new Map((invClients || []).map(c => [c.id, c.full_name || 'Client']));

            const invoiceRows = invData.map(inv => {
              const rj = inv.recurring_job as { trade_category?: string; service_subtype?: string | null } | null;
              const label = (rj?.service_subtype || rj?.trade_category || 'Service')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              const sessions = inv.regular_sessions_count || 0;
              const period = `${new Date(inv.billing_period_start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${new Date(inv.billing_period_end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;

              return {
                id: `inv_${inv.id}`,
                job_id: '',
                amount: Math.round(Number(inv.total) * 100),
                status: 'completed',
                created_at: inv.paid_at || inv.created_at,
                metadata: null,
                invoice_number: null,
                invoice_ref: null,
                jobs: { title: `${label} Invoice`, description: `Service Invoice — ${sessions} session${sessions !== 1 ? 's' : ''} (${period})`, status: 'completed', client_id: inv.homeowner_id },
                client_name: (inv.homeowner_id && invClientMap.get(inv.homeowner_id)) || 'Client',
                jobStatus: 'completed',
                isRecurring: true,
              };
            });

            mapped.push(...invoiceRows);
          }
        } catch { /* ignore */ }

        // Sort combined results by date
        mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecentPayments(mapped);
      } else {
        // No recent job payments — still fetch recurring invoices
        try {
          const { data: invData } = await supabase
            .from('recurring_invoices')
            .select('id, total, status, created_at, paid_at, homeowner_id, billing_period_start, billing_period_end, regular_sessions_count, recurring_job:recurring_jobs!recurring_invoices_recurring_job_id_fkey(trade_category, service_subtype)')
            .eq('tradie_id', user.id)
            .eq('status', 'paid')
            .neq('payment_method', 'external')
            .order('paid_at', { ascending: false });

          if (invData && invData.length > 0) {
            const invClientIds = [...new Set(invData.flatMap(inv => inv.homeowner_id ? [inv.homeowner_id] : []))];
            const { data: invClients } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', invClientIds);
            const invClientMap = new Map((invClients || []).map(c => [c.id, c.full_name || 'Client']));

            setRecentPayments(invData.map(inv => {
              const rj = inv.recurring_job as { trade_category?: string; service_subtype?: string | null } | null;
              const label = (rj?.service_subtype || rj?.trade_category || 'Service')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c: string) => c.toUpperCase());
              const sessions = inv.regular_sessions_count || 0;
              const period = `${new Date(inv.billing_period_start + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${new Date(inv.billing_period_end + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;

              return {
                id: `inv_${inv.id}`,
                job_id: '',
                amount: Math.round(Number(inv.total) * 100),
                status: 'completed',
                created_at: inv.paid_at || inv.created_at,
                metadata: null,
                invoice_number: null,
                invoice_ref: null,
                jobs: { title: `${label} Invoice`, description: `Service Invoice — ${sessions} session${sessions !== 1 ? 's' : ''} (${period})`, status: 'completed', client_id: inv.homeowner_id },
                client_name: (inv.homeowner_id && invClientMap.get(inv.homeowner_id)) || 'Client',
                jobStatus: 'completed',
                isRecurring: true,
              };
            }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
          }
        } catch { /* ignore */ }
      }
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

  const isAuthenticated = !!session;
  useEffect(() => {
    if (isAuthenticated) {
      fetchDetails();
      fetchEarnings();
      fetchOnboardingStatus();
      // Load saved invoice template
      const saved = localStorage.getItem('ct_invoice_template');
      if (saved) setCustomInvoiceTemplate(saved);
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setCustomInvoiceTemplate(dataUrl);
      localStorage.setItem('ct_invoice_template', dataUrl);
    };
    reader.readAsDataURL(file);
    if (templateInputRef.current) templateInputRef.current.value = '';
  };

  const handleRemoveTemplate = () => {
    setCustomInvoiceTemplate(null);
    localStorage.removeItem('ct_invoice_template');
  };

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

  // Group payouts by month
  const payoutGroups = useMemo(() => {
    const payouts = accountDetails?.payouts || [];
    if (payouts.length === 0) return [];

    const groups: { key: string; label: string; payouts: typeof payouts; total: number }[] = [];
    const monthMap = new Map<string, typeof payouts>();

    for (const p of payouts) {
      const d = new Date(p.created * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      if (!monthMap.has(key)) {
        monthMap.set(key, []);
        groups.push({ key, label, payouts: monthMap.get(key)!, total: 0 });
      }
      monthMap.get(key)!.push(p);
    }

    for (const g of groups) {
      g.total = g.payouts.reduce((s, p) => s + p.amount, 0);
    }

    return groups;
  }, [accountDetails?.payouts]);

  const toggleMonth = (key: string) => {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Group recent payments by month → week
  const paymentMonthGroups = useMemo(() => {
    if (recentPayments.length === 0) return [];

    const getWeekStart = (date: Date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      d.setDate(diff);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const getWeekEnd = (weekStart: Date) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + 6);
      return d;
    };

    type Payment = typeof recentPayments[number];
    type WeekGroup = { key: string; label: string; payments: Payment[]; total: number };
    type MonthGroup = { key: string; label: string; weeks: WeekGroup[]; total: number };

    const monthMap = new Map<string, MonthGroup>();
    const ordered: MonthGroup[] = [];

    for (const p of recentPayments) {
      const d = new Date(p.created_at);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthMap.has(monthKey)) {
        const monthGroup: MonthGroup = {
          key: monthKey,
          label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
          weeks: [],
          total: 0,
        };
        monthMap.set(monthKey, monthGroup);
        ordered.push(monthGroup);
      }

      const monthGroup = monthMap.get(monthKey)!;
      const weekStart = getWeekStart(d);
      const weekEnd = getWeekEnd(weekStart);
      const weekKey = `${monthKey}-w${weekStart.toISOString().split('T')[0]}`;
      const weekLabel = `${weekStart.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;

      let weekGroup = monthGroup.weeks.find(w => w.key === weekKey);
      if (!weekGroup) {
        weekGroup = { key: weekKey, label: weekLabel, payments: [], total: 0 };
        monthGroup.weeks.push(weekGroup);
      }

      weekGroup.payments.push(p);
      weekGroup.total += p.amount;
      monthGroup.total += p.amount;
    }

    return ordered;
  }, [recentPayments]);

  const togglePaymentMonth = (key: string) => {
    setCollapsedPaymentMonths(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const togglePaymentWeek = (key: string) => {
    setCollapsedPaymentWeeks(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // CSV export
  const handleExportCSV = () => {
    const payouts = accountDetails?.payouts || [];
    if (payouts.length === 0) return;

    const rows = [
      ['Date', 'Amount (AUD)', 'Status', 'Arrival Date'],
      ...payouts.map(p => [
        new Date(p.created * 1000).toLocaleDateString('en-AU'),
        (p.amount / 100).toFixed(2),
        p.status,
        new Date(p.arrival_date * 1000).toLocaleDateString('en-AU'),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  const handleDownloadInvoice = async (p: typeof recentPayments[number]) => {
    if (pdfLoadingId) return;
    setPdfLoadingId(p.id);

    const invoiceNum = p.invoice_ref
      || (p.invoice_number != null
        ? `INV-${String(p.invoice_number).padStart(4, '0')}`
        : `INV-${p.id.slice(0, 8).toUpperCase()}`);
    const jobTitle = p.jobs?.title || p.jobs?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job';
    const amountDollars = (p.amount / 100).toFixed(2);
    const date = new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    const isInvoice = p.id.startsWith('inv_');
    const isReleased = isInvoice || !!(p.metadata?.transfer_id);
    const statusText = isInvoice ? 'Completed' : isReleased ? 'Paid' : 'In Escrow';
    const statusColor = isReleased ? '#16a34a' : '#d97706';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; width: 650px; margin: 0 auto; padding: 40px 0; color: #1a1a2e;">
        <!-- Header -->
        <table style="width: 100%; margin-bottom: 30px;">
          <tr>
            <td style="vertical-align: top; width: 50%;">
              <div style="background: #004d40; color: white; padding: 8px 16px; border-radius: 6px; display: inline-block; font-size: 18px; font-weight: 700; letter-spacing: 0.5px;">
                Connec<span style="color: #06D6A0;">Tradie</span>
              </div>
              <p style="font-size: 11px; color: #888; margin: 8px 0 0;">ABN: ${COMPANY_ABN}</p>
              <p style="font-size: 11px; color: #888; margin: 2px 0 0;">Australian Tradie Marketplace</p>
            </td>
            <td style="vertical-align: top; text-align: right; width: 50%;">
              <p style="font-size: 24px; font-weight: 700; color: #004d40; margin: 0; letter-spacing: -0.5px;">RECEIPT</p>
              <p style="font-size: 14px; font-weight: 600; margin: 6px 0 0; color: #333;">${escapeHtml(invoiceNum)}</p>
              <p style="font-size: 12px; color: #888; margin: 4px 0 0;">Issued: ${escapeHtml(date)}</p>
            </td>
          </tr>
        </table>

        <!-- Divider -->
        <div style="height: 3px; background: linear-gradient(to right, #004d40, #06D6A0); border-radius: 2px; margin-bottom: 28px;"></div>

        <!-- Bill To / Job Info -->
        <table style="width: 100%; margin-bottom: 28px;">
          <tr>
            <td style="vertical-align: top; width: 50%; padding-right: 20px;">
              <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 6px; font-weight: 600;">Client</p>
              <p style="font-size: 14px; font-weight: 600; margin: 0; color: #1a1a2e;">${escapeHtml(p.client_name)}</p>
            </td>
            <td style="vertical-align: top; width: 50%;">
              <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 6px; font-weight: 600;">Job Reference</p>
              <p style="font-size: 14px; font-weight: 600; margin: 0; color: #1a1a2e;">${escapeHtml(jobTitle)}</p>
            </td>
          </tr>
        </table>

        <!-- Line Items -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 12px 16px; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; background: #f8f9fa; border-radius: 6px 0 0 0;">Description</th>
              <th style="text-align: center; padding: 12px 16px; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; background: #f8f9fa;">Qty</th>
              <th style="text-align: right; padding: 12px 16px; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; background: #f8f9fa; border-radius: 0 6px 0 0;">Amount (AUD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 14px 16px; font-size: 13px; border-bottom: 1px solid #eee; color: #333;">${escapeHtml(jobTitle)}</td>
              <td style="padding: 14px 16px; font-size: 13px; border-bottom: 1px solid #eee; text-align: center; color: #666;">1</td>
              <td style="padding: 14px 16px; font-size: 13px; border-bottom: 1px solid #eee; text-align: right; font-weight: 600;">$${amountDollars}</td>
            </tr>
          </tbody>
        </table>

        <!-- Totals -->
        <table style="width: 280px; margin-left: auto; margin-bottom: 32px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 16px; font-size: 12px; color: #666;">Subtotal</td>
            <td style="padding: 8px 16px; font-size: 12px; text-align: right; font-weight: 500;">$${amountDollars}</td>
          </tr>
          <tr>
            <td style="padding: 8px 16px; font-size: 12px; color: #666;">GST</td>
            <td style="padding: 8px 16px; font-size: 12px; text-align: right; font-weight: 500;">$0.00</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 0;"><div style="height: 2px; background: #004d40; margin: 4px 16px;"></div></td>
          </tr>
          <tr>
            <td style="padding: 10px 16px; font-size: 15px; font-weight: 700; color: #004d40;">Total</td>
            <td style="padding: 10px 16px; font-size: 15px; font-weight: 700; text-align: right; color: #004d40;">$${amountDollars}</td>
          </tr>
        </table>

        <!-- Status & Reference -->
        <table style="width: 100%; margin-bottom: 32px; background: #f8f9fa; border-radius: 8px; border-collapse: collapse;">
          <tr>
            <td style="padding: 14px 20px; width: 33%;">
              <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; font-weight: 600;">Status</p>
              <p style="font-size: 13px; font-weight: 700; margin: 0; color: ${statusColor};">${escapeHtml(statusText)}</p>
            </td>
            <td style="padding: 14px 20px; width: 33%;">
              <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; font-weight: 600;">Payment Method</p>
              <p style="font-size: 13px; font-weight: 500; margin: 0;">Stripe Connect</p>
            </td>
            <td style="padding: 14px 20px; width: 34%;">
              <p style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px; font-weight: 600;">Currency</p>
              <p style="font-size: 13px; font-weight: 500; margin: 0;">AUD</p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; text-align: center;">
          <p style="font-size: 11px; color: #999; margin: 0 0 4px;">Payment receipt issued by ConnecTradie Pty Ltd</p>
          <p style="font-size: 10px; color: #bbb; margin: 0;">All prices in AUD. Retain for your records.</p>
        </div>
      </div>
    `;

    // If a custom template was uploaded, use it as a background with data overlay.
    // Validate it is a safe image reference (data:image/* or https:) and escape it
    // for the HTML attribute context before interpolating into innerHTML below,
    // to prevent HTML/attribute injection.
    const safeTemplateSrc = (() => {
      if (!customInvoiceTemplate) return null;
      const v = customInvoiceTemplate.trim();
      const isImageDataUrl = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(v);
      const isHttps = /^https:\/\/[^\s"'<>]+$/i.test(v);
      if (!isImageDataUrl && !isHttps) return null;
      return v
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    })();

    const finalHtml = safeTemplateSrc
      ? `<div style="position: relative; width: 210mm; min-height: 297mm;">
          <img src="${safeTemplateSrc}" style="width: 100%; position: absolute; top: 0; left: 0; z-index: 0; opacity: 0.15;" />
          <div style="position: relative; z-index: 1;">${html}</div>
        </div>`
      : html;

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.background = 'white';
    container.innerHTML = finalHtml;
    document.body.appendChild(container);

    const filename = `ConnecTradie-Receipt-${invoiceNum}.pdf`;
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const worker = html2pdf()
        .set({
          margin: safeTemplateSrc ? [0, 0, 0, 0] : [15, 15, 15, 15],
          filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container);

      if (Capacitor.isNativePlatform()) {
        // Android/iOS WebView silently ignores html2pdf's blob-anchor download
        // (`.save()`), which is why tapping did nothing in the app. Generate the
        // PDF as a blob and hand it to the OS share sheet via the WebView's
        // built-in Web Share API — the user can then Save to Files/Downloads,
        // open it in a PDF viewer, or email it.
        const blob: Blob = await worker.outputPdf('blob');
        const file = new File([blob], filename, { type: 'application/pdf' });
        const nav = navigator as Navigator & { canShare?: (data?: { files?: File[] }) => boolean };
        if (nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: 'Payment receipt', text: `ConnecTradie receipt ${invoiceNum}` });
        } else {
          // Older WebView without file sharing: open the PDF so it can be viewed/saved.
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } else {
        // Web: normal browser download.
        await worker.save();
      }
    } catch (err) {
      // AbortError = the user dismissed the share sheet — that's fine, not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Invoice download/share failed', err);
      }
    } finally {
      document.body.removeChild(container);
      setPdfLoadingId(null);
    }
  };

  const totalPayoutCount = accountDetails?.payouts?.length ?? 0;
  const autoReleaseLabel = (() => {
    if (!escrowReleaseAt) return `Auto-releases after ${RELEASE_WINDOW_LABEL}`;
    const ms = escrowReleaseAt + RELEASE_WINDOW_MS - nowTs;
    if (ms <= 0) return 'Auto-releasing now…';
    const mins = Math.floor(ms / 60000);
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    const m = mins % 60;
    if (d > 0) return `Auto-releases in ${d}d ${h}h`;
    if (h > 0) return `Auto-releases in ${h}h ${m}m`;
    return `Auto-releases in ${m}m`;
  })();
  const externalTotal = useMemo(() => externalPayments.reduce((s, p) => s + p.amount, 0), [externalPayments]);

  // Reasons instant can NEVER run for this tradie right now, as opposed to
  // "not this time": a platform-wide outage, or no instant-eligible payout
  // account. Offering the preference in those cases promises minutes and
  // silently delivers the standard 2-3 days.
  const instantPreferenceBlocked: 'instant_unavailable' | 'no_instant_method' | null =
    instantStatus && !instantStatus.eligible &&
    (instantStatus.reason === 'instant_unavailable' || instantStatus.reason === 'no_instant_method')
      ? instantStatus.reason
      : null;

  const methodLabel = (m: string | null) =>
    m ? (({ bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', accountant: 'Accountant' } as Record<string, string>)[m] ?? m) : '';

  if (loading) {
    return (
      <DashboardLayout wide>
        <div>
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-ct-mute-2 animate-spin mx-auto mb-4" />
              <p className="text-ct-mute font-medium">Loading payout details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout wide>
        <div className="space-y-6">
          {/* Payment requests work without Stripe — many subcontractors are paid
              purely off-platform, so don't hide them behind a Connect failure. */}
          <PaymentRequestsSection />
          <div className="flex flex-col items-center justify-center py-24">
            <AlertTriangle className="w-12 h-12 text-ct-rose mb-4" />
            <p className="text-ct-paper font-semibold mb-2">Couldn't load your payout details</p>
            <p className="text-ct-mute text-sm mb-6">{error}</p>
            <button
              onClick={fetchDetails}
              className="px-6 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 transition-colors"
            >
              Try again
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
    <DashboardLayout wide>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-ct-surface-2 rounded-ct-sm">
                <Wallet className="w-5 h-5 text-ct-mute-2" />
              </div>
              <h1 className="text-2xl font-bold text-ct-paper">Payouts</h1>
            </div>
            <p className="text-sm text-ct-mute ml-12">
              View your balance, payout history, and manage bank details
            </p>
          </div>
          {accountDetails?.connected && (accountDetails.payouts?.length ?? 0) > 0 && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 bg-ct-surface border border-ct-line rounded-ct-sm text-sm font-medium text-ct-paper hover:bg-ct-surface-2 transition-colors flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>

        {/* Off-platform payment requests (worker ↔ employer, BSB transfer) */}
        <PaymentRequestsSection />

        {/* Stripe vs external filter — only shown when there are external payments */}
        {externalPayments.length > 0 && (
          <div className="flex items-center gap-1 bg-ct-surface-2 rounded-ct-md p-1 w-full sm:w-auto sm:inline-flex">
            {(['all', 'stripe', 'external'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setPaymentFilter(f)}
                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-ct-sm text-sm font-medium transition-colors ${
                  paymentFilter === f ? 'bg-ct-surface text-ct-paper shadow-sm' : 'text-ct-mute-2 hover:text-ct-paper'
                }`}
              >
                {f === 'all' ? 'All' : f === 'stripe' ? 'Stripe' : 'External'}
              </button>
            ))}
          </div>
        )}

        {/* Externally received payments (bank transfer / cash / cheque) */}
        {externalPayments.length > 0 && paymentFilter !== 'stripe' && (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-2 bg-ct-surface-2 rounded-ct-sm flex-shrink-0">
                  <Banknote className="w-4 h-4 text-ct-mute-2" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ct-paper">Externally received</h2>
                  <p className="text-xs text-ct-mute">Bank transfer / cash — marked paid by you</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium text-ct-mute uppercase tracking-wide">Total</p>
                <p className="text-xl font-bold text-ct-paper">{formatCurrency(externalTotal)}</p>
              </div>
            </div>
            <div className="divide-y divide-ct-line-soft">
              {externalPayments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-ct-sm bg-ct-surface-2 flex items-center justify-center flex-shrink-0">
                    <Banknote className="w-4 h-4 text-ct-mute-2" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ct-paper truncate">{p.clientName}</p>
                    <p className="text-xs text-ct-mute truncate">
                      {p.service} · {new Date(p.paidAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {p.method ? ` · ${methodLabel(p.method)}` : ''}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ct-paper tabular-nums flex-shrink-0">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Not Connected state */}
        {!accountDetails?.connected && paymentFilter !== 'external' && (
          <div className="bg-ct-teal/[0.14] rounded-ct-lg border border-ct-line p-8 text-center">
            <div className="w-16 h-16 bg-ct-surface-2 rounded-ct-lg flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-ct-mute-2" />
            </div>
            <h2 className="text-xl font-bold text-ct-paper mb-2">Set up payouts</h2>
            <p className="text-ct-mute-2 mb-2 max-w-md mx-auto">
              Connect your bank account to receive payments directly from completed jobs.
            </p>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-ct-surface-2 border border-ct-line rounded-ct-sm mb-6 max-w-md mx-auto text-left">
              <Shield className="w-4 h-4 text-ct-mute-2 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ct-mute-2 leading-relaxed">
                You'll need your <strong>BSB, account number, and ABN</strong>. Setup takes about 2 minutes. Payments processed securely by Stripe.
              </p>
            </div>
            <button
              onClick={handleConnectSetup}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-60 transition-colors"
            >
              {connectLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Set up payouts'
              )}
            </button>
          </div>
        )}

        {/* Connected state */}
        {accountDetails?.connected && paymentFilter !== 'external' && (
          <>
            {/* Account Status banner */}
            {isFullyActive ? (
              <div className="bg-ct-teal/[0.14] rounded-ct-lg border border-ct-teal/30 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-ct-teal" />
                  <div>
                    <p className="font-semibold text-ct-teal">Account active</p>
                    <p className="text-sm text-ct-teal">Your bank account is connected and ready to receive payouts.</p>
                  </div>
                </div>
              </div>
            ) : hasRequirements ? (
              <div className="bg-ct-amber/[0.13] rounded-ct-lg border border-ct-amber/[0.34] p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-ct-amber flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-ct-paper">Setup incomplete</p>
                      <p className="text-sm text-ct-amber">
                        We need a few more details (e.g. bank account or identity info) before you can receive payouts.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSetup}
                    disabled={connectLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-ct-amber text-ct-ink font-semibold rounded-ct-md hover:bg-ct-amber disabled:opacity-60 transition-colors text-sm"
                  >
                    {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete setup'}
                  </button>
                </div>
              </div>
            ) : null}

            {/* Summary — one big number + three plain-language status rows.
                Deliberately simple: a tradie should know in 3 seconds how much
                they've earned, where the money is, and when it arrives. */}
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line shadow-sm p-5 sm:p-6">
              <p className="text-sm text-ct-mute">You’ve earned</p>
              <p className="text-4xl font-bold text-ct-paper mt-0.5 tabular-nums">{formatCurrency(summary.earned)}</p>

              <div className="mt-5">
                <PayoutBreakdownRows summary={summary} autoReleaseLabel={autoReleaseLabel} />
              </div>

              {/* ⚡ Opt-in instant payout.
                  Deliberately NOT nested inside the transit row: this acts on the
                  cleared Connect balance, never on a payout Stripe has already
                  sent. Sitting inside that row, it read as "get the $64.90 heading
                  to your bank now" while actually offering $3.50. */}
              {instantDone ? (
                <p className="mt-3 text-xs font-medium text-ct-teal bg-ct-teal/[0.14] border border-ct-teal/30 rounded-ct-sm px-3 py-2">
                  💰 {instantDone}
                </p>
              ) : instantStatus?.eligible && instantStatus.netCents > 0 ? (
                <div className="mt-3 rounded-ct-md bg-ct-surface border border-ct-line px-4 py-3">
                  <p className="text-sm font-semibold text-ct-paper tabular-nums">
                    {formatCurrency(instantStatus.instantAvailable)} available now
                  </p>
                  <p className="mt-0.5 text-xs text-ct-mute-2">
                    Instant transfer fee{' '}
                    <span className="font-semibold">{formatCurrency(instantStatus.feeCents)}</span>
                    {instantStatus.instantAvailable > 0
                      ? ` (${((instantStatus.feeCents / instantStatus.instantAvailable) * 100).toFixed(1)}%)`
                      : ''}
                    {' — you receive '}
                    <span className="font-semibold text-ct-paper">{formatCurrency(instantStatus.netCents)}</span>
                    {' in minutes'}
                    {instantStatus.destinationLabel ? ` on ${instantStatus.destinationLabel}` : ''}
                  </p>
                  <button
                    onClick={runInstantPayout}
                    disabled={instantBusy}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-ct-teal text-ct-ink text-xs font-semibold rounded-ct-sm hover:bg-ct-teal-deep disabled:opacity-50 transition-colors"
                  >
                    {instantBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '⚡'} Send {formatCurrency(instantStatus.netCents)} now
                  </button>
                  {/* The fee IS charged: Stripe's platform pricing scheme collects
                      it as an application fee on the instant payout. The tradie
                      never has to take it — standard payouts remain free — so say
                      that plainly rather than burying the choice. */}
                  <p className="mt-1.5 text-[11px] text-ct-mute">
                    Only charged if you choose instant. Waiting costs nothing — standard payouts are always free.
                  </p>
                  {instantError && <p className="mt-1.5 text-xs text-ct-rose">{instantError}</p>}
                </div>
              ) : instantStatus && !instantStatus.eligible && instantStatus.reason === 'below_minimum' ? (
                <p className="mt-3 text-[11px] text-ct-mute">
                  Instant payout is available from {formatCurrency(instantStatus.minBaseCents ?? 0)} — below that the{' '}
                  {formatCurrency(instantStatus.feeMinCents ?? 0)} minimum fee takes too much of it. Your{' '}
                  {formatCurrency(instantStatus.instantAvailable)} is on its way free of charge.
                </p>
              ) : instantStatus && !instantStatus.eligible && instantStatus.reason === 'funds_pending' ? (
                <p className="mt-3 text-[11px] text-ct-mute">
                  Instant payout available once funds clear (usually next business day).
                </p>
              ) : instantStatus && !instantStatus.eligible && instantStatus.reason === 'no_instant_method' && summary.transit.amount > 0 && payoutPref !== 'standard' ? (
                <p className="mt-3 text-[11px] text-ct-mute">
                  This payout account can’t receive instant payouts — add an instant-eligible debit card or bank in Bank settings.
                </p>
              ) : null}

              {/* The payout breakdown and the explainer use the same wording, so a
                  tradie can reconcile what they read with what they were paid. */}
              <p className="mt-3 text-xs text-ct-mute text-center">
                Our fee applies to your labour only — never your materials.{' '}
                <Link to="/how-fees-work" className="text-ct-mute-2 hover:text-ct-mute-2 font-medium">
                  How fees work
                </Link>
              </p>
            </div>

            {/* Stripe Connect onboarding warning. Was a ramp from rose to amber
                — two different meanings in one fill. Nothing has failed here;
                the tradie has a step left to do, which is amber. */}
            {onboardingWarning && onboardingComplete === false && (
              <div className="bg-ct-amber/[0.13] rounded-ct-lg border border-ct-amber/[0.34] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-ct-amber" />
                    <div>
                      <p className="font-semibold text-ct-paper">Stripe Connect setup required</p>
                      <p className="text-sm text-ct-amber">
                        You must complete your Stripe Connect setup before you can manage payouts or access your payout dashboard. Please complete onboarding first.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSetup}
                    disabled={connectLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-ct-rose text-ct-ink font-semibold rounded-ct-md hover:brightness-110 disabled:opacity-60 transition-colors text-sm"
                  >
                    {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete setup'}
                  </button>
                </div>
              </div>
            )}

            {/* Bank settings + payout speed preference */}
            {accountDetails.dashboardUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {onboardingComplete === false ? (
                  <button
                    onClick={() => setOnboardingWarning(true)}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:bg-ct-teal-deep transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Bank settings
                  </button>
                ) : (
                  <a
                    href={accountDetails.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-ct-teal text-ct-ink font-semibold rounded-ct-md hover:bg-ct-teal-deep transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Bank settings
                  </a>
                )}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-2 text-xs text-ct-mute">
                    Payout speed:
                    <select
                      value={payoutPref}
                      onChange={(e) => savePayoutPref(e.target.value as 'standard' | 'instant' | 'ask')}
                      className="px-2.5 py-2 border border-ct-line rounded-ct-sm text-xs bg-ct-surface text-ct-mute-2 focus:outline-none focus:ring-2 focus:ring-ct-teal"
                    >
                      <option value="standard">Standard — free (2–3 business days)</option>
                      {/* Rates come from pricing_tiers via the status response; the
                          label used to be hardcoded and would silently lie if a
                          tier's rate changed.
                          Disabled when instant genuinely can't run — a platform-wide
                          outage or no instant-eligible account. Choosing it then
                          would promise minutes and silently deliver the standard
                          2-3 days. Transient reasons (balance below the minimum,
                          funds still clearing) must NOT disable it: they say
                          nothing about future payouts. */}
                      <option value="instant" disabled={instantPreferenceBlocked !== null}>
                        {instantStatus?.feeBps != null && instantStatus.feeMinCents != null
                          ? `Instant — ${(instantStatus.feeBps / 100).toFixed(2).replace(/\.?0+$/, '')}%, min ${formatCurrency(instantStatus.feeMinCents)} (minutes)`
                          : 'Instant — minutes, small fee'}
                        {instantPreferenceBlocked ? ' — unavailable' : ''}
                      </option>
                      {/* Nothing prompts per payout — the instant button above IS
                          the ask — so this is described as what it actually does. */}
                      <option value="ask">Only when I ask — free by default</option>
                    </select>
                  </label>
                  {instantPreferenceBlocked && payoutPref === 'instant' && (
                    <p className="text-[11px] text-ct-mute max-w-sm">
                      {instantPreferenceBlocked === 'no_instant_method'
                        ? 'Instant needs an instant-eligible debit card or bank account — add one in Bank settings. Until then your payouts go out free on the standard schedule.'
                        : 'Instant payouts aren’t available right now. Your payouts go out free on the standard schedule until they are.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Recent Job Payments */}
            {recentPayments.length > 0 && (
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
                <div className="flex items-start justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-ct-line">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-ct-mute flex-shrink-0" />
                      <h2 className="text-sm font-semibold text-ct-paper whitespace-nowrap">Recent payments</h2>
                      <span className="text-xs text-ct-mute font-medium hidden sm:inline">(Last 5 days)</span>
                    </div>
                    <span className="text-[11px] text-ct-mute font-medium ml-6 sm:hidden">Last 5 days</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      ref={templateInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleTemplateUpload}
                      className="hidden"
                    />
                    {customInvoiceTemplate ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-ct-teal font-medium bg-ct-teal/[0.14] px-3 py-1 rounded-full whitespace-nowrap">Custom template active</span>
                        <button
                          onClick={handleRemoveTemplate}
                          className="text-xs text-ct-rose hover:text-ct-rose font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => templateInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ct-mute-2 border border-ct-line rounded-ct-sm hover:bg-ct-surface-2 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="sm:hidden">Upload invoice</span>
                        <span className="hidden sm:inline">Upload invoice template</span>
                      </button>
                    )}
                  </div>
                </div>

                {paymentMonthGroups.map((monthGroup) => {
                  const isMonthCollapsed = collapsedPaymentMonths.has(monthGroup.key);
                  return (
                    <div key={monthGroup.key}>
                      {/* Month header */}
                      <button
                        onClick={() => togglePaymentMonth(monthGroup.key)}
                        className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-3 bg-ct-surface-2 sm:bg-ct-surface-2 border-b border-ct-line hover:bg-ct-surface-2 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isMonthCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-ct-mute" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-ct-mute" />
                          )}
                          <span className="text-[15px] sm:text-sm font-bold sm:font-semibold text-ct-paper">{monthGroup.label}</span>
                          <span className="text-xs text-ct-mute">
                            ({monthGroup.weeks.reduce((s, w) => s + w.payments.length, 0)} payments)
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-ct-paper tabular-nums">
                          {formatCurrency(monthGroup.total)}
                        </span>
                      </button>

                      {!isMonthCollapsed && monthGroup.weeks.map((weekGroup) => {
                        const isWeekCollapsed = collapsedPaymentWeeks.has(weekGroup.key);
                        return (
                          <div key={weekGroup.key}>
                            {/* Week header */}
                            <button
                              onClick={() => togglePaymentWeek(weekGroup.key)}
                              className="w-full flex items-center justify-between px-5 py-2.5 pl-9 bg-ct-surface border-b border-ct-line-soft hover:bg-ct-surface-2 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {isWeekCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-ct-mute" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-ct-mute" />
                                )}
                                <span className="text-xs font-medium text-ct-mute-2">{weekGroup.label}</span>
                                <span className="text-xs text-ct-mute">({weekGroup.payments.length})</span>
                              </div>
                              <span className="text-xs font-semibold text-ct-paper tabular-nums">
                                {formatCurrency(weekGroup.total)}
                              </span>
                            </button>

                            {!isWeekCollapsed && (
                              <>
                                {/* Desktop rows */}
                                <div className="hidden md:block">
                                  {/* Fixed layout + shared colgroup so every week's
                                      table has identical column widths — otherwise
                                      each per-week table auto-sizes independently and
                                      the columns drift out of alignment down the list. */}
                                  <table className="w-full table-fixed">
                                    <colgroup>
                                      <col className="w-[90px]" />
                                      <col />
                                      <col className="w-[240px]" />
                                      <col className="w-[110px]" />
                                      <col className="w-[132px]" />
                                      <col className="w-16" />
                                    </colgroup>
                                    <tbody className="divide-y divide-ct-line-soft">
                                      {weekGroup.payments.map((p) => {
                                        const jobTitle = p.jobs?.title || p.jobs?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job';
                                        const isInvoice = p.id.startsWith('inv_');
                                        const isReleased = isInvoice || !!(p.metadata?.transfer_id);
                                        const statusLabel = isInvoice ? 'Completed' : isReleased ? 'Paid to bank' : p.status === 'completed' ? 'Awaiting release' : p.status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
                                        const statusClass = isInvoice ? 'bg-ct-teal/[0.14] text-ct-teal' : isReleased ? 'bg-ct-teal/[0.14] text-ct-teal' : p.status === 'completed' ? 'bg-ct-amber/[0.13] text-ct-amber' : 'bg-ct-surface-2 text-ct-mute-2';
                                        const isCancelled = p.jobStatus === 'cancelled' || p.jobStatus === 'declined';
                                        return (
                                          <tr key={p.id} onClick={() => !isInvoice && setSelectedJobId(p.job_id)} className={`hover:bg-ct-surface-2 transition-colors ${isInvoice ? '' : 'cursor-pointer'} ${isCancelled ? 'opacity-60' : ''}`}>
                                            <td className="px-5 py-3 text-sm text-ct-mute w-24">
                                              {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </td>
                                            <td className="px-5 py-3">
                                              <div className="flex items-center gap-2 min-w-0">
                                                <p className="text-sm font-medium text-ct-paper truncate">{jobTitle}</p>
                                                {p.isRecurring && (
                                                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                    isCancelled ? 'bg-ct-rose/[0.13] text-ct-rose' : 'bg-ct-surface-2 text-ct-mute-2'
                                                  }`}>
                                                    {isCancelled ? 'Cancelled' : 'Ongoing'}
                                                  </span>
                                                )}
                                                {!p.isRecurring && isCancelled && (
                                                  <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-ct-rose/[0.13] text-ct-rose">
                                                    Cancelled
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-ct-mute-2">{p.client_name}</td>
                                            <td className="px-5 py-3 text-right">
                                              <span className="text-sm font-semibold text-ct-paper tabular-nums">{formatCurrency(p.amount)}</span>
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                              <span className={`inline-flex items-center text-xs font-medium px-3 py-1 rounded-full ${statusClass}`}>
                                                {statusLabel}
                                              </span>
                                            </td>
                                            <td className="px-5 py-3 text-center w-20">
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(p); }}
                                                disabled={pdfLoadingId === p.id}
                                                className="p-1.5 text-ct-mute hover:text-ct-mute-2 hover:bg-ct-surface-2 rounded-ct-sm transition-colors disabled:opacity-50"
                                                title="Download invoice"
                                              >
                                                {pdfLoadingId === p.id ? (
                                                  <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                  <FileText className="w-4 h-4" />
                                                )}
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Mobile rows */}
                                <div className="md:hidden divide-y divide-ct-line-soft">
                                  {weekGroup.payments.map((p) => {
                                    const jobTitle = p.jobs?.title || p.jobs?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job';
                                    const isInvoice = p.id.startsWith('inv_');
                                    const isReleased = isInvoice || !!(p.metadata?.transfer_id);
                                    const statusLabel = isInvoice ? 'Completed' : isReleased ? 'Paid to bank' : p.status === 'completed' ? 'Awaiting release' : p.status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
                                    const statusClass = isInvoice ? 'bg-ct-teal/[0.14] text-ct-teal' : isReleased ? 'bg-ct-teal/[0.14] text-ct-teal' : p.status === 'completed' ? 'bg-ct-amber/[0.13] text-ct-amber' : 'bg-ct-surface-2 text-ct-mute-2';
                                    const isCancelled = p.jobStatus === 'cancelled' || p.jobStatus === 'declined';
                                    return (
                                      <div key={p.id} onClick={() => !isInvoice && setSelectedJobId(p.job_id)} className={`px-4 py-4 ${isInvoice ? '' : 'cursor-pointer'} hover:bg-ct-surface-2 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                                        {/* Row 1: icon + full service name + amount */}
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                            <div className="w-8 h-8 rounded-ct-sm flex items-center justify-center flex-shrink-0 bg-ct-amber/[0.13] mt-0.5">
                                              <DollarSign className="w-4 h-4 text-ct-amber" />
                                            </div>
                                            <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                              <p className="text-sm font-medium text-ct-paper leading-snug">{jobTitle}</p>
                                              {p.isRecurring && (
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isCancelled ? 'bg-ct-rose/[0.13] text-ct-rose' : 'bg-ct-surface-2 text-ct-mute-2'}`}>
                                                  {isCancelled ? 'Cancelled' : 'Ongoing'}
                                                </span>
                                              )}
                                              {!p.isRecurring && isCancelled && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-ct-rose/[0.13] text-ct-rose">Cancelled</span>
                                              )}
                                            </div>
                                          </div>
                                          <p className="text-base font-semibold text-ct-paper tabular-nums flex-shrink-0">{formatCurrency(p.amount)}</p>
                                        </div>

                                        {/* Row 2: client · date + status badge (aligned under the name) */}
                                        <div className="flex items-center justify-between gap-2 mt-2 pl-[42px]">
                                          <p className="text-xs text-ct-mute truncate min-w-0">
                                            {p.client_name} · {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                          </p>
                                          <span className={`inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${statusClass}`}>
                                            {statusLabel}
                                          </span>
                                        </div>

                                        {/* Row 3: download invoice */}
                                        <div className="mt-2 pl-[42px]">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(p); }}
                                            disabled={pdfLoadingId === p.id}
                                            className="inline-flex items-center gap-1.5 text-xs font-medium text-ct-mute-2 hover:text-ct-mute-2 disabled:opacity-50 min-h-[36px]"
                                            title="Download invoice"
                                          >
                                            {pdfLoadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                            Download invoice
                                          </button>
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
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payout History — month-grouped like client page */}
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-ct-line">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-ct-mute" />
                  <h2 className="text-sm font-semibold text-ct-paper">Payout history</h2>
                  {totalPayoutCount > 0 && (
                    <span className="text-xs text-ct-mute font-medium">({totalPayoutCount})</span>
                  )}
                </div>
              </div>

              {payoutGroups.length > 0 ? (
                <>
                  {payoutGroups.map((group) => {
                    const isCollapsed = collapsedMonths.has(group.key);
                    return (
                      <div key={group.key}>
                        {/* Month header */}
                        <button
                          onClick={() => toggleMonth(group.key)}
                          className="w-full flex items-center justify-between px-5 py-3 bg-ct-surface-2 border-b border-ct-line hover:bg-ct-surface-2 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronDown className={`w-4 h-4 text-ct-mute transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                            <h3 className="text-sm font-semibold text-ct-paper">{group.label}</h3>
                            <span className="text-xs text-ct-mute">
                              {group.payouts.length} payout{group.payouts.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-ct-paper tabular-nums">
                            {formatCurrency(group.total)}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <>
                            {/* Desktop rows */}
                            <div className="hidden md:block">
                              <table className="w-full">
                                <tbody className="divide-y divide-ct-line-soft">
                                  {group.payouts.map((payout) => (
                                    <tr key={payout.id} className="hover:bg-ct-surface-2 transition-colors">
                                      <td className="px-5 py-3.5 w-32">
                                        <span className="text-sm text-ct-mute">
                                          {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-ct-sm flex items-center justify-center flex-shrink-0 ${
                                            payout.status === 'paid' ? 'bg-ct-amber/[0.13]' :
                                            payout.status === 'in_transit' ? 'bg-ct-amber/[0.13]' :
                                            payout.status === 'pending' ? 'bg-ct-amber/[0.13]' : 'bg-ct-surface-2'
                                          }`}>
                                            <Banknote className={`w-3.5 h-3.5 ${
                                              payout.status === 'paid' ? 'text-ct-amber' :
                                              payout.status === 'in_transit' ? 'text-ct-amber' :
                                              payout.status === 'pending' ? 'text-ct-amber' : 'text-ct-mute'
                                            }`} />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-ct-paper">Bank transfer</p>
                                            <span className="text-xs text-ct-mute">
                                              Arrives {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-5 py-3.5 text-right w-28">
                                        <span className="text-sm font-semibold text-ct-paper tabular-nums">
                                          {formatCurrency(payout.amount)}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3.5 text-center w-32">
                                        <PayoutStatusBadge status={payout.status} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile rows */}
                            <div className="md:hidden divide-y divide-ct-line-soft">
                              {group.payouts.map((payout) => (
                                <div key={payout.id} className="flex items-center gap-3 px-5 py-3.5">
                                  <div className={`w-9 h-9 rounded-ct-sm flex items-center justify-center flex-shrink-0 ${
                                    payout.status === 'paid' ? 'bg-ct-amber/[0.13]' :
                                    payout.status === 'in_transit' ? 'bg-ct-amber/[0.13]' : 'bg-ct-surface-2'
                                  }`}>
                                    <Banknote className={`w-4 h-4 ${
                                      payout.status === 'paid' ? 'text-ct-amber' :
                                      payout.status === 'in_transit' ? 'text-ct-amber' : 'text-ct-mute'
                                    }`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-ct-paper">Bank transfer</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs text-ct-mute">
                                        {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                      <span className="text-xs text-ct-mute">
                                        → {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-ct-paper tabular-nums">{formatCurrency(payout.amount)}</p>
                                    <div className="mt-1"><PayoutStatusBadge status={payout.status} /></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-ct-surface-2 rounded-ct-lg flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-ct-mute" />
                  </div>
                  <h3 className="text-lg font-semibold text-ct-paper mb-1">No payouts yet</h3>
                  <p className="text-sm text-ct-mute max-w-sm mx-auto">
                    When clients release funds for completed jobs, your payouts will appear here. Payments typically arrive in your bank within 2-3 business days.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedJobId && (
        <JobManagementModal
          isOpen={true}
          onClose={() => setSelectedJobId(null)}
          jobId={selectedJobId}
          onJobUpdated={() => { fetchEarnings(); fetchDetails(); }}
        />
      )}
    </DashboardLayout>
  );
}

function PayoutStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-ct-teal/[0.14] text-ct-teal',
    pending: 'bg-ct-amber/[0.13] text-ct-amber',
    in_transit: 'bg-ct-surface-2 text-ct-mute-2',
    canceled: 'bg-ct-rose/[0.13] text-ct-rose',
    failed: 'bg-ct-rose/[0.13] text-ct-rose',
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
      className={`inline-flex items-center text-xs font-medium px-3 py-1 rounded-full ${
        styles[status] || 'bg-ct-surface-2 text-ct-mute'
      }`}
      title={tooltips[status] || ''}
    >
      {labels[status] || status}
    </span>
  );
}
