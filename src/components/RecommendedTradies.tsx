import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Heart, Star, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { redactName } from '../lib/contactGating';
import UserTradeBadges from './UserTradeBadges';
import type { TradieWithDetails } from '../types/database';

/*
  RecommendedTradies — replaces the old "New & Recommended" widget that just
  pulled `.limit(4)` off profiles with no filtering. This one actually ranks.

  Strategy:
   - If the client has active recurring services, recommend OTHER tradies in
     the same trade(s) — backups in case her current tradie cancels.
   - Otherwise, fall back to top-rated nearby tradies of any trade.
   - Rank in JS (no PostGIS) using postcode prefix proximity + rating + recency.
*/

type RankedTradie = TradieWithDetails & {
  __score: number;
  __distanceLabel: string;
  __averageRating: number;
  __totalReviews: number;
  __matchesActiveTrade: boolean;
};

const POSTCODE_SAME_AREA = 30;     // first 2 chars match — same broad area code
const POSTCODE_SAME_CLUSTER = 60;  // first 3 chars match — neighbouring suburbs
const POSTCODE_EXACT = 100;        // full match — same suburb
const RATING_WEIGHT = 25;          // up to 25 from a 5★ rating
const REVIEW_VOLUME_WEIGHT = 10;   // log-scaled, max 10
const PRO_BONUS = 5;
const TRADE_MATCH_BONUS = 40;      // big — same trade as her active service is the most useful signal

function distanceLabel(myPostcode: string | null | undefined, theirPostcode: string | null | undefined): string {
  if (!myPostcode || !theirPostcode) return '';
  if (myPostcode === theirPostcode) return 'Same suburb';
  if (myPostcode.slice(0, 3) === theirPostcode.slice(0, 3)) return 'Nearby';
  if (myPostcode.slice(0, 2) === theirPostcode.slice(0, 2)) return 'Same area';
  return '';
}

function postcodeScore(myPostcode: string | null | undefined, theirPostcode: string | null | undefined): number {
  if (!myPostcode || !theirPostcode) return 0;
  if (myPostcode === theirPostcode) return POSTCODE_EXACT;
  if (myPostcode.slice(0, 3) === theirPostcode.slice(0, 3)) return POSTCODE_SAME_CLUSTER;
  if (myPostcode.slice(0, 2) === theirPostcode.slice(0, 2)) return POSTCODE_SAME_AREA;
  return 0;
}

