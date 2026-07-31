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
      <DashboardLayout wide>
        <div>
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-ct-mute-2 animate-spin mx-auto mb-4" />
              <p className="text-ct-mute font-medium">Crunching your numbers...</p>
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
      <DashboardLayout wide>
        <div className="py-12">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-ct-teal/[0.14] rounded-ct-lg mb-4">
              <TrendingUp className="w-8 h-8 text-ct-teal" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <h1 className="text-3xl font-bold text-ct-paper">Performance Insights</h1>
              <ProBadge size="md" />
            </div>
            <p className="text-ct-mute">Win rate, response time, conversion, and revenue trends — track every metric that matters.</p>
          </div>

          <div className="bg-ct-surface rounded-ct-md shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-ct-paper mb-3">What you get with Pro Insights</h2>
            <ul className="space-y-2.5">
              {[
                'Quote win rate with trend indicators',
                'Average response time — how fast you quote vs the average',
                'Profile views from homeowners (weekly)',
                'Average job value across your completed work',
                'Total revenue ranked against the trade',
                'Personalised focus areas to win more work',
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-ct-mute-2">
                  <CheckCircle2 className="w-4 h-4 text-ct-teal flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-center">
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-ct-teal hover:brightness-110 text-ct-ink font-semibold rounded-ct-md shadow-sm transition-colors text-sm"
            >
              <TrendingUp className="w-4 h-4" />
              {`Upgrade to Pro — $${TIER_PRICING.pro.monthly}/mo`}
            </button>
            <p className="mt-3 text-xs text-ct-mute-2">Pro also gives you priority placement in client search and lower platform fees.</p>
          </div>
        </div>
        <SubscriptionModal isOpen={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout wide>
      <div>
        <div className="mb-8">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-10 h-10 bg-ct-teal/[0.14] rounded-ct-md flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-ct-teal" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-ct-paper">Performance Insights</h1>
              <p className="text-ct-mute-2 text-sm">
                Understand how your business is performing and where to improve
              </p>
            </div>
          </div>
        </div>

        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-ct-mute-2" />
            <h2 className="text-lg font-bold text-ct-paper">Health Check</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

          {/* Was bg-gradient-to-r from-ct-teal to-ct-teal — green and emerald
              are the same ramp, so the gradient rendered flat anyway. */}
          {health && health.totalRevenue > 0 && (
            <div className="mt-4 bg-ct-teal/[0.14] rounded-ct-md border border-ct-teal/30 p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-ct-teal/[0.14] rounded-ct-md flex items-center justify-center flex-shrink-0">
                  <DollarSign className="w-6 h-6 text-ct-teal" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-ct-teal font-medium">Total Quoted Revenue</p>
                  <p className="text-3xl font-bold text-ct-teal truncate">
                    ${health.totalRevenue.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-ct-mute-2" />
            <h2 className="text-lg font-bold text-ct-paper">Strengths & Focus Areas</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-ct-surface rounded-ct-md border border-ct-line p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-ct-teal/[0.14] rounded-ct-sm flex items-center justify-center">
                  <Award className="w-4 h-4 text-ct-teal" />
                </div>
                <h3 className="font-bold text-ct-paper">What's Working</h3>
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
                    <div className="pt-3 border-t border-ct-line">
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-4 h-4 ${
                                s <= Math.round(strengths.avgRating)
                                  ? 'text-ct-amber fill-yellow-400'
                                  : 'text-ct-paper'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm font-semibold text-ct-mute">
                          {strengths.avgRating} avg rating
                        </span>
                      </div>
                    </div>
                  )}
                  {strengths.reviewCount === 0 && strengths.topSuburb === '--' && (
                    <p className="text-sm text-ct-mute-2 italic">
                      Complete more jobs and gather reviews to unlock detailed strengths analysis.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ct-mute-2">
                  Complete some jobs and receive reviews to see your strengths here.
                </p>
              )}
            </div>

            <div className="bg-ct-surface rounded-ct-md border border-ct-line p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-ct-amber/[0.13] rounded-ct-sm flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-ct-amber" />
                </div>
                <h3 className="font-bold text-ct-paper">Where to Improve</h3>
              </div>

              {focusAreas.length > 0 ? (
                <div className="space-y-4">
                  {focusAreas.map((area, idx) => (
                    <FocusAreaRow key={idx} area={area} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-ct-mute-2">
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
  // amber was bg-ct-amber/[0.13]/text-ct-amber, but tailwind.config aliases warm, green,
  // emerald and teal onto the SAME #06D6A0 ramp — so "Profile Views" and "Average
  // Job Value" rendered identical mint chips. Real amber keeps them distinct.
  const colorMap = {
    sky: {
      iconBg: 'bg-ct-surface-2',
      iconText: 'text-ct-mute-2',
    },
    green: {
      iconBg: 'bg-ct-teal/[0.14]',
      iconText: 'text-ct-teal',
    },
    amber: {
      iconBg: 'bg-ct-amber/[0.13]',
      iconText: 'text-ct-amber',
    },
  };

  const c = colorMap[color];

  return (
    <div
      className="bg-ct-surface rounded-ct-md border border-ct-line shadow-sm p-6 h-full"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`w-10 h-10 ${c.iconBg} rounded-ct-md flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${c.iconText}`} />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 whitespace-nowrap flex-shrink-0 text-xs font-medium px-3 py-1 rounded-full ${
              trend === 'up'
                ? 'bg-ct-teal/[0.14] text-ct-teal'
                : 'bg-ct-rose/[0.13] text-ct-rose'
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
      <p className="text-sm font-medium text-ct-mute-2 mb-1">{label}</p>
      <p className="text-3xl font-bold text-ct-paper mb-1">{value}</p>
      {detail && <p className="text-xs text-ct-mute-2 leading-relaxed">{detail}</p>}
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
      <div className="w-8 h-8 bg-ct-surface-2 rounded-ct-sm flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-ct-mute-2" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ct-mute-2 font-medium uppercase tracking-wide">{label}</p>
        <p className="font-semibold text-ct-paper">{value}</p>
        <p className="text-xs text-ct-mute-2 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

function FocusAreaRow({ area }: { area: FocusArea }) {
  const Icon = area.icon;
  // medium used warm-*, which is the same #06D6A0 ramp as green-* — so "medium"
  // and "low" severity were indistinguishable. Amber gives a real red→amber→
  // emerald ramp, and matches the pending/attention tier in the design system.
  const severityStyles = {
    high: 'bg-ct-rose/[0.13] border-ct-rose/[0.34]',
    medium: 'bg-ct-amber/[0.13] border-ct-amber/[0.34]',
    low: 'bg-ct-teal/[0.14] border-ct-teal/30',
  };
  const iconStyles = {
    high: 'bg-ct-rose/[0.13] text-ct-rose',
    medium: 'bg-ct-amber/[0.13] text-ct-amber',
    low: 'bg-ct-teal/[0.14] text-ct-teal',
  };
  const badgeStyles = {
    high: 'bg-ct-rose/[0.13] text-ct-rose',
    medium: 'bg-ct-amber/[0.13] text-ct-amber',
    low: 'bg-ct-teal/[0.14] text-ct-teal',
  };
  const badgeLabels = {
    high: 'High Priority',
    medium: 'Medium',
    low: 'All Good',
  };

  return (
    <div className={`rounded-ct-md border p-4 ${severityStyles[area.severity]}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-8 h-8 rounded-ct-sm flex items-center justify-center flex-shrink-0 ${iconStyles[area.severity]}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          {/* items-start, and the badge must not shrink: without whitespace-nowrap
              it broke "High Priority" across two lines beside a wrapping title. */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-ct-paper text-sm min-w-0">{area.title}</p>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${badgeStyles[area.severity]}`}
            >
              {badgeLabels[area.severity]}
            </span>
          </div>
          <p className="text-sm text-ct-mute-2 leading-relaxed">{area.description}</p>
          {area.link && area.linkLabel && (
            <Link
              to={area.link}
              className="inline-flex items-center min-h-[44px] mt-1 text-xs font-semibold text-ct-teal hover:text-ct-teal transition-colors"
            >
              {area.linkLabel} →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
