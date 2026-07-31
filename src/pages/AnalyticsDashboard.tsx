import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  DollarSign,
  Briefcase,
  Target,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Users,
  Calendar,
  Lightbulb,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';
import { DashboardStatsSkeleton, GridSkeleton } from '../components/SkeletonLoader';
import { LineChart, DonutChart } from '../components/SimpleCharts';

type DateRange = '7d' | '30d' | '90d' | '12m' | 'all';

interface JobRow {
  id: string;
  client_id: string;
  status: string;
  budget_amount: number | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

interface QuoteRow {
  id: string;
  job_id: string;
  price_min: number;
  price_max: number;
  firm_price: number | null;
  status: string;
  created_at: string;
  /** Joined job, used for response time (job posted -> quote sent). */
  jobs?: { created_at: string } | null;
}

/** Use firm_price if set, otherwise midpoint of price range. */
function quoteAmount(q: QuoteRow): number {
  return q.firm_price ?? (q.price_min + q.price_max) / 2;
}

/** Elapsed hours as the largest sensible unit — "45m", "6h", "2.1d". */
function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

interface ReviewRow {
  rating: number;
  created_at: string;
}

interface PaymentRow {
  amount: number;
  created_at: string;
  status: string;
}

interface ClientEntry {
  client_id: string;
  full_name: string;
  count: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const rangeStart = useMemo(() => {
    const now = new Date();
    if (dateRange === '7d') now.setDate(now.getDate() - 7);
    else if (dateRange === '30d') now.setDate(now.getDate() - 30);
    else if (dateRange === '90d') now.setDate(now.getDate() - 90);
    else if (dateRange === '12m') now.setFullYear(now.getFullYear() - 1);
    else now.setFullYear(now.getFullYear() - 10); // 'all' — go back far enough
    return now.toISOString();
  }, [dateRange]);

  useEffect(() => {
    if (user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, rangeStart]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [jobsRes, quotesRes, reviewsRes, recurringPayRes, jobPayRes, extRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, client_id, status, budget_amount, created_at, profiles!jobs_client_id_fkey(full_name)')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      supabase
        .from('quotes')
        .select('id, job_id, price_min, price_max, firm_price, status, created_at, jobs:job_id(created_at)')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      supabase
        .from('reviews')
        .select('rating, created_at')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      // Tradie income arrives under TWO different keys, so it takes two queries.
      //
      // (a) Recurring / off-app invoices — these rows genuinely carry
      //     profile_id = the tradie, because the payer is often an off-app
      //     client_contact with no profiles row at all.
      supabase
        .from('payments')
        .select('amount, created_at, status')
        .eq('profile_id', user.id)
        .eq('payment_type', 'recurring_invoice')
        .gte('created_at', rangeStart),
      // (b) Escrow job income — reached via the JOB, because on job_funding rows
      //     profile_id is the CLIENT who paid (accept-and-pay/index.ts:500,
      //     create-job-deposit:209, pay-milestone:199 all write the payer's id).
      //     This page previously filtered on profile_id alone, so a tradie's
      //     revenue silently EXCLUDED every escrow job they had ever done.
      //     Same shape as src/pages/Payouts.tsx:159-163.
      supabase
        .from('payments')
        .select('amount, created_at, status, jobs!inner(tradie_id)')
        .eq('jobs.tradie_id', user.id)
        .eq('payment_type', 'job_funding')
        .gte('created_at', rangeStart),
      // Externally-received (bank transfer / cash) invoice income — merged into
      // payments as synthetic completed rows so revenue totals include them.
      supabase
        .from('recurring_invoices')
        .select('total, paid_at')
        .eq('tradie_id', user.id)
        .eq('payment_method', 'external')
        .eq('status', 'paid')
        .gte('paid_at', rangeStart),
    ]);

    // Only set state if no error is present and data is an array
    setJobs(Array.isArray(jobsRes.data) && !jobsRes.error ? (jobsRes.data as JobRow[]) : []);
    // Only cast to QuoteRow[] if there is no error and data is an array
    if (quotesRes.error || !Array.isArray(quotesRes.data)) {
      // This can happen if the query requests a column that doesn't exist (e.g., 'amount')
      // or if there is another query error. Log for debugging.
      console.error('Error fetching quotes:', quotesRes.error);
      setQuotes([]);
    } else {
      // Defensive: filter out any non-object or incomplete entries for type safety
      const validQuotes = (quotesRes.data as unknown[])
        .filter(
          (q): q is QuoteRow =>
            typeof q === 'object' &&
            q !== null &&
            'id' in q &&
            'job_id' in q &&
            'price_min' in q &&
            'price_max' in q &&
            'status' in q &&
            'created_at' in q
        );
      setQuotes(validQuotes);
    }
    setReviews(Array.isArray(reviewsRes.data) && !reviewsRes.error ? (reviewsRes.data as ReviewRow[]) : []);
    const recurringPayments = Array.isArray(recurringPayRes.data) && !recurringPayRes.error
      ? (recurringPayRes.data as PaymentRow[])
      : [];
    // The escrow query embeds `jobs` only to filter on tradie_id — drop it so
    // these rows are the same shape as the rest and PaymentRow stays accurate.
    const jobPayments: PaymentRow[] = Array.isArray(jobPayRes.data) && !jobPayRes.error
      ? (jobPayRes.data as (PaymentRow & { jobs?: unknown })[]).map(({ amount, created_at, status }) => ({
          amount,
          created_at,
          status,
        }))
      : [];
    const basePayments = [...recurringPayments, ...jobPayments];
    const extRows: PaymentRow[] = Array.isArray(extRes.data) && !extRes.error
      ? (extRes.data as { total: number; paid_at: string | null }[]).map((r) => ({
          amount: Math.round(Number(r.total) * 100),
          created_at: r.paid_at || new Date().toISOString(),
          status: 'completed',
        }))
      : [];
    setPayments([...basePayments, ...extRows]);
    setLoading(false);
  };

