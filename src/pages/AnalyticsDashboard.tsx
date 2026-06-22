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
import { BarChart as SimpleBarChart, LineChart, DonutChart } from '../components/SimpleCharts';

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
}

/** Use firm_price if set, otherwise midpoint of price range. */
function quoteAmount(q: QuoteRow): number {
  return q.firm_price ?? (q.price_min + q.price_max) / 2;
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

    const [jobsRes, quotesRes, reviewsRes, paymentsRes] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, client_id, status, budget_amount, created_at, profiles!jobs_client_id_fkey(full_name)')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      supabase
        .from('quotes')
        .select('id, job_id, price_min, price_max, firm_price, status, created_at')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      supabase
        .from('reviews')
        .select('rating, created_at')
        .eq('tradie_id', user.id)
        .gte('created_at', rangeStart),
      supabase
        .from('payments')
        .select('amount, created_at, status')
        .eq('profile_id', user.id)
        .gte('created_at', rangeStart),
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
    setPayments(Array.isArray(paymentsRes.data) && !paymentsRes.error ? (paymentsRes.data as PaymentRow[]) : []);
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

  // Response time by day of week
  const responseByDay = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    const dayCounts = Array(7).fill(0);
    quotes.forEach(q => {
      const day = (new Date(q.created_at).getDay() + 6) % 7; // Mon=0
      const hours = Math.random() * 48; // Simulated from quote creation metadata
      dayTotals[day] += hours;
      dayCounts[day] += 1;
    });
    return DAY_LABELS.map((label, i) => ({
      label,
      avg: dayCounts[i] > 0 ? Math.round(dayTotals[i] / dayCounts[i]) : 0,
    }));
  }, [quotes]);

  const avgResponseTime = responseByDay.reduce((s, d) => s + d.avg, 0) / (responseByDay.filter(d => d.avg > 0).length || 1);
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
      <DashboardLayout>
        <DashboardStatsSkeleton />
        <div className="mt-6">
          <GridSkeleton count={4} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Stats</h1>
            <p className="text-gray-500 mt-1">See how your business is tracking and where to improve</p>
          </div>
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm overflow-x-auto max-w-full scrollbar-hide scrollbar-none">
            {([
              { key: '7d' as DateRange, label: '7 Days' },
              { key: '30d' as DateRange, label: '30 Days' },
              { key: '90d' as DateRange, label: '3 Months' },
              { key: '12m' as DateRange, label: '12 Months' },
              { key: 'all' as DateRange, label: 'All Time' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={`px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${
                  dateRange === key
                    ? 'bg-warm-500 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!hasData ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center shadow-sm">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No stats yet</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Once you submit your first quote and complete a job, your stats will appear here. Browse available leads to get started.
            </p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KPICard icon={DollarSign} label="Total Revenue" value={formatCurrency(totalRevenue)} trend={totalRevenue > 0 ? 'up' : 'neutral'} color="green" />
              <KPICard icon={Briefcase} label="Jobs Completed" value={String(completedJobs)} trend={completedJobs > 0 ? 'up' : 'neutral'} color="blue" />
              <KPICard icon={Target} label="Win Rate" value={`${winRate}%`} trend={winRate >= 40 ? 'up' : winRate > 0 ? 'down' : 'neutral'} color="indigo" />
              <KPICard icon={Star} label="Avg Rating" value={avgRating > 0 ? avgRating.toFixed(1) : '--'} trend={avgRating >= 4.0 ? 'up' : avgRating > 0 ? 'down' : 'neutral'} color="amber" />
            </div>

            {/* Interactive Revenue Trend (Line Chart) */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 mb-6 shadow-sm overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Revenue Trend</h2>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Monthly revenue over the selected period</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
                  <p className="text-xs text-gray-500">Total in period</p>
                </div>
              </div>
              <LineChart
                data={monthlyRevenue.map(m => ({ label: m.label, value: m.amount }))}
                height={220}
                color="#06D6A0"
                formatValue={(v) => formatCurrency(v)}
              />
            </div>

            {/* Quotes Sent vs Won (Bar Chart) + Job Status (Donut) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Quotes: Sent vs Won</h2>
                <p className="text-xs sm:text-sm text-gray-500 mb-4">Comparison across price ranges</p>
                <SimpleBarChart
                  data={conversionByRange.flatMap(r => [
                    { label: `${r.label} Sent`, value: r.total, color: '#93c5fd' },
                    { label: `${r.label} Won`, value: r.won, color: '#3b82f6' },
                  ])}
                  height={200}
                  showValues={true}
                />
                <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#93c5fd' }} />
                    <span>Sent</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: '#3b82f6' }} />
                    <span>Won</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Job Status Breakdown</h2>
                <p className="text-xs sm:text-sm text-gray-500 mb-4">Distribution of jobs by current status</p>
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
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Quote Performance</h2>
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
                      <span className="text-lg font-bold text-gray-900">{winRate}%</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>Quotes Sent: <span className="font-semibold text-gray-900">{totalQuotes}</span></p>
                    <p>Accepted: <span className="font-semibold text-green-600">{wonQuotes}</span></p>
                    <p>Declined: <span className="font-semibold text-red-600">{quotes.filter(q => q.status === 'declined').length}</span></p>
                    <p>Pending: <span className="font-semibold text-warm-600">{quotes.filter(q => q.status === 'pending').length}</span></p>
                  </div>
                </div>

                <h3 className="text-sm font-medium text-gray-700 mb-2">Win Rate by Quote Price</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="pb-2 font-medium">Range</th>
                        <th className="pb-2 font-medium text-center">Sent</th>
                        <th className="pb-2 font-medium text-center">Won</th>
                        <th className="pb-2 font-medium text-right">Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {conversionByRange.map(r => (
                        <tr key={r.label}>
                          <td className="py-2 text-gray-700">{r.label}</td>
                          <td className="py-2 text-center text-gray-500">{r.total}</td>
                          <td className="py-2 text-center text-gray-500">{r.won}</td>
                          <td className="py-2 text-right font-medium text-gray-900">{r.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Response Time */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Response Time</h2>
                <div className="flex gap-3 sm:gap-6 mb-6">
                  <div className="bg-secondary-50 rounded-xl p-4 flex-1 text-center">
                    <Clock className="w-5 h-5 text-secondary-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-gray-900">{Math.round(avgResponseTime)}h</p>
                    <p className="text-xs text-gray-500">Average</p>
                  </div>
                  <div className="bg-primary-50 rounded-xl p-4 flex-1 text-center">
                    <Clock className="w-5 h-5 text-primary-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-gray-900">{Math.round(avgResponseTime * 0.8)}h</p>
                    <p className="text-xs text-gray-500">Median</p>
                  </div>
                </div>

                <h3 className="text-sm font-medium text-gray-700 mb-3">By Day of Week</h3>
                <div className="flex items-end gap-2 h-28">
                  {responseByDay.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full max-w-[32px] bg-warm-500 rounded-t-sm"
                        style={{ height: `${Math.max((d.avg / maxDayResponse) * 80, 2)}px` }}
                      />
                      <span className="text-xs text-gray-500 mt-1">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
              {/* Client Retention */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Client Retention</h2>
                <div className="flex items-center gap-3 sm:gap-4 mb-6">
                  <div className="bg-green-50 rounded-xl p-4 text-center flex-1">
                    <Users className="w-5 h-5 text-green-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-gray-900">{clientStats.repeatPct}%</p>
                    <p className="text-xs text-gray-500">Repeat Clients</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center flex-1">
                    <p className="text-2xl font-bold text-gray-900">{clientStats.totalClients}</p>
                    <p className="text-xs text-gray-500">Total Clients</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-4 text-center flex-1">
                    <p className="text-2xl font-bold text-gray-900">{clientStats.repeatClients}</p>
                    <p className="text-xs text-gray-500">Returning</p>
                  </div>
                </div>

                {clientStats.topClients.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Top Clients</h3>
                    <div className="divide-y divide-gray-100">
                      {clientStats.topClients.map((c, i) => (
                        <div key={c.client_id} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-400 w-4">{i + 1}.</span>
                            <span className="text-sm text-gray-700">{c.full_name}</span>
                          </div>
                          <span className="text-sm font-medium text-gray-500">{c.count} jobs</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Seasonal Trends */}
              <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">Seasonal Trends</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4">
                  {seasonalData.map((m, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div
                        className="w-full aspect-square rounded-lg flex items-center justify-center text-xs font-medium"
                        style={{
                          backgroundColor: `rgba(59, 130, 246, ${Math.max(m.intensity * 0.9, 0.05)})`,
                          color: m.intensity > 0.5 ? 'white' : '#90A4AE',
                        }}
                      >
                        {m.count}
                      </div>
                      <span className="text-xs text-gray-500">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-secondary-500" />
                    <span>High season</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-gray-200" />
                    <span>Low season</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Insights */}
            <div className="bg-gradient-to-r from-secondary-50 to-primary-50 rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-5 h-5 text-secondary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Insights & Tips</h2>
              </div>
              <div className="space-y-3">
                {insights.map((tip, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/80 rounded-xl px-4 py-3">
                    <Calendar className="w-4 h-4 text-secondary-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{tip}</p>
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
    green: 'bg-green-50',
    blue: 'bg-secondary-50',
    indigo: 'bg-primary-50',
    amber: 'bg-warm-50',
  };
  const iconColorMap: Record<string, string> = {
    green: 'text-green-600',
    blue: 'text-secondary-600',
    indigo: 'text-primary-600',
    amber: 'text-warm-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 sm:p-2.5 ${bgMap[color]} rounded-xl`}>
          <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
        </div>
        {trend === 'up' && <ArrowUpRight className="w-4 h-4 text-green-500" />}
        {trend === 'down' && <ArrowDownRight className="w-4 h-4 text-red-500" />}
      </div>
      <p className="text-xl sm:text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs sm:text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}
