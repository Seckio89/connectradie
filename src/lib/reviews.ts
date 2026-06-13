import { supabase } from './supabase';

export interface Review {
  id: string;
  job_id: string;
  tradie_id: string;
  client_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    full_name: string;
  };
  job?: {
    title: string | null;
    description: string | null;
  };
}

export interface TradieRating {
  tradie_id: string;
  total_reviews: number;
  average_rating: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  two_star_count: number;
  one_star_count: number;
}

export interface PlatformStats {
  total_reviews: number;
  average_rating: number;
  total_tradies_with_reviews: number;
}

export async function getTradieRating(tradieId: string): Promise<TradieRating | null> {
  const { data, error } = await supabase
    .from('tradie_ratings')
    .select('*')
    .eq('tradie_id', tradieId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as TradieRating;
}

export async function getTradieReviews(tradieId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      client:profiles!reviews_client_id_fkey(full_name),
      job:jobs!reviews_job_id_fkey(title, description)
    `)
    .eq('tradie_id', tradieId)
    .order('created_at', { ascending: false });

  if (error) {
    return [];
  }

  return (data as unknown as Review[]) || [];
}

export async function getPlatformStats(): Promise<PlatformStats> {
  // Uses a Supabase RPC function to compute stats server-side.
  // Create this function in your Supabase SQL editor:
  //
  //   CREATE OR REPLACE FUNCTION get_platform_stats()
  //   RETURNS JSON AS $$
  //     SELECT json_build_object(
  //       'total_reviews', COUNT(*),
  //       'average_rating', COALESCE(ROUND(AVG(rating)::numeric, 1), 0),
  //       'total_tradies_with_reviews', COUNT(DISTINCT tradie_id)
  //     )
  //     FROM reviews;
  //   $$ LANGUAGE SQL STABLE;
  //
  const { data, error } = await supabase.rpc('get_platform_stats') as { data: PlatformStats | null, error: { message: string } | null };

  if (error || !data) {
    return {
      total_reviews: 0,
      average_rating: 0,
      total_tradies_with_reviews: 0,
    };
  }

  return {
    total_reviews: data.total_reviews ?? 0,
    average_rating: data.average_rating ?? 0,
    total_tradies_with_reviews: data.total_tradies_with_reviews ?? 0,
  };
}

export async function canUserReviewJob(jobId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: job } = await supabase
    .from('jobs')
    .select('status, client_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || job.client_id !== user.id || job.status !== 'completed') {
    return false;
  }

  const { data: existingReview } = await supabase
    .from('reviews')
    .select('id')
    .eq('job_id', jobId)
    .eq('client_id', user.id)
    .maybeSingle();

  return !existingReview;
}
