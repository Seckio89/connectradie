import { describe, it, expect } from 'vitest';
import { selfBookedConflictSlotIds, type ConflictLabelJob, type ConflictLabelSlot } from '../jobConflicts';
import { jobEventWindow } from '../../../supabase/functions/_shared/calendarConflicts.ts';

// These assertions pin the attribution that turns "Busy in Google Calendar"
// into "You have a job booked then". The claim is only true when the blocked
// slot really overlaps a job the sync exports, rebuilt through the exporter's
// own window synthesis — so most of what is tested here is what must NOT be
// attributed: unstamped slots, jobs the export would never push, and windows
// that merely touch.

// The exporter synthesises +10:00 timestamps; write the slots in the same
// offset so the arithmetic is legible. 09:00+10:00 job → busy 09:00–11:00.
function slot(over: Partial<ConflictLabelSlot> = {}): ConflictLabelSlot {
  return {
    id: 'slot-1',
    start_time: '2026-09-01T10:00:00+10:00',
    end_time: '2026-09-01T12:00:00+10:00',
    external_conflict_at: '2026-08-28T00:00:00.000Z',
    ...over,
  };
}

function job(over: Partial<ConflictLabelJob> = {}): ConflictLabelJob {
  return {
    status: 'accepted',
    scheduled_date: '2026-09-01',
    start_time: '09:00:00',
    ...over,
  };
}

describe('jobEventWindow', () => {
  it('matches the export synthesis: start from the job, end two hours later, +10:00', () => {
    const w = jobEventWindow('2026-09-01', '09:30:00');
    expect(w.startDateTime).toBe('2026-09-01T09:30:00+10:00');
    expect(w.endDateTime).toBe('2026-09-01T11:30:00+10:00');
    expect(w.endMs - w.startMs).toBe(2 * 60 * 60 * 1000);
  });

  it('defaults a missing start time to 09:00, as the export does', () => {
    const w = jobEventWindow('2026-09-01', null);
    expect(w.startDateTime).toBe('2026-09-01T09:00:00+10:00');
    expect(w.endDateTime).toBe('2026-09-01T11:00:00+10:00');
  });

  it('reports an unbuildable window as NaN rather than throwing', () => {
    // 23:00 + 2h synthesises T25:00 — not a time. The export sends the string
    // and lets Google refuse it; interval consumers must see NaN and skip.
    const w = jobEventWindow('2026-09-01', '23:00:00');
    expect(Number.isNaN(w.endMs)).toBe(true);
  });
});

describe('selfBookedConflictSlotIds', () => {
  it('attributes a blocked slot overlapping a booked job', () => {
    // Job 09:00–11:00, slot 10:00–12:00 — a one-hour overlap.
    expect(selfBookedConflictSlotIds([slot()], [job()])).toEqual(new Set(['slot-1']));
  });

  it('never attributes a slot the sync did not block', () => {
    // Same overlap, but no external_conflict_at — the slot is available or the
    // tradie blocked it by hand; there is no calendar label to rewrite.
    expect(selfBookedConflictSlotIds([slot({ external_conflict_at: null })], [job()]).size).toBe(0);
  });

  it('ignores jobs in statuses the export never pushes', () => {
    // A pending or completed job has no opaque event in Google, so it cannot
    // be what FreeBusy matched.
    for (const status of ['pending', 'completed', 'cancelled', 'declined', null]) {
      expect(selfBookedConflictSlotIds([slot()], [job({ status })]).size).toBe(0);
    }
  });

  it('ignores jobs with no scheduled date — the export skips them too', () => {
    expect(selfBookedConflictSlotIds([slot()], [job({ scheduled_date: null })]).size).toBe(0);
  });

  it('treats touching edges as no overlap, same as the conflict check', () => {
    // Job 09:00–11:00; slot starts exactly at 11:00. Half-open on both sides.
    expect(
      selfBookedConflictSlotIds(
        [slot({ start_time: '2026-09-01T11:00:00+10:00', end_time: '2026-09-01T13:00:00+10:00' })],
        [job()],
      ).size,
    ).toBe(0);
  });

  it('skips a job whose synthesised window does not parse', () => {
    // 23:00 start → T25:00 end → NaN. A NaN window must not swallow every
    // comparison; the job is dropped and other jobs still attribute.
    expect(selfBookedConflictSlotIds([slot()], [job({ start_time: '23:00:00' })]).size).toBe(0);
    expect(
      selfBookedConflictSlotIds([slot()], [job({ start_time: '23:00:00' }), job()]),
    ).toEqual(new Set(['slot-1']));
  });

  it('skips a slot whose own times do not parse', () => {
    expect(
      selfBookedConflictSlotIds([slot({ start_time: 'not-a-date' })], [job()]).size,
    ).toBe(0);
  });

  it('labels each slot independently across several jobs', () => {
    const morning = slot(); // 10:00–12:00, overlaps the 09:00 job
    const evening = slot({
      id: 'slot-2',
      start_time: '2026-09-01T18:00:00+10:00',
      end_time: '2026-09-01T20:00:00+10:00',
    }); // personal Google entry blocked this one — no job overlaps
    expect(selfBookedConflictSlotIds([morning, evening], [job()])).toEqual(new Set(['slot-1']));
  });
});
