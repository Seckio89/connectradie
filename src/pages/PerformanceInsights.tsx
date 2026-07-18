import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { extractSuburb } from '../lib/contactGating';
import DashboardLayout from '../components/DashboardLayout';
import SubscriptionModal from '../components/SubscriptionModal';
import { isPro, TIER_PRICING } from '../lib/subscription';
import ProBadge from '../components/ProBadge';

interface HealthStats {
  quoteWinRate: number;
  totalQuotes: number;
  wonQuotes: number;
  avgJobValue: number;
  profileViews: number;
  completedJobs: number;
  totalRevenue: number;
  /** Avg hours from job posted -> tradie's quote submitted. null = no data. */
  avgResponseTimeHours: number | null;
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

interface ReviewResult {
  rating: number;
  created_at: string;
}

interface JobResult {
  status: string;
  location_address: string | null;
  created_at: string;
  budget_amount: number | null;
}

interface FocusArea {
  icon: typeof Camera;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  link?: string;
  linkLabel?: string;
}

export default function PerformanceInsights() {
  const { user, profile, tradieDetails } = useAuth();
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [strengths, setStrengths] = useState<StrengthsData | null>(null);
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isProUser = isPro(tradieDetails?.subscription_tier, profile?.is_premium);

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
          .select('status, price_min, price_max, firm_price, created_at, jobs:job_id(created_at)')
          .eq('tradie_id', user.id),
        supabase
          .from('jobs')
          .select('status, location_address, created_at, budget_amount')
          .eq('tradie_id', user.id),
        supabase
          .from('profile_views')
          .select('id')
          .eq('tradie_id', user.id)
          .gte('viewed_at', weekAgoStr),
        supabase
          .from('reviews')
          .select('rating, created_at')
          .eq('tradie_id', user.id),
        supabase
          .from('portfolio_images')
          .select('id')
          .eq('tradie_id', user.id)
          .limit(1),
      ]);

      const quotes = quotesRes.data || [];
      const jobs = (jobsRes.data as unknown as JobResult[]) || [];
      const views = viewsRes.data || [];
      const reviews = (reviewsRes.data as unknown as ReviewResult[]) || [];
      const portfolio = portfolioRes.data || [];

      const resolved = quotes.filter((q) => q.status === 'accepted' || q.status === 'declined');
      const won = resolved.filter((q) => q.status === 'accepted');
      const winRate = resolved.length > 0 ? Math.round((won.length / resolved.length) * 100) : 0;

      const completedJobs = jobs.filter((j) => j.status === 'completed');
      const avgJobValue =
        completedJobs.length > 0
          ? Math.round(completedJobs.reduce((sum, j) => sum + (j.budget_amount || 0), 0) / completedJobs.length)
          : 0;

      const totalRevenue = won.reduce(
        (sum, q) => sum + (q.firm_price || (q.price_min + q.price_max) / 2),
        0
      );

      // Avg response time: hours from job's created_at -> tradie's quote
      // created_at, across every quote that has a job we can join to.
      const responsesWithJob = (quotes as Array<{ created_at: string; jobs?: { created_at?: string } | null }>)
        .filter(q => q.jobs?.created_at);
      const avgResponseTimeHours = responsesWithJob.length > 0
        ? responsesWithJob.reduce((sum, q) => {
            const ms = new Date(q.created_at).getTime() - new Date(q.jobs!.created_at!).getTime();
            return sum + ms / (1000 * 60 * 60);
          }, 0) / responsesWithJob.length
        : null;

      setHealth({
        quoteWinRate: winRate,
        totalQuotes: quotes.length,
        wonQuotes: won.length,
        avgJobValue,
        profileViews: views.length,
        completedJobs: completedJobs.length,
        totalRevenue: Math.round(totalRevenue),
        avgResponseTimeHours,
      });

      const suburbCounts: Record<string, number> = {};
      completedJobs.forEach((j) => {
        const suburb = extractSuburb(j.location_address);
        if (suburb) {
          suburbCounts[suburb] = (suburbCounts[suburb] || 0) + 1;
        }
      });
      const topSuburbEntry = Object.entries(suburbCounts).sort(([, a], [, b]) => b - a)[0];

      const avgRating =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      // Use overall rating as the primary metric since sub-ratings aren't available
      const topAttr = 'Overall Rating';
      const topAttrScore = avgRating;

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
            'You are winning fewer than 1 in 3 quotes. Try adjusting your pricing or adding more detail to stand out. Check your recent quotes in the Work Hub.',
          severity: 'high',
          link: '/work?tab=active',
          linkLabel: 'Review My Quotes',
        });
      }

      if (portfolio.length === 0) {
        areas.push({
          icon: Camera,
          title: 'No Portfolio Photos',
          description:
            'Profiles with recent project photos get 2x more leads. Upload some of your best work to your portfolio.',
          severity: 'high',
          link: '/my-profile',
          linkLabel: 'Upload Photos',
        });
      }

      if (views.length < 5) {
        areas.push({
          icon: Eye,
          title: 'Low Profile Visibility',
          description:
            'Your profile had fewer than 5 views this week. Make sure your availability calendar is up to date and your services are listed correctly.',
          severity: 'medium',
          link: '/schedule',
          linkLabel: 'Update Availability',
        });
      }

      if (reviews.length === 0 && completedJobs.length > 0) {
        areas.push({
          icon: Star,
          title: 'No Reviews Yet',
          description:
            'You have completed jobs but no reviews. Ask your clients to leave a review — tradies with reviews rank higher in search.',
          severity: 'medium',
          link: '/work?tab=active',
          linkLabel: 'View Completed Jobs',
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
        avgResponseTimeHours: null,
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
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 font-medium">Crunching your numbers...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Pro tier gate: free tradies see a teaser with the upgrade CTA. Pro
  // tradies see the full dashboard below.
  if (!isProUser) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
              <TrendingUp className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h1 className="text-3xl font-bold text-white">Performance Insights</h1>
              <ProBadge size="md" />
            </div>
            <p className="text-gray-400">Win rate, response time, conversion, and revenue trends — track every metric that matters.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-3">What you get with Pro Insights</h2>
            <ul className="space-y-2.5">
              {[
                'Quote win rate with trend indicators',
                'Average response time — how fast you quote vs the average',
                'Profile views from homeowners (weekly)',
                'Average job value across your completed work',
                'Total revenue ranked against the trade',
                'Personalised focus areas to win more work',
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-center">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-sm transition-colors text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              {`Upgrade to Pro — $${TIER_PRICING.pro.monthly}/mo`}
            </button>
            <p className="mt-3 text-xs text-gray-500">Pro also gives you priority placement in client search and lower platform fees.</p>
          </div>
        </div>
        <SubscriptionModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1600px] mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Performance Insights</h1>
              <p className="text-gray-400 text-sm">
                Understand how your business is performing and where to improve
              </p>
            </div>
          </div>
        </div>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-bold text-white">Health Check</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <HealthCard
              icon={Award}
              label="Avg Response Time"
              value={
                health && health.avgResponseTimeHours != null
                  ? health.avgResponseTimeHours < 1
                    ? `${Math.round(health.avgResponseTimeHours * 60)}m`
                    : health.avgResponseTimeHours < 24
                      ? `${health.avgResponseTimeHours.toFixed(1)}h`
                      : `${(health.avgResponseTimeHours / 24).toFixed(1)}d`
                  : '--'
              }
              detail="Time from job posted to your quote — faster wins more leads"
              color="sky"
              trend={
                health && health.avgResponseTimeHours != null
                  ? health.avgResponseTimeHours <= 4
                    ? 'up'
                    : health.avgResponseTimeHours <= 24
                      ? undefined
                      : 'down'
                  : undefined
              }
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
            <h2 className="text-lg font-bold text-white">Strengths & Focus Areas</h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-navy-800 rounded-2xl border border-navy-700 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <Award className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="font-bold text-white">What's Working</h3>
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
                    <div className="pt-3 border-t border-navy-700">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= Math.round(strengths.avgRating)
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-200'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold text-gray-300">
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

            <div className="bg-navy-800 rounded-2xl border border-navy-700 p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-warm-100 rounded-lg flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-warm-600" />
                </div>
                <h3 className="font-bold text-white">Where to Improve</h3>
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
      iconBg: 'bg-secondary-100',
      iconText: 'text-secondary-600',
    },
    green: {
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
    },
    amber: {
      iconBg: 'bg-warm-100',
      iconText: 'text-warm-600',
    },
  };

  const c = colorMap[color];

  return (
    <div
      className="bg-navy-800 rounded-2xl border border-primary-800 shadow-sm p-5 hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${c.iconBg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.iconText}`} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full ${
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
      <p className="text-sm font-medium text-navy-500 mb-1">{label}</p>
      <p className="text-3xl font-bold text-navy-900 mb-1">{value}</p>
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
      <div className="w-8 h-8 bg-navy-700 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="font-semibold text-white">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function FocusAreaRow({ area }: { area: FocusArea }) {
  const Icon = area.icon;
  const severityStyles = {
    high: 'bg-red-50 border-red-200',
    medium: 'bg-warm-50 border-warm-200',
    low: 'bg-green-50 border-green-200',
  };
  const iconStyles = {
    high: 'bg-red-100 text-red-600',
    medium: 'bg-warm-100 text-warm-600',
    low: 'bg-green-100 text-green-600',
  };
  const badgeStyles = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-warm-100 text-warm-700',
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
            <p className="font-semibold text-white text-sm">{area.title}</p>
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badgeStyles[area.severity]}`}
            >
              {badgeLabels[area.severity]}
            </span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed">{area.description}</p>
          {area.link && area.linkLabel && (
            <Link
              to={area.link}
              className="inline-block mt-2 text-xs font-semibold text-warm-600 hover:text-warm-700 transition-colors"
            >
              {area.linkLabel} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
