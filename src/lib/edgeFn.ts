import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Returns auth headers using the current user's session token.
 * Forces a token refresh to ensure the token is not expired.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  // Always refresh to get a valid, non-expired token
  const { data: { session }, error } = await supabase.auth.refreshSession();
  if (error || !session?.access_token) {
    // Fallback: try cached session (may still be valid)
    const { data: { session: cached } } = await supabase.auth.getSession();
    if (!cached?.access_token) {
      throw new Error('Your session has expired. Please sign in again.');
    }
    return {
      'Authorization': `Bearer ${cached.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
  }
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };
}

/**
 * Call a Supabase Edge Function with proper auth.
 * Uses raw fetch with a freshly-refreshed token to guarantee the gateway accepts it.
 */
export async function callEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  // Always refresh to get a guaranteed-valid token for edge functions
  const { data: { session: refreshed } } = await supabase.auth.refreshSession();
  let token = refreshed?.access_token;

  if (!token) {
    // Fallback to cached session
    const { data: { session: cached } } = await supabase.auth.getSession();
    token = cached?.access_token;
  }

  if (!token) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(text || `Server error (${response.status})`);
  }

  if (!response.ok) {
    const parsed = data as Record<string, unknown>;
    const errorMessage = typeof parsed?.error === 'string'
      ? parsed.error
      : typeof parsed?.message === 'string'
      ? parsed.message
      : typeof parsed?.msg === 'string'
      ? parsed.msg
      : null;
    const errorCode = typeof parsed?.error_code === 'string' ? parsed.error_code : undefined;
    const err = new Error(
      errorMessage || `Edge function "${functionName}" failed (${response.status})`
    );
    if (errorCode) {
      (err as Error & { code?: string }).code = errorCode;
    }
    throw err;
  }

  return data;
}
