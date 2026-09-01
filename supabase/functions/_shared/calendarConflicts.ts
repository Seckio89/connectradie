// Deciding what a Google Calendar clash does to an availability slot.
//
// ⚠️ This is the logic that destroyed a tradie's entire availability on
// 2026-06-13. The sync had just started exporting every open slot into Google
// as "✅ Available — ConnecTradie"; the conflict check read those events back,
// saw them overlapping the slots that produced them, and deleted the lot.
// Deletion was removed outright eight minutes later (7373a89) rather than trust
// the title filter added two minutes before it — correctly, because that filter
// matched on a summary the tradie can edit in Google.
//
// Two things keep that from recurring, and only one of them is here:
//
//   1. The caller reads busy intervals from the FreeBusy API, which ignores
//      events marked transparent — and every availability block we export is
//      transparent. Our own events therefore cannot come back to us as busy.
//      That is upstream of this file and is the real guarantee.
//   2. Nothing below deletes anything. There is no delete bucket, and adding
//      one is not a change this system makes. A clash BLOCKS a slot and stamps
//      it; when the commitment goes away the stamp is what lets the next sync
//      hand the slot straight back.
//
// Split out of the edge function so it can be tested: supabase/functions/ is
// outside `npm run typecheck` and Deno's own checker needs jsr, so a pure
// module imported by a vitest test is the only way this gets executed
// verification at all. See src/lib/__tests__/calendarConflicts.test.ts.

/** A busy window from Google, as epoch milliseconds. */
export interface BusyInterval {
  start: number;
  end: number;
}

/** The slot columns the decision actually reads. */
export interface ConflictSlot {
  id: string;
  start_time: string;
  end_time: string;
  status: string | null;
  calendar_event_id: string | null;
  external_conflict_at: string | null;
}

export interface ConflictPlan {
  /** Slots overlapping a commitment, whatever state they are in. Reported, not acted on. */
  conflictCount: number;
  /** Open slots to block and stamp. Carries calendar_event_id so the caller can retract the Google event. */
  toBlock: ConflictSlot[];
  /** Slots we blocked whose commitment has gone — hand them back. */
  toRelease: string[];
  /** Slots carrying a stale stamp that have since moved on. Drop the stamp, leave the state. */
  toUnstamp: string[];
}

/** Half-open interval intersection. Touching edges do not overlap. */
export function overlapsBusy(startMs: number, endMs: number, busy: readonly BusyInterval[]): boolean {
  return busy.some((b) => b.start < endMs && b.end > startMs);
}

/** The window a job occupies in Google Calendar, as the export synthesises it. */
export interface JobEventWindow {
  /** RFC3339 strings the export sends to Google, hardcoded +10:00. */
  startDateTime: string;
  endDateTime: string;
  /** The same window as epoch ms. NaN when the inputs do not parse — callers
   *  comparing intervals must skip NaN; the export sends the strings regardless
   *  and lets Google refuse them, exactly as it did before this helper. */
  startMs: number;
  endMs: number;
}

/**
 * Synthesise the busy window of an exported job event from the job row.
 *
 * A job has no end time in Google terms: the export invents one — start plus
 * two hours, at a fixed +10:00 offset — and that invention is what FreeBusy
 * later reads back as a busy interval that blocks the tradie's own slots. The
 * dashboard labels such a block "you have a job booked then" by rebuilding this
 * exact window and testing overlap, so the synthesis lives here, shared,
 * where the exporter and the label cannot drift apart.
 */
export function jobEventWindow(scheduledDate: string, startTime: string | null): JobEventWindow {
  const [rawHour = '09', rawMin = '00'] = startTime ? startTime.split(':') : [];
  const startHour = rawHour.padStart(2, '0');
  const startMin = rawMin.padStart(2, '0');
  const startDateTime = `${scheduledDate}T${startHour}:${startMin}:00+10:00`;
  const endHour = String(Number(startHour) + 2).padStart(2, '0');
  const endDateTime = `${scheduledDate}T${endHour}:${startMin}:00+10:00`;
  return {
    startDateTime,
    endDateTime,
    startMs: new Date(startDateTime).getTime(),
    endMs: new Date(endDateTime).getTime(),
  };
}

/**
 * Work out what each slot's clash state means, without changing anything.
 *
 * The rules, and why each one is narrow:
 *
 *  - Block only what is currently `available`. A `booked` slot is a commitment
 *    already made — surfacing the clash is right, silently withdrawing it is
 *    not. A slot the tradie blocked by hand is already blocked.
 *  - Release only a slot that is BOTH stamped and still `blocked`. A stamped
 *    slot that has since been booked must never be flipped back to available:
 *    that would clobber a real booking on a later sync.
 *  - A stamped slot in any other state just loses its stamp.
 *
 * A slot lands in at most one bucket.
 */
export function planConflictChanges(
  slots: readonly ConflictSlot[],
  busy: readonly BusyInterval[]
): ConflictPlan {
  const plan: ConflictPlan = { conflictCount: 0, toBlock: [], toRelease: [], toUnstamp: [] };

  for (const slot of slots) {
    const start = new Date(slot.start_time).getTime();
    const end = new Date(slot.end_time).getTime();
    // A slot with unreadable times cannot be reasoned about. Leaving it alone is
    // the only safe answer — blocking it would remove availability on the
    // strength of a parse failure.
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    if (overlapsBusy(start, end, busy)) {
      plan.conflictCount++;
      if (slot.status === 'available') plan.toBlock.push(slot);
      continue;
    }

    if (slot.external_conflict_at) {
      if (slot.status === 'blocked') plan.toRelease.push(slot.id);
      else plan.toUnstamp.push(slot.id);
    }
  }

  return plan;
}
