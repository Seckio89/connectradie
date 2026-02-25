import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  DollarSign,
  Eye,
  CheckCircle2,
  Star,
  MapPin,
  Camera,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Lightbulb,
  Award,
  BarChart3,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DashboardLayout from '../components/DashboardLayout';

interface HealthStats {
  quoteWinRate: number;
  totalQuotes: number;
  wonQuotes: number;
  avgJobValue: number;
  profileViews: number;
  completedJobs: number;
  totalRevenue: number;
}

interface StrengthsData {
  topTrade: string;
  topAttribute: string;
  topAttributeScore: number;
  topSuburb: string;
  topSuburbCount: number;
  avgRating: number;
  reviewCount: number;
}

interface FocusArea {
  icon: typeof Camera;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export default function PerformanceInsights() {
  const { user, profile } = useAuth();
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [strengths, setStrengths] = useState<StrengthsData | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchAllData = async () => {
    if (!user) return;

    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString();

      const [quotesRes, jobsRes, viewsRes, reviewsRes, portfolioRes] = await Promise.all([
        supabase
          .from('quotes')
          .select('status, price_min, price_max, firm_price, created_at')
          .eq('tradie_id', user.id),
        supabase
          .from('jobs')
          .select('status, suburb, created_at, budget')
          .eq('tradie_id', user.id),
        supabase
          .from('profile_views')
          .select('id')
          .eq('tradie_id', user.id)
          .gte('viewed_at', weekAgoStr),
        supabase
          .from('reviews')
          .select('rating, communication_rating, punctuality_rating, quality_rating, value_rating, created_at')
          .eq('tradie_id', user.id),
        supabase
          .from('portfolio_images')
          .select('id')
          .eq('tradie_id', user.id)
          .limit(1),
      ]);

      const quotes = quotesRes.data || [];
      const jobs = jobsRes.data || [];
      const views = viewsRes.data || [];
      const reviews = reviewsRes.data || [];
      const portfolio = portfolioRes.data || [];

      const resolved = quotes.filter((q) => q.status === 'accepted' || q.status === 'declined');
      const won = resolved.filter((q) => q.status === 'accepted');
      const winRate = resolved.length > 0 ? Math.round((won.length / resolved.length) * 100) : 0;

      const completedJobs = jobs.filter((j) => j.status === 'completed');
      const avgJobValue =
        completedJobs.length > 0
          ? Math.round(completedJobs.reduce((sum, j) => sum + (j.budget || 0), 0) / completedJobs.length)
          : 0;

      const totalRevenue = won.reduce(
        (sum, q) => sum + (q.firm_price || (q.price_min + q.price_max) / 2),
        0
      );

      setHealth({
        quoteWinRate: winRate,
        totalQuotes: quotes.length,
        wonQuotes: won.length,
        avgJobValue,
        profileViews: views.length,
        completedJobs: completedJobs.length,
        totalRevenue: Math.round(totalRevenue),
      });

      const suburbCounts: Record<string, number> = {};
      completedJobs.forEach((j) => {
        if (j.suburb) {
          suburbCounts[j.suburb] = (suburbCounts[j.suburb] || 0) + 1;
        }
      });
      const topSuburbEntry = Object.entries(suburbCounts).sort(([, a], [, b]) => b - a)[0];

      const avgRating =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      const attributes: Record<string, number[]> = {
        Communication: [],
        Punctuality: [],
        Quality: [],
        Value: [],
      };
      reviews.forEach((r) => {
        if (r.communication_rating) attributes['Communication'].push(r.communication_rating);
        if (r.punctuality_rating) attributes['Punctuality'].push(r.punctuality_rating);
        if (r.quality_rating) attributes['Quality'].push(r.quality_rating);
        if (r.value_rating) attributes['Value'].push(r.value_rating);
      });

      let topAttr = 'Quality';
      let topAttrScore = 0;
      Object.entries(attributes).forEach(([name, scores]) => {
        if (scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          if (avg > topAttrScore) {
            topAttr = name;
            topAttrScore = avg;
          }
        }
      });

      const declaredTrades = profile?.declared_trades || [];

      setStrengths({
        topTrade: declaredTrades[0] || 'General',
        topAttribute: topAttr,
        topAttributeScore: Math.round(topAttrScore * 10) / 10,
        topSuburb: topSuburbEntry ? topSuburbEntry[0] : '--',
        topSuburbCount: topSuburbEntry ? topSuburbEntry[1] : 0,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: reviews.length,
      });

      const areas: FocusArea[] = [];

      if (winRate < 30 && resolved.length >= 3) {
        areas.push({
          icon: Target,
          title: 'Low Quote Win Rate',
          description:
            'You are winning fewer than 1 in 3 quotes. Consider adjusting your pricing or adding more detail to your quotes to stand out.',
          severity: 'high',
        });
      }

      if (portfolio.length === 0) {
        areas.push({
          icon: Camera,
          title: 'No Portfolio Photos',
          description:
            'Profiles with recent project photos get 2x more leads. Upload some of your best work to your portfolio.',
          severity: 'high',
        });
      }

      if (views.length < 5) {
        areas.push({
          icon: Eye,
          title: 'Low Profile Visibility',
          description:
            'Your profile had fewer than 5 views this week. Make sure your availability calendar is up to date and your services are listed correctly.',
          severity: 'medium',
        });
      }

      if (reviews.length === 0 && completedJobs.length > 0) {
        areas.push({
          icon: Star,
          title: 'No Reviews Yet',
          description:
            'You have completed jobs but no reviews. Ask your clients to leave a review -- tradies with reviews rank higher in search.',
          severity: 'medium',
        });
      }

      if (avgRating > 0 && avgRating < 4.0) {
        areas.push({
          icon: ArrowDownRight,
          title: 'Rating Below Average',
          description: `Your average rating is ${avgRating.toFixed(1)} stars. Focus on communication and punctuality to improve client satisfaction.`,
          severity: 'high',
        });
      }

      if (areas.length === 0) {
        areas.push({
          icon: CheckCircle2,
          title: 'Looking Strong',
          description:
            'No major areas need attention right now. Keep responding quickly to leads and maintaining quality work.',
          severity: 'low',
        });
      }

      setFocusAreas(areas);
    } catch {
      setHealth({
        quoteWinRate: 0,
        totalQuotes: 0,
        wonQuotes: 0,
        avgJobValue: 0,
        profileViews: 0,
        completedJobs: 0,
        totalRevenue: 0,
      });
      setStrengths(null);
      setFocusAreas([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-sky-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Crunching your numbers...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance Insights</h1>
              <p className="text-gray-600 text-sm">
                Understand how your business is performing and where to improve
              </p>
            </div>
          </div>
        </div>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold text-gray-900">Health Check</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <HealthCard
              icon={Target}
              label="Quote Win Rate"
              value={health ? `${health.quoteWinRate}%` : '--'}
              detail={
                health
                  ? `You win ${health.wonQuotes} out of ${health.totalQuotes} quotes`
                  : ''
              }
              color="sky"
              trend={health && health.quoteWinRate >= 40 ? 'up' : health && health.quoteWinRate > 0 ? 'down' : undefined}
            />
            <HealthCard
              icon={DollarSign}
              label="Average Job Value"
              value={health ? `$${health.avgJobValue.toLocaleString()}` : '--'}
              detail={
                health
                  ? `Across ${health.completedJobs} completed jobs`
                  : ''
              }
              color="green"
            />
            <HealthCard
              icon={Eye}
              label="Profile Views"
              value={health ? `${health.profileViews}` : '--'}
              detail="Homeowners who viewed your profile this week"
              color="amber"
              trend={health && health.profileViews >= 10 ? 'up' : undefined}
            />
          </div>

          {health && health.totalRevenue > 0 && (
            <div className="mt-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-green-700 font-medium">Total Quoted Revenue</p>
                  <p className="text-3xl font-bold text-green-900">
                    ${health.totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold text-gray-900">Strengths & Focus Areas</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="font-bold text-gray-900">What's Working</h3>
              </div>

              {strengths ? (
                <div className="space-y-4">
                  <StrengthRow
                    icon={TrendingUp}
                    label="Top Service"
                    value={strengths.topTrade}
                    detail="Your most active trade category"
                  />
                  {strengths.reviewCount > 0 && (
                    <StrengthRow
                      icon={Star}
                      label="Highest-Rated Attribute"
                      value={`${strengths.topAttribute} (${strengths.topAttributeScore}/5)`}
                      detail={`Based on ${strengths.reviewCount} review${strengths.reviewCount !== 1 ? 's' : ''}`}
                    />
                  )}
                  {strengths.topSuburb !== '--' && (
                    <StrengthRow
                      icon={MapPin}
                      label="Top Suburb"
                      value={strengths.topSuburb}
                      detail={`${strengths.topSuburbCount} completed job${strengths.topSuburbCount !== 1 ? 's' : ''} in this area`}
                    />
                  )}
                  {strengths.avgRating > 0 && (
                    <div className="pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= Math.round(strengths.avgRating)
                                  ? 'text-amber-400 fill-amber-400'
                                  : 'text-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          {strengths.avgRating} avg rating
                        </span>
                      </div>
                    </div>
                  )}
                  {strengths.reviewCount === 0 && strengths.topSuburb === '--' && (
                    <p className="text-sm text-gray-500 italic">
                      Complete more jobs and gather reviews to unlock detailed strengths analysis.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  Complete some jobs and receive reviews to see your strengths here.
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="font-bold text-gray-900">Where to Improve</h3>
              </div>

              {focusAreas.length > 0 ? (
                <div className="space-y-4">
                  {focusAreas.map((area, idx) => (
                    <FocusAreaRow key={idx} area={area} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No immediate areas to focus on. Keep doing what you're doing!
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  detail,
  color,
  trend,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail: string;
  color: 'sky' | 'green' | 'amber';
  trend?: 'up' | 'down';
}) {
  const colorMap = {
    sky: {
      bg: 'bg-gradient-to-br from-sky-50 to-cyan-50',
      border: 'border-sky-200',
      iconBg: 'bg-sky-100',
      iconText: 'text-sky-600',
      label: 'text-sky-700',
      value: 'text-sky-900',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50',
      border: 'border-green-200',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
      label: 'text-green-700',
      value: 'text-green-900',
    },
    amber: {
      bg: 'bg-gradient-to-br from-amber-50 to-yellow-50',
      border: 'border-amber-200',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
      label: 'text-amber-700',
      value: 'text-amber-900',
    },
  };

  const c = colorMap[color];

  return (
    <div
      className={`${c.bg} rounded-2xl border ${c.border} p-5 hover:shadow-lg transition-all duration-200`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${c.iconBg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.iconText}`} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
              trend === 'up'
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {trend === 'up' ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {trend === 'up' ? 'Strong' : 'Needs work'}
          </div>
        )}
      </div>
      <p className={`text-sm font-medium ${c.label} mb-1`}>{label}</p>
      <p className={`text-3xl font-bold ${c.value} mb-1`}>{value}</p>
      {detail && <p className="text-xs text-gray-500 leading-relaxed">{detail}</p>}
    </div>
  );
}

function StrengthRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="font-semibold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function FocusAreaRow({ area }: { area: FocusArea }) {
  const Icon = area.icon;
  const severityStyles = {
    high: 'bg-red-50 border-red-200',
    medium: 'bg-amber-50 border-amber-200',
    low: 'bg-green-50 border-green-200',
  };
  const iconStyles = {
    high: 'bg-red-100 text-red-600',
    medium: 'bg-amber-100 text-amber-600',
    low: 'bg-green-100 text-green-600',
  };
  const badgeStyles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-green-100 text-green-700',
  };
  const badgeLabels = {
    high: 'High Priority',
    medium: 'Medium',
    low: 'All Good',
  };

  return (
    <div className={`rounded-xl border p-4 ${severityStyles[area.severity]}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconStyles[area.severity]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-gray-900 text-sm">{area.title}</p>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeStyles[area.severity]}`}
            >
              {badgeLabels[area.severity]}
            </span>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">{area.description}</p>
        </div>
      </div>
    </div>
  );
}
