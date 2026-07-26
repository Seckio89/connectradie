import { supabase } from './supabase';
import type { Insert } from '../types/database';

/**
 * Writes to `profile_private` — the owner-or-admin-only sibling of `profiles`.
 *
 * `profiles` is readable by every signed-in user (its SELECT policy is
 * `auth.role() = 'authenticated'`), and several cross-user embeds pull it with
 * `profiles(*)`. Anything that must not be world-readable belongs here instead.
 */

/**
 * Persist a user's home-base coordinates.
 *
 * These are a HOME ADDRESS, so they live in profile_private rather than on
 * profiles. Every caller previously wrote them straight onto the profiles row.
 *
 * Upsert rather than update: a profile_private row is created lazily, so the
 * first write for a user has nothing to update.
 */
export async function saveBaseCoords(
  userId: string,
  lat: number | null,
  lng: number | null,
): Promise<{ error: Error | null }> {
  const payload: Insert<'profile_private'> = {
    profile_id: userId,
    base_latitude: lat,
    base_longitude: lng,
  };

  const { error } = await supabase
    .from('profile_private')
    .upsert(payload, { onConflict: 'profile_id' });

  return { error: error ? new Error(error.message) : null };
}
