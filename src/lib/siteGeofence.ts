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
const DEFAULT_RADIUS_M = 150;

let initialised = false;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
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

    await BackgroundGeolocation.ready({
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

    // Geofence-only mode: the SDK sleeps until a boundary is crossed.
    await BackgroundGeolocation.startGeofences();
    initialised = true;
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
