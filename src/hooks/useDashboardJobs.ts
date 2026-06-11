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
  // Stored as an array (stable identity for consumers that destructure it)
  // but membership checks should go through isJobUnlocked, which uses the
  // memoised Set below.
  const [unlockedJobIds, setUnlockedJobIds] = useState<string[]>([]);
  const unlockedJobIdSet = useMemo(() => new Set(unlockedJobIds), [unlockedJobIds]);
  const [quotedJobIds, setQuotedJobIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Stable refs for callbacks to avoid invalidating useCallback deps every render
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const fetchJobs = useCallback(async () => {
    if (!userId) return;
    try {
      // Jobs where this tradie is the awarded contractor (quote accepted onward).
      // For v2 quotes pre-acceptance (site_visit_scheduled, site_visit_completed,
      // final_submitted), jobs.tradie_id is still null — the awarded tradie is
      // only stamped on the job at accept-and-pay. Without the second query
      // below, those in-flight jobs are invisible to the tradie's dashboard.
      const { data: awardedJobs, error: awardedErr } = await supabase
        .from('jobs')
        .select('*, profiles!jobs_client_id_fkey(full_name, email)')
        .eq('tradie_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (awardedErr) throw awardedErr;

      // Jobs where this tradie has an in-flight v2 quote (site visit booked,
      // visit completed, or final submitted — but not yet accepted). These
      // belong in the dashboard pipeline so the tradie can act on them.
      const { data: pipelineQuotes, error: pipelineQuotesErr } = await supabase
        .from('quotes')
        .select('job_id')
        .eq('tradie_id', userId)
        .in('status', ['site_visit_scheduled', 'site_visit_completed', 'final_submitted']);
      if (pipelineQuotesErr) {
        // Don't fail the whole dashboard — but surface the issue so users
        // aren't quietly missing in-flight quotes from the pipeline.
        console.error('useDashboardJobs: pipeline quotes query failed', pipelineQuotesErr);
      }
      const pipelineJobIds = Array.from(new Set((pipelineQuotes || []).map((q) => q.job_id)));
      // Use a Set for O(1) lookups instead of Array.some — this runs over
      // every awarded job for every pipeline id, was quadratic before.
      const awardedJobIdSet = new Set((awardedJobs || []).map((j) => j.id));
      const newPipelineIds = pipelineJobIds.filter((id) => !awardedJobIdSet.has(id));

      let pipelineJobs: typeof awardedJobs = [];
      if (newPipelineIds.length > 0) {
        const { data: extra, error: extraErr } = await supabase
          .from('jobs')
          .select('*, profiles!jobs_client_id_fkey(full_name, email)')
          .in('id', newPipelineIds)
          .is('archived_at', null);
        if (extraErr) {
          console.error('useDashboardJobs: pipeline jobs query failed', extraErr);
        }
        pipelineJobs = extra || [];
      }

      const combined = [...(awardedJobs || []), ...(pipelineJobs || [])];

      // Exclude jobs linked to recurring services — those are managed via Services tab.
      // Cover both the original placeholder (recurring_jobs.original_job_id) and any
      // quote-request jobs created later (jobs.recurring_job_id).
      const recurringJobIds = new Set<string>();
      for (const j of combined as { id: string; recurring_job_id?: string | null }[]) {
        if (j.recurring_job_id) recurringJobIds.add(j.id);
      }
      const { data: recurringLinked, error: recurringErr } = await supabase
        .from('recurring_jobs')
        .select('original_job_id')
        .eq('tradie_id', userId)
        .not('original_job_id', 'is', null);
      if (recurringErr) {
        console.error('useDashboardJobs: recurring-linked query failed', recurringErr);
      }
      for (const r of recurringLinked || []) {
        if (r.original_job_id) recurringJobIds.add(r.original_job_id);
      }
      const filtered = combined.filter((j) => !recurringJobIds.has(j.id));

      setJobs(filtered);

      // Fetch jobs this tradie has already quoted on (for pending counter)
      const pendingIds = combined.filter((j) => j.status === 'pending').map((j) => j.id);
      if (pendingIds.length > 0) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('job_id')
          .eq('tradie_id', userId)
          .in('job_id', pendingIds);
        setQuotedJobIds(new Set((quotes || []).map((q) => q.job_id)));
      } else {
        setQuotedJobIds(new Set());
      }
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
      // Child tables use ON DELETE CASCADE (migration 20260321100000),
      // so just delete the job — DB handles cleanup automatically.
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

  const archiveJob = useCallback(async (jobId: string) => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', jobId);
      if (error) throw error;
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      onSuccessRef.current?.('Job archived');
    } catch {
      onErrorRef.current?.('Failed to archive job');
    }
  }, []);

  const isJobUnlocked = useCallback(
    (jobId: string) => unlockedJobIdSet.has(jobId),
    [unlockedJobIdSet]
  );

  const activeJobCount = useMemo(
    () => jobs.filter((j) => j.status === 'in_progress').length,
    [jobs]
  );

  return {
    jobs,
    unlockedJobIds,
    quotedJobIds,
    deleting,
    fetchJobs,
    fetchUnlockedJobs,
    deleteJob,
    archiveJob,
    isJobUnlocked,
    activeJobCount,
  };
}
