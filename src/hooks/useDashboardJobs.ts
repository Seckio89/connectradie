import { useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Job } from '../types/database';

export interface DashboardJob extends Job {
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

interface UseDashboardJobsOptions {
  userId: string | undefined;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useDashboardJobs({ userId, onSuccess, onError }: UseDashboardJobsOptions) {
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [unlockedJobIds, setUnlockedJobIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Stable refs for callbacks to avoid invalidating useCallback deps every render
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchJobs = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email)')
        .eq('tradie_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch {
      onErrorRef.current?.('Failed to load jobs. Please refresh.');
    }
  }, [userId]);

  const fetchUnlockedJobs = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('job_unlocks')
        .select('job_id')
        .eq('tradie_id', userId);

      if (error) throw error;
      setUnlockedJobIds(data?.map((j) => j.job_id) || []);
    } catch {
      onErrorRef.current?.('Failed to load unlocked jobs. Please refresh.');
    }
  }, [userId]);

  const deleteJob = useCallback(async (jobId: string) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      if (error) throw error;
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      onSuccessRef.current?.('Job deleted successfully');
    } catch {
      onErrorRef.current?.('Failed to delete job. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, []);

  const isJobUnlocked = useCallback(
    (jobId: string) => unlockedJobIds.includes(jobId),
    [unlockedJobIds]
  );

  const activeJobCount = useMemo(
    () => jobs.filter((j) => j.status === 'in_progress').length,
    [jobs]
  );

  return {
    jobs,
    unlockedJobIds,
    deleting,
    fetchJobs,
    fetchUnlockedJobs,
    deleteJob,
    isJobUnlocked,
    activeJobCount,
  };
}
