// ─────────────────────────────────────────────────────────────────────────────
// useSiteGeofencing — keeps native background geofences in sync with the
// tradie's scheduled site visits. No-op on web / for non-tradies.
//
// On the Capacitor app it initialises the background-geolocation plugin, then
// registers a geofence at each job the tradie has a 'site_visit_scheduled'
// quote for (using the job's stored coordinates + geofence_radius_m). Crossing
// a boundary is reported natively to the geofence-event edge function.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  isNativeApp,
  initSiteGeofencing,
  syncSiteGeofences,
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

export function useSiteGeofencing(): void {
  const { user, profile } = useAuth();
  const role = profile?.role;

  useEffect(() => {
    if (!isNativeApp()) return;
    if (!user || role !== 'tradie') return;

    let cancelled = false;

    (async () => {
      const ready = await initSiteGeofencing(user.id);
      if (!ready || cancelled) return;

      const { data, error } = await supabase
        .from('quotes')
        .select('id, job_id, status, jobs!inner(id, latitude, longitude, geofence_radius_m)')
        .eq('tradie_id', user.id)
        .eq('status', 'site_visit_scheduled');

      if (error || !data || cancelled) return;

      const rows = data as unknown as ScheduledVisitRow[];
      const sites: GeofenceSite[] = [];
      for (const row of rows) {
        const job = row.jobs;
        if (job && job.latitude != null && job.longitude != null) {
          sites.push({
            jobId: job.id,
            quoteId: row.id,
            latitude: job.latitude,
            longitude: job.longitude,
            radiusM: job.geofence_radius_m ?? 150,
          });
        }
      }

      await syncSiteGeofences(sites);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, role]);
}
