// ─────────────────────────────────────────────────────────────────────────────
// siteActivity.ts — turns raw geofence ENTER/EXIT events into an employer-facing
// timeline: per worker, per day, the sites they arrived at / left, how long they
// were on each, and the travel time + straight-line distance between sites.
//
// Source data comes from the `get_team_site_activity` RPC (see migration
// 20260707120000). We only ever have arrival/departure crossings — NOT the route
// — so distance is straight-line ("as the crow flies"), never real road km.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { calculateDistance } from '../hooks/useGeolocation';

/** One raw crossing row as returned by the RPC. */
interface RawEvent {
  tradie_id: string;
  tradie_name: string;
  employment_type: string;
  job_id: string;
  job_title: string | null;
  job_address: string | null;
  latitude: number | null;
  longitude: number | null;
  action: 'ENTER' | 'EXIT';
  occurred_at: string;
}

export interface SiteVisit {
  jobId: string;
  jobTitle: string | null;
  jobAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  arrivedAt: string;
  /** null = arrived but not yet left (still on site). */
  leftAt: string | null;
  /** milliseconds on site, or null while still on site. */
  durationMs: number | null;
}

export interface TravelLeg {
  fromJobTitle: string | null;
  toJobTitle: string | null;
  departedAt: string;
  arrivedAt: string;
  travelMs: number;
  /** Straight-line distance between the two sites, km. null if coords missing. */
  straightLineKm: number | null;
}

export interface WorkerDayActivity {
  /** yyyy-mm-dd in the viewer's local timezone. */
  date: string;
  visits: SiteVisit[];
  legs: TravelLeg[];
  totalOnSiteMs: number;
}

export interface WorkerSiteActivity {
  tradieId: string;
  tradieName: string;
  employmentType: string;
  days: WorkerDayActivity[];
}

/** yyyy-mm-dd for the local day of an ISO timestamp. */
function localDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pair a single worker's chronological events into visits. Handles interleaved
 * geofences (multiple sites open at once) by tracking an open ENTER per job.
 */
function pairVisits(events: RawEvent[]): SiteVisit[] {
  const open = new Map<string, RawEvent>();
  const visits: SiteVisit[] = [];

  for (const ev of events) {
    if (ev.action === 'ENTER') {
      // A second ENTER without an EXIT: close the previous as open-ended first.
      if (open.has(ev.job_id)) {
        const prev = open.get(ev.job_id)!;
        visits.push(makeVisit(prev, null));
      }
      open.set(ev.job_id, ev);
    } else {
      // EXIT — close a matching open ENTER, else ignore (orphan exit).
      const enter = open.get(ev.job_id);
      if (enter) {
        visits.push(makeVisit(enter, ev));
        open.delete(ev.job_id);
      }
    }
  }

  // Any still-open ENTERs = worker currently on site.
  for (const enter of open.values()) {
    visits.push(makeVisit(enter, null));
  }

  return visits.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
}

function makeVisit(enter: RawEvent, exit: RawEvent | null): SiteVisit {
  const arrivedAt = enter.occurred_at;
  const leftAt = exit?.occurred_at ?? null;
  return {
    jobId: enter.job_id,
    jobTitle: enter.job_title,
    jobAddress: enter.job_address,
    latitude: enter.latitude,
    longitude: enter.longitude,
    arrivedAt,
    leftAt,
    durationMs: leftAt ? new Date(leftAt).getTime() - new Date(arrivedAt).getTime() : null,
  };
}

/** Travel legs between consecutive completed visits (departed A → arrived B). */
function buildLegs(visits: SiteVisit[]): TravelLeg[] {
  const legs: TravelLeg[] = [];
  for (let i = 0; i < visits.length - 1; i++) {
    const from = visits[i];
    const to = visits[i + 1];
    if (!from.leftAt) continue; // never left the first site → no leg
    const km =
      from.latitude != null && from.longitude != null && to.latitude != null && to.longitude != null
        ? calculateDistance(from.latitude, from.longitude, to.latitude, to.longitude)
        : null;
    legs.push({
      fromJobTitle: from.jobTitle,
      toJobTitle: to.jobTitle,
      departedAt: from.leftAt,
      arrivedAt: to.arrivedAt,
      travelMs: new Date(to.arrivedAt).getTime() - new Date(from.leftAt).getTime(),
      straightLineKm: km,
    });
  }
  return legs;
}

/** Fetch + shape the calling employer's team site activity for the last N days. */
export async function fetchTeamSiteActivity(sinceDays = 30): Promise<WorkerSiteActivity[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc('get_team_site_activity', { p_since: since });
  if (error) throw error;

  const rows = (data as RawEvent[]) ?? [];

  // Group by worker.
  const byTradie = new Map<string, RawEvent[]>();
  for (const row of rows) {
    const list = byTradie.get(row.tradie_id) ?? [];
    list.push(row);
    byTradie.set(row.tradie_id, list);
  }

  const workers: WorkerSiteActivity[] = [];
  for (const [tradieId, events] of byTradie) {
    const visits = pairVisits(events);

    // Group visits (and their outbound leg) by local day of arrival.
    const legs = buildLegs(visits);
    const legByDeparture = new Map<string, TravelLeg>();
    for (const leg of legs) legByDeparture.set(leg.departedAt, leg);

    const dayMap = new Map<string, WorkerDayActivity>();
    for (const visit of visits) {
      const key = localDateKey(visit.arrivedAt);
      const day =
        dayMap.get(key) ?? { date: key, visits: [], legs: [], totalOnSiteMs: 0 };
      day.visits.push(visit);
      if (visit.durationMs) day.totalOnSiteMs += visit.durationMs;
      // Attach the leg that departs from this visit (same day as departure).
      if (visit.leftAt && legByDeparture.has(visit.leftAt)) {
        day.legs.push(legByDeparture.get(visit.leftAt)!);
      }
      dayMap.set(key, day);
    }

    workers.push({
      tradieId,
      tradieName: events[0].tradie_name,
      employmentType: events[0].employment_type,
      days: [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  return workers.sort((a, b) => a.tradieName.localeCompare(b.tradieName));
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/** "3h 12m", "47m", "—" while still on site (null). */
export function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** "8:58am" in local time. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Wed 8 Jul" in local time. */
export function formatDayLabel(dateKey: string): string {
  // dateKey is yyyy-mm-dd (local); append time to avoid UTC parsing shift.
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}
