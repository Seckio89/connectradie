import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/**
 * Public (non-secret) Google **Web** OAuth client ID — the same one configured
 * in the Supabase Google provider and used by the web redirect flow. The native
 * Capacitor plugin uses it as `serverClientId` so the ID token it returns has
 * the audience Supabase verifies in `signInWithIdToken`.
 *
 * ⚠️ This MUST exactly match the Web client ID in Google Cloud Console
 * (APIs & Services → Credentials) and the `serverClientId` in
 * capacitor.config.ts. Override at build time with VITE_GOOGLE_WEB_CLIENT_ID.
 */
export const GOOGLE_WEB_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined) ||
  '491568884460-unfmph1ckhu27ut9kh5b6cbgui02b6se.apps.googleusercontent.com';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the user backed out of the native Google picker (not a real error). */
export function isGoogleCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  // 12501 = Android SIGN_IN_CANCELLED; other strings cover web/iOS cancels.
  return /cancel|12501|popup_closed|closed the popup|user_cancel/i.test(msg);
}

/**
 * Native Google Sign-In for the Capacitor app.
 *
 * Google blocks OAuth from embedded WebViews (Error 403: disallowed_useragent),
 * so instead of the Supabase web redirect we open Google's native account
 * picker via the plugin, take the ID token it returns, and hand it to Supabase
 * via signInWithIdToken. Only call this when Capacitor.isNativePlatform().
 */
export async function signInWithGoogleNative(): Promise<void> {
  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');

  try {
    await GoogleAuth.initialize({
      clientId: GOOGLE_WEB_CLIENT_ID,
      scopes: ['profile', 'email'],
      grantOfflineAccess: false,
    });
  } catch {
    // initialize is safe to call repeatedly; ignore re-init noise.
  }

  const result = await GoogleAuth.signIn();
  const idToken = result?.authentication?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
}
