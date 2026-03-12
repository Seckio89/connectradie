import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TradieAvailabilityBlock {
  id: string;
  tradie_id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_blocked: boolean;
  reason: string | null;
  source_job_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Block / unblock
// ---------------------------------------------------------------------------

export async function blockTimeSlot(
  tradieId: string,
  date: string,
  startTime: string,
  endTime: string,
  reason: string,
  sourceJobId?: string,
): Promise<void> {
  const { error } = await supabase
    .from('tradie_availability')
    .upsert(
      {
        tradie_id: tradieId,
        date,
        start_time: startTime,
        end_time: endTime,
        is_blocked: true,
        reason,
        source_job_id: sourceJobId ?? null,
      },
      { onConflict: 'tradie_id,date,start_time' },
    );

  if (error) throw new Error(error.message);
}

export async function unblockTimeSlot(sourceJobId: string): Promise<void> {
  const { error } = await supabase
    .from('tradie_availability')
    .delete()
    .eq('source_job_id', sourceJobId);

  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const WORK_START = 7; // 07:00
const WORK_END = 17;  // 17:00

export async function getAvailableSlots(
  tradieId: string,
  date: string,
): Promise<{ start: string; end: string }[]> {
  const { data: blocks, error } = await supabase
    .from('tradie_availability')
    .select('start_time, end_time')
    .eq('tradie_id', tradieId)
    .eq('date', date)
    .eq('is_blocked', true)
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);

  const blocked = (blocks ?? []) as { start_time: string; end_time: string }[];

  // Generate 1-hour slots from WORK_START to WORK_END, excluding blocked
  const available: { start: string; end: string }[] = [];
  for (let h = WORK_START; h < WORK_END; h++) {
    const slotStart = `${String(h).padStart(2, '0')}:00:00`;
    const slotEnd = `${String(h + 1).padStart(2, '0')}:00:00`;

    const hasClash = blocked.some(
      (b) => b.start_time < slotEnd && b.end_time > slotStart,
    );

    if (!hasClash) {
      available.push({ start: slotStart, end: slotEnd });
    }
  }

  return available;
}

export async function checkClash(
  tradieId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('tradie_availability')
    .select('id')
    .eq('tradie_id', tradieId)
    .eq('date', date)
    .eq('is_blocked', true)
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function getBlockedDates(
  tradieId: string,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('tradie_availability')
    .select('date, start_time, end_time')
    .eq('tradie_id', tradieId)
    .eq('is_blocked', true)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // A date is "fully blocked" if blocked slots cover the entire work day
  const blocksByDate = new Map<string, { start_time: string; end_time: string }[]>();
  for (const row of data as { date: string; start_time: string; end_time: string }[]) {
    const existing = blocksByDate.get(row.date) ?? [];
    existing.push({ start_time: row.start_time, end_time: row.end_time });
    blocksByDate.set(row.date, existing);
  }

  const fullyBlocked: string[] = [];
  for (const [date, blocks] of blocksByDate) {
    // Check if every work hour (7-17) is covered
    let allBlocked = true;
    for (let h = WORK_START; h < WORK_END; h++) {
      const slotStart = `${String(h).padStart(2, '0')}:00:00`;
      const slotEnd = `${String(h + 1).padStart(2, '0')}:00:00`;
      const covered = blocks.some(
        (b) => b.start_time <= slotStart && b.end_time >= slotEnd,
      );
      if (!covered) {
        allBlocked = false;
        break;
      }
    }
    if (allBlocked) fullyBlocked.push(date);
  }

  return fullyBlocked;
}
