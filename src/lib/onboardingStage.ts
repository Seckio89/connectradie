// ─────────────────────────────────────────────────────────────────────────────
// onboardingStage — helpers for the progressive onboarding stages.
//
//   1 = brand new (no basic info)   → welcome screen
//   2 = basic info done             → simplified 2-card dashboard
//   3 = first key action done       → full dashboard + getting-started card
//   4 = fully onboarded             → full dashboard, no card
//
// resolveStage() computes the stage a user's DATA justifies; it is only ever used
// to ADVANCE a user (max of current and resolved), never to downgrade — so an
// existing user with clients/jobs is auto-advanced and never re-onboarded.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type { Profile } from '../types/database';

export const FULL_STAGE = 4;

export async function setOnboardingStage(userId: string, stage: number): Promise<void> {
  try {
    await supabase.from('profiles').update({ onboarding_stage: stage }).eq('id', userId);
  } catch {
    /* non-fatal — the gate re-resolves next load */
  }
}

export interface OnboardingSignals {
  hasBasicInfo: boolean;
  hasClient: boolean;
  hasAvailability: boolean;
  hasJob: boolean;
}

export function resolveStage(role: Profile['role'], s: OnboardingSignals): number {
  if (role === 'tradie') {
    if (s.hasAvailability || s.hasJob) return 4;
    if (s.hasClient) return 3;
    if (s.hasBasicInfo) return 2;
    return 1;
  }
  // client — no separate "almost there" stage; a posted job means fully set up.
  if (s.hasJob) return 4;
  if (s.hasBasicInfo) return 2;
  return 1;
}

/** Basic-info completeness: name + trade for tradies, name + location for clients. */
export function hasBasicInfo(profile: Profile): boolean {
  const name = !!profile.full_name?.trim();
  if (profile.role === 'tradie') {
    const trade = (profile.declared_trades?.length ?? 0) > 0;
    return name && trade;
  }
  const location = !!(profile.address || profile.suburb || profile.postcode);
  return name && location;
}

const countOf = (res: { count: number | null } | { count?: number | null }): number =>
  (res as { count: number | null }).count ?? 0;

/** Fetch the data signals used to resolve a user's true onboarding stage. */
export async function fetchOnboardingSignals(profile: Profile): Promise<OnboardingSignals> {
  const userId = profile.id;
  const isTradie = profile.role === 'tradie';

  const clientQ = isTradie
    ? supabase.from('client_contacts').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
    : Promise.resolve({ count: 0 });
  const availQ = isTradie
    ? supabase.from('availability_slots').select('id', { count: 'exact', head: true }).eq('tradie_id', userId).eq('status', 'available')
    : Promise.resolve({ count: 0 });
  const jobQ = isTradie
    ? supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('tradie_id', userId)
    : supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('client_id', userId);

  const [clientRes, availRes, jobRes] = await Promise.all([clientQ, availQ, jobQ]);

  return {
    hasBasicInfo: hasBasicInfo(profile),
    hasClient: countOf(clientRes) > 0,
    hasAvailability: countOf(availRes) > 0,
    hasJob: countOf(jobRes) > 0,
  };
}
