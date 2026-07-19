// ─────────────────────────────────────────────────────────────────────────────
// jobTracking.ts — per-job geo-tracking data for the tracking screen.
//
// Pulls the job's site meta + geofence crossings via SECURITY DEFINER RPCs
// (get_job_tracking_meta / get_job_site_visits — authorised for the worker, the
// business owner and the client), pairs ENTER/EXIT into visits, and builds the
// compact Google Static Map (site + geofence circle + check-in/out markers).
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export interface TrackMeta {
  title: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  clientId: string | null;
  ownerId: string | null;
}

interface RawCrossing {
  tradie_id: string;
  tradie_name: string;
  action: 'ENTER' | 'EXIT';
  occurred_at: string;
  latitude: number | null;
  longitude: number | null;
}

export interface TrackVisit {
  workerId: string;
  workerName: string;
  arrivedAt: string;
  leftAt: string | null; // null = still on site
  durationMs: number | null;
  inLat: number | null;
  inLng: number | null;
  outLat: number | null;
  outLng: number | null;
}

export interface TrackWorker {
  workerId: string;
  workerName: string;
  visits: TrackVisit[];
  totalMs: number;
  onSiteNow: boolean;
}

export interface JobTracking {
  meta: TrackMeta;
  visits: TrackVisit[];      // all, newest first
  workers: TrackWorker[];    // grouped, sorted by name
  onSiteNow: boolean;
  hasAnyVisit: boolean;
}

/** Pair one worker's chronological crossings into visits (handles orphans). */
function pairWorker(rows: RawCrossing[]): TrackVisit[] {
  const visits: TrackVisit[] = [];
  let open: RawCrossing | null = null;
  for (const r of rows) {
    if (r.action === 'ENTER') {
      if (open) visits.push(makeVisit(open, null)); // ENTER without EXIT
      open = r;
    } else if (open) {
      visits.push(makeVisit(open, r));
      open = null;
    }
  }
  if (open) visits.push(makeVisit(open, null));
  return visits;
}

function makeVisit(enter: RawCrossing, exit: RawCrossing | null): TrackVisit {
  const leftAt = exit?.occurred_at ?? null;
  return {
    workerId: enter.tradie_id,
    workerName: enter.tradie_name,
    arrivedAt: enter.occurred_at,
    leftAt,
    durationMs: leftAt ? new Date(leftAt).getTime() - new Date(enter.occurred_at).getTime() : null,
    inLat: enter.latitude, inLng: enter.longitude,
    outLat: exit?.latitude ?? null, outLng: exit?.longitude ?? null,
  };
}

export async function fetchJobTracking(jobId: string): Promise<JobTracking | null> {
  const [{ data: metaRows }, { data: visitRows }] = await Promise.all([
    supabase.rpc('get_job_tracking_meta', { p_job_id: jobId }),
    supabase.rpc('get_job_site_visits', { p_job_id: jobId }),
  ]);

  const m = (Array.isArray(metaRows) ? metaRows[0] : metaRows) as
    | { title: string | null; address: string | null; latitude: number | null; longitude: number | null; radius_m: number | null; client_id: string | null; owner_id: string | null }
    | undefined;
  if (!m) return null; // not authorised / no such job

  const meta: TrackMeta = {
    title: m.title, address: m.address,
    latitude: m.latitude, longitude: m.longitude,
    radiusM: m.radius_m ?? 150, clientId: m.client_id, ownerId: m.owner_id,
  };

  const rows = ((visitRows as RawCrossing[] | null) ?? []).filter((r) => r.action === 'ENTER' || r.action === 'EXIT');

  const byWorker = new Map<string, RawCrossing[]>();
  for (const r of rows) {
    const list = byWorker.get(r.tradie_id) ?? [];
    list.push(r);
    byWorker.set(r.tradie_id, list);
  }

  const workers: TrackWorker[] = [];
  const all: TrackVisit[] = [];
  for (const [, list] of byWorker) {
    const visits = pairWorker(list);
    all.push(...visits);
    const totalMs = visits.reduce((s, v) => s + (v.durationMs ?? 0), 0);
    const onSiteNow = visits.some((v) => v.leftAt == null);
    workers.push({ workerId: list[0].tradie_id, workerName: list[0].tradie_name, visits: visits.slice().reverse(), totalMs, onSiteNow });
  }

  all.sort((a, b) => b.arrivedAt.localeCompare(a.arrivedAt));
  workers.sort((a, b) => a.workerName.localeCompare(b.workerName));

  return {
    meta,
    visits: all,
    workers,
    onSiteNow: all.some((v) => v.leftAt == null),
    hasAnyVisit: all.length > 0,
  };
}

// ── Static map ───────────────────────────────────────────────────────────────

/** Points approximating a circle of radiusM around (lat,lng) for a Static Maps path. */
function circlePoints(lat: number, lng: number, radiusM: number, n = 32): string[] {
  const pts: string[] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push(`${(lat + dLat * Math.sin(a)).toFixed(6)},${(lng + dLng * Math.cos(a)).toFixed(6)}`);
  }
  return pts;
}

/**
 * Compact Google Static Map: geofence circle around the site, a site marker,
 * and up to a few recent check-in (green) / check-out (red) markers. Returns
 * null when no key or no coordinates.
 */
export function staticMapUrl(meta: TrackMeta, visits: TrackVisit[], width = 640, height = 280): string | null {
  if (!MAPS_KEY || meta.latitude == null || meta.longitude == null) return null;
  const lat = meta.latitude, lng = meta.longitude;

  const params: string[] = [
    `size=${width}x${height}`,
    'scale=2',
    `path=${encodeURIComponent(`fillcolor:0x2E86DE22|color:0x2E86DEAA|weight:2|${circlePoints(lat, lng, meta.radiusM).join('|')}`)}`,
    `markers=${encodeURIComponent(`color:0x2E86DE|label:S|${lat},${lng}`)}`,
  ];

  // Most recent few crossings with coordinates.
  const recent = visits.slice(0, 4);
  for (const v of recent) {
    if (v.inLat != null && v.inLng != null) {
      params.push(`markers=${encodeURIComponent(`color:0x06D6A0|label:I|${v.inLat},${v.inLng}`)}`);
    }
    if (v.outLat != null && v.outLng != null) {
      params.push(`markers=${encodeURIComponent(`color:0xEF4444|label:O|${v.outLat},${v.outLng}`)}`);
    }
  }

  params.push(`key=${MAPS_KEY}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`;
}
