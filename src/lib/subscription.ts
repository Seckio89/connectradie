import { supabase } from './supabase';
import { calculatePlatformFeeCentsV2, TIER_SCHEDULES } from '../../supabase/functions/_shared/pricing';

export const FREE_LIMITS = {
  MAX_TRADE_CATEGORIES: 1,
  MAX_JOBS_PER_MONTH: 5,
  MAX_LEAD_UNLOCKS_PER_MONTH: 3,
} as const;

export const PRO_LIMITS = {
  LEAD_NOTIFICATIONS_PER_MONTH: 15,
} as const;

export const PRO_FEATURES = {
  VERIFIED_BADGE: 'verified_badge',
  PRIORITY_SEARCH: 'priority_search',
  REDUCED_FEES: 'reduced_fees',
  GOOGLE_CALENDAR_SYNC: 'google_calendar_sync',
  INVOICE_CREATION: 'invoice_creation',
  PROJECT_MILESTONES: 'project_milestones',
  BULK_AVAILABILITY: 'bulk_availability',
  LEAD_UNLOCK_HISTORY: 'lead_unlock_history',
  TEAM_MANAGEMENT: 'team_management',
  SITE_CALENDAR: 'site_calendar',
  FIRST_CLAIM_LEADS: 'first_claim_leads',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  PROFILE_BOOST: 'profile_boost',
} as const;

export type ProFeature = (typeof PRO_FEATURES)[keyof typeof PRO_FEATURES];

export type SubscriptionTier = 'free' | 'pro' | 'pro_plus';
export type BillingCycle = 'monthly' | 'annual';

export interface TierPricing {
  monthly: number;
  annual: number;
  annualMonthly: number;
}

export interface FeeTier {
  maxJobValue: number;
  rate: number;
}

export interface PlatformFeeConfig {
  type: 'sliding' | 'flat';
  tiers?: FeeTier[];
  rate?: number;
  cap: number;
}

export const TIER_PRICING: Record<Exclude<SubscriptionTier, 'free'>, TierPricing> = {
  pro: {
    monthly: 49,
    annual: 420,
    annualMonthly: 35,
  },
  pro_plus: {
    monthly: 59,
    annual: 499,
    annualMonthly: 41.58,
  },
};

// The advertised V2 schedule (see /pricing): full rate on the first $3,000, the
// reduced rate on the part above, capped per job. These numbers mirror the money
// path (supabase/functions/_shared/pricing.ts) so what a tradie is shown here is
// exactly what they'll be charged. pro_plus (retired, unadvertised) = Pro.
export const PLATFORM_FEES: Record<SubscriptionTier, PlatformFeeConfig> = {
  free: {
    type: 'sliding',
    tiers: [
      { maxJobValue: 3000, rate: 0.10 },
      { maxJobValue: Infinity, rate: 0.05 },
    ],
    cap: 900,
  },
  pro: {
    type: 'sliding',
    tiers: [
      { maxJobValue: 3000, rate: 0.07 },
      { maxJobValue: Infinity, rate: 0.035 },
    ],
    cap: 630,
  },
  pro_plus: {
    type: 'sliding',
    tiers: [
      { maxJobValue: 3000, rate: 0.07 },
      { maxJobValue: Infinity, rate: 0.035 },
    ],
    cap: 630,
  },
};

/**
 * Calculate the platform fee for a given job value and tier.
 * Delegates to the single V2 fee engine so this can never disagree with the
 * amount the edge functions actually charge on the destination charge.
 */
export function calculatePlatformFee(jobValue: number, tier: SubscriptionTier, overrideBps?: number | null): number {
  const schedule = tier === 'free' ? TIER_SCHEDULES.free : TIER_SCHEDULES.pro; // pro + pro_plus
  const cents = Math.round(Math.max(0, jobValue) * 100);
  // overrideBps (profiles.platform_fee_override_bps) mirrors the money path: a flat
  // rate on the whole amount, still capped. 0 → zero fee (e.g. the platform owner).
  return calculatePlatformFeeCentsV2(cents, schedule, overrideBps).feeCents / 100;
}

/** Get a human-readable fee summary for a tier */
export function getFeeSummary(tier: SubscriptionTier): string {
  const config = PLATFORM_FEES[tier];
  if (config.type === 'flat') {
    return `${(config.rate ?? 0) * 100}% flat (capped at $${config.cap})`;
  }
  const tiers = config.tiers ?? [];
  const highest = tiers[0]?.rate ?? 0;
  const lowest = tiers[tiers.length - 1]?.rate ?? 0;
  return `${highest * 100}%–${lowest * 100}% sliding (capped at $${config.cap})`;
}

/**
 * Platform-owner / admin entitlement check. The owner (and any admin) gets full
 * Pro/PM access, no commission, and unlimited limits — independently of their
 * `role` (which stays 'tradie'/'client' so they still look and behave like a
 * normal user to clients). Accepts anything with the two flags so it works with
 * a full Profile or a lightweight `{ is_admin, role }`.
 */
