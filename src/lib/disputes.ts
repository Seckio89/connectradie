import { supabase } from './supabase';
import { friendlyError } from './utils';
import { callEdgeFunction } from './edgeFn';

/**
 * Raise a dispute on a job.
 *
 * Shared by the explicit "Raise a Dispute" button, the refund path (which
 * auto-escalates when a refund is refused), and cancelling a job whose payment
 * has already been released. One implementation so they cannot drift — this
 * writes to a table that freezes payouts.
 *
 * Lifted verbatim out of PaymentHistory.tsx, where it was a local function, so
 * a third caller didn't become a third copy.
 */
export async function raiseDispute(
  { jobId, againstUser, openedBy, description, reason }:
  { jobId: string; againstUser: string; openedBy: string; description: string; reason: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: created, error } = await supabase
    .from('disputes')
    .insert({
      job_id: jobId,
      opened_by: openedBy,
      against_user: againstUser,
      reason,
      description,
    })
    .select('id')
    .single();

  if (error) {
    // 23505 = the one-live-dispute-per-job index. Not a failure from the
    // client's point of view: their concern is already with the team.
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, message: 'You already have an open dispute for this job. Our team is reviewing it.' };
    }
    // 23514 = the escrow-required trigger. Its message is written for the user,
    // so pass it through rather than replacing it with something vaguer. This
    // is reachable even though the button is hidden for non-escrow payments —
    // the refund path escalates automatically and does not check first.
    if ((error as { code?: string }).code === '23514') {
      return { ok: false, message: (error as { message?: string }).message || 'Disputes are only available on jobs paid through ConnecTradie.' };
    }
    return { ok: false, message: friendlyError(error, 'Could not raise the dispute. Please try again.') };
  }

  // Tell the tradie their payout is on hold and why. Non-fatal: a failed
  // notification must never lose a recorded dispute.
  try {
    await supabase.rpc('create_notification', {
      p_user_id: againstUser,
      p_title: 'A client has raised a dispute',
      p_message: 'A client has raised a dispute on one of your jobs. Payment for it is on hold while our team reviews.',
      p_type: 'DISPUTE_RAISED',
      p_job_id: jobId,
    });
  } catch { /* intentionally ignored */ }

  // Kick off the AI evidence summary for whoever reviews this. Deliberately
  // fire-and-forget and deliberately non-fatal: it only writes to
  // dispute_evidence_summaries, it cannot move money, and the admin queue works
  // without it. Making the client wait on a model call — or fail because one
  // errored — would be trading a recorded dispute for a nice-to-have.
  if (created?.id) {
    void callEdgeFunction('dispute-evidence-summary', { disputeId: created.id })
      .catch(() => { /* summary is an assist, not a dependency */ });
  }

  return { ok: true };
}
