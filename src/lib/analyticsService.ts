import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonthlyRevenue {
  month: string; // YYYY-MM
  revenue: number; // cents
  jobCount: number;
}

export interface RevenueData {
  totalRevenue: number;
  monthlyRevenue: MonthlyRevenue[];
  avgJobValue: number;
}

export interface JobAnalytics {
  totalJobs: number;
  completedJobs: number;
  completionRate: number;
  jobsByCategory: Record<string, number>;
}

export interface ConversionByPriceRange {
  range: string;
  total: number;
  accepted: number;
  rate: number;
}

export interface QuotePerformance {
  totalQuotes: number;
  acceptedQuotes: number;
  winRate: number;
  avgQuoteAmount: number;
  conversionByPriceRange: ConversionByPriceRange[];
}

export interface DayOfWeekMetric {
  day: string;
  avgResponseMinutes: number;
}

export interface ResponseMetrics {
  avgResponseTime: number; // minutes
  medianResponseTime: number; // minutes
  responseByDayOfWeek: DayOfWeekMetric[];
}

export interface TopClient {
  clientId: string;
  clientName: string;
  jobCount: number;
  totalSpent: number;
}

export interface ClientRetention {
  repeatRate: number;
  topClients: TopClient[];
  avgJobsPerClient: number;
}

export interface MonthlyHeatMap {
  month: number; // 1-12
  monthName: string;
  jobCount: number;
}

export interface SeasonalTrend {
  monthlyHeatMap: MonthlyHeatMap[];
  highSeasons: string[];
  lowSeasons: string[];
}

export interface AnalyticsSummary {
  revenue: RevenueData;
  jobs: JobAnalytics;
  quotes: QuotePerformance;
  response: ResponseMetrics;
  retention: ClientRetention;
  seasonal: SeasonalTrend;
  insights: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthsAgoISO(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString();
}

function toMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Revenue analytics
// ---------------------------------------------------------------------------

/**
 * Revenue analytics for a tradie over a given period.
 */
export async function getRevenueAnalytics(
  tradieId: string,
  months: number = 12,
): Promise<RevenueData> {
  const since = monthsAgoISO(months);

  const { data: payments, error } = await supabase
    .from('payments')
    .select('amount, created_at')
    .eq('profile_id', tradieId)
    .eq('status', 'completed')
    .gte('created_at', since);

  if (error) throw new Error(error.message);

  const items = payments ?? [];
  const totalRevenue = items.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const avgJobValue = items.length > 0 ? Math.round(totalRevenue / items.length) : 0;

  // Group by month
  const monthMap = new Map<string, { revenue: number; jobCount: number }>();
  for (const p of items) {
    const key = toMonthKey(p.created_at);
    const existing = monthMap.get(key) ?? { revenue: 0, jobCount: 0 };
    existing.revenue += p.amount ?? 0;
    existing.jobCount += 1;
    monthMap.set(key, existing);
  }

  const monthlyRevenue: MonthlyRevenue[] = Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, ...data }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { totalRevenue, monthlyRevenue, avgJobValue };
}

// ---------------------------------------------------------------------------
// Job analytics
// ---------------------------------------------------------------------------

/**
 * Job completion and category analytics.
 */
export async function getJobAnalytics(
  tradieId: string,
  months: number = 12,
): Promise<JobAnalytics> {
  const since = monthsAgoISO(months);

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('status, trade_category')
    .eq('tradie_id', tradieId)
    .gte('created_at', since);

  if (error) throw new Error(error.message);

  const items = jobs ?? [];
  const totalJobs = items.length;
  const completedJobs = items.filter((j) => j.status === 'completed').length;
  const completionRate = totalJobs > 0 ? completedJobs / totalJobs : 0;

  const jobsByCategory: Record<string, number> = {};
  for (const job of items) {
    const cat = job.trade_category ?? 'unknown';
    jobsByCategory[cat] = (jobsByCategory[cat] ?? 0) + 1;
  }

  return { totalJobs, completedJobs, completionRate, jobsByCategory };
}

