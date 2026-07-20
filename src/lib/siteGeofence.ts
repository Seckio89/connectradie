// ─────────────────────────────────────────────────────────────────────────────
// siteGeofence.ts — native background geofencing for on-site arrival/departure.
//
// Uses @transistorsoft/capacitor-background-geolocation. Registers a circular
// geofence at each job the tradie has a scheduled site visit for; when the
// device crosses the boundary the plugin POSTs the crossing DIRECTLY from native
// code to the `geofence-event` edge function (its built-in HTTP layer), so it
// works even when the app is fully closed — critical because this app loads a
// remote URL and there's no live WebView to receive a JS callback.
//
// Everything here is a no-op on web (Capacitor.isNativePlatform() === false).
//
// Native setup that CANNOT be done here (see docs/native-geofencing-setup.md):
//   • purchase + set the Transistorsoft license key in AndroidManifest
//   • ACCESS_BACKGROUND_LOCATION permission + Play Store prominent disclosure
//   • `npx cap sync android` + Android Studio rebuild
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/** A job site to geofence. radius is metres (falls back to the job's geofence_radius_m). */
export interface GeofenceSite {
  jobId: string;
  quoteId: string;
  latitude: number;
  longitude: number;
  radiusM: number;
}

const TOKEN_CACHE_KEY = 'connectradie_geofence_token';
const CONSENT_KEY = 'connectradie_geofence_consent';
const DEFAULT_RADIUS_M = 100;

/** Fired (window CustomEvent) on a foreground geofence crossing so the UI can
 * react instantly — detail: { action: 'ENTER'|'EXIT', jobId?: string }. */
export const GEOFENCE_CROSSING_EVENT = 'geofence-crossing';
// After a "Not now", wait this long before showing the disclosure again.
const DISMISS_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

let initialised = false;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// ── Prominent-disclosure consent ─────────────────────────────────────────────
// Google Play requires an in-app disclosure the user affirmatively accepts
// BEFORE any background-location permission is requested. We record that consent
// per-device and never call the plugin (which requests "Always") until it's given.

/** Fired whenever consent changes, so mounted components (layout + Settings) resync. */
export const GEOFENCE_CONSENT_EVENT = 'geofence-consent-changed';

function writeConsent(status: 'granted' | 'dismissed' | 'revoked'): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ status, at: Date.now() }));
  } catch { /* storage unavailable — the OS permission prompt still gates access */ }
  try {
    window.dispatchEvent(new Event(GEOFENCE_CONSENT_EVENT));
  } catch { /* no window (SSR) — ignore */ }
}

/** True once the user has accepted the in-app background-location disclosure. */
export function hasGeofenceConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return !!raw && (JSON.parse(raw) as { status?: string }).status === 'granted';
  } catch {
    return false;
  }
}

/** Whether to auto-show the disclosure: never granted, and neither revoked nor recently dismissed. */
export function shouldPromptGeofenceDisclosure(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return true;
    const v = JSON.parse(raw) as { status?: string; at?: number };
    if (v.status === 'granted' || v.status === 'revoked') return false;
    if (v.status === 'dismissed' && typeof v.at === 'number') return Date.now() - v.at > DISMISS_SNOOZE_MS;
    return true;
  } catch {
    return true;
  }
}

export function grantGeofenceConsent(): void {
  writeConsent('granted');
}

export function dismissGeofenceDisclosure(): void {
  writeConsent('dismissed');
}

/** Explicit opt-out from Settings — turns the feature off and stops auto-prompting. */
export function revokeGeofenceConsent(): void {
  writeConsent('revoked');
}

// ── First-active reassurance toast ───────────────────────────────────────────
// The very first time geofencing actually goes live for a job, we reassure the
// tradie (once) that tracking is active + private. Broadcast → GeofenceActiveToast.
export const GEOFENCE_ACTIVE_EVENT = 'geofence-active-first';
const FIRST_ACTIVE_KEY = 'connectradie_geofence_first_active';

/** Fire the one-time "location tracking active" toast the first time it applies. */
export function notifyGeofenceActiveOnce(): void {
  try {
    if (localStorage.getItem(FIRST_ACTIVE_KEY)) return; // already shown on this device
    localStorage.setItem(FIRST_ACTIVE_KEY, String(Date.now()));
  } catch {
    return; // storage unavailable — skip rather than risk repeating every sync
  }
  try {
    window.dispatchEvent(new Event(GEOFENCE_ACTIVE_EVENT));
  } catch { /* no window — ignore */ }
}

/**
 * Get (or lazily create) this device's opaque geofence token, bound to the
 * current tradie. The token authenticates background POSTs to the edge function
 * long after any JWT would have expired. Regenerated if a different tradie logs
 * in on the same device.
 */
async function ensureDeviceToken(tradieId: string): Promise<string | null> {
  try {
    const cachedRaw = localStorage.getItem(TOKEN_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as { token: string; tradieId: string };
      if (cached.tradieId === tradieId && cached.token) return cached.token;
    }

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    const { error } = await supabase
      .from('device_geofence_tokens')
      .upsert({ token, tradie_id: tradieId }, { onConflict: 'token' });
    if (error) {
      console.error('siteGeofence: failed to store device token', error);
      return null;
    }

    localStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify({ token, tradieId }));
    return token;
  } catch (err) {
    console.error('siteGeofence: ensureDeviceToken failed', err);
    return null;
  }
}

