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
  '491568884460-unfmph1ckhu227ut9kh5b6cbgui028se.apps.googleusercontent.com';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Native Google Sign-In needs out-of-code setup before it works, so the
 * "Continue with Google" button is HIDDEN on the Capacitor app until it's ready
 * — otherwise mobile users see a Google option that fails. Web is unaffected.
 *
 * To turn it on, complete ALL of these, then set VITE_NATIVE_GOOGLE_ENABLED=true
 * and redeploy the web app + rebuild the APK:
 *   1. Google Cloud Console → Credentials → an **Android** OAuth client with
 *      package `com.connectradie.app` and the app's SHA-1 fingerprint
 *      (debug for testing; the Play App Signing SHA-1 for release).
 *   2. GOOGLE_WEB_CLIENT_ID above (and serverClientId in capacitor.config.ts +
 *      server_client_id in android strings.xml) = the **Web** OAuth client ID.
 *   3. Supabase → Authentication → Providers → Google: enabled, with that Web
 *      client ID + secret, and the Web client ID added to "Authorized Client IDs".
 *   4. `npx cap sync android` + rebuild the Android app (it's a native plugin).
 */
export const NATIVE_GOOGLE_SIGNIN_ENABLED =
  (import.meta.env.VITE_NATIVE_GOOGLE_ENABLED as string | undefined) === 'true';

/**
 * Show the "Continue with Google" button on web and native — native Google
 * Sign-In works now (correct Web client ID + Android OAuth client/SHA-1). If it
 * ever needs disabling on native again, return `!Capacitor.isNativePlatform()`.
 */
export function showGoogleSignIn(): boolean {
  return true;
}

/**
 * Pull the most useful detail out of a native/plugin error for on-screen
 * debugging — the plugin often nests a numeric code (e.g. 10 = DEVELOPER_ERROR,
 * 12500/12501) that pinpoints the failing piece far better than the message.
 */
export function describeAuthError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; errorMessage?: unknown };
    const parts = [e.code != null ? `code ${e.code}` : null, e.message ?? e.errorMessage]
      .filter(Boolean);
    if (parts.length) return parts.join(' — ');
    try { return JSON.stringify(err); } catch { /* ignore */ }
  }
  return String(err);
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
