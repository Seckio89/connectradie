import { useState, useEffect, useMemo } from 'react';
import {
  Star,
  Clock,
  Package,
  Eye,
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  Briefcase,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Job, QuoteWithTradie } from '../types/database';

type SortMode = 'recommended' | 'price_low' | 'price_high' | 'rating';

interface QuoteComparisonViewProps {
  job: Job;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  onDeclineQuote: (quoteId: string) => Promise<void>;
  onMessageTradie: (tradieId: string) => void;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i <= Math.round(rating)
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

function QuoteTag({ label, color }: { label: string; color: 'teal' | 'amber' | 'blue' | 'green' }) {
  const colorClasses = {
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorClasses[color]}`}>
      {label}
    </span>
  );
}

export default function QuoteComparisonView({
  job,
  onAcceptQuote,
  onDeclineQuote,
  onMessageTradie,
}: QuoteComparisonViewProps) {
  const [quotes, setQuotes] = useState<QuoteWithTradie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchQuotes();
  }, [job.id]);

  const fetchQuotes = async () => {
    setLoading(true);

    const { data: quotesData, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('job_id', job.id)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: true });

    if (error || !quotesData) {
      setLoading(false);
      return;
    }

    const enriched: QuoteWithTradie[] = await Promise.all(
      quotesData.map(async (q) => {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, verification_status, verified_trades, declared_trades')
          .eq('id', q.tradie_id)
          .maybeSingle();

        const { data: detailsData } = await supabase
          .from('tradie_details')
          .select('business_name, trade_category, is_verified, is_insured, subscription_tier')
          .eq('profile_id', q.tradie_id)
          .maybeSingle();

        const { data: reviewData } = await supabase
          .from('reviews')
          .select('rating')
          .eq('tradie_id', q.tradie_id);

        const { count: completedJobs } = await supabase
          .from('jobs')
          .select('*', { count: 'exact', head: true })
          .eq('tradie_id', q.tradie_id)
          .eq('status', 'completed');

        const ratings = reviewData || [];
        const avgRating = ratings.length > 0
          ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
          : 0;

        return {
          ...q,
          tradie_profile: profileData || null,
          tradie_details: detailsData || null,
          review_stats: {
            avg_rating: avgRating,
            total_reviews: ratings.length,
            total_jobs_completed: completedJobs || 0,
          },
        };
      })
    );

    setQuotes(enriched);
    setLoading(false);
  };

  const sortedQuotes = useMemo(() => {
    const sorted = [...quotes];

    switch (sortMode) {
      case 'price_low':
        sorted.sort((a, b) => (a.firm_price || a.price_min) - (b.firm_price || b.price_min));
        break;
      case 'price_high':
        sorted.sort((a, b) => (b.firm_price || b.price_max) - (a.firm_price || a.price_max));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.review_stats?.avg_rating || 0) - (a.review_stats?.avg_rating || 0));
        break;
      case 'recommended':
      default: {
        sorted.sort((a, b) => {
          const scoreA = computeRecommendationScore(a);
          const scoreB = computeRecommendationScore(b);
          return scoreB - scoreA;
        });
        break;
      }
    }

    return sorted;
  }, [quotes, sortMode]);

  const handleAccept = async (quoteId: string) => {
    setAcceptingId(quoteId);
    await onAcceptQuote(quoteId);
    await fetchQuotes();
    setAcceptingId(null);
  };

  const handleDecline = async (quoteId: string) => {
    setDecliningId(quoteId);
    await onDeclineQuote(quoteId);
    await fetchQuotes();
    setDecliningId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-300">
        <Clock className="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <h3 className="font-semibold text-gray-900 mb-1">Waiting for Quotes</h3>
        <p className="text-sm text-gray-600 max-w-xs mx-auto">
          Tradies are reviewing your job. You'll receive up to {job.max_quotes} quotes.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <div className="flex -space-x-1">
            {Array.from({ length: Math.min(job.max_quotes, 5) }).map((_, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white"
              />
            ))}
          </div>
          <span className="text-xs text-gray-500">{job.max_quotes} slots open</span>
        </div>
      </div>
    );
  }

  const acceptedQuote = quotes.find((q) => q.status === 'accepted');

  return (
    <div>
      {!acceptedQuote && quotes.length > 1 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{quotes.length}</span> quote{quotes.length !== 1 ? 's' : ''} received
            {job.quoting_status === 'open' && (
              <span className="text-gray-400"> -- {job.max_quotes - job.quote_count} more possible</span>
            )}
          </p>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="recommended">Recommended</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="rating">Highest Rated</option>
          </select>
        </div>
      )}

      {acceptedQuote && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="text-sm font-semibold text-green-800">
            You've accepted a quote from {acceptedQuote.tradie_details?.business_name || acceptedQuote.tradie_profile?.full_name}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {sortedQuotes.map((quote, index) => {
          const isExpanded = expandedId === quote.id;
          const isAccepted = quote.status === 'accepted';
          const tags = getQuoteTags(quote, sortedQuotes, index);

          return (
            <div
              key={quote.id}
              className={`rounded-xl border-2 transition-all ${
                isAccepted
                  ? 'border-green-300 bg-green-50/30 shadow-md'
                  : 'border-gray-200 hover:border-teal-200 hover:shadow-md'
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-lg font-bold text-teal-600">
                        {quote.tradie_profile?.full_name?.charAt(0) || 'T'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900">
                          {quote.tradie_details?.business_name || quote.tradie_profile?.full_name || 'Tradie'}
                        </h3>
                        {quote.tradie_profile?.verification_status === 'verified' && (
                          <Shield className="w-4 h-4 text-teal-500" />
                        )}
                        {isAccepted && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">
                            Accepted
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        {quote.review_stats && quote.review_stats.avg_rating > 0 && (
                          <div className="flex items-center gap-1">
                            <RatingStars rating={quote.review_stats.avg_rating} />
                            <span className="text-xs text-gray-500">
                              ({quote.review_stats.total_reviews})
                            </span>
                          </div>
                        )}
                        {quote.review_stats && quote.review_stats.total_jobs_completed > 0 && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            {quote.review_stats.total_jobs_completed} jobs done
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {quote.firm_price ? (
                      <p className="text-2xl font-bold text-gray-900">
                        ${quote.firm_price.toLocaleString()}
                      </p>
                    ) : (
                      <div>
                        <p className="text-lg font-bold text-gray-900">
                          ${quote.price_min.toLocaleString()} - ${quote.price_max.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Range</p>
                      </div>
                    )}
                  </div>
                </div>

                {tags.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    {tags.map((tag) => (
                      <QuoteTag key={tag.label} label={tag.label} color={tag.color} />
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
                  {quote.estimated_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {quote.estimated_duration}
                    </span>
                  )}
                  {quote.includes_materials && (
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      Materials included
                    </span>
                  )}
                  {quote.requires_site_inspection && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Eye className="w-3 h-3" />
                      Needs site visit
                    </span>
                  )}
                </div>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : quote.id)}
                  className="mt-3 flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isExpanded ? 'Less detail' : 'View approach'}
                </button>

                {isExpanded && (
                  <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{quote.message}</p>
                  </div>
                )}

                {!acceptedQuote && quote.status === 'pending' && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleAccept(quote.id)}
                      disabled={!!acceptingId || !!decliningId}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 text-sm"
                    >
                      {acceptingId === quote.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Accept Quote
                    </button>
                    <button
                      onClick={() => onMessageTradie(quote.tradie_id)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </button>
                    <button
                      onClick={() => handleDecline(quote.id)}
                      disabled={!!acceptingId || !!decliningId}
                      className="inline-flex items-center justify-center px-3 py-2.5 border border-gray-200 text-gray-400 rounded-xl hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {decliningId === quote.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeRecommendationScore(quote: QuoteWithTradie): number {
  let score = 0;

  const rating = quote.review_stats?.avg_rating || 0;
  score += rating * 8;

  const reviews = quote.review_stats?.total_reviews || 0;
  score += Math.min(reviews, 20) * 1.5;

  const completed = quote.review_stats?.total_jobs_completed || 0;
  score += Math.min(completed, 50) * 0.6;

  if (quote.tradie_profile?.verification_status === 'verified') score += 10;
  if (quote.tradie_details?.is_insured) score += 5;
  if (quote.firm_price) score += 3;
  if (quote.includes_materials) score += 2;

  const hoursSinceQuote = (Date.now() - new Date(quote.created_at).getTime()) / 3600000;
  if (hoursSinceQuote < 1) score += 5;
  else if (hoursSinceQuote < 4) score += 3;

  return score;
}

function getQuoteTags(
  quote: QuoteWithTradie,
  allQuotes: QuoteWithTradie[],
  index: number
): { label: string; color: 'teal' | 'amber' | 'blue' | 'green' }[] {
  const tags: { label: string; color: 'teal' | 'amber' | 'blue' | 'green' }[] = [];

  if (index === 0 && allQuotes.length > 1) {
    tags.push({ label: 'Best Match', color: 'teal' });
  }

  const avgPrice = allQuotes.reduce((sum, q) => sum + (q.firm_price || (q.price_min + q.price_max) / 2), 0) / allQuotes.length;
  const thisPrice = quote.firm_price || (quote.price_min + quote.price_max) / 2;
  if (allQuotes.length > 1 && thisPrice <= avgPrice * 0.85) {
    tags.push({ label: 'Great Value', color: 'green' });
  }

  if ((quote.review_stats?.avg_rating || 0) >= 4.5 && (quote.review_stats?.total_reviews || 0) >= 3) {
    tags.push({ label: 'Top Rated', color: 'amber' });
  }

  const hoursSinceQuote = (Date.now() - new Date(quote.created_at).getTime()) / 3600000;
  if (hoursSinceQuote < 2) {
    tags.push({ label: 'Quick Responder', color: 'blue' });
  }

  return tags;
}