  // --- Derived analytics ---
  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((s, p) => s + (p.amount || 0), 0);
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const totalQuotes = quotes.length;
  const wonQuotes = quotes.filter(q => q.status === 'accepted').length;
  const winRate = totalQuotes > 0 ? Math.round((wonQuotes / totalQuotes) * 100) : 0;
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  // Monthly revenue for bar chart (last 12 months)
  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, 0);
    }
    payments.filter(p => p.status === 'completed').forEach(p => {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (map.has(key)) map.set(key, (map.get(key) || 0) + p.amount);
    });
    return Array.from(map.entries()).map(([key, amount]) => ({
      label: MONTH_LABELS[parseInt(key.split('-')[1]) - 1],
      amount,
    }));
  }, [payments]);

  // Conversion by price range
  const conversionByRange = useMemo(() => {
    const ranges = [
      { label: '$0-500', min: 0, max: 50000 },
      { label: '$500-2k', min: 50000, max: 200000 },
      { label: '$2k-5k', min: 200000, max: 500000 },
      { label: '$5k+', min: 500000, max: Infinity },
    ];
    return ranges.map(r => {
      const inRange = quotes.filter(q => { const a = quoteAmount(q); return a >= r.min && a < r.max; });
      const won = inRange.filter(q => q.status === 'accepted').length;
      return { label: r.label, total: inRange.length, won, rate: inRange.length > 0 ? Math.round((won / inRange.length) * 100) : 0 };
    });
  }, [quotes]);

  // Response time: hours from the job being posted to this tradie's quote landing.
  //
  // This used to be `Math.random() * 48`, so the average, the median and the
  // day-of-week chart were all invented and changed on every page load. Same
  // calculation as PerformanceInsights.tsx, which has always done it properly.
  // Quotes with no joinable job are excluded rather than counted as zero, which
  // would drag every average down.
  const responseHours = useMemo(
    () =>
      quotes
        .filter(q => q.jobs?.created_at)
        .map(q => ({
          day: (new Date(q.created_at).getDay() + 6) % 7, // Mon=0
          hours:
            (new Date(q.created_at).getTime() - new Date(q.jobs!.created_at).getTime()) /
            (1000 * 60 * 60),
        }))
        .filter(r => Number.isFinite(r.hours) && r.hours >= 0),
    [quotes]
  );

  const responseByDay = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    const dayCounts = Array(7).fill(0);
    responseHours.forEach(r => {
      dayTotals[r.day] += r.hours;
      dayCounts[r.day] += 1;
    });
    return DAY_LABELS.map((label, i) => ({
      label,
      avg: dayCounts[i] > 0 ? Math.round(dayTotals[i] / dayCounts[i]) : 0,
    }));
  }, [responseHours]);

  // Mean and a real median — the median was previously just `average * 0.8`.
  const { avgResponseTime, medianResponseTime } = useMemo(() => {
    if (responseHours.length === 0) return { avgResponseTime: 0, medianResponseTime: 0 };
    const sorted = responseHours.map(r => r.hours).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return {
      avgResponseTime: sorted.reduce((s, h) => s + h, 0) / sorted.length,
      medianResponseTime:
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
    };
  }, [responseHours]);

  const hasResponseData = responseHours.length > 0;
  const maxDayResponse = Math.max(...responseByDay.map(d => d.avg), 1);

  // Client retention
  const clientStats = useMemo(() => {
    const clientJobMap = new Map<string, { name: string; count: number }>();
    jobs.forEach(j => {
      const existing = clientJobMap.get(j.client_id);
      const name = j.profiles?.full_name || 'Unknown Client';
      if (existing) {
        existing.count += 1;
      } else {
        clientJobMap.set(j.client_id, { name, count: 1 });
      }
    });
    const repeatClients = Array.from(clientJobMap.values()).filter(c => c.count > 1).length;
    const totalClients = clientJobMap.size;
    const repeatPct = totalClients > 0 ? Math.round((repeatClients / totalClients) * 100) : 0;
    const topClients: ClientEntry[] = Array.from(clientJobMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([client_id, { name, count }]) => ({ client_id, full_name: name, count }));
    return { repeatPct, totalClients, repeatClients, topClients };
  }, [jobs]);

  // Seasonal heat map (jobs per month)
  const seasonalData = useMemo(() => {
    const counts = Array(12).fill(0);
    jobs.forEach(j => {
      const month = new Date(j.created_at).getMonth();
      counts[month] += 1;
    });
    const max = Math.max(...counts, 1);
    return MONTH_LABELS.map((label, i) => ({ label, count: counts[i], intensity: counts[i] / max }));
  }, [jobs]);

  // Insights
  const insights = useMemo(() => {
    const tips: string[] = [];
    if (winRate < 30 && totalQuotes > 5) tips.push('Your quote win rate is below 30%. Consider adjusting your pricing or adding more detail to your quotes.');
    if (winRate >= 60) tips.push('Excellent win rate! You could try raising your quote amounts slightly to increase revenue.');
    if (avgRating >= 4.5 && reviews.length >= 3) tips.push('Your high rating is a strong selling point. Make sure it is highlighted on your profile.');
    if (clientStats.repeatPct > 40) tips.push('Great client retention! Consider offering loyalty discounts to keep repeat clients coming back.');
    if (clientStats.repeatPct < 15 && clientStats.totalClients > 3) tips.push('Low repeat client rate. Follow up after jobs with a thank-you message to build relationships.');
    if (completedJobs === 0) tips.push('Complete your first job to start building your analytics. Post quotes on available leads to get started.');
    if (tips.length === 0) tips.push('Keep submitting quotes and completing jobs to unlock more detailed insights.');
    return tips.slice(0, 5);
  }, [winRate, totalQuotes, avgRating, reviews.length, clientStats, completedJobs]);

  const formatCurrency = (cents: number) =>
    (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

  const hasData = jobs.length > 0 || quotes.length > 0 || payments.length > 0;

  if (loading) {
    return (
      <DashboardLayout wide>
        <DashboardStatsSkeleton />
        <div className="mt-6">
          <GridSkeleton count={4} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wide>
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ct-paper">My Stats</h1>
            <p className="text-ct-mute-2 mt-1">See how your business is tracking and where to improve</p>
          </div>
          {/* Short labels below sm: five full labels ("All Time" etc.) overflow a
              360px screen, and the last one was being clipped mid-word. */}
          <div className="flex items-center gap-1 bg-ct-surface border border-ct-line rounded-ct-md p-1 shadow-sm">
            {([
              { key: '7d' as DateRange, short: '7D', label: '7 Days' },
              { key: '30d' as DateRange, short: '30D', label: '30 Days' },
              { key: '90d' as DateRange, short: '3M', label: '3 Months' },
              { key: '12m' as DateRange, short: '12M', label: '12 Months' },
              { key: 'all' as DateRange, short: 'All', label: 'All Time' },
            ]).map(({ key, short, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                aria-label={label}
                aria-pressed={dateRange === key}
                className={`flex-1 sm:flex-none min-h-[44px] px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-ct-sm transition-colors whitespace-nowrap ${
                  dateRange === key
                    ? 'bg-ct-teal text-ct-ink shadow-sm'
                    : 'text-ct-mute-2 hover:bg-ct-surface-2 hover:text-ct-paper'
                }`}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {!hasData ? (
          <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-12 text-center shadow-sm">
            <BarChart3 className="w-12 h-12 text-ct-mute mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-ct-paper mb-2">No stats yet</h3>
            <p className="text-ct-mute-2 max-w-md mx-auto">
              Once you submit your first quote and complete a job, your stats will appear here. Browse available leads to get started.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
              <KPICard icon={DollarSign} label="Total Revenue" value={formatCurrency(totalRevenue)} trend={totalRevenue > 0 ? 'up' : 'neutral'} color="green" />
              <KPICard icon={Briefcase} label="Jobs Completed" value={String(completedJobs)} trend={completedJobs > 0 ? 'up' : 'neutral'} color="blue" />
              <KPICard icon={Target} label="Win Rate" value={`${winRate}%`} trend={winRate >= 40 ? 'up' : winRate > 0 ? 'down' : 'neutral'} color="indigo" />
              <KPICard icon={Star} label="Avg Rating" value={avgRating > 0 ? avgRating.toFixed(1) : '--'} trend={avgRating >= 4.0 ? 'up' : avgRating > 0 ? 'down' : 'neutral'} color="amber" />
            </div>

            {/* Interactive Revenue Trend (Line Chart) */}
            <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 mb-6 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-ct-paper">Revenue Trend</h2>
                  <p className="text-xs sm:text-sm text-ct-mute-2 mt-0.5">Monthly revenue over the selected period</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl sm:text-2xl font-bold text-ct-paper">{formatCurrency(totalRevenue)}</p>
                  <p className="text-xs text-ct-mute-2">Total in period</p>
                </div>
              </div>
              <LineChart
                data={monthlyRevenue.map(m => ({ label: m.label, value: m.amount }))}
                height={220}
                color="#06D6A0"
                formatValue={(v) => formatCurrency(v)}
              />
            </div>

            {/* Job Status (Donut).
                "Quotes: Sent vs Won" used to sit beside this, but it drew eight bars
                labelled "$0-500 Sent" etc. which truncated to "$0-5…" on mobile, and
                the "Win Rate by Quote Price" table below carries the same four rows. */}
            <div className="mb-6">
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-ct-paper mb-1">Job Status Breakdown</h2>
                <p className="text-xs sm:text-sm text-ct-mute-2 mb-4">Distribution of jobs by current status</p>
                <DonutChart
                  data={[
                    { label: 'Completed', value: jobs.filter(j => j.status === 'completed').length, color: '#06D6A0' },
                    { label: 'In Progress', value: jobs.filter(j => j.status === 'in_progress').length, color: '#3b82f6' },
                    { label: 'Pending', value: jobs.filter(j => j.status === 'pending' || j.status === 'open').length, color: '#f59e0b' },
                    { label: 'Declined', value: jobs.filter(j => j.status === 'declined').length, color: '#f97316' },
                    { label: 'Cancelled', value: jobs.filter(j => j.status === 'cancelled').length, color: '#ef4444' },
                  ].filter(d => d.value > 0)}
                  size={160}
                  centerLabel="Jobs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
              {/* Quote Performance */}
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-ct-paper mb-4">Quote Performance</h2>
                <div className="flex items-center gap-4 sm:gap-6 mb-6">
                  {/* CSS Donut */}
                  <div className="relative w-24 h-24 flex-shrink-0">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9155" fill="none" stroke="#06D6A0"
                        strokeWidth="3" strokeDasharray={`${winRate} ${100 - winRate}`} strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-bold text-ct-paper">{winRate}%</span>
                    </div>
                  </div>
                  <div className="text-sm text-ct-mute-2 space-y-1">
                    <p>Quotes Sent: <span className="font-semibold text-ct-paper">{totalQuotes}</span></p>
                    <p>Accepted: <span className="font-semibold text-ct-teal">{wonQuotes}</span></p>
                    <p>Declined: <span className="font-semibold text-ct-rose">{quotes.filter(q => q.status === 'declined').length}</span></p>
                    <p>Pending: <span className="font-semibold text-ct-amber">{quotes.filter(q => q.status === 'pending').length}</span></p>
                  </div>
                </div>

                <h3 className="text-sm font-medium text-ct-mute-2 mb-2">Win Rate by Quote Price</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ct-mute-2 border-b border-ct-line">
                        <th className="pb-2 font-medium">Range</th>
                        <th className="pb-2 font-medium text-center">Sent</th>
                        <th className="pb-2 font-medium text-center">Won</th>
                        <th className="pb-2 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ct-line-soft">
                      {conversionByRange.map(r => (
                        <tr key={r.label}>
                          <td className="py-2 text-ct-mute-2">{r.label}</td>
                          <td className="py-2 text-center text-ct-mute-2">{r.total}</td>
                          <td className="py-2 text-center text-ct-mute-2">{r.won}</td>
                          <td className="py-2 text-right font-medium text-ct-paper">{r.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Response Time */}
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-ct-paper mb-1">Response Time</h2>
                <p className="text-xs sm:text-sm text-ct-mute-2 mb-4">
                  How long from a job being posted to your quote landing
                </p>

                {hasResponseData ? (
                  <>
                    <div className="flex gap-3 sm:gap-6 mb-6">
                      <div className="bg-ct-surface-2 rounded-ct-md p-4 flex-1 text-center">
                        <Clock className="w-5 h-5 text-ct-mute-2 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-ct-paper">{formatHours(avgResponseTime)}</p>
                        <p className="text-xs text-ct-mute-2">Average</p>
                      </div>
                      <div className="bg-ct-surface-2 rounded-ct-md p-4 flex-1 text-center">
                        <Clock className="w-5 h-5 text-ct-mute-2 mx-auto mb-1" />
                        <p className="text-2xl font-bold text-ct-paper">{formatHours(medianResponseTime)}</p>
                        <p className="text-xs text-ct-mute-2">Median</p>
                      </div>
                    </div>

                    <h3 className="text-sm font-medium text-ct-mute-2 mb-3">By Day of Week</h3>
                    <div className="flex items-end gap-2 h-28">
                      {responseByDay.map((d, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full max-w-[32px] bg-ct-teal rounded-t-ct-xs"
                            style={{ height: `${Math.max((d.avg / maxDayResponse) * 80, 2)}px` }}
                            title={d.avg > 0 ? `${d.label}: ${formatHours(d.avg)}` : `${d.label}: no quotes`}
                          />
                          <span className="text-xs text-ct-mute-2 mt-1">{d.label}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-ct-mute-2 py-8 text-center">
                    Quote on a few leads and your response times will show up here.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
              {/* Client Retention */}
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-ct-paper mb-4">Client Retention</h2>
                {/* items-stretch, not items-center: only the first tile has an icon
                    and only some labels wrap, so centring left the three at visibly
                    different heights with their numbers on different baselines. */}
                <div className="flex items-stretch gap-3 sm:gap-4 mb-6">
                  <div className="bg-ct-teal/[0.14] rounded-ct-md p-4 text-center flex-1 flex flex-col justify-center">
                    <Users className="w-5 h-5 text-ct-teal mx-auto mb-1" />
                    <p className="text-2xl font-bold text-ct-paper">{clientStats.repeatPct}%</p>
                    <p className="text-xs text-ct-mute-2">Repeat Clients</p>
                  </div>
                  <div className="bg-ct-surface-2 rounded-ct-md p-4 text-center flex-1 flex flex-col justify-center">
                    <p className="text-2xl font-bold text-ct-paper">{clientStats.totalClients}</p>
                    <p className="text-xs text-ct-mute-2">Total Clients</p>
                  </div>
                  <div className="bg-ct-surface-2 rounded-ct-md p-4 text-center flex-1 flex flex-col justify-center">
                    <p className="text-2xl font-bold text-ct-paper">{clientStats.repeatClients}</p>
                    <p className="text-xs text-ct-mute-2">Returning</p>
                  </div>
                </div>

                {clientStats.topClients.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-ct-mute-2 mb-2">Top Clients</h3>
                    <div className="divide-y divide-ct-line-soft">
                      {clientStats.topClients.map((c, i) => (
                        <div key={c.client_id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-ct-mute w-4">{i + 1}.</span>
                            <span className="text-sm text-ct-mute-2">{c.full_name}</span>
                          </div>
                          <span className="text-sm font-medium text-ct-mute-2">{c.count} jobs</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Seasonal Trends */}
              <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-ct-paper mb-4">Seasonal Trends</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4">
                  {seasonalData.map((m, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div
                        className="w-full aspect-square rounded-ct-sm flex items-center justify-center text-xs font-medium"
                        /* Tokens, not literals — the hard-coded blue measured
                           4.25:1 against white and failed AA, and the #4b5563
                           low-intensity branch was dark-on-dark. Teal deepens
                           with volume; the label flips to ink once the fill is
                           bright enough to carry it. */
                        style={{
                          backgroundColor: `rgb(var(--teal-c) / ${Math.max(m.intensity * 0.9, 0.06)})`,
                          color: m.intensity > 0.5 ? 'rgb(var(--ink-c))' : 'rgb(var(--paper-c))',
                        }}
                      >
                        {m.count}
                      </div>
                      <span className="text-xs text-ct-mute-2">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-ct-mute-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-ct-xs bg-ct-surface-2" />
                    <span>High season</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-ct-xs bg-ct-line" />
                    <span>Low season</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-ct-teal/[0.14] rounded-ct-md border border-ct-line p-4 sm:p-6 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-ct-mute-2" />
                <h2 className="text-lg font-semibold text-ct-paper">Insights & Tips</h2>
              </div>
              <div className="space-y-3">
                {insights.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3 bg-ct-surface/80 rounded-ct-md px-4 py-3">
                    <Calendar className="w-4 h-4 text-ct-mute-2 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-ct-mute-2">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// --- Helper component ---

function KPICard({
  icon: Icon,
  label,
  value,
  trend,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
  color: string;
}) {
  const bgMap: Record<string, string> = {
    green: 'bg-ct-teal/[0.14]',
    blue: 'bg-ct-surface-2',
    indigo: 'bg-ct-surface-2',
    amber: 'bg-ct-amber/[0.13]',
  };
  const iconColorMap: Record<string, string> = {
    green: 'text-ct-teal',
    blue: 'text-ct-mute-2',
    indigo: 'text-ct-mute-2',
    amber: 'text-ct-amber',
  };

  return (
    <div className="bg-ct-surface rounded-ct-lg border border-ct-line p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 sm:p-2.5 ${bgMap[color]} rounded-ct-md`}>
          <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
        </div>
        {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-ct-teal" />}
        {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-ct-rose" />}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-ct-paper">{value}</p>
      <p className="text-xs sm:text-sm text-ct-mute-2 mt-1">{label}</p>
    </div>
  );
}