export function isPlatformAdmin(
  profile?: { is_admin?: boolean | null; role?: string | null } | null,
): boolean {
  return profile?.is_admin === true || profile?.role === 'admin';
}

export function isPro(subscriptionTier?: string, isPremium?: boolean, isAdmin?: boolean): boolean {
  return isAdmin === true || subscriptionTier === 'pro' || subscriptionTier === 'pro_plus' || subscriptionTier === 'business' || isPremium === true;
}

export function getCurrentTier(subscriptionTier?: string, isPremium?: boolean, isAdmin?: boolean): SubscriptionTier {
  if (isAdmin === true) return 'pro';
  if (subscriptionTier === 'pro_plus') return 'pro_plus';
  if (subscriptionTier === 'pro' || subscriptionTier === 'business' || isPremium === true) return 'pro';
  return 'free';
}

/**
 * The tier the tradie is ACTUALLY CHARGED at. Mirrors the edge functions'
 * resolveTradieTier (supabase/functions/_shared/pricing.ts), which reads ONLY
 * tradie_details.subscription_tier — the single source of truth for money.
 *
 * Deliberately has NO profiles.is_premium fallback: is_premium is a UI perk
 * flag and can drift (e.g. set manually or in test mode without a real
 * subscription). Every fee shown to the tradie MUST use this, never
 * getCurrentTier, or the disclosed fee can disagree with the charged fee.
 */
export function getChargedTier(subscriptionTier?: string | null): SubscriptionTier {
  if (subscriptionTier === 'pro_plus') return 'pro_plus';
  if (subscriptionTier === 'pro' || subscriptionTier === 'business') return 'pro';
  return 'free';
}

export async function getMonthlyJobAccepts(userId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('tradie_id', userId)
    .in('status', ['accepted', 'in_progress', 'completed'])
    .gte('created_at', startOfMonth);

  return count || 0;
}

export async function getMonthlyLeadUnlocks(userId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { count } = await supabase
    .from('job_unlocks')
    .select('*', { count: 'exact', head: true })
    .eq('tradie_id', userId)
    .gte('created_at', startOfMonth);

  return count || 0;
}


export function getFeatureLabel(feature: ProFeature): string {
  const labels: Record<ProFeature, string> = {
    [PRO_FEATURES.VERIFIED_BADGE]: 'Verified Pro Badge',
    [PRO_FEATURES.PRIORITY_SEARCH]: 'Priority Search Ranking',
    [PRO_FEATURES.REDUCED_FEES]: '7% Platform Fee (capped $630)',
    [PRO_FEATURES.GOOGLE_CALENDAR_SYNC]: 'Google Calendar Sync',
    [PRO_FEATURES.INVOICE_CREATION]: 'Invoice Creation',
    [PRO_FEATURES.PROJECT_MILESTONES]: 'Project & Milestone Tracking',
    [PRO_FEATURES.BULK_AVAILABILITY]: 'Bulk Availability Management',
    [PRO_FEATURES.LEAD_UNLOCK_HISTORY]: 'Lead Unlock History',
    [PRO_FEATURES.TEAM_MANAGEMENT]: 'Team Management',
    [PRO_FEATURES.SITE_CALENDAR]: 'Site Calendar',
    [PRO_FEATURES.FIRST_CLAIM_LEADS]: 'First-Claim on Leads',
    [PRO_FEATURES.ADVANCED_ANALYTICS]: 'Advanced Analytics',
    [PRO_FEATURES.PROFILE_BOOST]: 'Profile Boost',
  };
  return labels[feature];
}

export function getFeatureDescription(feature: ProFeature): string {
  const descriptions: Record<ProFeature, string> = {
    [PRO_FEATURES.VERIFIED_BADGE]: 'Build trust with a verified badge on your profile',
    [PRO_FEATURES.PRIORITY_SEARCH]: 'Appear at the top of search results',
    [PRO_FEATURES.REDUCED_FEES]: 'Pay 7% instead of 10% — and just 3.5% on the part of a job above $3,000',
    [PRO_FEATURES.GOOGLE_CALENDAR_SYNC]: 'Sync your schedule with Google Calendar',
    [PRO_FEATURES.INVOICE_CREATION]: 'Create and send professional invoices',
    [PRO_FEATURES.PROJECT_MILESTONES]: 'Manage complex projects with milestones',
    [PRO_FEATURES.BULK_AVAILABILITY]: 'Set availability for multiple days at once',
    [PRO_FEATURES.LEAD_UNLOCK_HISTORY]: 'View full history of unlocked client leads',
    [PRO_FEATURES.TEAM_MANAGEMENT]: 'Manage your team and subcontractors',
    [PRO_FEATURES.SITE_CALENDAR]: 'Coordinate jobs across your whole team',
    [PRO_FEATURES.FIRST_CLAIM_LEADS]: 'See and claim leads before other tradies',
    [PRO_FEATURES.ADVANCED_ANALYTICS]: 'Detailed insights into your business performance',
    [PRO_FEATURES.PROFILE_BOOST]: 'Boosted visibility in search and listings',
  };
  return descriptions[feature];
}
