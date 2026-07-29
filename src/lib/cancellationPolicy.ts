/**
 * Cancellation policy — agreed terms, recorded before the job starts.
 *
 * No money moves here and no fee is calculated. This records what both sides
 * agreed to and when. See the migration
 * 20260729120000_cancellation_policy_agreements.sql for why that restraint is
 * deliberate.
 */
import { supabase } from './supabase';

export interface CancellationPolicy {
  id: string;
  version: number;
  summary: string;
  terms: string;
  notice_hours: number;
}

export interface CancellationAgreement {
  job_id: string;
  policy_version: number;
  terms_snapshot: string;
  client_accepted_at: string | null;
  tradie_accepted_at: string | null;
}

/** The policy a new job would be agreed under. */
export async function fetchCurrentCancellationPolicy(): Promise<CancellationPolicy | null> {
  try {
    const { data, error } = await supabase
      .from('cancellation_policies')
      .select('id, version, summary, terms, notice_hours')
      .eq('is_current', true)
      .maybeSingle();

    if (error) {
      console.error('Failed to load cancellation policy:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Failed to load cancellation policy:', err);
    return null;
  }
}

/**
 * What a specific job was agreed under.
 *
 * Always prefer this over the current policy when showing terms for an
 * existing job — the snapshot is what the parties actually agreed to, and the
 * catalogue may have moved on since.
 */
export async function fetchJobCancellationAgreement(
  jobId: string,
): Promise<CancellationAgreement | null> {
  try {
    const { data, error } = await supabase
      .from('job_cancellation_agreements')
      .select('job_id, policy_version, terms_snapshot, client_accepted_at, tradie_accepted_at')
      .eq('job_id', jobId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load cancellation agreement:', error);
      return null;
    }
    return data;
  } catch (err) {
    console.error('Failed to load cancellation agreement:', err);
    return null;
  }
}

/**
 * Record that the caller accepts the current terms for this job.
 *
 * Goes through a SECURITY DEFINER RPC rather than a table write: the function
 * resolves the caller from auth.uid() and can only ever set that caller's own
 * column, so neither party can record the other's consent.
 *
 * Throws on failure — acceptance is a consent record, so a silent failure
 * would be worse than an error the caller has to handle.
 */
export async function acceptCancellationTerms(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_cancellation_terms', { p_job_id: jobId });
  if (error) {
    console.error('Failed to record cancellation terms acceptance:', error);
    throw new Error(error.message || "Couldn't record your agreement to the cancellation terms.");
  }
}
