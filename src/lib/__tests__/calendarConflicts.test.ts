import { describe, it, expect } from 'vitest';
import {
  overlapsBusy,
  planConflictChanges,
  type BusyInterval,
  type ConflictSlot,
} from '../../../supabase/functions/_shared/calendarConflicts.ts';

// The rules in calendarConflicts.ts exist because of a real incident: on
// 2026-06-13 the calendar sync deleted a tradie's entire availability, and
// deletion was ripped out eight minutes later. These assertions are the guard
// rail on the replacement. supabase/functions/ is outside `npm run typecheck`
// and Deno's checker cannot reach jsr here, so this file is the only place the
// logic is actually executed before it reaches a tradie's calendar.

const HOUR = 60 * 60 * 1000;
const T = (iso: string) => new Date(iso).getTime();

function slot(over: Partial<ConflictSlot> = {}): ConflictSlot {
  return {
    id: 'slot-1',
    start_time: '2026-09-01T09:00:00.000Z',
    end_time: '2026-09-01T11:00:00.000Z',
    status: 'available',
    calendar_event_id: null,
    external_conflict_at: null,
    ...over,
  };
}

const busyAt = (startIso: string, hours: number): BusyInterval => ({
  start: T(startIso),
  end: T(startIso) + hours * HOUR,
});

describe('overlapsBusy', () => {
  const busy = [busyAt('2026-09-01T10:00:00.000Z', 1)]; // 10:00–11:00

  it('detects a partial overlap at either end', () => {
    expect(overlapsBusy(T('2026-09-01T09:30:00.000Z'), T('2026-09-01T10:30:00.000Z'), busy)).toBe(true);
    expect(overlapsBusy(T('2026-09-01T10:30:00.000Z'), T('2026-09-01T11:30:00.000Z'), busy)).toBe(true);
  });

  it('detects containment in both directions', () => {
    expect(overlapsBusy(T('2026-09-01T08:00:00.000Z'), T('2026-09-01T12:00:00.000Z'), busy)).toBe(true);
    expect(overlapsBusy(T('2026-09-01T10:15:00.000Z'), T('2026-09-01T10:45:00.000Z'), busy)).toBe(true);
  });

  it('treats touching edges as free, not busy', () => {
    // A 09:00–10:00 slot against a 10:00–11:00 meeting is back-to-back, not a
    // clash. Getting this wrong blocks the slot either side of every booking.
    expect(overlapsBusy(T('2026-09-01T09:00:00.000Z'), T('2026-09-01T10:00:00.000Z'), busy)).toBe(false);
    expect(overlapsBusy(T('2026-09-01T11:00:00.000Z'), T('2026-09-01T12:00:00.000Z'), busy)).toBe(false);
  });

  it('is false when nothing is busy', () => {
    expect(overlapsBusy(T('2026-09-01T09:00:00.000Z'), T('2026-09-01T11:00:00.000Z'), [])).toBe(false);
  });
});

