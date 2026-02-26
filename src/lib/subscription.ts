import { supabase } from './supabase';

export const FREE_LIMITS = {
  JOB_ACCEPTS_PER_MONTH: 5,
  LEAD_UNLOCKS_PER_MONTH: 3,
  MAX_TRADE_CATEGORIES: 1,
} as const;

export const PRO_LIMITS = {
  LEAD_NOTIFICATIONS_PER_MONTH: 15,
} as const;

export const PRO_FEATURES = {
  VERIFIED_BADGE: 'verified_badge',
  PRIORITY_SEARCH: 'priority_search',
  UNLIMITED_JOB_ACCEPTS: 'unlimited_job_accepts',
  ZERO_SERVICE_FEES: 'zero_service_fees',
  GOOGLE_CALENDAR_SYNC: 'google_calendar_sync',
  INVOICE_CREATION: 'invoice_creation',
  PROJECT_MILESTONES: 'project_milestones',
  BULK_AVAILABILITY: 'bulk_availability',
  UNLIMITED_LEAD_UNLOCKS: 'unlimited_lead_unlocks',
  TEAM_MANAGEMENT: 'team_management',
  SITE_CALENDAR: 'site_calendar',
  FIRST_CLAIM_LEADS: 'first_claim_leads',
  ADVANCED_ANALYTICS: 'advanced_analytics',
  PROFILE_BOOST: 'profile_boost',
} as const;

export type ProFeature = (typeof PRO_FEATURES)[keyof typeof PRO_FEATURES];

export type SubscriptionTier = 'free' | 'pro';
export type BillingCycle = 'monthly' | 'annual';

export interface TierPricing {
  monthly: number;
  annual: number;
  annualMonthly: number;
}

export const TIER_PRICING: Record<Exclude<SubscriptionTier, 'free'>, TierPricing> = {
  pro: {
    monthly: 45,
    annual: 432,
    annualMonthly: 36,
  },
};

export function isPro(subscriptionTier?: string, isPremium?: boolean): boolean {
  return subscriptionTier === 'pro' || subscriptionTier === 'business' || isPremium === true;
}

export function getCurrentTier(subscriptionTier?: string, isPremium?: boolean): SubscriptionTier {
  if (subscriptionTier === 'pro' || subscriptionTier === 'business' || isPremium === true) return 'pro';
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

export function canAcceptJob(isProUser: boolean, monthlyAccepts: number): boolean {
  if (isProUser) return true;
  return monthlyAccepts < FREE_LIMITS.JOB_ACCEPTS_PER_MONTH;
}

export function canUnlockLead(isProUser: boolean, monthlyUnlocks: number): boolean {
  if (isProUser) return true;
  return monthlyUnlocks < FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH;
}

export function getRemainingJobAccepts(isProUser: boolean, monthlyAccepts: number): number | null {
  if (isProUser) return null;
  return Math.max(0, FREE_LIMITS.JOB_ACCEPTS_PER_MONTH - monthlyAccepts);
}

export function getRemainingLeadUnlocks(isProUser: boolean, monthlyUnlocks: number): number | null {
  if (isProUser) return null;
  return Math.max(0, FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH - monthlyUnlocks);
}

export function getFeatureLabel(feature: ProFeature): string {
  const labels: Record<ProFeature, string> = {
    [PRO_FEATURES.VERIFIED_BADGE]: 'Verified Pro Badge',
    [PRO_FEATURES.PRIORITY_SEARCH]: 'Priority Search Ranking',
    [PRO_FEATURES.UNLIMITED_JOB_ACCEPTS]: 'Unlimited Job Accepts',
    [PRO_FEATURES.ZERO_SERVICE_FEES]: '100% Payout',
    [PRO_FEATURES.GOOGLE_CALENDAR_SYNC]: 'Google Calendar Sync',
    [PRO_FEATURES.INVOICE_CREATION]: 'Invoice Creation',
    [PRO_FEATURES.PROJECT_MILESTONES]: 'Project & Milestone Tracking',
    [PRO_FEATURES.BULK_AVAILABILITY]: 'Bulk Availability Management',
    [PRO_FEATURES.UNLIMITED_LEAD_UNLOCKS]: 'Unlimited Lead Unlocks',
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
    [PRO_FEATURES.UNLIMITED_JOB_ACCEPTS]: 'Accept unlimited jobs every month',
    [PRO_FEATURES.ZERO_SERVICE_FEES]: 'Keep 100% of every job - zero platform fees',
    [PRO_FEATURES.GOOGLE_CALENDAR_SYNC]: 'Sync your schedule with Google Calendar',
    [PRO_FEATURES.INVOICE_CREATION]: 'Create and send professional invoices',
    [PRO_FEATURES.PROJECT_MILESTONES]: 'Manage complex projects with milestones',
    [PRO_FEATURES.BULK_AVAILABILITY]: 'Set availability for multiple days at once',
    [PRO_FEATURES.UNLIMITED_LEAD_UNLOCKS]: 'Unlock unlimited client leads each month',
    [PRO_FEATURES.TEAM_MANAGEMENT]: 'Manage your team and subcontractors',
    [PRO_FEATURES.SITE_CALENDAR]: 'Coordinate jobs across your whole team',
    [PRO_FEATURES.FIRST_CLAIM_LEADS]: 'See and claim leads before Pro users',
    [PRO_FEATURES.ADVANCED_ANALYTICS]: 'Detailed insights into your business performance',
    [PRO_FEATURES.PROFILE_BOOST]: 'Boosted visibility in search and listings',
  };
  return descriptions[feature];
}
