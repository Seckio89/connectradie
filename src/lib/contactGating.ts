import { supabase } from './supabase';

const DAILY_VIEW_LIMIT = 5;

export function redactName(fullName: string | null | undefined): string {
  if (!fullName) return 'Tradie';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export function extractSuburb(address: string | null | undefined): string {
  if (!address) return '';

  const parts = address.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    const secondLast = parts[parts.length - 2];
    const statePostcodePattern = /^[A-Z]{2,3}\s+\d{4}$/;
    if (statePostcodePattern.test(secondLast) && parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return secondLast;
  }

  const stateMatch = address.match(/(.+?)\s+(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}/i);
  if (stateMatch) {
    const beforeState = stateMatch[1].trim();
    const subParts = beforeState.split(',');
    return subParts[subParts.length - 1].trim();
  }

  return parts[0];
}

export async function recordProfileView(viewerId: string, tradieId: string): Promise<void> {
  await supabase
    .from('profile_views')
    .insert({ viewer_id: viewerId, tradie_id: tradieId });
}

export async function getDailyViewCount(viewerId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_daily_profile_view_count', { viewer_uuid: viewerId });

  if (error) return 0;
  return data ?? 0;
}

export async function hasEngagement(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('has_user_engagement', { user_uuid: userId });

  if (error) return false;
  return data ?? false;
}

export async function canViewProfile(userId: string): Promise<boolean> {
  const engaged = await hasEngagement(userId);
  if (engaged) return true;

  const count = await getDailyViewCount(userId);
  return count < DAILY_VIEW_LIMIT;
}

export function getRemainingViews(dailyCount: number): number {
  return Math.max(0, DAILY_VIEW_LIMIT - dailyCount);
}

export const DAILY_VIEW_LIMIT_VALUE = DAILY_VIEW_LIMIT;
