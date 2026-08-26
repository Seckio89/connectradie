// ─────────────────────────────────────────────────────────────────────────────
// Getting the tradie back into the app after Google consent.
//
// ⚠️ WHY THIS EXISTS. On the Android app, Google's consent page opens in a
// Chrome Custom Tab (Google rejects embedded WebViews with
// "Error 403: disallowed_useragent"). The OAuth callback then lands on the
// static page at /calendar-connected, whose only control was
// `<button onclick="window.close()">`. `window.close()` only works on a window
// that script opened, so in a Custom Tab it does nothing — and pressing back
// walks back up the OAuth chain rather than dismissing. The tradie was stranded
// on a page saying "Google Calendar connected" with no way back.
//
// THE CONSTRAINT. There is no deep link to come back through:
// AndroidManifest.xml declares only a MAIN/LAUNCHER intent-filter, the
// `custom_url_scheme` string is not wired to anything, and @capacitor/app is not
// installed. Adding any of that means a new APK and a Play review — while the
// app loads the REMOTE site (capacitor.config.ts `server.url`), so everything
// here reaches an already-installed app on the next web deploy.
//
// SO THE APP PULLS THE USER BACK instead of the page pushing them. The callback
// binds the tokens server-side, so while the Custom Tab is open we watch the
// tradie's own calendar_integrations row; the moment it changes, we call
// Browser.close() ourselves and the tab disappears.
//
// The decision logic is separated from Capacitor and the clock so it can be
// unit-tested — see calendarConnect.test.ts. Nothing here may run on a real
// device in CI, and "did it come back?" is exactly the kind of thing that
// silently regresses.
// ─────────────────────────────────────────────────────────────────────────────
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

/** How often to re-read the row while the consent tab is open. */
export const POLL_INTERVAL_MS = 2000;

/**
 * Give up watching after this long. Consent can legitimately take a while — a
 * password, then 2FA, then a scope screen — so this is generous. Giving up only
 * stops the polling; it never reports a failure, because the tradie may still
 * be mid-consent.
 */
export const POLL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Enough of the integration row to tell "something happened" from "nothing yet".
 *
 * `id` alone is not enough: reconnecting an existing integration updates the row
 * in place rather than creating a new one, so the id is unchanged. `updated_at`
 * alone is not enough either, because disconnect-then-reconnect creates a fresh
 * row whose `updated_at` could in principle read older than the one it replaced.
 * Both together cover it.
 */
export type ConnectionMarker = { id: string; updated_at: string } | null;

export type PollOutcome = 'connected' | 'cancelled' | 'timeout';

/** Did the OAuth callback land since we opened the consent page? */
export function connectionChanged(before: ConnectionMarker, after: ConnectionMarker): boolean {
  // Nothing stored yet — consent has not completed (or was declined).
  if (!after) return false;
  // Nothing there before, something there now: a first connection.
  if (!before) return true;
  return after.id !== before.id || after.updated_at !== before.updated_at;
}

/** Read the marker for one tradie. Returns null when no integration exists. */
export async function readConnectionMarker(tradieId: string): Promise<ConnectionMarker> {
  try {
    const { data, error } = await supabase
      .from('calendar_integrations')
      .select('id, updated_at')
      .eq('tradie_id', tradieId)
      .eq('provider', 'google')
      .maybeSingle();
    if (error) throw error;
    return (data as ConnectionMarker) ?? null;
  } catch (err) {
    // A failed read must not end the watch — the tab is still open and the next
    // tick may well succeed. Treat it as "nothing yet".
    console.error('Could not read calendar connection state:', err);
    return null;
  }
}

export interface PollDeps {
  readMarker: () => Promise<ConnectionMarker>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** True once the tradie has dismissed the consent tab themselves. */
  isCancelled: () => boolean;
}

export interface PollLimits {
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * Watch for the OAuth callback landing, and say why watching stopped.
 *
 * Checks cancellation before every read AND after every sleep, so dismissing the
 * tab stops the polling promptly instead of after one more round trip.
 */
export async function pollForConnection(
  before: ConnectionMarker,
  deps: PollDeps,
  limits: PollLimits = {},
): Promise<PollOutcome> {
  const intervalMs = limits.intervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = limits.timeoutMs ?? POLL_TIMEOUT_MS;
  const startedAt = deps.now();

  for (;;) {
    if (deps.isCancelled()) return 'cancelled';

    const after = await deps.readMarker();
    if (connectionChanged(before, after)) return 'connected';

    if (deps.now() - startedAt >= timeoutMs) return 'timeout';

    await deps.sleep(intervalMs);
    if (deps.isCancelled()) return 'cancelled';
  }
}

/** True on the Capacitor app, false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export interface NativeConsentOptions {
  authUrl: string;
  tradieId: string;
  /** Re-read whatever the caller shows about the connection. The result is
   *  never used — typed loosely so callers can pass their fetch directly. */
  onSettled: () => unknown | Promise<unknown>;
  limits?: PollLimits;
}

/**
 * Open Google consent in the system browser and bring the tradie back.
 *
 * Resolves once the tab has been dealt with — connected and closed by us, or
 * dismissed by them — never while it is still on screen.
 */
export async function openGoogleConsentNative(opts: NativeConsentOptions): Promise<PollOutcome> {
  const before = await readConnectionMarker(opts.tradieId);

  // Register BEFORE opening: a very fast dismissal would otherwise be missed and
  // leave the poll running for its full three minutes.
  let dismissed = false;
  const sub = await Browser.addListener('browserFinished', () => {
    dismissed = true;
  });

  try {
    await Browser.open({ url: opts.authUrl });

    const outcome = await pollForConnection(
      before,
      {
        readMarker: () => readConnectionMarker(opts.tradieId),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
        isCancelled: () => dismissed,
      },
      opts.limits,
    );

    if (outcome === 'connected' && !dismissed) {
      try {
        await Browser.close();
      } catch (err) {
        // The tab may already be gone. Nothing to recover — the connection is
        // stored either way, and onSettled still runs below.
        console.error('Could not close the Google consent tab:', err);
      }
    }

    return outcome;
  } finally {
    await sub.remove();
    // Always re-read. On 'connected' it flips the UI; on 'cancelled' the tradie
    // may have completed consent and dismissed the tab before we noticed; on
    // 'timeout' it costs one query. Refreshing here rather than relying on the
    // browserFinished event keeps this off plugin internals — that event is only
    // demonstrably raised when the USER dismisses the tab.
    await opts.onSettled();
  }
}