function prettyTrade(category: string | null | undefined): string {
  if (!category) return 'Tradie';
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function RecommendedTradies() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<RankedTradie[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTrades, setActiveTrades] = useState<string[]>([]);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const myPostcode = profile?.postcode;

    const run = async () => {
      try {
        // 1. Find Nicole's active trade categories + the tradies she already
        // uses (exclude them — recommending the cleaner she has is pointless).
        const { data: activeJobs } = await supabase
          .from('recurring_jobs')
          .select('trade_category, tradie_id')
          .eq('client_id', user.id)
          .eq('is_active', true)
          .is('cancelled_at', null);

        const targetTrades = [...new Set((activeJobs ?? []).map((j) => j.trade_category).filter(Boolean) as string[])];
        const currentTradieIds = new Set((activeJobs ?? []).map((j) => j.tradie_id).filter(Boolean) as string[]);
        setActiveTrades(targetTrades);

        // 2. Saved tradies — exclude (she already knows them).
        const { data: saved } = await supabase
          .from('my_trades')
          .select('tradie_id')
          .eq('client_id', user.id);
        const savedIds = new Set((saved ?? []).map((s) => s.tradie_id));
        setSavedSet(savedIds);

        const excludeIds = new Set([...currentTradieIds, ...savedIds, user.id]);

        // 3. Pull eligible tradies — onboarded + can receive payment. Pull a
        // wider set than 4 so the client-side ranker has something to work with.
        let query = supabase
          .from('profiles')
          .select('*, tradie_details!inner(*)')
          .eq('role', 'tradie')
          .eq('stripe_connect_onboarding_complete', true)
          .limit(40);

        if (targetTrades.length > 0) {
          query = query.in('tradie_details.trade_category', targetTrades);
        }

        const { data: candidates } = await query;
        if (!candidates) {
          setItems([]);
          return;
        }

        const candidateList = (candidates as unknown as TradieWithDetails[]).filter(
          (t) => t.tradie_details && !excludeIds.has(t.id),
        );

        // 4. Pull ratings for these candidates only.
        const ids = candidateList.map((t) => t.id);
        const ratingMap = new Map<string, { avg: number; count: number }>();
        if (ids.length > 0) {
          const { data: ratings } = await supabase
            .from('tradie_ratings')
            .select('tradie_id, average_rating, total_reviews')
            .in('tradie_id', ids);
          for (const r of ratings ?? []) {
            ratingMap.set(r.tradie_id, { avg: r.average_rating ?? 0, count: r.total_reviews ?? 0 });
          }
        }

        // 5. Rank.
        const ranked: RankedTradie[] = candidateList.map((t) => {
          const rating = ratingMap.get(t.id) ?? { avg: 0, count: 0 };
          const tier = (t.tradie_details?.subscription_tier as string | undefined)?.toLowerCase();
          const isPro = tier === 'pro' || tier === 'business';
          const matchesActiveTrade = !!t.tradie_details?.trade_category && targetTrades.includes(t.tradie_details.trade_category);

          let score = 0;
          score += postcodeScore(myPostcode, t.postcode);
          score += (rating.avg / 5) * RATING_WEIGHT;
          // log-scale review count so 50 reviews ≈ 10pt, 5 reviews ≈ 7pt, 0 = 0
          score += rating.count > 0 ? Math.min(REVIEW_VOLUME_WEIGHT, Math.log10(rating.count + 1) * 6) : 0;
          if (isPro) score += PRO_BONUS;
          if (matchesActiveTrade) score += TRADE_MATCH_BONUS;
          // Tiny tiebreaker for verified profiles so unverified don't beat verified at equal score.
          if (t.tradie_details?.is_verified) score += 1;

          return {
            ...t,
            __score: score,
            __distanceLabel: distanceLabel(myPostcode, t.postcode),
            __averageRating: rating.avg,
            __totalReviews: rating.count,
            __matchesActiveTrade: matchesActiveTrade,
          };
        });

        ranked.sort((a, b) => b.__score - a.__score);
        setItems(ranked.slice(0, 4));
      } catch (err) {
        console.error('RecommendedTradies fetch error:', err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [user, profile?.postcode]);

  const handleSave = async (tradieId: string) => {
    if (!user || savingId) return;
    setSavingId(tradieId);
    try {
      await supabase.from('my_trades').insert({ client_id: user.id, tradie_id: tradieId });
      setSavedSet((prev) => new Set(prev).add(tradieId));
      setItems((prev) => prev.filter((t) => t.id !== tradieId));
    } catch (err) {
      console.error('Save tradie error:', err);
    } finally {
      setSavingId(null);
    }
  };

  const headerLabel = profile?.postcode ? 'Tradies near you' : 'Tradies you might like';

  // Pre-filtered Search link — actually applies the trade if we know it.
  const viewAllHref = activeTrades.length === 1
    ? `/search?trade=${encodeURIComponent(activeTrades[0])}`
    : '/search';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6" data-tour="recommended-tradies">
      <h3 className="font-semibold text-gray-900 mb-4">
        {headerLabel}
        {profile?.postcode && (
          <span className="text-gray-400 font-normal"> · {profile.postcode}</span>
        )}
      </h3>
      {!profile?.postcode && (
        <p className="text-xs text-gray-500 -mt-3 mb-4">
          <Link to="/profile" className="text-primary-600 hover:underline">Add your postcode</Link> for nearby matches.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500 mb-2">No matches in your area yet</p>
          <Link to="/search" className="text-xs text-primary-600 hover:underline">
            Browse all tradies →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((tradie) => {
            const tier = (tradie.tradie_details?.subscription_tier as string | undefined)?.toLowerCase();
            const isPro = tier === 'pro' || tier === 'business';
            const displayName = isPro
              ? (tradie.tradie_details?.business_name || tradie.full_name)
              : redactName(tradie.full_name);

            return (
              <div
                key={tradie.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <Link to={`/tradie/${tradie.id}`} className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary-600">
                    {tradie.full_name?.charAt(0) || 'T'}
                  </span>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link to={`/tradie/${tradie.id}`} className="font-medium text-gray-900 text-sm truncate hover:text-primary-600 transition-colors">
                      {displayName}
                    </Link>
                    {isPro && <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-600">
                    <span className="capitalize truncate">{prettyTrade(tradie.tradie_details?.trade_category)}</span>
                    {tradie.__totalReviews > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {tradie.__averageRating.toFixed(1)}
                          <span className="text-gray-400">({tradie.__totalReviews})</span>
                        </span>
                      </>
                    )}
                    {tradie.__distanceLabel && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span>{tradie.__distanceLabel}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <UserTradeBadges
                      verifiedTrades={tradie.verified_trades || []}
                      declaredTrades={tradie.declared_trades || []}
                      size="sm"
                    />
                    {tradie.__matchesActiveTrade && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Same as your service
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleSave(tradie.id)}
                  disabled={savingId === tradie.id}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Save tradie"
                  aria-label="Save tradie"
                >
                  <Heart className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Link
        to={viewAllHref}
        className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 text-primary-600 font-medium hover:bg-primary-50 active:scale-95 rounded-xl transition-all duration-200 min-h-[44px]"
      >
        View all matches
        <ArrowRight className="w-4 h-4" />
      </Link>

      {/* Cross-sell escape hatch — for the "I need a plumber, not another
          cleaner" moment where the trade-filtered list above is the wrong tool. */}
      {activeTrades.length > 0 && (
        <Link
          to="/search"
          className="mt-1 block text-center text-xs text-gray-500 hover:text-primary-600 transition-colors py-1"
        >
          Looking for a different trade? Browse all tradies →
        </Link>
      )}
    </div>
  );
}
