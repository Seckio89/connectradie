import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewSubmission {
  jobId: string;
  tradieId: string;
  rating: number;
  comment: string;
  tags?: string[];
  photos?: string[];
}

export interface ReviewWithClient {
  id: string;
  job_id: string;
  tradie_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  tradie_response: string | null;
  helpful_count: number;
  photos: string[] | null;
  tags: string[] | null;
  created_at: string;
  client?: {
    id: string;
    full_name: string;
  } | null;
}

export interface ReviewStats {
  avgRating: number;
  totalReviews: number;
  distribution: {
    oneStar: number;
    twoStar: number;
    threeStar: number;
    fourStar: number;
    fiveStar: number;
  };
  responseRate: number;
  isTopRated: boolean;
}

export interface PendingReview {
  jobId: string;
  tradieId: string;
  tradieName: string;
  tradeCategory: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REVIEW_TAGS = [
  'punctual',
  'quality_work',
  'good_communication',
  'fair_pricing',
  'clean_worksite',
  'professional',
  'experienced',
  'reliable',
  'friendly',
  'would_recommend',
] as const;

export type ReviewTag = (typeof REVIEW_TAGS)[number];

// ---------------------------------------------------------------------------
// Core review functions
// ---------------------------------------------------------------------------

/**
 * Submit a review for a completed job.
 */
export async function submitReview(
  jobId: string,
  tradieId: string,
  rating: number,
  comment: string,
): Promise<ReviewWithClient> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  // Verify the job is completed and belongs to this client
  const { data: job } = await supabase
    .from('jobs')
    .select('id, status, client_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) throw new Error('Job not found');
  if (job.client_id !== user.id) throw new Error('You can only review your own jobs');
  if (job.status !== 'completed') throw new Error('Can only review completed jobs');

  // Check for duplicate review
  const { data: existing } = await supabase
    .from('reviews')
    .select('id')
    .eq('job_id', jobId)
    .eq('client_id', user.id)
    .maybeSingle();

  if (existing) throw new Error('You have already reviewed this job');

  const { data, error } = await supabase
    .from('reviews')
    .insert({
      job_id: jobId,
      tradie_id: tradieId,
      client_id: user.id,
      rating,
      comment,
    })
    .select(`
      *,
      client:profiles!reviews_client_id_fkey(id, full_name)
    `)
    .single();

  if (error) throw new Error(error.message);

  return data as unknown as ReviewWithClient;
}

/**
 * Allow a tradie to respond to a review.
 */
export async function respondToReview(
  reviewId: string,
  response: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (!response.trim()) throw new Error('Response cannot be empty');

  // Verify the review belongs to this tradie
  const { data: review } = await supabase
    .from('reviews')
    .select('id, tradie_id')
    .eq('id', reviewId)
    .maybeSingle();

  if (!review) throw new Error('Review not found');
  if (review.tradie_id !== user.id) throw new Error('You can only respond to your own reviews');

  // Check if already responded by querying the tradie_response field
  const { data: fullReview } = await supabase
    .from('reviews')
    .select('tradie_response')
    .eq('id', reviewId)
    .maybeSingle();

  if (fullReview?.tradie_response) throw new Error('You have already responded to this review');

  const { error } = await supabase
    .from('reviews')
    .update({ tradie_response: response.trim() })
    .eq('id', reviewId);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Review statistics
// ---------------------------------------------------------------------------

/**
 * Get aggregated review statistics for a tradie.
 */
export async function getReviewStats(tradieId: string): Promise<ReviewStats> {
  const { data: ratings } = await supabase
    .from('tradie_ratings')
    .select('*')
    .eq('tradie_id', tradieId)
    .maybeSingle();

  if (!ratings) {
    return {
      avgRating: 0,
      totalReviews: 0,
      distribution: { oneStar: 0, twoStar: 0, threeStar: 0, fourStar: 0, fiveStar: 0 },
      responseRate: 0,
      isTopRated: false,
    };
  }

  const r = ratings as unknown as {
    total_reviews?: number;
    average_rating?: number;
    one_star_count?: number;
    two_star_count?: number;
    three_star_count?: number;
    four_star_count?: number;
    five_star_count?: number;
  };
  const totalReviews = r.total_reviews ?? 0;
  const avgRating = r.average_rating ?? 0;

  const distribution = {
    oneStar: r.one_star_count ?? 0,
    twoStar: r.two_star_count ?? 0,
    threeStar: r.three_star_count ?? 0,
    fourStar: r.four_star_count ?? 0,
    fiveStar: r.five_star_count ?? 0,
  };

  // Calculate response rate from actual reviews
  const { data: allReviews } = await supabase
    .from('reviews')
    .select('id, tradie_response')
    .eq('tradie_id', tradieId);

  const reviewsList = allReviews ?? [];
  const responseRate = reviewsList.length > 0
    ? reviewsList.filter((r) => r.tradie_response).length / reviewsList.length
    : 0;

  const topRated = isTopRated({ avgRating, totalReviews, distribution, responseRate });

  return {
    avgRating,
    totalReviews,
    distribution,
    responseRate,
    isTopRated: topRated,
  };
}

/**
 * Determine whether a tradie qualifies for the "Top Rated" badge.
 * Criteria: >= 5 reviews, >= 4.5 average, >= 80% response rate.
 */
export function isTopRated(stats: Omit<ReviewStats, 'isTopRated'>): boolean {
  return (
    stats.totalReviews >= 5 &&
    stats.avgRating >= 4.5 &&
    stats.responseRate >= 0.8
  );
}

// ---------------------------------------------------------------------------
// Pending reviews
// ---------------------------------------------------------------------------

/**
 * Get completed jobs that the current user has not yet reviewed.
 */
export async function getPendingReviews(userId?: string): Promise<PendingReview[]> {
  let clientId = userId;

  if (!clientId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    clientId = user.id;
  }

  const { data: completedJobs, error: jobsError } = await supabase
    .from('jobs')
    .select(`
      id,
      tradie_id,
      updated_at,
      tradie:profiles!jobs_tradie_id_fkey(full_name)
    `)
    .eq('client_id', clientId)
    .eq('status', 'completed');

  if (jobsError) throw new Error(jobsError.message);
  if (!completedJobs || completedJobs.length === 0) return [];

  // Get existing reviews by this client
  const { data: existingReviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('job_id')
    .eq('client_id', clientId);

  if (reviewsError) throw new Error(reviewsError.message);

  const reviewedJobIds = new Set((existingReviews ?? []).map((r) => r.job_id));

  return (completedJobs as unknown as Array<{
    id: string;
    tradie_id: string;
    updated_at: string;
    trade_category?: string;
    tradie: { full_name: string } | null;
  }>)
    .filter((job) => !reviewedJobIds.has(job.id))
    .map((job) => ({
      jobId: job.id,
      tradieId: job.tradie_id,
      tradieName: job.tradie?.full_name ?? 'Unknown',
      tradeCategory: job.trade_category ?? 'General',
      completedAt: job.updated_at,
    }));
}

// ---------------------------------------------------------------------------
// Moderation helpers
// ---------------------------------------------------------------------------

/**
 * Report an inappropriate review for moderation.
 */
export async function reportReview(reviewId: string, reason: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Verify the review exists
  const { data: review } = await supabase
    .from('reviews')
    .select('id, client_id')
    .eq('id', reviewId)
    .maybeSingle();

  if (!review) throw new Error('Review not found');

  const { error } = await supabase.from('abuse_reports').insert({
    reporter_id: user.id,
    reported_user_id: review.client_id,
    report_type: 'fake_review' as const,
    severity: 'medium' as const,
    description: `Review ${reviewId}: ${reason}`,
    status: 'pending' as const,
  });

  if (error) throw new Error(error.message);
}

/**
 * Mark a review as helpful (increment helpful_count).
 */
export async function markReviewHelpful(reviewId: string): Promise<void> {
  const { data: review, error: fetchError } = await supabase
    .from('reviews')
    .select('id, helpful_count')
    .eq('id', reviewId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!review) throw new Error('Review not found');

  const { error } = await supabase
    .from('reviews')
    .update({ helpful_count: (review.helpful_count ?? 0) + 1 })
    .eq('id', reviewId);

  if (error) throw new Error(error.message);
}
