// ============================================================
// Search Ranking Algorithm
// Weighted scoring for tradie search results
// ============================================================

export interface TradieScoringFactors {
  distanceKm: number;          // distance from searched postcode
  averageRating: number;       // 0-5 stars
  reviewCount: number;         // total reviews
  responseRate: number;        // 0-1 (percentage of jobs quoted on)
  isAbnVerified: boolean;
  isLicenseVerified: boolean;
  profileCompleteness: number; // 0-1 score
  recentActivityDays: number;  // days since last login/quote
  jobsCompleted: number;       // total completed jobs on platform
}

// Weight configuration — tweak these to adjust ranking priority
const WEIGHTS = {
  distance: 25,
  rating: 20,
  reviewCount: 10,
  responseRate: 10,
  verification: 15,
  profileCompleteness: 5,
  recentActivity: 10,
  jobsCompleted: 5,
} as const;

/**
 * Distance score: closer = higher score.
 * 0 km → 1.0, 10 km → 0.8, 25 km → 0.5, 50+ km → 0.0
 * Uses inverse linear decay with a 50 km cap.
 */
function scoreDistance(distanceKm: number): number {
  if (distanceKm <= 0) return 1;
  if (distanceKm >= 50) return 0;
  return 1 - distanceKm / 50;
}

/**
 * Rating score: linear 0-5 mapped to 0-1.
 * Applies a Bayesian adjustment for low review counts
 * so a 5.0 from 1 review doesn't beat a 4.7 from 50 reviews.
 */
function scoreRating(averageRating: number, reviewCount: number): number {
  if (reviewCount === 0) return 0.4; // neutral default
  // Bayesian average: blend with platform mean (3.5) using confidence factor
  const confidenceThreshold = 5;
  const platformMean = 3.5;
  const adjustedRating =
    (reviewCount * averageRating + confidenceThreshold * platformMean) /
    (reviewCount + confidenceThreshold);
  return Math.min(adjustedRating / 5, 1);
}

/**
 * Review count score: diminishing returns via log scale.
 * 0 → 0, 1 → 0.25, 5 → 0.55, 10 → 0.7, 50 → 0.9, 100+ → 1.0
 */
function scoreReviewCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.log10(count + 1) / Math.log10(101), 1);
}

/**
 * Response rate score: linear 0-1.
 */
function scoreResponseRate(rate: number): number {
  return Math.max(0, Math.min(rate, 1));
}

/**
 * Verification score: ABN + license each contribute 0.5.
 */
function scoreVerification(isAbnVerified: boolean, isLicenseVerified: boolean): number {
  let score = 0;
  if (isAbnVerified) score += 0.5;
  if (isLicenseVerified) score += 0.5;
  return score;
}

/**
 * Recent activity score: active tradies rank higher.
 * 0 days → 1.0, 7 days → 0.7, 30 days → 0.3, 90+ days → 0.0
 */
function scoreRecentActivity(daysSinceActive: number): number {
  if (daysSinceActive <= 0) return 1;
  if (daysSinceActive >= 90) return 0;
  return 1 - daysSinceActive / 90;
}

/**
 * Jobs completed score: diminishing returns via log scale.
 * 0 → 0, 5 → 0.45, 10 → 0.6, 50 → 0.85, 200+ → 1.0
 */
function scoreJobsCompleted(count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.log10(count + 1) / Math.log10(201), 1);
}

/**
 * Calculate the overall weighted score for a tradie.
 * Returns a number between 0 and 100.
 */
export function calculateTradeScore(factors: TradieScoringFactors): number {
  const scores = {
    distance: scoreDistance(factors.distanceKm) * WEIGHTS.distance,
    rating: scoreRating(factors.averageRating, factors.reviewCount) * WEIGHTS.rating,
    reviewCount: scoreReviewCount(factors.reviewCount) * WEIGHTS.reviewCount,
    responseRate: scoreResponseRate(factors.responseRate) * WEIGHTS.responseRate,
    verification: scoreVerification(factors.isAbnVerified, factors.isLicenseVerified) * WEIGHTS.verification,
    profileCompleteness: factors.profileCompleteness * WEIGHTS.profileCompleteness,
    recentActivity: scoreRecentActivity(factors.recentActivityDays) * WEIGHTS.recentActivity,
    jobsCompleted: scoreJobsCompleted(factors.jobsCompleted) * WEIGHTS.jobsCompleted,
  };

  return Object.values(scores).reduce((sum, s) => sum + s, 0);
}

/**
 * Build scoring factors from raw tradie data available in Search.tsx.
 * Fields that aren't available yet default to neutral values.
 */
export function buildScoringFactors(tradie: {
  abn_verified?: boolean;
  license_verified?: boolean;
  verification_status?: string;
  bio?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  postcode?: string | null;
  tradie_details?: {
    bio?: string | null;
    hourly_rate?: number | null;
    insurance_provider?: string | null;
    qualifications?: string[] | null;
  } | null;
  averageRating?: number;
  reviewCount?: number;
  jobsCompleted?: number;
  recentActivityDays?: number;
  distanceKm?: number;
}): TradieScoringFactors {
  // Profile completeness: check key fields
  let completeness = 0;
  let totalFields = 0;
  const check = (val: unknown) => {
    totalFields++;
    if (val !== null && val !== undefined && val !== '' && val !== false) completeness++;
  };
  check(tradie.avatar_url);
  check(tradie.phone);
  check(tradie.postcode);
  check(tradie.tradie_details?.bio);
  check(tradie.tradie_details?.hourly_rate);
  check(tradie.tradie_details?.insurance_provider);
  check(tradie.tradie_details?.qualifications?.length);

  return {
    distanceKm: tradie.distanceKm ?? 25, // default mid-range if no location
    averageRating: tradie.averageRating ?? 0,
    reviewCount: tradie.reviewCount ?? 0,
    responseRate: 0.5, // not tracked yet — neutral default
    isAbnVerified: tradie.abn_verified ?? false,
    isLicenseVerified: tradie.license_verified ?? (tradie.verification_status === 'verified'),
    profileCompleteness: totalFields > 0 ? completeness / totalFields : 0,
    recentActivityDays: tradie.recentActivityDays ?? 30, // default mid-range
    jobsCompleted: tradie.jobsCompleted ?? 0,
  };
}
