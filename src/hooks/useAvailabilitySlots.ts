import { useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AvailabilitySlot } from '../types/database';

interface UseAvailabilitySlotsOptions {
  userId: string | undefined;
  currentDate: Date;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useAvailabilitySlots({ userId, currentDate, onSuccess, onError }: UseAvailabilitySlotsOptions) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable refs for callbacks to avoid invalidating useCallback deps every render
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchSlots = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

      const { data, error } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('tradie_id', userId)
        .gte('start_time', startOfMonth.toISOString())
        .lt('start_time', endOfMonth.toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;
      setSlots((data || []) as AvailabilitySlot[]);
    } catch {
      onErrorRef.current?.('Failed to load availability slots. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [userId, currentDate]);

  const addSlot = useCallback(async (slotsToAdd: Array<{ date: string; startTime: string; endTime: string }>) => {
    if (!userId || slotsToAdd.length === 0) return;
    try {
      const rows = slotsToAdd.map((slot) => ({
        tradie_id: userId,
        start_time: new Date(`${slot.date}T${slot.startTime}`).toISOString(),
        end_time: new Date(`${slot.date}T${slot.endTime}`).toISOString(),
        status: 'available' as const,
      }));
      const { error } = await supabase.from('availability_slots').insert(rows);
      if (!error) {
        onSuccessRef.current?.(`Successfully added ${slotsToAdd.length} slot${slotsToAdd.length !== 1 ? 's' : ''}`);
        await fetchSlots();
      } else {
        onErrorRef.current?.('Failed to add slots. Please try again.');
      }
    } catch {
      onErrorRef.current?.('Failed to add slots. Please try again.');
    }
  }, [userId, fetchSlots]);

  const addSlotForDay = useCallback(async (day: number, startTime: string, endTime: string) => {
    if (!userId) return;
    const slotDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const start = new Date(slotDate);
    start.setHours(startH, startM, 0, 0);
    const end = new Date(slotDate);
    end.setHours(endH, endM, 0, 0);

    const { error } = await supabase.from('availability_slots').insert({
      tradie_id: userId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'available',
    });

    if (error) {
      onErrorRef.current?.('Failed to add slot. Please try again.');
    } else {
      onSuccessRef.current?.('Slot added successfully');
      await fetchSlots();
    }
  }, [userId, currentDate, fetchSlots]);

  const updateSlot = useCallback(async (slot: AvailabilitySlot, startTime: string, endTime: string) => {
    if (startTime >= endTime) {
      onErrorRef.current?.('Start time must be before end time.');
      return;
    }
    try {
      const slotDate = new Date(slot.start_time);
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);

      const newStart = new Date(slotDate);
      newStart.setHours(startH, startM, 0, 0);
      const newEnd = new Date(slotDate);
      newEnd.setHours(endH, endM, 0, 0);

      const { error } = await supabase
        .from('availability_slots')
        .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
        .eq('id', slot.id);

      if (error) throw error;
      onSuccessRef.current?.('Slot updated successfully');
      await fetchSlots();
    } catch {
      onErrorRef.current?.('Failed to update slot. Please try again.');
    }
  }, [fetchSlots]);

  const deleteSlot = useCallback(async (slotId: string) => {
    try {
      const { error } = await supabase.from('availability_slots').delete().eq('id', slotId);
      if (error) throw error;
      await fetchSlots();
    } catch {
      onErrorRef.current?.('Failed to delete slot. Please try again.');
    }
  }, [fetchSlots]);

  const clearAllUpcoming = useCallback(async () => {
    if (!userId) return;
    try {
      const { error } = await supabase
        .from('availability_slots')
        .delete()
        .eq('tradie_id', userId)
        .eq('status', 'available')
        .gte('start_time', new Date().toISOString());
      if (error) throw error;
      onSuccessRef.current?.('All upcoming available slots cleared');
      await fetchSlots();
    } catch {
      onErrorRef.current?.('Failed to clear slots. Please try again.');
    }
  }, [userId, fetchSlots]);

  const removeDuplicates = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: allSlots, error: fetchError } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('tradie_id', userId)
        .eq('status', 'available')
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;
      if (!allSlots || allSlots.length === 0) {
        onSuccessRef.current?.('No duplicates found');
        return;
      }

      const seen = new Map<string, string>();
      const duplicateIds: string[] = [];
      (allSlots as AvailabilitySlot[]).forEach((slot) => {
        const key = `${slot.start_time}-${slot.end_time}`;
        if (seen.has(key)) duplicateIds.push(slot.id);
        else seen.set(key, slot.id);
      });

      if (duplicateIds.length === 0) {
        onSuccessRef.current?.('No duplicates found');
        return;
      }

      const { error } = await supabase.from('availability_slots').delete().in('id', duplicateIds);
      if (error) throw error;
      onSuccessRef.current?.(`Removed ${duplicateIds.length} duplicate slot(s)`);
      await fetchSlots();
    } catch {
      onErrorRef.current?.('Failed to remove duplicates. Please try again.');
    }
  }, [userId, fetchSlots]);

  // Memoized computed values
  const totalAvailableHours = useMemo(() =>
    slots
      .filter((s) => s.status === 'available')
      .reduce((acc, slot) => {
        const start = new Date(slot.start_time);
        const end = new Date(slot.end_time);
        return acc + (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      }, 0),
    [slots]
  );

  const bookedSlots = useMemo(() => slots.filter((s) => s.status === 'booked').length, [slots]);

  const getSlotsForDate = useCallback((day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return slots.filter((slot) => {
      const slotDate = new Date(slot.start_time);
      return (
        slotDate.getDate() === date.getDate() &&
        slotDate.getMonth() === date.getMonth() &&
        slotDate.getFullYear() === date.getFullYear()
      );
    });
  }, [slots, currentDate]);

  return {
    slots,
    loading,
    fetchSlots,
    addSlot,
    addSlotForDay,
    updateSlot,
    deleteSlot,
    clearAllUpcoming,
    removeDuplicates,
    totalAvailableHours,
    bookedSlots,
    getSlotsForDate,
  };
}
