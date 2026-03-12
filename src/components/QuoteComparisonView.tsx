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
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { redactContactInfo } from '../lib/redaction';
import type { Job, Quote, QuoteWithTradie } from '../types/database';

type SortMode = 'recommended' | 'price_low' | 'price_high' | 'rating';

interface QuoteComparisonViewProps {
  job: Job;
  onAcceptQuote: (quoteId: string, jobId: string, agreedPrice?: number) => Promise<void>;
  onDeclineQuote: (quoteId: string) => Promise<void>;
  onMessageTradie: (tradieId: string, jobId: string) => void;
  onConfirmPrice?: (quoteId: string, jobId: string, min: number, max: number) => void;
}

/** Format tradie display name based on subscription tier */
function formatTradieDisplayName(quote: QuoteWithTradie): string {
  const isPro = quote.tradie_details?.subscription_tier === 'pro';
  const fullName = quote.tradie_profile?.full_name || '';
  const businessName = quote.tradie_details?.business_name || '';

  // Pro users: show full business name or full name
  if (isPro) {
    return capitalizeWords(businessName || fullName || 'Tradie');
  }

  // Free users: show "FirstName L." format
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${capitalizeWord(parts[0])} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
    }
    return capitalizeWord(parts[0]);
  }

  return 'Tradie';
}

function capitalizeWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function capitalizeWords(str: string): string {
  if (!str) return '';
  return str.split(/\s+/).map(capitalizeWord).join(' ');
}

/**
 * Redact identifying info from quote messages for free-tier tradies.
 * Strips: business name, full name, first name, last name, and contact info.
 * Pro users get no redaction — their identity is part of the value prop.
 */
function redactQuoteMessage(quote: QuoteWithTradie): string {
  if (!quote.message) return '';
  const isPro = quote.tradie_details?.subscription_tier === 'pro';
  if (isPro) return quote.message;

  let text = quote.message;

  // Collect identifying strings to redact (case-insensitive)
  const identifiers: string[] = [];

  const businessName = quote.tradie_details?.business_name?.trim();
  if (businessName) identifiers.push(businessName);

  const fullName = quote.tradie_profile?.full_name?.trim();
  if (fullName) {
    identifiers.push(fullName);
    const parts = fullName.split(/\s+/);
    // Also redact individual first/last names (only if 3+ chars to avoid false positives)
    for (const part of parts) {
      if (part.length >= 3) identifiers.push(part);
    }
  }

  // Sort by length descending so longer matches are replaced first
  identifiers.sort((a, b) => b.length - a.length);

  for (const id of identifiers) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(escaped, 'gi'), '[redacted]');
  }

  // Also apply standard contact info redaction (phones, emails)
  text = redactContactInfo(text);

  return text;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i <= Math.round(rating)
              ? 'text-yellow-400 fill-yellow-400'
              : 'text-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

