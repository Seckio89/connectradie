// Which calendar-blocked slots are the tradie's own booked jobs?
//
// The sync exports booked jobs into Google as opaque events, and FreeBusy —
// which returns bare intervals, never titles — then reads those events back as
// busy and blocks the tradie's overlapping slots. From the dashboard both that
// and a genuinely personal Google entry looked identical: "Busy in Google
// Calendar". This module tells them apart without any new stored data: a
// blocked slot that overlaps one of the tradie's own booked jobs can truthfully
// be labelled "you have a job booked then", whatever FreeBusy actually matched.
//
// Deliberately client-side. `availability_slots` is SELECT-readable by every
// authenticated user, so persisting a conflict *source* on the row would
// publish it platform-wide; deriving the label from data the dashboard already
// loads keeps the fact on this tradie's screen only, and keeps it live rather
// than one sync stale.
import {
  jobEventWindow,
  overlapsBusy,
  type BusyInterval,
} from '../../supabase/functions/_shared/calendarConflicts.ts';

/** The statuses the sync exports to Google — the only jobs that can be the
 *  cause of a FreeBusy block. Mirrors the exporter's own query filter. */
const EXPORTED_JOB_STATUSES = new Set(['accepted', 'funded', 'in_progress']);

/** The slot columns the decision reads. AvailabilitySlot satisfies this. */
export interface ConflictLabelSlot {
  id: string;
  start_time: string;
  end_time: string;
  external_conflict_at: string | null;
}

/** The job columns the decision reads. A jobs row satisfies this. */
export interface ConflictLabelJob {
  status: string | null;
  scheduled_date: string | null;
  start_time: string | null;
}

/**
 * The ids of calendar-blocked slots that overlap one of the tradie's own
 * booked jobs, rebuilt through the same window synthesis the export uses
 * (`jobEventWindow`) so the attribution cannot drift from what was exported.
 * Slots without `external_conflict_at`, jobs the export would not push, and
 * anything with unparseable times are all excluded.
 */
export function selfBookedConflictSlotIds(
  slots: readonly ConflictLabelSlot[],
  jobs: readonly ConflictLabelJob[],
): Set<string> {
  const ids = new Set<string>();

  const windows: BusyInterval[] = [];
  for (const job of jobs) {
    if (!job.status || !EXPORTED_JOB_STATUSES.has(job.status)) continue;
    if (!job.scheduled_date) continue;
    const { startMs, endMs } = jobEventWindow(job.scheduled_date, job.start_time);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    windows.push({ start: startMs, end: endMs });
  }
  if (windows.length === 0) return ids;

  for (const slot of slots) {
    if (!slot.external_conflict_at) continue;
    const start = new Date(slot.start_time).getTime();
    const end = new Date(slot.end_time).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (overlapsBusy(start, end, windows)) ids.add(slot.id);
  }
  return ids;
}
