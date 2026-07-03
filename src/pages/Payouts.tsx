import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Wallet,
  DollarSign,
  Clock,
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
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getConnectAccountDetails, createConnectOnboardingSession } from '../lib/stripe';
import type { ConnectAccountDetails } from '../lib/stripe';
import { escapeHtml } from '../lib/escapeHtml';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Payouts() {
  const { session, user } = useAuth();
  const [accountDetails, setAccountDetails] = useState<ConnectAccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [escrowHeld, setEscrowHeld] = useState(0);
  const [escrowCount, setEscrowCount] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingWarning, setOnboardingWarning] = useState(false);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const [collapsedPaymentMonths, setCollapsedPaymentMonths] = useState<Set<string>>(new Set());
  const [collapsedPaymentWeeks, setCollapsedPaymentWeeks] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [customInvoiceTemplate, setCustomInvoiceTemplate] = useState<string | null>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [recentPayments, setRecentPayments] = useState<{
    id: string;
    job_id: string;
    amount: number;
    status: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
    invoice_number: number | null;
    invoice_ref: string | null;
    jobs: { title: string; description: string; status: string; client_id: string } | null;
    client_name: string;
    jobStatus: string;
    isRecurring: boolean;
  }[]>([]);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;
    try {
      // Fetch unreleased escrow payments (completed job_funding with no transfer_id)
      const { data: escrowData } = await supabase
        .from('payments')
        .select('amount, metadata, jobs!inner(tradie_id, status)')
        .eq('jobs.tradie_id', user.id)
        .eq('status', 'completed')
        .eq('payment_type', 'job_funding')
        .in('jobs.status', ['funded', 'in_progress', 'completed']);

      const unreleased = (escrowData || []).filter(
        (p) => !(p.metadata as Record<string, unknown>)?.transfer_id
      );
      setEscrowHeld(unreleased.reduce((s, r) => s + (r.amount || 0), 0));
      setEscrowCount(unreleased.length);

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
        const clientIds = [...new Set(jobPayments.map(p => (p.jobs as unknown as { client_id: string }).client_id))];
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
          const { data: recurringJobs } = await supabase
            .from('recurring_jobs')
            .select('id, status')
            .in('id', uniqueIds);
          if (recurringJobs) {
            for (const rj of recurringJobs) {
              recurringStatusMap.set(rj.id, rj.status);
            }
          }
        }

        const mapped = jobPayments.map(p => {
          const job = p.jobs as unknown as { title: string; description: string; status: string; client_id: string };
          const meta = p.metadata as Record<string, unknown> | null;
          const recurringId = meta?.recurring_job_id as string | undefined;
          const isRecurring = !!recurringId || /recurring|ongoing/i.test(job.title || '') || /recurring|ongoing/i.test(job.description || '');

          // Determine recurring service status
          let recurringStatus = '';
          if (recurringId && recurringStatusMap.has(recurringId)) {
            recurringStatus = recurringStatusMap.get(recurringId)!;
          }
          const isCancelledRecurring = recurringStatus === 'cancelled' || recurringStatus === 'ended';

          return {
            id: p.id,
            job_id: (p as unknown as { job_id: string }).job_id,
            amount: p.amount,
            status: p.status,
            created_at: p.created_at,
            metadata: meta,
            invoice_number: (p as unknown as { invoice_number: number | null }).invoice_number ?? null,
            invoice_ref: (p as unknown as { invoice_ref: string | null }).invoice_ref ?? null,
            jobs: job,
            client_name: clientMap.get(job.client_id) || 'Client',
            jobStatus: isCancelledRecurring ? 'cancelled' : job.status,
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
            .order('paid_at', { ascending: false });

          if (invData && invData.length > 0) {
            // Fetch client names for invoices
            const invClientIds = [...new Set(invData.map(inv => inv.homeowner_id))];
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
                client_name: invClientMap.get(inv.homeowner_id) || 'Client',
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
            .order('paid_at', { ascending: false });

          if (invData && invData.length > 0) {
            const invClientIds = [...new Set(invData.map(inv => inv.homeowner_id))];
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
                client_name: invClientMap.get(inv.homeowner_id) || 'Client',
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
              <p style="font-size: 11px; color: #888; margin: 8px 0 0;">ABN: XX XXX XXX XXX</p>
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

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: safeTemplateSrc ? [0, 0, 0, 0] : [15, 15, 15, 15],
          filename: `ConnecTradie-Receipt-${invoiceNum}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(container)
        .save();
    } finally {
      document.body.removeChild(container);
      setPdfLoadingId(null);
    }
  };

  const totalPayoutCount = accountDetails?.payouts?.length ?? 0;
  const totalPaidOut = useMemo(() => {
    return (accountDetails?.payouts || []).reduce((s, p) => s + p.amount, 0);
  }, [accountDetails?.payouts]);
  const escrowAmount = escrowHeld;
  const onItsWay = (accountDetails?.balance?.available ?? 0) + (accountDetails?.balance?.pending ?? 0);
  const computedTotalEarned = escrowAmount + onItsWay + totalPaidOut;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Loading payout details...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col items-center justify-center py-24">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-gray-900 font-semibold mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm mb-6">{error}</p>
            <button
              onClick={fetchDetails}
              className="px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 transition-colors"
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
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-primary-50 rounded-lg">
                <Wallet className="w-5 h-5 text-primary-700" />
              </div>
              <h1 className="text-2xl font-bold text-navy-900">Payouts</h1>
            </div>
            <p className="text-sm text-navy-400 ml-12">
              View your balance, payout history, and manage bank details
            </p>
          </div>
          {accountDetails?.connected && (accountDetails.payouts?.length ?? 0) > 0 && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm font-medium text-navy-700 hover:bg-surface-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>

        {/* Not Connected state */}
        {!accountDetails?.connected && (
          <div className="bg-gradient-to-r from-secondary-50 to-primary-50 rounded-2xl border border-secondary-200 p-8 text-center">
            <div className="w-16 h-16 bg-secondary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-secondary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Payouts</h2>
            <p className="text-gray-600 mb-2 max-w-md mx-auto">
              Connect your bank account to receive payments directly from completed jobs.
            </p>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-secondary-50 border border-secondary-200 rounded-lg mb-6 max-w-md mx-auto text-left">
              <Shield className="w-4 h-4 text-secondary-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-secondary-800 leading-relaxed">
                You'll need your <strong>BSB, account number, and ABN</strong>. Setup takes about 2 minutes. Payments processed securely by Stripe.
              </p>
            </div>
            <button
              onClick={handleConnectSetup}
              disabled={connectLoading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-warm-500 text-white font-semibold rounded-xl hover:bg-warm-600 disabled:opacity-60 transition-colors"
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
              <div className="bg-gradient-to-r from-green-50 to-secondary-50 rounded-2xl border border-green-200 p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-900">Account Active</p>
                    <p className="text-sm text-green-700">Your bank account is connected and ready to receive payouts.</p>
                  </div>
                </div>
              </div>
            ) : hasRequirements ? (
              <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="font-semibold text-amber-900">Setup Incomplete</p>
                      <p className="text-sm text-amber-700">
                        We need a few more details (e.g. bank account or identity info) before you can receive payouts.
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

            {/* Summary */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-baseline justify-between mb-5">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Total Earned</p>
                  <p className="text-3xl font-bold text-gray-900">{formatCurrency(computedTotalEarned)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {escrowAmount > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-medium text-amber-700">Waiting for Client</span>
                    </div>
                    <p className="text-xl font-bold text-amber-900">{formatCurrency(escrowAmount)}</p>
                    <p className="text-xs text-amber-600 mt-1">
                      {escrowCount} job{escrowCount !== 1 ? 's' : ''} · Auto-releases after 48 hours
                    </p>
                  </div>
                )}
                {onItsWay > 0 && (
                  <div className="rounded-xl bg-secondary-50 border border-secondary-200 p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-3.5 h-3.5 text-secondary-500" />
                      <span className="text-xs font-medium text-secondary-700">On Its Way</span>
                    </div>
                    <p className="text-xl font-bold text-secondary-900">{formatCurrency(onItsWay)}</p>
                    <p className="text-xs text-secondary-600 mt-1">Transferring to your bank (2–3 days)</p>
                  </div>
                )}
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-700">Paid to Bank</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-900">{formatCurrency(totalPaidOut)}</p>
                  <p className="text-xs text-emerald-600 mt-1">{totalPayoutCount} transfer{totalPayoutCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {/* Stripe Connect onboarding warning */}
            {onboardingWarning && onboardingComplete === false && (
              <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-2xl border border-red-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                    <div>
                      <p className="font-semibold text-red-900">Stripe Connect Setup Required</p>
                      <p className="text-sm text-red-700">
                        You must complete your Stripe Connect setup before you can manage payouts or access your payout dashboard. Please complete onboarding first.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleConnectSetup}
                    disabled={connectLoading}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors text-sm"
                  >
                    {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Setup'}
                  </button>
                </div>
              </div>
            )}

            {/* Stripe Dashboard link */}
            {accountDetails.dashboardUrl && (
              <div>
                {onboardingComplete === false ? (
                  <button
                    onClick={() => setOnboardingWarning(true)}
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Bank Details & Payout Schedule
                  </button>
                ) : (
                  <a
                    href={accountDetails.dashboardUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Manage Bank Details & Payout Schedule
                  </a>
                )}
              </div>
            )}

            {/* Recent Job Payments */}
            {recentPayments.length > 0 && (
              <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
                <div className="flex items-start justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-surface-200">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-navy-300 flex-shrink-0" />
                      <h2 className="text-sm font-semibold text-navy-800 whitespace-nowrap">Recent Payments</h2>
                      <span className="text-xs text-navy-300 font-medium hidden sm:inline">(Last 5 days)</span>
                    </div>
                    <span className="text-[11px] text-navy-300 font-medium ml-6 sm:hidden">Last 5 days</span>
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
                        <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full whitespace-nowrap">Custom template active</span>
                        <button
                          onClick={handleRemoveTemplate}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => templateInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy-500 border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors whitespace-nowrap flex-shrink-0"
                      >
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="sm:hidden">Upload Invoice</span>
                        <span className="hidden sm:inline">Upload Invoice Template</span>
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
                        className="w-full flex items-center justify-between px-5 py-3 bg-surface-50 border-b border-surface-200 hover:bg-surface-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isMonthCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-navy-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-navy-400" />
                          )}
                          <span className="text-sm font-semibold text-navy-800">{monthGroup.label}</span>
                          <span className="text-xs text-navy-300">
                            ({monthGroup.weeks.reduce((s, w) => s + w.payments.length, 0)} payments)
                          </span>
                        </div>
                        <span className="text-sm font-semibold text-navy-900 tabular-nums">
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
                              className="w-full flex items-center justify-between px-5 py-2.5 pl-9 bg-white border-b border-surface-100 hover:bg-surface-50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {isWeekCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-navy-300" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-navy-300" />
                                )}
                                <span className="text-xs font-medium text-navy-500">{weekGroup.label}</span>
                                <span className="text-xs text-navy-300">({weekGroup.payments.length})</span>
                              </div>
                              <span className="text-xs font-semibold text-navy-700 tabular-nums">
                                {formatCurrency(weekGroup.total)}
                              </span>
                            </button>

                            {!isWeekCollapsed && (
                              <>
                                {/* Desktop rows */}
                                <div className="hidden md:block">
                                  <table className="w-full">
                                    <tbody className="divide-y divide-surface-100">
                                      {weekGroup.payments.map((p) => {
                                        const jobTitle = p.jobs?.title || p.jobs?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job';
                                        const isInvoice = p.id.startsWith('inv_');
                                        const isReleased = isInvoice || !!(p.metadata?.transfer_id);
                                        const statusLabel = isInvoice ? 'Completed' : isReleased ? 'Paid to Bank' : p.status === 'completed' ? 'In Escrow' : p.status;
                                        const statusClass = isInvoice ? 'bg-emerald-100 text-emerald-700' : isReleased ? 'bg-green-100 text-green-700' : p.status === 'completed' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
                                        const isCancelled = p.jobStatus === 'cancelled' || p.jobStatus === 'declined';
                                        return (
                                          <tr key={p.id} onClick={() => !isInvoice && setSelectedJobId(p.job_id)} className={`hover:bg-surface-50 transition-colors ${isInvoice ? '' : 'cursor-pointer'} ${isCancelled ? 'opacity-60' : ''}`}>
                                            <td className="px-5 py-3 text-sm text-navy-400 w-24">
                                              {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </td>
                                            <td className="px-5 py-3">
                                              <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-navy-900 truncate max-w-[260px] sm:max-w-[180px] md:max-w-[260px]">{jobTitle}</p>
                                                {p.isRecurring && (
                                                  <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                    isCancelled ? 'bg-red-100 text-red-600' : 'bg-secondary-100 text-secondary-700'
                                                  }`}>
                                                    {isCancelled ? 'Cancelled' : 'Ongoing'}
                                                  </span>
                                                )}
                                                {!p.isRecurring && isCancelled && (
                                                  <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-600">
                                                    Cancelled
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-5 py-3 text-sm text-navy-500">{p.client_name}</td>
                                            <td className="px-5 py-3 text-right">
                                              <span className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(p.amount)}</span>
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
                                                className="p-1.5 text-navy-300 hover:text-secondary-600 hover:bg-secondary-50 rounded-lg transition-colors disabled:opacity-50"
                                                title="Download Invoice"
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
                                <div className="md:hidden divide-y divide-surface-100">
                                  {weekGroup.payments.map((p) => {
                                    const jobTitle = p.jobs?.title || p.jobs?.description?.match(/^\[([^\]]+)\]/)?.[1]?.replace(/_/g, ' ') || 'Job';
                                    const isInvoice = p.id.startsWith('inv_');
                                    const isReleased = isInvoice || !!(p.metadata?.transfer_id);
                                    const statusLabel = isInvoice ? 'Completed' : isReleased ? 'Paid to Bank' : p.status === 'completed' ? 'In Escrow' : p.status;
                                    const statusClass = isInvoice ? 'bg-emerald-100 text-emerald-700' : isReleased ? 'bg-green-100 text-green-700' : p.status === 'completed' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600';
                                    const isCancelled = p.jobStatus === 'cancelled' || p.jobStatus === 'declined';
                                    return (
                                      <div key={p.id} onClick={() => !isInvoice && setSelectedJobId(p.job_id)} className={`flex items-center gap-3 px-3 sm:px-5 py-3.5 ${isInvoice ? '' : 'cursor-pointer'} hover:bg-surface-50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-warm-50">
                                          <DollarSign className="w-4 h-4 text-warm-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <p className="text-sm font-medium text-navy-900 truncate">{jobTitle}</p>
                                            {p.isRecurring && (
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isCancelled ? 'bg-red-100 text-red-600' : 'bg-secondary-100 text-secondary-700'}`}>
                                                {isCancelled ? 'Cancelled' : 'Ongoing'}
                                              </span>
                                            )}
                                            {!p.isRecurring && isCancelled && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-600">Cancelled</span>
                                            )}
                                          </div>
                                          <p className="text-xs text-navy-300 mt-0.5">
                                            {p.client_name} · {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                          </p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                          <p className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(p.amount)}</p>
                                          <span className={`inline-flex items-center text-xs font-medium px-3 py-1 rounded-full mt-1 ${statusClass}`}>
                                            {statusLabel}
                                          </span>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(p); }}
                                          disabled={pdfLoadingId === p.id}
                                          className="p-1.5 text-navy-300 hover:text-secondary-600 flex-shrink-0"
                                          title="Download Invoice"
                                        >
                                          {pdfLoadingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                        </button>
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
            <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
                <div className="flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-navy-300" />
                  <h2 className="text-sm font-semibold text-navy-800">Payout History</h2>
                  {totalPayoutCount > 0 && (
                    <span className="text-xs text-navy-300 font-medium">({totalPayoutCount})</span>
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
                          className="w-full flex items-center justify-between px-5 py-3 bg-surface-50 border-b border-surface-200 hover:bg-surface-100 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <ChevronDown className={`w-4 h-4 text-navy-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                            <h3 className="text-sm font-semibold text-navy-800">{group.label}</h3>
                            <span className="text-xs text-navy-300">
                              {group.payouts.length} payout{group.payouts.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-navy-700 tabular-nums">
                            {formatCurrency(group.total)}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <>
                            {/* Desktop rows */}
                            <div className="hidden md:block">
                              <table className="w-full">
                                <tbody className="divide-y divide-surface-100">
                                  {group.payouts.map((payout) => (
                                    <tr key={payout.id} className="hover:bg-surface-50 transition-colors">
                                      <td className="px-5 py-3.5 w-32">
                                        <span className="text-sm text-navy-400">
                                          {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                        </span>
                                      </td>
                                      <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                            payout.status === 'paid' ? 'bg-warm-50' :
                                            payout.status === 'in_transit' ? 'bg-accent-50' :
                                            payout.status === 'pending' ? 'bg-accent-50' : 'bg-surface-100'
                                          }`}>
                                            <Banknote className={`w-3.5 h-3.5 ${
                                              payout.status === 'paid' ? 'text-warm-600' :
                                              payout.status === 'in_transit' ? 'text-accent-600' :
                                              payout.status === 'pending' ? 'text-accent-600' : 'text-navy-400'
                                            }`} />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium text-navy-900">Bank Transfer</p>
                                            <span className="text-xs text-navy-300">
                                              Arrives {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-5 py-3.5 text-right w-28">
                                        <span className="text-sm font-semibold text-navy-900 tabular-nums">
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
                            <div className="md:hidden divide-y divide-surface-100">
                              {group.payouts.map((payout) => (
                                <div key={payout.id} className="flex items-center gap-3 px-5 py-3.5">
                                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    payout.status === 'paid' ? 'bg-warm-50' :
                                    payout.status === 'in_transit' ? 'bg-accent-50' : 'bg-surface-100'
                                  }`}>
                                    <Banknote className={`w-4 h-4 ${
                                      payout.status === 'paid' ? 'text-warm-600' :
                                      payout.status === 'in_transit' ? 'text-accent-600' : 'text-navy-400'
                                    }`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-navy-900">Bank Transfer</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs text-navy-300">
                                        {new Date(payout.created * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                      <span className="text-xs text-navy-200">
                                        → {new Date(payout.arrival_date * 1000).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-semibold text-navy-900 tabular-nums">{formatCurrency(payout.amount)}</p>
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
                  <div className="w-16 h-16 bg-surface-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Wallet className="w-8 h-8 text-navy-200" />
                  </div>
                  <h3 className="text-lg font-semibold text-navy-800 mb-1">No Payouts Yet</h3>
                  <p className="text-sm text-navy-400 max-w-sm mx-auto">
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
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    in_transit: 'bg-secondary-100 text-secondary-700',
    canceled: 'bg-red-100 text-red-700',
    failed: 'bg-red-100 text-red-700',
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
        styles[status] || 'bg-gray-100 text-gray-300'
      }`}
      title={tooltips[status] || ''}
    >
      {labels[status] || status}
    </span>
  );
}
