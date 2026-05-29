import { useEffect, useState } from 'react';
import { getSignedUrl, getSignedUrls, type StorageBucket } from '../lib/storage';

/**
 * Resolve a single stored path/URL to a signed URL. Returns null while
 * loading or on failure — render a placeholder accordingly.
 *
 * Re-fetches when the value or bucket changes. Re-fetches after `expiresIn`
 * to avoid serving expired URLs in long-lived sessions.
 */
export function useSignedUrl(
  bucket: StorageBucket,
  value: string | null | undefined,
  expiresIn = 3600,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getSignedUrl(bucket, value, expiresIn).then(u => {
      if (!cancelled) setUrl(u);
    });
    // Auto-refresh just before expiry so long-lived views don't break.
    // We refresh at 80% of the expiry window.
    const refreshMs = expiresIn * 1000 * 0.8;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      getSignedUrl(bucket, value, expiresIn).then(u => {
        if (!cancelled) setUrl(u);
      });
    }, refreshMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bucket, value, expiresIn]);

  return url;
}

/**
 * Resolve an array of stored paths/URLs to signed URLs in one bulk request.
 * Order matches input. Returns an array of (string | null), same length as
 * input.
 */
export function useSignedUrls(
  bucket: StorageBucket,
  values: (string | null | undefined)[] | null | undefined,
  expiresIn = 3600,
): (string | null)[] {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  // Stringify the array for stable dependency comparison; small arrays only.
  const key = values ? values.join('|') : '';

  useEffect(() => {
    if (!values || values.length === 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    getSignedUrls(bucket, values, expiresIn).then(result => {
      if (!cancelled) setUrls(result);
    });
    const refreshMs = expiresIn * 1000 * 0.8;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      getSignedUrls(bucket, values, expiresIn).then(result => {
        if (!cancelled) setUrls(result);
      });
    }, refreshMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, key, expiresIn]);

  return urls;
}
