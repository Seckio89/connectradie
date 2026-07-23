import { supabase } from './supabase';
import {
  calculateFeeV21,
  TIER_SCHEDULES_V21,
  DEFAULT_MATERIALS_PROCESSING_BPS,
} from '../../supabase/functions/_shared/pricing';

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
    // v2.1: $49 → $39. The gap Pro bridges shrank (8→5 instead of 10→7), so the
    // price drops with it. Breakeven ~$1,300/mo of labour.
    monthly: 39,
    annual: 420,
    annualMonthly: 35,
  },
  pro_plus: {
    monthly: 59,
    annual: 499,
    annualMonthly: 41.58,
  },
};

// The advertised v2.1 schedule (see /pricing): a FLAT rate on the tradie's
// LABOUR only, capped per job, with a cheaper repeat-client rate. Materials are
// passed through untouched. These numbers mirror the money path
// (supabase/functions/_shared/pricing.ts → TIER_SCHEDULES_V21) so what a tradie
// is shown here is exactly what they'll be charged.
// pro_plus (retired, unadvertised) = Pro.
export const PLATFORM_FEES: Record<SubscriptionTier, PlatformFeeConfig> = {
  free: { type: 'flat', rate: 0.08, cap: 500 },
  pro: { type: 'flat', rate: 0.05, cap: 400 },
  pro_plus: { type: 'flat', rate: 0.05, cap: 400 },
};

/** The cheaper rate a (tradie, client) pair gets from their 2nd job onward. */
export const REPEAT_CLIENT_FEES: Record<SubscriptionTier, number> = {
  free: 0.05,
  pro: 0.04,
  pro_plus: 0.04,
};

/**
 * Platform commission for a job, v2.1.
 *
 * IMPORTANT: `labourValue` is the tradie's LABOUR, not the job total. Commission
 * is never charged on materials. Callers holding only a total must subtract
 * materials first, or they will overstate the fee.
 *
 * Delegates to the single v2.1 engine so this can never disagree with what the
 * edge functions actually charge.
 */
export function calculatePlatformFee(
  labourValue: number,
  tier: SubscriptionTier,
  overrideBps?: number | null,
  isRepeatClient = false,
): number {
  const schedule = tier === 'free' ? TIER_SCHEDULES_V21.free : TIER_SCHEDULES_V21.pro; // pro + pro_plus
  const labourCents = Math.round(Math.max(0, labourValue) * 100);
  return calculateFeeV21({
    labourCents,
    materialsCents: 0,
    tier: schedule,
    isRepeatClient,
    materialsProcessingBps: DEFAULT_MATERIALS_PROCESSING_BPS,
    // overrideBps (profiles.platform_fee_override_bps) mirrors the money path: a
    // flat rate on labour, still capped, bypassing the floor and min fee.
    // 0 → zero fee (e.g. the platform owner).
    overrideBps,
  }).commissionCents / 100;
}

/**
 * At-cost card processing on the materials portion. Not platform revenue — it is
 * Stripe's cost passed through without markup, shown as its own line so tradies
 * can see there is no margin hidden in it.
 */
export function calculateMaterialsProcessing(materialsValue: number): number {
  const materialsCents = Math.round(Math.max(0, materialsValue) * 100);
  return calculateFeeV21({
    labourCents: 0,
    materialsCents,
    tier: TIER_SCHEDULES_V21.free, // commission is 0 here regardless of tier
    isRepeatClient: false,
    materialsProcessingBps: DEFAULT_MATERIALS_PROCESSING_BPS,
  }).materialsProcessingCents / 100;
}

/** Get a human-readable fee summary for a tier (v2.1: flat, on labour only). */
export function getFeeSummary(tier: SubscriptionTier): string {
  const config = PLATFORM_FEES[tier];
  const repeat = REPEAT_CLIENT_FEES[tier];
  return `${(config.rate ?? 0) * 100}% of your labour (capped at $${config.cap}) — ${repeat * 100}% for repeat clients`;
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
    [PRO_FEATURES.REDUCED_FEES]: '5% on your labour (capped $400)',
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
    [PRO_FEATURES.REDUCED_FEES]: 'Pay 5% on your labour instead of 8% — and just 4% on repeat clients. Never anything on materials.',
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
