import { supabase } from './supabase';
import type { Update } from '../types/database';
import { getAuthHeaders } from './edgeFn';
import { queueOfflineAction, requestBackgroundSync } from './serviceWorker';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function offlineAcceptJob(jobId: string, tradieId: string): Promise<{ online: boolean }> {
  try {
    // `count` is only populated when `count: 'exact'` is passed as an update
    // option — it isn't here, so it was ALWAYS null and this success branch was
    // unreachable. Every accept fell through to the second update below, which
    // matches 0 rows for an already-claimed job and — since a 0-row UPDATE is
    // not an error — returned success anyway. Two tradies tapping Accept both
    // saw the success banner; only one actually got the job.
    //
    // Use the rows the `.select('id')` actually returns.
    const { error, data: claimedRows } = await supabase
      .from('jobs')
      .update({ tradie_id: tradieId, status: 'accepted' })
      .eq('id', jobId)
      .eq('status', 'pending')
      .is('tradie_id', null)
      .select('id');

    if (!error && claimedRows && claimedRows.length > 0) {
      await supabase.from('job_unlocks').insert({
        tradie_id: tradieId,
        job_id: jobId,
      });
      return { online: true };
    }

    // Fallback: the job was already assigned to THIS tradie (a retry).
    const { error: assignedError, data: assignedRows } = await supabase
      .from('jobs')
      .update({ status: 'accepted' })
      .eq('id', jobId)
      .eq('status', 'pending')
      .eq('tradie_id', tradieId)
      .select('id');

    if (!assignedError && assignedRows && assignedRows.length > 0) {
      await supabase.from('job_unlocks').upsert(
        { tradie_id: tradieId, job_id: jobId },
        { onConflict: 'tradie_id,job_id' }
      );
      return { online: true };
    }

    // A 0-row update is NOT an error, so reaching here with no error means the
    // job is no longer available — someone else claimed it, or it left 'pending'.
    // Reporting success here is what made the UI lie.
    throw new Error(
      assignedError?.message ??
        'That job is no longer available — another tradie accepted it first.',
    );
  } catch (err) {
    if (!navigator.onLine) {
      const headers = await getAuthHeaders();

      const queued = await queueOfflineAction({
        url: `${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&status=eq.pending&tradie_id=eq.${tradieId}`,
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'accepted' }),
      });

      if (queued) {
        await queueOfflineAction({
          url: `${SUPABASE_URL}/rest/v1/job_unlocks?on_conflict=tradie_id,job_id`,
          method: 'POST',
          headers: { ...headers, 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ tradie_id: tradieId, job_id: jobId }),
        });

        await requestBackgroundSync();
      }

      return { online: false };
    }

    throw err;
  }
}

export async function offlineSubmitMilestone(
  milestoneId: string,
  action: 'approved' | 'paid'
): Promise<{ online: boolean }> {
  // Annotated so every key is column-checked — see the note on `Update` in
  // types/database.ts.
  const updateData: Update<'job_milestones'> =
    action === 'approved'
      ? { status: 'approved', approved_at: new Date().toISOString() }
      : { status: 'paid', paid_at: new Date().toISOString() };

  try {
    const { error } = await supabase
      .from('job_milestones')
      .update(updateData)
      .eq('id', milestoneId);

    if (!error) return { online: true };

    throw new Error(error.message);
  } catch {
    const headers = await getAuthHeaders();

    const queued = await queueOfflineAction({
      url: `${SUPABASE_URL}/rest/v1/job_milestones?id=eq.${milestoneId}`,
      method: 'PATCH',
      headers,
      body: JSON.stringify(updateData),
    });

    if (queued) {
      await requestBackgroundSync();
    }

    return { online: false };
  }
}