function QuoteTag({ label, color }: { label: string; color: 'teal' | 'amber' | 'blue' | 'green' }) {
  const colorClasses = {
    teal: 'bg-secondary-50 text-secondary-700 border-secondary-200',
    amber: 'bg-warm-50 text-warm-700 border-warm-200',
    blue: 'bg-secondary-50 text-secondary-700 border-secondary-200',
    green: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${colorClasses[color]}`}>
      {label}
    </span>
  );
}

export default function QuoteComparisonView({
  job,
  onAcceptQuote,
  onDeclineQuote,
  onMessageTradie,
  onConfirmPrice,
}: QuoteComparisonViewProps) {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteWithTradie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [collapsedId, setCollapsedId] = useState<string | null>(null);

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
      (quotesData as unknown as Quote[]).map(async (q) => {
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
    const quote = quotes.find((q) => q.id === quoteId);
    // Range quote → open price confirmation modal instead of paying immediately
    if (quote && !quote.firm_price && quote.price_min && quote.price_max && onConfirmPrice) {
      onConfirmPrice(quoteId, job.id, quote.price_min, quote.price_max);
      return;
    }
    setAcceptingId(quoteId);
    await onAcceptQuote(quoteId, job.id);
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
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
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
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-secondary-500"
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
            You've accepted a quote from {formatTradieDisplayName(acceptedQuote)}
          </span>
        </div>
      )}

      <div className="space-y-2.5">
        {sortedQuotes.map((quote, index) => {
          const isCollapsed = collapsedId === quote.id;
          const isAccepted = quote.status === 'accepted';
          const tags = getQuoteTags(quote, sortedQuotes, index);
          const quoteNumber = index + 1;

          return (
            <div
              key={quote.id}
              className={`rounded-xl overflow-hidden border transition-all ${
                isAccepted
                  ? 'border-green-200 bg-green-50/30'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {/* Quote header */}
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  {/* Quote number */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5 ${
                    isAccepted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {quoteNumber}
                  </div>

                  {/* Avatar — clickable */}
                  <button
                    onClick={() => navigate(`/tradie/${quote.tradie_id}`)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 ${
                      isAccepted ? 'bg-green-100' : 'bg-secondary-50'
                    }`}
                    title="View profile"
                  >
                    <span className={`text-base font-bold ${isAccepted ? 'text-green-600' : 'text-secondary-600'}`}>
                      {(quote.tradie_profile?.full_name?.charAt(0) || 'T').toUpperCase()}
                    </span>
                  </button>

                  {/* Tradie info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => navigate(`/tradie/${quote.tradie_id}`)}
                        className="text-[15px] font-semibold text-gray-900 truncate hover:text-primary-600 transition-colors"
                        title="View profile"
                      >
                        {formatTradieDisplayName(quote)}
                      </button>
                      {quote.tradie_details?.subscription_tier === 'pro' && (
                        <span className="px-1.5 py-0.5 bg-warm-100 text-warm-600 rounded text-[10px] font-bold uppercase tracking-wide flex-shrink-0">Pro</span>
                      )}
                      {quote.tradie_profile?.verification_status === 'verified' && (
                        <Shield className="w-4 h-4 text-secondary-500 flex-shrink-0" />
                      )}
                      {isAccepted && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Hired
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                      {quote.review_stats && quote.review_stats.avg_rating > 0 && (
                        <div className="flex items-center gap-1">
                          <RatingStars rating={quote.review_stats.avg_rating} />
                          <span className="text-xs text-gray-400">({quote.review_stats.total_reviews})</span>
                        </div>
                      )}
                      {quote.review_stats && quote.review_stats.total_jobs_completed > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {quote.review_stats.total_jobs_completed} jobs
                        </span>
                      )}
                      {tags.map((tag) => (
                        <QuoteTag key={tag.label} label={tag.label} color={tag.color} />
                      ))}
                    </div>
                  </div>

                  {/* Price */}
                  <div className="text-right flex-shrink-0 pl-2">
                    {quote.firm_price ? (
                      <span className="text-xl font-bold text-gray-900">
                        ${quote.firm_price.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-lg font-bold text-gray-900">
                        ${quote.price_min.toLocaleString()} – ${quote.price_max.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quote details — shown by default */}
                <div className="mt-3 ml-[4.75rem]">
                  {/* Meta row */}
                  <div className="flex items-center gap-4 text-[13px] text-gray-400">
                    {quote.estimated_duration && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        {quote.estimated_duration}
                      </span>
                    )}
                    {quote.includes_materials && (
                      <span className="inline-flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 flex-shrink-0" />
                        Materials incl.
                      </span>
                    )}
                    {quote.requires_site_inspection && (
                      <span className="inline-flex items-center gap-1.5 text-warm-500">
                        <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                        Site visit required
                      </span>
                    )}
                    {quote.message && (
                      <button
                        onClick={() => setCollapsedId(isCollapsed ? null : quote.id)}
                        className="inline-flex items-center gap-1 text-secondary-500 hover:text-secondary-700 font-medium ml-auto"
                      >
                        {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                        {isCollapsed ? 'Show message' : 'Hide message'}
                      </button>
                    )}
                  </div>

                  {/* Quote message — shown by default, can be collapsed */}
                  {quote.message && !isCollapsed && (
                    <div className="mt-2.5 p-3.5 bg-gray-50 rounded-lg border border-gray-100">
                      <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{redactQuoteMessage(quote)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action footer */}
              {!acceptedQuote && quote.status === 'pending' && (
                <div className="flex items-center gap-2.5 px-5 py-3 border-t border-gray-100 bg-gray-50/50 ml-[4.75rem]">
                  <button
                    onClick={() => handleAccept(quote.id)}
                    disabled={!!acceptingId || !!decliningId}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors disabled:opacity-50 text-sm shadow-sm"
                  >
                    {acceptingId === quote.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Accept & Deposit
                  </button>
                  <button
                    onClick={() => onMessageTradie(quote.tradie_id, job.id)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white hover:border-gray-300 transition-colors text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Ask a Question
                  </button>
                  <button
                    onClick={() => handleDecline(quote.id)}
                    disabled={!!acceptingId || !!decliningId}
                    className="inline-flex items-center justify-center px-3 py-2 border border-gray-200 text-gray-400 rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
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
