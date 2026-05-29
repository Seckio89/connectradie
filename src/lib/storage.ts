// Storage path/URL helpers. The codebase has historically stored full public
// URLs in DB columns like `profiles.documents_url` and `jobs.images_url`.
// We're migrating to store PATHS only, then resolve to signed URLs at render
// time — this lets us flip the buckets private without breaking existing data.
//
// Every helper here is back-compat: it accepts either a stored path or a
// legacy public URL and resolves the same way. A SQL backfill converts
// existing rows from URLs to paths but is not required for correctness.

import { supabase } from './supabase';

export type StorageBucket = 'documents' | 'job-attachments' | 'verification-documents' | 'avatars' | 'cover-photos' | 'job-images' | 'job-photos' | 'portfolio-images';

const DEFAULT_EXPIRES_SECONDS = 60 * 60; // 1 hour — long enough for a session, short enough that leaked URLs go stale fast

/**
 * Extract the in-bucket path from a stored value that might be either a full
 * public URL (legacy) or already a path (new format). Returns the input
 * unchanged if it looks like a path already.
 */
export function pathFromValue(value: string, bucket: StorageBucket): string {
  if (!value) return value;
  if (!value.startsWith('http')) return value;
  // Public URL format:
  //   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // Signed URL format (legacy stored, unlikely but handle anyway):
  //   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ];
  for (const m of markers) {
    const idx = value.indexOf(m);
    if (idx !== -1) {
      const after = value.slice(idx + m.length);
      // Strip query string from signed URLs
      const q = after.indexOf('?');
      return q === -1 ? after : after.slice(0, q);
    }
  }
  return value;
}

/**
 * Resolve a single stored value (path or legacy URL) to a fresh signed URL.
 * Returns null on failure — callers should handle the broken-image fallback.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  value: string | null | undefined,
  expiresIn: number = DEFAULT_EXPIRES_SECONDS,
): Promise<string | null> {
  if (!value) return null;
  const path = pathFromValue(value, bucket);
  if (!path) return null;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Batch resolve multiple stored values. Uses Supabase's bulk endpoint where
 * possible (`createSignedUrls`). Order of results matches the input array;
 * entries that fail to sign resolve to null.
 */
export async function getSignedUrls(
  bucket: StorageBucket,
  values: (string | null | undefined)[],
  expiresIn: number = DEFAULT_EXPIRES_SECONDS,
): Promise<(string | null)[]> {
  if (!values || values.length === 0) return [];
  const paths = values.map(v => (v ? pathFromValue(v, bucket) : ''));
  // Filter out empties to call the bulk endpoint, keep a mapping back to indices
  const nonEmpty = paths.map((p, i) => ({ p, i })).filter(x => !!x.p);
  if (nonEmpty.length === 0) return values.map(() => null);
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(nonEmpty.map(x => x.p), expiresIn);
    if (error || !data) return values.map(() => null);
    const result: (string | null)[] = values.map(() => null);
    data.forEach((entry, idx) => {
      const originalIndex = nonEmpty[idx]?.i;
      if (originalIndex != null) {
        result[originalIndex] = entry.signedUrl ?? null;
      }
    });
    return result;
  } catch {
    return values.map(() => null);
  }
}