// ---------------------------------------------------------------------------
// Quote performance
// ---------------------------------------------------------------------------

/**
 * Quote win rate and conversion analytics.
 */
export async function getQuotePerformance(
  tradieId: string,
  months: number = 12,
): Promise<QuotePerformance> {
  const since = monthsAgoISO(months);

  const { data: quotes, error } = await supabase
    .from('jobs')
    .select('status, description, trade_category, created_at')
    .eq('tradie_id', tradieId)
    .gte('created_at', since);

  if (error) throw new Error(error.message);

  // Also fetch payment amounts to approximate quote amounts
  const { data: payments } = await supabase
    .from('payments')
    .select('job_id, amount')
    .eq('profile_id', tradieId)
    .gte('created_at', since);

  const paymentMap = new Map<string, number>();
  for (const p of payments ?? []) {
    paymentMap.set(p.job_id, p.amount ?? 0);
  }

  const items = quotes ?? [];
  const totalQuotes = items.length;
  const acceptedStatuses = new Set(['accepted', 'in_progress', 'completed']);
  const acceptedQuotes = items.filter((q) => acceptedStatuses.has(q.status)).length;
  const winRate = totalQuotes > 0 ? acceptedQuotes / totalQuotes : 0;

  const amounts = items
    .map((q) => paymentMap.get(q.trade_category) ?? 0)
    .filter((a) => a > 0);
  const avgQuoteAmount = amounts.length > 0
    ? Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length)
    : 0;

  // Conversion by price range (in cents)
  const ranges = [
    { range: '$0-$500', min: 0, max: 50000 },
    { range: '$500-$2,000', min: 50000, max: 200000 },
    { range: '$2,000-$10,000', min: 200000, max: 1000000 },
    { range: '$10,000+', min: 1000000, max: Infinity },
  ];

  const conversionByPriceRange: ConversionByPriceRange[] = ranges.map(({ range, min, max }) => {
    const inRange = items.filter((q) => {
      const amt = paymentMap.get(q.trade_category) ?? 0;
      return amt >= min && amt < max;
    });
    const accepted = inRange.filter((q) => acceptedStatuses.has(q.status)).length;
    return {
      range,
      total: inRange.length,
      accepted,
      rate: inRange.length > 0 ? accepted / inRange.length : 0,
    };
  });

  return { totalQuotes, acceptedQuotes, winRate, avgQuoteAmount, conversionByPriceRange };
}

// ---------------------------------------------------------------------------
// Response metrics
// ---------------------------------------------------------------------------

/**
 * Response time analytics for a tradie.
 */
export async function getResponseMetrics(
  tradieId: string,
  months: number = 12,
): Promise<ResponseMetrics> {
  const since = monthsAgoISO(months);

  // Fetch jobs with both created_at (when posted) and updated_at (proxy for first response)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('created_at, updated_at, status')
    .eq('tradie_id', tradieId)
    .gte('created_at', since)
    .neq('status', 'open');

  if (error) throw new Error(error.message);

  const items = jobs ?? [];
  const responseTimes: number[] = [];
  const dayBuckets: Record<number, number[]> = {};

  for (const job of items) {
    const created = new Date(job.created_at);
    const updated = new Date(job.updated_at);
    const diffMinutes = Math.max(0, (updated.getTime() - created.getTime()) / (1000 * 60));

    if (diffMinutes < 60 * 24 * 7) {
      // Filter out unreasonable values (> 1 week)
      responseTimes.push(diffMinutes);
      const day = created.getDay();
      if (!dayBuckets[day]) dayBuckets[day] = [];
      dayBuckets[day].push(diffMinutes);
    }
  }

  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length)
    : 0;

  const medianResponseTime = Math.round(median(responseTimes));

  const responseByDayOfWeek: DayOfWeekMetric[] = DAY_NAMES.map((day, i) => {
    const times = dayBuckets[i] ?? [];
    return {
      day,
      avgResponseMinutes: times.length > 0
        ? Math.round(times.reduce((s, t) => s + t, 0) / times.length)
        : 0,
    };
  });

  return { avgResponseTime, medianResponseTime, responseByDayOfWeek };
}