describe('planConflictChanges', () => {
  const clash = [busyAt('2026-09-01T10:00:00.000Z', 1)];

  it('never proposes a deletion — the plan has no delete bucket', () => {
    // The 2026-06-13 regression in one line. If a `toDelete` ever appears here,
    // that incident is being rebuilt.
    const plan = planConflictChanges([slot()], clash);
    expect(Object.keys(plan).sort()).toEqual(
      ['conflictCount', 'toBlock', 'toRelease', 'toUnstamp'].sort()
    );
  });

  it('blocks an open slot that clashes, and carries its Google event id', () => {
    const plan = planConflictChanges([slot({ calendar_event_id: 'gcal-abc' })], clash);
    expect(plan.toBlock.map((s) => s.id)).toEqual(['slot-1']);
    expect(plan.toBlock[0].calendar_event_id).toBe('gcal-abc');
    expect(plan.conflictCount).toBe(1);
    expect(plan.toRelease).toEqual([]);
    expect(plan.toUnstamp).toEqual([]);
  });

  it('leaves an open slot alone when nothing clashes', () => {
    const plan = planConflictChanges([slot()], []);
    expect(plan).toEqual({ conflictCount: 0, toBlock: [], toRelease: [], toUnstamp: [] });
  });

  it('reports a clash on a booked slot but never withdraws it', () => {
    // Surfacing the clash is right; silently un-booking a client is not.
    const plan = planConflictChanges([slot({ status: 'booked' })], clash);
    expect(plan.conflictCount).toBe(1);
    expect(plan.toBlock).toEqual([]);
  });

  it("leaves the tradie's own manual block alone, clash or no clash", () => {
    const manual = slot({ status: 'blocked', external_conflict_at: null });
    expect(planConflictChanges([manual], clash).toBlock).toEqual([]);

    const noClash = planConflictChanges([manual], []);
    expect(noClash.toRelease).toEqual([]);
    expect(noClash.toUnstamp).toEqual([]);
  });

  it('releases a slot it blocked once the commitment has gone', () => {
    const ours = slot({ status: 'blocked', external_conflict_at: '2026-08-20T00:00:00.000Z' });
    const plan = planConflictChanges([ours], []);
    expect(plan.toRelease).toEqual(['slot-1']);
    expect(plan.toUnstamp).toEqual([]);
  });

  it('keeps holding a slot it blocked while the commitment stands', () => {
    const ours = slot({ status: 'blocked', external_conflict_at: '2026-08-20T00:00:00.000Z' });
    const plan = planConflictChanges([ours], clash);
    expect(plan.toRelease).toEqual([]);
    expect(plan.toBlock).toEqual([]);
    expect(plan.conflictCount).toBe(1);
  });

  it('never flips a booked slot back to available on a stale stamp', () => {
    // The clobber case: we blocked it, the tradie accepted a job into it
    // anyway, then the Google event went away. Releasing would wipe a real
    // booking — drop only the stamp.
    const booked = slot({ status: 'booked', external_conflict_at: '2026-08-20T00:00:00.000Z' });
    const plan = planConflictChanges([booked], []);
    expect(plan.toRelease).toEqual([]);
    expect(plan.toUnstamp).toEqual(['slot-1']);
  });

  it('counts slots, not overlapping pairs', () => {
    const busyTwice = [
      busyAt('2026-09-01T09:15:00.000Z', 1),
      busyAt('2026-09-01T10:30:00.000Z', 1),
    ];
    const plan = planConflictChanges([slot()], busyTwice);
    expect(plan.conflictCount).toBe(1);
    expect(plan.toBlock).toHaveLength(1);
  });

  it('puts each slot in at most one bucket', () => {
    const slots = [
      slot({ id: 'open-clash' }),
      slot({ id: 'open-free', start_time: '2026-09-02T09:00:00.000Z', end_time: '2026-09-02T11:00:00.000Z' }),
      slot({ id: 'ours-free', status: 'blocked', external_conflict_at: '2026-08-20T00:00:00.000Z', start_time: '2026-09-03T09:00:00.000Z', end_time: '2026-09-03T11:00:00.000Z' }),
      slot({ id: 'booked-stale', status: 'booked', external_conflict_at: '2026-08-20T00:00:00.000Z', start_time: '2026-09-04T09:00:00.000Z', end_time: '2026-09-04T11:00:00.000Z' }),
    ];
    const plan = planConflictChanges(slots, clash);
    const touched = [...plan.toBlock.map((s) => s.id), ...plan.toRelease, ...plan.toUnstamp];
    expect(new Set(touched).size).toBe(touched.length);
    expect(plan.toBlock.map((s) => s.id)).toEqual(['open-clash']);
    expect(plan.toRelease).toEqual(['ours-free']);
    expect(plan.toUnstamp).toEqual(['booked-stale']);
  });

  it('leaves a slot with unreadable times untouched rather than blocking it', () => {
    const broken = slot({ start_time: 'not-a-date', end_time: 'also-not-a-date' });
    const plan = planConflictChanges([broken], clash);
    expect(plan).toEqual({ conflictCount: 0, toBlock: [], toRelease: [], toUnstamp: [] });
  });

  it('blocks nothing when Google reports no busy intervals at all', () => {
    // What a tradie with only transparent ConnecTradie blocks in their calendar
    // looks like: FreeBusy omits transparent events, so an availability export
    // can never come back as a clash against the slot that created it.
    const slots = [slot({ id: 'a' }), slot({ id: 'b', status: 'booked' })];
    const plan = planConflictChanges(slots, []);
    expect(plan.toBlock).toEqual([]);
    expect(plan.conflictCount).toBe(0);
  });
});