/**
 * Configure the plugin once per app run. Points its HTTP layer at the
 * geofence-event edge function with the device token as an auth header, and
 * starts geofence-only monitoring (battery-friendly — no continuous tracking).
 */
export async function initSiteGeofencing(tradieId: string): Promise<boolean> {
  if (!isNativeApp() || initialised) return initialised;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) return false;

  const token = await ensureDeviceToken(tradieId);
  if (!token) return false;

  try {
    const { default: BackgroundGeolocation } = await import(
      '@transistorsoft/capacitor-background-geolocation'
    );

    const state = await BackgroundGeolocation.ready({
      desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
      distanceFilter: 50,
      // Keep running across app terminate / device reboot so a scheduled visit
      // still auto-checks-in even if the tradie force-quit the app.
      stopOnTerminate: false,
      startOnBoot: true,
      geofenceModeHighAccuracy: true,
      // Native HTTP → our edge function. httpRootProperty wraps the record as
      // { "location": <record> }, which the edge function expects.
      url: `${supabaseUrl}/functions/v1/geofence-event`,
      httpRootProperty: 'location',
      autoSync: true,
      headers: {
        'X-Geofence-Token': token,
        apikey: anonKey,
      },
      backgroundPermissionRationale: {
        title: 'Allow ConnecTradie to detect job-site arrivals?',
        message:
          'So we can automatically log when you arrive at and leave a booked job site, ' +
          'ConnecTradie needs location access all the time (even in the background).',
        positiveAction: 'Change to "Allow all the time"',
      },
      locationAuthorizationRequest: 'Always',
    });

    // ready() is the real initialisation signal — mark it done now so geofence
    // sync can proceed even if the startGeofences() call below no-ops.
    initialised = true;

    // Foreground crossings: surface immediately in the UI (toast + live screens)
    // without waiting for the server round-trip. Background crossings still go
    // native → edge function as before.
    try {
      BackgroundGeolocation.onGeofence((event: { action?: string; extras?: { job_id?: string } }) => {
        if (event.action !== 'ENTER' && event.action !== 'EXIT') return;
        try {
          window.dispatchEvent(new CustomEvent(GEOFENCE_CROSSING_EVENT, {
            detail: { action: event.action, jobId: event.extras?.job_id },
          }));
        } catch { /* no window */ }
      });
    } catch { /* listener is best-effort */ }

    // Geofence-only mode: the SDK sleeps until a boundary is crossed. Because
    // stopOnTerminate:false persists the started state, ready() often restores
    // an already-enabled SDK — calling startGeofences() again then rejects with
    // "Waiting for previous start action to complete". Only start when not
    // already enabled, and tolerate the race triggered by the permission flow.
    if (!state.enabled) {
      try {
        await BackgroundGeolocation.startGeofences();
      } catch (startErr) {
        console.warn('siteGeofence: startGeofences race (SDK already starting)', startErr);
      }
    }
    return true;
  } catch (err) {
    console.error('siteGeofence: init failed', err);
    return false;
  }
}

/**
 * Reconcile the device's active geofences to exactly `sites`. Adds new ones,
 * removes stale ones. Call whenever the tradie's set of scheduled site visits
 * changes. No-op on web.
 */
export async function syncSiteGeofences(sites: GeofenceSite[]): Promise<void> {
  if (!isNativeApp() || !initialised) return;

  try {
    const { default: BackgroundGeolocation } = await import(
      '@transistorsoft/capacitor-background-geolocation'
    );

    const desired = new Map(sites.map((s) => [s.quoteId, s]));

    const existing = await BackgroundGeolocation.getGeofences();
    const existingIds = new Set(existing.map((g) => g.identifier));

    // Remove geofences no longer wanted.
    const stale = existing.filter((g) => !desired.has(g.identifier)).map((g) => g.identifier);
    if (stale.length > 0) {
      await BackgroundGeolocation.removeGeofences(stale);
    }

    // Add geofences we don't already have.
    const toAdd = sites.filter((s) => !existingIds.has(s.quoteId));
    if (toAdd.length > 0) {
      await BackgroundGeolocation.addGeofences(
        toAdd.map((s) => ({
          identifier: s.quoteId,
          latitude: s.latitude,
          longitude: s.longitude,
          radius: Math.max(s.radiusM || DEFAULT_RADIUS_M, 100), // Android min ~100m
          notifyOnEntry: true,
          notifyOnExit: true,
          extras: { job_id: s.jobId, quote_id: s.quoteId },
        })),
      );
    }
  } catch (err) {
    console.error('siteGeofence: sync failed', err);
  }
}

/** Remove all site geofences (e.g. on logout). No-op on web. */
export async function clearSiteGeofences(): Promise<void> {
  if (!isNativeApp() || !initialised) return;
  try {
    const { default: BackgroundGeolocation } = await import(
      '@transistorsoft/capacitor-background-geolocation'
    );
    await BackgroundGeolocation.removeGeofences();
  } catch (err) {
    console.error('siteGeofence: clear failed', err);
  }
}