// ---------------------------------------------------------------------------
// Client retention
// ---------------------------------------------------------------------------

/**
 * Client retention and repeat-customer analytics.
 */
export async function getClientRetention(tradieId: string): Promise<ClientRetention> {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      client_id,
      status,
      client:profiles!jobs_client_id_fkey(full_name)
    `)
    .eq('tradie_id', tradieId)
    .eq('status', 'completed');

  if (error) throw new Error(error.message);

  const items = jobs ?? [];

  // Count jobs per client
  const clientMap = new Map<string, { name: string; count: number }>();
  for (const job of items) {
    const clientId = job.client_id;
    const existing = clientMap.get(clientId);
    if (existing) {
      existing.count += 1;
    } else {
      clientMap.set(clientId, {
        name: (job.client as unknown as { full_name: string })?.full_name ?? 'Unknown',
        count: 1,
      });
    }
  }

  const totalClients = clientMap.size;
  const repeatClients = Array.from(clientMap.values()).filter((c) => c.count > 1).length;
  const repeatRate = totalClients > 0 ? repeatClients / totalClients : 0;
  const avgJobsPerClient = totalClients > 0 ? items.length / totalClients : 0;

  // Fetch payment totals for top clients
  const { data: payments } = await supabase
    .from('payments')
    .select('profile_id, job_id, amount')
    .eq('status', 'completed');

  const clientSpend = new Map<string, number>();
  for (const p of payments ?? []) {
    // Correlate via the jobs we already fetched
    const matchedJob = items.find((j) => j.client_id && p.job_id);
    if (matchedJob) {
      const current = clientSpend.get(matchedJob.client_id) ?? 0;
      clientSpend.set(matchedJob.client_id, current + (p.amount ?? 0));
    }
  }

  const topClients: TopClient[] = Array.from(clientMap.entries())
    .map(([clientId, { name, count }]) => ({
      clientId,
      clientName: name,
      jobCount: count,
      totalSpent: clientSpend.get(clientId) ?? 0,
    }))
    .sort((a, b) => b.jobCount - a.jobCount)
    .slice(0, 10);

  return { repeatRate, topClients, avgJobsPerClient };
}

// ---------------------------------------------------------------------------
// Seasonal trends
// ---------------------------------------------------------------------------

/**
 * Seasonal job volume trends.
 */
export async function getSeasonalTrends(tradieId: string): Promise<SeasonalTrend> {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('created_at')
    .eq('tradie_id', tradieId);

  if (error) throw new Error(error.message);

  const items = jobs ?? [];

  // Count by month (1-12)
  const counts = new Array(12).fill(0) as number[];
  for (const job of items) {
    const month = new Date(job.created_at).getMonth(); // 0-11
    counts[month] += 1;
  }

  const monthlyHeatMap: MonthlyHeatMap[] = counts.map((jobCount, i) => ({
    month: i + 1,
    monthName: MONTH_NAMES[i],
    jobCount,
  }));

  // Determine high and low seasons (top/bottom quartile)
  const avg = items.length > 0 ? items.length / 12 : 0;
  const highSeasons = monthlyHeatMap
    .filter((m) => m.jobCount > avg * 1.25)
    .map((m) => m.monthName);
  const lowSeasons = monthlyHeatMap
    .filter((m) => m.jobCount < avg * 0.75 && m.jobCount >= 0)
    .map((m) => m.monthName);

  return { monthlyHeatMap, highSeasons, lowSeasons };
}

// ---------------------------------------------------------------------------
// Insights generator
// ---------------------------------------------------------------------------

/**
 * Generate human-readable, context-aware business insights.
 */
export function generateInsights(analytics: AnalyticsSummary): string[] {
  const insights: string[] = [];

  // Win rate insight
  if (analytics.quotes.winRate < 0.2 && analytics.quotes.totalQuotes >= 5) {
    insights.push(
      'Your quote win rate is below 20%. Consider adjusting your pricing or adding more detail to your quotes.',
    );
  } else if (analytics.quotes.winRate > 0.6 && analytics.quotes.totalQuotes >= 5) {
    insights.push(
      'Your win rate is above 60% — consider raising your quote amounts to increase revenue.',
    );
  }

  // Completion rate
  if (analytics.jobs.completionRate < 0.7 && analytics.jobs.totalJobs >= 3) {
    insights.push(
      'Your job completion rate is below 70%. Following up on in-progress jobs could improve client satisfaction.',
    );
  }

  // Response time
  if (analytics.response.avgResponseTime > 120) {
    insights.push(
      `Your average response time is ${Math.round(analytics.response.avgResponseTime / 60)} hours. Faster responses typically lead to higher win rates.`,
    );
  } else if (analytics.response.avgResponseTime > 0 && analytics.response.avgResponseTime <= 30) {
    insights.push(
      'Great job! Your average response time is under 30 minutes — this gives you a competitive edge.',
    );
  }

  // Client retention
  if (analytics.retention.repeatRate > 0.3) {
    insights.push(
      `${Math.round(analytics.retention.repeatRate * 100)}% of your clients are repeat customers. Keep up the great work!`,
    );
  } else if (analytics.retention.repeatRate < 0.1 && analytics.retention.topClients.length >= 3) {
    insights.push(
      'Your repeat client rate is below 10%. Consider following up with past clients for recurring work.',
    );
  }

  // Seasonal advice
  if (analytics.seasonal.highSeasons.length > 0) {
    insights.push(
      `Your busiest months are ${analytics.seasonal.highSeasons.join(', ')}. Plan ahead to manage workload during peak periods.`,
    );
  }

  if (analytics.seasonal.lowSeasons.length > 0) {
    insights.push(
      `${analytics.seasonal.lowSeasons.join(', ')} tend to be quieter. Consider running promotions or expanding service areas during these months.`,
    );
  }

  // Revenue insight
  if (analytics.revenue.monthlyRevenue.length >= 2) {
    const recent = analytics.revenue.monthlyRevenue[analytics.revenue.monthlyRevenue.length - 1];
    const previous = analytics.revenue.monthlyRevenue[analytics.revenue.monthlyRevenue.length - 2];
    if (recent.revenue > previous.revenue * 1.2) {
      insights.push('Revenue is trending up — great momentum!');
    } else if (recent.revenue < previous.revenue * 0.8) {
      insights.push(
        'Revenue has dipped compared to last month. Review your lead pipeline and consider adjusting your marketing.',
      );
    }
  }

  if (insights.length === 0) {
    insights.push('Keep building your track record to unlock detailed business insights.');
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Summary aggregator
// ---------------------------------------------------------------------------

/**
 * Aggregate all analytics into a single summary object.
 */
export async function getAnalyticsSummary(
  tradieId: string,
  months: number = 12,
): Promise<AnalyticsSummary> {
  const [revenue, jobs, quotes, response, retention, seasonal] = await Promise.all([
    getRevenueAnalytics(tradieId, months),
    getJobAnalytics(tradieId, months),
    getQuotePerformance(tradieId, months),
    getResponseMetrics(tradieId, months),
    getClientRetention(tradieId),
    getSeasonalTrends(tradieId),
  ]);

  const summary: AnalyticsSummary = {
    revenue,
    jobs,
    quotes,
    response,
    retention,
    seasonal,
    insights: [],
  };

  summary.insights = generateInsights(summary);

  return summary;
}
