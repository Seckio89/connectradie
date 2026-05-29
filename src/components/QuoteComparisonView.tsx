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
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { redactContactInfo } from '../lib/redaction';
import type { Job, Quote, QuoteWithTradie } from '../types/database';
import QuoteStatusBadge from './QuoteStatusBadge';
import TrustSignals from './TrustSignals';
import ProBadge from './ProBadge';
import Modal from './Modal';
import {
  getClientActions,
  finalPriceExceedsAdvisory,
  isFinalQuoteExpired,
  isTerminalQuoteStatus,
} from '../lib/quoteFlow';
import { callEdgeFunction } from '../lib/edgeFn';

type SortMode = 'recommended' | 'price_low' | 'price_high' | 'rating';

interface QuoteComparisonViewProps {
  job: Job;
  onAcceptQuote: (quoteId: string, jobId: string, agreedPrice?: number) => Promise<void>;
  onDeclineQuote: (quoteId: string) => Promise<void>;
  onMessageTradie: (tradieId: string, jobId: string) => void;
  onConfirmPrice?: (quoteId: string, jobId: string, min: number, max: number, tradieId: string) => void;
  /** 3-stage flow (flow_version=2): book a site visit. Defaults to a direct
   *  edge-function call if the parent doesn't pass a handler. */
  onBookSiteVisit?: (quoteId: string, jobId: string) => Promise<void | { checkoutUrl?: string }>;
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
  onBookSiteVisit,
}: QuoteComparisonViewProps) {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteWithTradie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [bookingVisitId, setBookingVisitId] = useState<string | null>(null);
  const [confirmingBookVisitId, setConfirmingBookVisitId] = useState<string | null>(null);
  const [collapsedId, setCollapsedId] = useState<string | null>(null);

  // Site-visit scheduling (chosen before paying the call-out fee).
  const [visitSlots, setVisitSlots] = useState<{ id: string; start_time: string; end_time: string }[]>([]);
  const [visitSlotsLoading, setVisitSlotsLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeTime, setProposeTime] = useState('');
  const [proposeDuration, setProposeDuration] = useState(60);

  const isV2 = job.flow_version === 2;

  // When the booking modal opens, load the tradie's published availability so the
  // client can pick a real slot (auto-confirmed). If none, they propose a time.
  useEffect(() => {
    if (!confirmingBookVisitId) return;
    const q = quotes.find((x) => x.id === confirmingBookVisitId);
    const tradieId = q?.tradie_id;
    setSelectedSlotId(null);
    setProposeDate('');
    setProposeTime('');
    setProposeDuration(60);
    setVisitSlots([]);
    if (!tradieId) return;
    setVisitSlotsLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('availability_slots')
          .select('id, start_time, end_time')
          .eq('tradie_id', tradieId)
          .eq('status', 'available')
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(12);
        setVisitSlots(data || []);
      } finally {
        setVisitSlotsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingBookVisitId]);

  useEffect(() => {
    fetchQuotes();
  }, [job.id]);

  const fetchQuotes = async () => {
    setLoading(true);

    // Pull every non-terminal status plus 'accepted' so v2 in-flight quotes
    // (site_visit_scheduled, site_visit_completed, final_submitted) render
    // alongside legacy 'pending'/'accepted'. Terminal statuses (declined,
    // withdrawn, expired) are filtered out from this view.
    const { data: quotesData, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('job_id', job.id)
      .in('status', [
        'pending',
        'site_visit_scheduled',
        'site_visit_completed',
        'final_submitted',
        'accepted',
      ])
      .order('created_at', { ascending: true });

    if (error || !quotesData) {
      setLoading(false);
      return;
    }

    const enriched: QuoteWithTradie[] = await Promise.all(
      (quotesData as unknown as Quote[]).map(async (q) => {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, avatar_url, verification_status, verified_trades, declared_trades, is_gst_registered, created_at')
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
    // Site-visit-required range quote → deposit the client's own budget (not the tradie's max).
    // If the tradie's visit-confirmed final price exceeds the deposit, the client approves a top-up;
    // if lower, the difference is refunded. The tradie's price_min still floors the deposit when
    // the client's budget is below it (otherwise the tradie wouldn't accept the job).
    if (quote?.requires_site_inspection && quote.price_min) {
      const budget = typeof job.budget_amount === 'number' ? job.budget_amount : null;
      const deposit = Math.max(quote.price_min, budget ?? quote.price_min);
      setAcceptingId(quoteId);
      await onAcceptQuote(quoteId, job.id, deposit);
      await fetchQuotes();
      setAcceptingId(null);
      return;
    }
    // Plain range quote (no site visit) → client and tradie have agreed a number → confirm modal
    if (quote && !quote.firm_price && quote.price_min && quote.price_max && onConfirmPrice) {
      onConfirmPrice(quoteId, job.id, quote.price_min, quote.price_max, quote.tradie_id);
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

  /**
   * 3-stage flow (flow_version=2): book a site visit on a 'pending' quote that
   * requires one. The tradie's call-out fee is collected here — book-site-visit
   * returns a Stripe Checkout URL we redirect to. Once paid, the webhook flips the
   * quote to site_visit_scheduled. (A $0 fee flips immediately, no redirect.)
   * The job's escrow deposit still only lands at accept-and-pay on the final quote.
   */
  const handleBookSiteVisit = async (
    quoteId: string,
    payload?: { visitStart?: string; visitEnd?: string; timeConfirmed?: boolean },
  ) => {
    setBookingVisitId(quoteId);
    try {
      const res = onBookSiteVisit
        ? await onBookSiteVisit(quoteId, job.id)
        : await callEdgeFunction<{ checkoutUrl?: string }>('book-site-visit', { quoteId, ...payload });
      const checkoutUrl = (res as { checkoutUrl?: string } | void)?.checkoutUrl;
      if (checkoutUrl) {
        // Redirect to Stripe to pay the call-out fee; the webhook finishes the booking.
        window.location.href = checkoutUrl;
        return;
      }
      await fetchQuotes();
    } catch (err) {
      console.error('Failed to book site visit', err);
    } finally {
      setBookingVisitId(null);
    }
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
                      {(quote.tradie_details?.subscription_tier === 'pro'
                        || quote.tradie_details?.subscription_tier === 'pro_plus'
                        || quote.tradie_details?.subscription_tier === 'business') && (
                        <ProBadge size="xs" className="flex-shrink-0" />
                      )}
                      {quote.tradie_profile?.verification_status === 'verified' && (
                        <Shield className="w-4 h-4 text-secondary-500 flex-shrink-0" />
                      )}
                      {isAccepted && !isV2 && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Hired
                        </span>
                      )}
                      {isV2 && (
                        <QuoteStatusBadge status={quote.status} role="client" withTooltip />
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
                          {quote.review_stats.total_jobs_completed} jobs on ConnecTradie
                        </span>
                      )}
                      {quote.tradie_profile?.created_at && (
                        <span className="text-xs text-gray-400 flex items-center gap-1" title="When this tradie joined ConnecTradie">
                          <Calendar className="w-3 h-3" />
                          Member since {new Date(quote.tradie_profile.created_at).getFullYear()}
                        </span>
                      )}
                      {tags.map((tag) => (
                        <QuoteTag key={tag.label} label={tag.label} color={tag.color} />
                      ))}
                    </div>
                  </div>

                  {/* Price — v2 final_submitted shows the binding final_price prominently
                       with the original estimate range as context underneath. */}
                  <div className="text-right flex-shrink-0 pl-2">
                    {quote.final_price != null ? (
                      <>
                        <span className="text-xl font-bold text-gray-900">
                          ${Number(quote.final_price).toLocaleString()}
                        </span>
                        {quote.tradie_profile?.is_gst_registered && (
                          <span className="text-xs font-normal text-gray-500 ml-1">+ GST</span>
                        )}
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          Estimate was ${quote.price_min.toLocaleString()}–${quote.price_max.toLocaleString()}
                        </div>
                      </>
                    ) : quote.firm_price ? (
                      <>
                        <span className="text-xl font-bold text-gray-900">
                          ${quote.firm_price.toLocaleString()}
                        </span>
                        {quote.tradie_profile?.is_gst_registered && (
                          <span className="text-xs font-normal text-gray-500 ml-1">+ GST</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-lg font-bold text-gray-900">
                          ${quote.price_min.toLocaleString()} – ${quote.price_max.toLocaleString()}
                        </span>
                        {quote.tradie_profile?.is_gst_registered && (
                          <span className="text-xs font-normal text-gray-500 ml-1">+ GST</span>
                        )}
                      </>
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
                    {quote.proposed_start_date && (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        Available from {new Date(quote.proposed_start_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
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

              {/* Site-visit deposit explainer (LEGACY v1 only — on v2 the
                  deposit doesn't happen until the client accepts a final quote,
                  so this messaging would be misleading). */}
              {!acceptedQuote && !isV2 && quote.status === 'pending' && quote.requires_site_inspection && quote.price_min && (() => {
                const budget = typeof job.budget_amount === 'number' ? job.budget_amount : null;
                const deposit = Math.max(quote.price_min, budget ?? quote.price_min);
                const usingBudget = budget != null && budget >= quote.price_min;
                return (
                  <div className="mx-5 mt-3 ml-[4.75rem] p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                    <span className="font-semibold">How this works:</span>{' '}
                    You deposit ${deposit.toLocaleString()} {usingBudget ? '(your budget)' : "(the tradie's minimum quote)"} into escrow — the tradie gets your address and visits the site. After the visit, they confirm the final price. If it's higher, you approve the top-up before work starts; if lower, the difference is refunded.
                  </div>
                );
              })()}

              {/* Trust-signals panel for v1 at the accept-and-pay moment.
                  Surfaces what the platform actually provides (escrow, dispute
                  resolution, GST receipt) so the client sees the value bundle
                  alongside the deposit ask. */}
              {!acceptedQuote && !isV2 && quote.status === 'pending' && (
                <div className="mx-5 mt-3 ml-[4.75rem]">
                  <TrustSignals role="client" />
                </div>
              )}

              {/* LEGACY v1 action footer — unchanged behaviour */}
              {!acceptedQuote && !isV2 && quote.status === 'pending' && (
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
                    {quote.requires_site_inspection && quote.price_min
                      ? `Deposit $${Math.max(quote.price_min, (typeof job.budget_amount === 'number' ? job.budget_amount : quote.price_min)).toLocaleString()} & Book Site Visit`
                      : 'Accept & Deposit'}
                  </button>
                  <button
                    onClick={() => onMessageTradie(quote.tradie_id, job.id)}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-secondary-50 border border-secondary-200 text-secondary-700 font-semibold rounded-lg hover:bg-secondary-100 hover:border-secondary-300 transition-colors text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Message tradie
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

              {/* 3-STAGE v2 action footer — status-aware CTAs per getClientActions */}
              {isV2 && !acceptedQuote && !isTerminalQuoteStatus(quote.status) && (() => {
                const actions = getClientActions(quote, job);
                const expired = isFinalQuoteExpired(quote);
                const exceedsAdvisory = finalPriceExceedsAdvisory(quote);
                const callOutFeeDollars = typeof quote.call_out_fee_cents === 'number' && quote.call_out_fee_cents > 0
                  ? quote.call_out_fee_cents / 100
                  : 0;
                // Fee already paid at booking → credited against the final price now.
                const feeCredited = (quote.site_visit_fee_status === 'paid' || quote.site_visit_fee_status === 'credited')
                  && callOutFeeDollars > 0;
                const finalAfterCredit = quote.final_price != null
                  ? Math.max(0, Number(quote.final_price) - (feeCredited ? callOutFeeDollars : 0))
                  : null;

                // Wait-state hint when the only available action is 'decline'
                // (i.e. the ball is in the tradie's court).
                let waitHint: string | null = null;
                if (actions.length === 1 && actions[0] === 'decline') {
                  if (quote.status === 'pending') waitHint = 'Awaiting final quote from tradie';
                  else if (quote.status === 'site_visit_scheduled') waitHint = 'Site visit booked — awaiting visit';
                  else if (quote.status === 'site_visit_completed') waitHint = 'Visit completed — awaiting final quote';
                }

                const busy = !!acceptingId || !!decliningId || !!bookingVisitId;

                return (
                  <>
                    {/* ACL anti-misleading advisory (spec §5.5) when final
                        exceeds the original estimate range by >25%. */}
                    {exceedsAdvisory && !expired && (
                      <div className="mx-5 mt-3 ml-[4.75rem] p-3 bg-warm-50 border border-warm-200 rounded-lg text-xs text-warm-800 leading-relaxed flex gap-2 items-start">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          <span className="font-semibold">Final is above the original estimate:</span>{' '}
                          ${Number(quote.final_price).toLocaleString()} is more than 25% above the originally quoted range
                          (${quote.price_min.toLocaleString()}–${quote.price_max.toLocaleString()}).
                          Check the tradie's message for the reason before accepting.
                        </span>
                      </div>
                    )}

                    {/* Expired final — block acceptance, show clearly. */}
                    {expired && (
                      <div className="mx-5 mt-3 ml-[4.75rem] p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                        <span className="font-semibold">This final quote expired on {quote.final_valid_until}.</span>{' '}
                        The tradie can submit a new quote on this job.
                      </div>
                    )}

                    {/* Value bundle at the accept-and-pay moment so the client
                        sees what they're getting in return for the deposit. */}
                    {actions.includes('accept_and_pay') && !expired && (
                      <div className="mx-5 mt-3 ml-[4.75rem]">
                        <TrustSignals role="client" />
                      </div>
                    )}

                    {/* Call-out fee credit at the accept moment */}
                    {actions.includes('accept_and_pay') && !expired && feeCredited && finalAfterCredit != null && (
                      <div className="mx-5 mt-3 ml-[4.75rem] p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 leading-relaxed">
                        Your <span className="font-semibold">${callOutFeeDollars.toLocaleString()}</span> call-out fee is credited.
                        You pay the remaining <span className="font-semibold">${finalAfterCredit.toLocaleString()}</span> of the
                        ${Number(quote.final_price).toLocaleString()} final price.
                      </div>
                    )}

                    {/* Call-out fee explainer at the book-visit moment */}
                    {actions.includes('book_site_visit') && callOutFeeDollars > 0 && (
                      <div className="mx-5 mt-3 ml-[4.75rem] p-3 bg-secondary-50 border border-secondary-200 rounded-lg text-xs text-secondary-800 leading-relaxed">
                        <span className="font-semibold">${callOutFeeDollars.toLocaleString()} call-out fee.</span>{' '}
                        Payable now to confirm your site visit, where the tradie assesses the job in person to
                        provide an accurate, detailed final price. The fee covers their time to attend and is
                        credited in full toward your final invoice should you proceed. If you choose not to go
                        ahead, it covers the cost of the visit.
                      </div>
                    )}

                    <div className="flex items-center gap-2.5 px-5 py-3 border-t border-gray-100 bg-gray-50/50 ml-[4.75rem]">
                      {actions.includes('book_site_visit') && (
                        <button
                          onClick={() => setConfirmingBookVisitId(quote.id)}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-secondary-500 text-white font-semibold rounded-lg hover:bg-secondary-600 transition-colors disabled:opacity-50 text-sm shadow-sm"
                        >
                          {bookingVisitId === quote.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                          {callOutFeeDollars > 0 ? `Book site visit · $${callOutFeeDollars.toLocaleString()}` : 'Book site visit'}
                        </button>
                      )}

                      {actions.includes('accept_and_pay') && !expired && quote.final_price != null && (
                        <button
                          onClick={() => handleAccept(quote.id)}
                          disabled={busy}
                          className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-warm-500 text-white font-semibold rounded-lg hover:bg-warm-600 transition-colors disabled:opacity-50 text-sm shadow-sm"
                          title={feeCredited ? `$${Number(quote.final_price).toLocaleString()} final less $${callOutFeeDollars.toLocaleString()} call-out already paid` : undefined}
                        >
                          {acceptingId === quote.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          Accept &amp; Pay ${Number(finalAfterCredit ?? quote.final_price).toLocaleString()}
                        </button>
                      )}

                      {waitHint && (
                        <span className="text-sm text-gray-500 italic">{waitHint}</span>
                      )}

                      <button
                        onClick={() => onMessageTradie(quote.tradie_id, job.id)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-secondary-50 border border-secondary-200 text-secondary-700 font-semibold rounded-lg hover:bg-secondary-100 hover:border-secondary-300 transition-colors text-sm"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Message tradie
                      </button>

                      {actions.includes('decline') && (
                        <button
                          onClick={() => handleDecline(quote.id)}
                          disabled={busy}
                          className="inline-flex items-center justify-center px-3 py-2 border border-gray-200 text-gray-400 rounded-lg hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 ml-auto"
                          title="Decline this quote"
                        >
                          {decliningId === quote.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <XCircle className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Address-disclosure confirmation modal — fires before book-site-visit.
          Covers the APP 5 (Australian Privacy Principles) hygiene point: the
          client is informed at the moment their address is shared with a
          specific tradie, and gives explicit consent by tapping confirm. */}
      {confirmingBookVisitId && (() => {
        const q = quotes.find((x) => x.id === confirmingBookVisitId);
        if (!q) return null;
        const tradieName = formatTradieDisplayName(q);
        const address = job.location_address || '(no address on file)';
        const feeDollars = typeof q.call_out_fee_cents === 'number' && q.call_out_fee_cents > 0
          ? q.call_out_fee_cents / 100 : 0;
        const hasChoice = !!selectedSlotId || (!!proposeDate && !!proposeTime);
        const fmtSlot = (iso: string, isoEnd: string) => {
          const s = new Date(iso); const e = new Date(isoEnd);
          const day = s.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
          const t = (d: Date) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
          return `${day} · ${t(s)} – ${t(e)}`;
        };
        const handleConfirm = async () => {
          let payload: { visitStart?: string; visitEnd?: string; timeConfirmed?: boolean } | undefined;
          if (selectedSlotId) {
            const slot = visitSlots.find((s) => s.id === selectedSlotId);
            if (slot) payload = { visitStart: slot.start_time, visitEnd: slot.end_time, timeConfirmed: true };
          } else if (proposeDate && proposeTime) {
            const start = new Date(`${proposeDate}T${proposeTime}`);
            const end = new Date(start.getTime() + proposeDuration * 60000);
            payload = { visitStart: start.toISOString(), visitEnd: end.toISOString(), timeConfirmed: false };
          }
          const quoteIdToBook = confirmingBookVisitId;
          setConfirmingBookVisitId(null);
          await handleBookSiteVisit(quoteIdToBook, payload);
        };
        return (
          <Modal isOpen onClose={() => setConfirmingBookVisitId(null)} maxWidth="md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Book a site visit</h2>
              <p className="text-sm text-gray-600 mb-4">
                Choose when {tradieName} should visit. They inspect the site and submit a
                binding final quote afterwards — your call-out fee is credited to it if you proceed.
              </p>

              <div className="mb-4">
                {visitSlotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading {tradieName}'s availability…
                  </div>
                ) : visitSlots.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{tradieName}'s available times</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {visitSlots.map((s) => {
                        const active = selectedSlotId === s.id;
                        return (
                          <button key={s.id} type="button"
                            onClick={() => { setSelectedSlotId(active ? null : s.id); setProposeDate(''); setProposeTime(''); }}
                            className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${active ? 'border-secondary-400 bg-secondary-50 text-secondary-800' : 'border-gray-200 bg-white text-gray-700 hover:border-secondary-300'}`}>
                            {fmtSlot(s.start_time, s.end_time)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-gray-400">Picking one of these confirms the visit immediately.</p>
                  </>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
                    {tradieName} hasn't published set times — suggest a time below and they'll confirm it.
                  </div>
                )}

                <div className={visitSlots.length > 0 ? 'mt-3 pt-3 border-t border-gray-100' : 'mt-3'}>
                  {visitSlots.length > 0 && (
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Or suggest another time</p>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input type="date" value={proposeDate} min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => { setProposeDate(e.target.value); setSelectedSlotId(null); }}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500 outline-none" />
                    <input type="time" value={proposeTime}
                      onChange={(e) => { setProposeTime(e.target.value); setSelectedSlotId(null); }}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-secondary-500 outline-none" />
                    <select value={proposeDuration} disabled={!proposeTime}
                      onChange={(e) => setProposeDuration(Number(e.target.value))}
                      className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-secondary-500 outline-none disabled:opacity-50">
                      <option value={30}>30 min</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                      <option value={120}>2 hours</option>
                    </select>
                  </div>
                  {proposeDate && proposeTime && !selectedSlotId && (
                    <p className="mt-1.5 text-[11px] text-gray-400">{tradieName} will confirm this proposed time.</p>
                  )}
                </div>
              </div>

              <div className="p-3 bg-secondary-50/60 border border-secondary-100 rounded-lg mb-4">
                <p className="text-xs font-semibold text-secondary-700 mb-1">Your address will be shared with {tradieName}</p>
                <p className="text-sm text-gray-800">{address}</p>
                <p className="text-[11px] text-gray-500 mt-1.5">Shared so they can plan the visit. Use is limited to this engagement under our Privacy Policy.</p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmingBookVisitId(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!hasChoice || bookingVisitId === confirmingBookVisitId}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-secondary-500 text-white font-semibold rounded-lg hover:bg-secondary-600 transition-colors text-sm disabled:opacity-50"
                >
                  {bookingVisitId === confirmingBookVisitId ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {feeDollars > 0 ? `Pay $${feeDollars.toLocaleString()} & book` : 'Book site visit'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}
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
  // Pro tier priority placement — Pro tradies are vetted, pay a subscription,
  // and tend to be more responsive. Worth 7 points so they edge out
  // verified-only tradies in the recommended sort, but not so much that
  // bad reviews can't outweigh.
  const tier = quote.tradie_details?.subscription_tier;
  if (tier === 'pro' || tier === 'pro_plus' || tier === 'business') score += 7;

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
