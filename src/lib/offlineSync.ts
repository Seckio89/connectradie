import { supabase } from './supabase';
import { getAuthHeaders } from './edgeFn';
import { queueOfflineAction, requestBackgroundSync } from './serviceWorker';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export async function offlineAcceptJob(jobId: string, tradieId: string): Promise<{ online: boolean }> {
  try {
    const { error, count } = await supabase
      .from('jobs')
      .update({ tradie_id: tradieId, status: 'accepted' })
      .eq('id', jobId)
      .eq('status', 'pending')
      .is('tradie_id', null)
      .select('id', { count: 'exact', head: true });

    if (!error && count && count > 0) {
      await supabase.from('job_unlocks').insert({
        tradie_id: tradieId,
        job_id: jobId,
      });
      return { online: true };
    }

    const { error: assignedError } = await supabase
      .from('jobs')
      .update({ status: 'accepted' })
      .eq('id', jobId)
      .eq('status', 'pending')
      .eq('tradie_id', tradieId);

    if (!assignedError) {
      await supabase.from('job_unlocks').upsert(
        { tradie_id: tradieId, job_id: jobId },
        { onConflict: 'tradie_id,job_id' }
      );
      return { online: true };
    }

    throw new Error(assignedError.message);
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
  const updateData =
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
