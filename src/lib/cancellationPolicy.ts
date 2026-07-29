/**
 * Cancellation policy — agreed terms, recorded before the job starts.
 *
 * No money moves here and no fee is calculated. This records what both sides
 * agreed to and when. See the migration
 * 20260729120000_cancellation_policy_agreements.sql for why that restraint is
 * deliberate.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
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

/* ───────────────────────────────────────────────────────────────────────────
 * TEMPORARY — delete this block once the migration is live.
 *
 * cancellation_policies, job_cancellation_agreements and
 * accept_cancellation_terms arrive with migration
 * 20260729120000_cancellation_policy_agreements.sql. src/types/supabase.ts is
 * generated FROM the live database, so until that migration is applied and
 *
 *   npx supabase gen types typescript --project-id uoqygmizupdpanplpvor \
 *     --schema public > src/types/supabase.ts
 *
 * is re-run, the generated Database type has no knowledge of them and every
 * call below fails to compile.
 *
 * This declares the three new objects and narrows the client to them in ONE
 * place, rather than reaching for `any` (banned) or hand-editing a generated
 * file (would be silently overwritten). Every shape here is written to match
 * the migration exactly.
 *
 * TO REMOVE: apply the migration, regenerate types, then delete PendingSchema
 * and `db`, and change the three `db.` calls back to `supabase.`.
 * ─────────────────────────────────────────────────────────────────────────── */
interface PolicyRow {
  id: string;
  version: number;
  summary: string;
  terms: string;
  notice_hours: number;
  is_current: boolean;
  effective_from: string;
  created_at: string;
}

interface AgreementRow {
  id: string;
  job_id: string;
  policy_id: string;
  terms_snapshot: string;
  policy_version: number;
  client_accepted_at: string | null;
  tradie_accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PendingSchema {
  // Mirrors the generated Database type. Without it the client picks a
  // different rpc overload and the Args are typed away to `undefined`.
  __InternalSupabase: { PostgrestVersion: '14.1' };
  public: {
    Tables: {
      cancellation_policies: {
        Row: PolicyRow;
        Insert: PolicyRow;
        Update: Partial<PolicyRow>;
        Relationships: [];
      };
      job_cancellation_agreements: {
        Row: AgreementRow;
        Insert: AgreementRow;
        Update: Partial<AgreementRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      accept_cancellation_terms: {
        Args: { p_job_id: string };
        Returns: AgreementRow;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

const db = supabase as unknown as SupabaseClient<PendingSchema>;

/** The policy a new job would be agreed under. */
export async function fetchCurrentCancellationPolicy(): Promise<CancellationPolicy | null> {
  try {
    const { data, error } = await db
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
    const { data, error } = await db
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
  // The table reads above resolve fine through PendingSchema, but the rpc
  // overload does not — it collapses Args to `undefined` for a function the
  // generated Functions map has never heard of. Narrowed at the call instead.
  // Goes away with the rest of the shim once types are regenerated.
  const rpc = db.rpc as unknown as (
    fn: 'accept_cancellation_terms',
    args: { p_job_id: string },
  ) => Promise<{ error: { message?: string } | null }>;

  const { error } = await rpc('accept_cancellation_terms', { p_job_id: jobId });
  if (error) {
    console.error('Failed to record cancellation terms acceptance:', error);
    throw new Error(error.message || "Couldn't record your agreement to the cancellation terms.");
  }
}
