// ─────────────────────────────────────────────────────────────────────────────
// useSiteGeofencing — keeps native background geofences in sync with the
// tradie's jobs. No-op on web / for non-tradies.
//
// Registers a geofence at:
//   • every job with a booked 'site_visit_scheduled' quote (pre-acceptance), and
//   • every ACTIVE job (accepted / funded / in_progress) — the auto check-in /
//     check-out path: crossing the boundary is reported natively to the
//     geofence-event edge function, which records the visit and notifies.
//
// Jobs that have an address but no coordinates are geocoded once (Google
// Geocoding REST with the app's Maps key) and the coordinates persisted.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  isNativeApp,
  initSiteGeofencing,
  syncSiteGeofences,
  notifyGeofenceActiveOnce,
  type GeofenceSite,
} from '../lib/siteGeofence';

interface ScheduledVisitRow {
  id: string;
  job_id: string;
  status: string;
  jobs: {
    id: string;
    latitude: number | null;
    longitude: number | null;
    geofence_radius_m: number | null;
  } | null;
}

interface ActiveJobRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number | null;
  location_address: string | null;
}

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Geocode an address once and persist the coords on the job. Best-effort. */
async function geocodeJob(job: ActiveJobRow): Promise<{ lat: number; lng: number } | null> {
  if (!MAPS_KEY || !job.location_address) return null;
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(job.location_address)}&region=au&key=${MAPS_KEY}`,
    );
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number') return null;
    await supabase.from('jobs').update({ latitude: loc.lat, longitude: loc.lng }).eq('id', job.id);
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

export function useSiteGeofencing(hasConsent: boolean): void {
  const { user, profile } = useAuth();
  const role = profile?.role;

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!user || role !== 'tradie') return;
    // Prominent-disclosure gate: never request the OS "Always" permission until
    // the user has accepted the in-app disclosure (SiteGeofenceConsent).
    if (!hasConsent) return;

    let cancelled = false;

    (async () => {
      const ready = await initSiteGeofencing(user.id);
      if (!ready || cancelled) return;

      const [{ data: visits }, { data: active }] = await Promise.all([
        supabase
          .from('quotes')
          .select('id, job_id, status, jobs!inner(id, latitude, longitude, geofence_radius_m)')
          .eq('tradie_id', user.id)
          .eq('status', 'site_visit_scheduled'),
        supabase
          .from('jobs')
          .select('id, latitude, longitude, geofence_radius_m, location_address')
          .eq('tradie_id', user.id)
          .in('status', ['accepted', 'funded', 'in_progress']),
      ]);
      if (cancelled) return;

      const sites: GeofenceSite[] = [];
      const covered = new Set<string>();

      for (const row of ((visits as unknown as ScheduledVisitRow[]) ?? [])) {
        const job = row.jobs;
        if (job && job.latitude != null && job.longitude != null) {
          sites.push({
            jobId: job.id,
            quoteId: row.id,
            latitude: job.latitude,
            longitude: job.longitude,
            radiusM: job.geofence_radius_m ?? 100,
          });
          covered.add(job.id);
        }
      }

      for (const job of ((active as ActiveJobRow[]) ?? [])) {
        if (covered.has(job.id)) continue;
        let lat = job.latitude;
        let lng = job.longitude;
        if ((lat == null || lng == null) && job.location_address) {
          const geo = await geocodeJob(job);
          if (geo) { lat = geo.lat; lng = geo.lng; }
        }
        if (lat == null || lng == null) continue;
        sites.push({
          jobId: job.id,
          // No quote behind an active-job fence — the job id doubles as the
          // geofence identifier (the edge fn only stores real quote uuids).
          quoteId: job.id,
          latitude: lat,
          longitude: lng,
          radiusM: job.geofence_radius_m ?? 100,
        });
      }

      if (cancelled) return;
      await syncSiteGeofences(sites);

      // First time a real geofence goes live → one-time reassurance toast.
      if (sites.length > 0) notifyGeofenceActiveOnce();
    })();

    return () => {
      cancelled = true;
    };
  }, [user, role, hasConsent]);
}
