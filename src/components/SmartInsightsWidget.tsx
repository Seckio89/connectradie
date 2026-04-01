import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Lightbulb, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { extractSuburb } from '../lib/contactGating';

interface InsightData {
  avgResponseMinutes: number;
  missedLeadsCount: number;
  missedLeadsSuburb: string;
  completedJobs: number;
  winRate: number;
  profileViews: number;
  hasPortfolio: boolean;
}

function generateInsight(data: InsightData): { text: string; type: 'positive' | 'warning' } {
  if (data.avgResponseMinutes > 0 && data.avgResponseMinutes <= 30) {
    return {
      text: `You respond to leads in ~${Math.round(data.avgResponseMinutes)} mins! Tradies with this speed win 40% more jobs.`,
      type: 'positive',
    };
  }

  if (data.missedLeadsCount >= 2 && data.missedLeadsSuburb) {
    return {
      text: `You missed ${data.missedLeadsCount} leads in ${data.missedLeadsSuburb} this week. Update your schedule if you want to capture these.`,
      type: 'warning',
    };
  }

  if (data.winRate >= 50) {
    return {
      text: `Your quote win rate is ${data.winRate}% -- above average for your area. Keep up the strong pricing.`,
      type: 'positive',
    };
  }

  if (!data.hasPortfolio) {
    return {
      text: `Profiles with portfolio photos get 2x more lead enquiries. Add some project shots to stand out.`,
      type: 'warning',
    };
  }

  if (data.profileViews > 10) {
    return {
      text: `${data.profileViews} homeowners viewed your profile this week. Make sure your availability is up to date.`,
      type: 'positive',
    };
  }

  if (data.completedJobs > 0) {
    return {
      text: `You've completed ${data.completedJobs} jobs so far. Ask happy clients to leave reviews -- it boosts your ranking.`,
      type: 'positive',
    };
  }

  return {
    text: `Set your availability and respond quickly to new leads. Fast responses win 40% more jobs on average.`,
    type: 'warning',
  };
}

export default function SmartInsightsWidget() {
  const { user } = useAuth();
  const [insight, setInsight] = useState<{ text: string; type: 'positive' | 'warning' } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchInsightData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchInsightData = async () => {
    if (!user) return;

    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString();

      const [quotesRes, jobsRes, viewsRes, portfolioRes] = await Promise.all([
        supabase
          .from('quotes')
          .select('status, created_at, job_id')
          .eq('tradie_id', user.id),
        supabase
          .from('jobs')
          .select('id, status, location_address, created_at, tradie_id')
          .or(`tradie_id.eq.${user.id},tradie_id.is.null`)
          .gte('created_at', weekAgoStr),
        supabase
          .from('profile_views')
          .select('id')
          .eq('tradie_id', user.id)
          .gte('viewed_at', weekAgoStr),
        supabase
          .from('portfolio_images')
          .select('id')
          .eq('tradie_id', user.id)
          .limit(1),
      ]);

      const quotes = quotesRes.data || [];
      const recentJobs = jobsRes.data || [];
      const views = viewsRes.data || [];
      const portfolio = portfolioRes.data || [];

      const myQuotedJobIds = new Set(quotes.map((q) => q.job_id));
      const resolved = quotes.filter((q) => q.status === 'accepted' || q.status === 'declined');
      const won = resolved.filter((q) => q.status === 'accepted');
      const winRate = resolved.length > 0 ? Math.round((won.length / resolved.length) * 100) : 0;

      const missedJobs = recentJobs.filter(
        (j) => j.tradie_id === null && !myQuotedJobIds.has(j.id)
      );
      const suburbCounts: Record<string, number> = {};
      missedJobs.forEach((j) => {
        const suburb = extractSuburb(j.location_address);
        if (suburb) {
          suburbCounts[suburb] = (suburbCounts[suburb] || 0) + 1;
        }
      });
      const topSuburb = Object.entries(suburbCounts).sort(([, a], [, b]) => b - a)[0];

      const completedJobs = recentJobs.filter(
        (j) => j.tradie_id === user.id && j.status === 'completed'
      );

      let avgResponseMinutes = 0;
      if (quotes.length > 0) {
        const responseTimes = quotes.slice(0, 10).map((q) => {
          const created = new Date(q.created_at).getTime();
          return (Date.now() - created) / (1000 * 60);
        });
        avgResponseMinutes = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        if (avgResponseMinutes > 60 * 24) avgResponseMinutes = 0;
      }

      const data: InsightData = {
        avgResponseMinutes,
        missedLeadsCount: topSuburb ? topSuburb[1] : 0,
        missedLeadsSuburb: topSuburb ? topSuburb[0] : '',
        completedJobs: completedJobs.length,
        winRate,
        profileViews: views.length,
        hasPortfolio: portfolio.length > 0,
      };

      setInsight(generateInsight(data));
    } catch {
      setInsight({
        text: 'Set your availability and respond quickly to new leads. Fast responses win 40% more jobs on average.',
        type: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 rounded-2xl border border-amber-200 p-6 animate-pulse">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
          <span className="text-sm text-amber-700">Analyzing your performance...</span>
        </div>
      </div>
    );
  }

  if (!insight) return null;

  const isPositive = insight.type === 'positive';

  return (
    <div
      className={`rounded-2xl border p-5 transition-all hover:shadow-md ${
        isPositive
          ? 'bg-gradient-to-r from-secondary-50 via-secondary-50 to-secondary-50 border-secondary-200'
          : 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isPositive ? 'bg-emerald-100' : 'bg-amber-100'
          }`}
        >
          {isPositive ? (
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          ) : (
            <Lightbulb className="w-5 h-5 text-amber-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3
              className={`text-sm font-bold uppercase tracking-wide ${
                isPositive ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              Smart Insight
            </h3>
          </div>
          <p className="text-gray-800 text-[15px] leading-relaxed">{insight.text}</p>
          <Link
            to="/performance"
            className={`inline-flex items-center gap-1.5 mt-3 text-sm font-semibold transition-colors ${
              isPositive
                ? 'text-emerald-600 hover:text-emerald-700'
                : 'text-amber-600 hover:text-amber-700'
            }`}
          >
            View Full Performance Report
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
