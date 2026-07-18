// ─────────────────────────────────────────────────────────────────────────────
// emailOffAppClientOnCompletion — when a tradie marks a job complete, an OFF-APP
// client (no ConnecTradie account) has no dashboard notification to tell them to
// approve. This emails them the quote link so they can tap "Approve & release
// payment" — otherwise the payment just sits until the 48h auto-release.
//
// Safe to call after ANY completion path: it self-checks that the job is off-app
// (has a client_contact_id but no linked client_id) and no-ops otherwise. Fully
// best-effort — never throws into the completion flow.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export async function emailOffAppClientOnCompletion(jobId: string): Promise<void> {
  try {
    const { data: job } = await supabase
      .from('jobs')
      .select('id, title, client_id, client_contact_id')
      .eq('id', jobId)
      .maybeSingle();

    // Only off-app jobs: a linked client_id means they get the in-app flow.
    if (!job || job.client_id || !job.client_contact_id) return;

    const { data: qRows } = await supabase
      .from('quotes')
      .select('public_token, sent_to_email')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1);
    const quote = qRows?.[0];
    if (!quote?.public_token) return;

    let email = (quote.sent_to_email as string | null) || null;
    let firstName = 'there';
    const { data: contact } = await supabase
      .from('client_contacts')
      .select('full_name, email')
      .eq('id', job.client_contact_id)
      .maybeSingle();
    if (!email && contact?.email) email = contact.email;
    if (contact?.full_name) firstName = contact.full_name.split(' ')[0];
    if (!email) return;

    const link = `${window.location.origin}/quote/${quote.public_token}`;
    const jobTitle = job.title || 'your job';

    await supabase.functions.invoke('send-email', {
      body: {
        to: email,
        subject: `Your job is complete — approve & release payment`,
        body:
          `Hi ${firstName},\n\n"${jobTitle}" has been marked complete. If you're happy with the work, ` +
          `tap below to approve and release the payment.\n\n` +
          `If you don't respond, the payment releases automatically 48 hours after completion.\n\n${link}`,
        notificationType: 'QUOTE_RECEIVED',
        metadata: { link },
      },
    });
  } catch (e) {
    console.error('Failed to send off-app completion email:', e);
  }
}
