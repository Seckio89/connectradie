import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Email a Stripe payment link to an OFF-APP client for an accepted one-off job.
// Wraps the invoice-contact edge function's jobId mode. Off-app clients have no
// account to Accept & Pay from — this is how they pay a one-off job by card.
// ─────────────────────────────────────────────────────────────────────────────

export interface JobPaymentLinkResult {
  ok: boolean;
  /** Human-readable failure reason (already user-safe — comes from the fn). */
  error?: string;
  emailedTo?: string;
  stripePaymentUrl?: string;
}

export async function sendJobPaymentLink(jobId: string): Promise<JobPaymentLinkResult> {
  try {
    const { data, error } = await supabase.functions.invoke('invoice-contact', {
      body: { jobId },
    });
    if (error) {
      // Edge function returns a JSON { error } body on non-2xx — surface it.
      let msg = 'Could not send the payment link.';
      try { msg = (await (error as { context?: Response }).context?.json())?.error || msg; } catch { /* keep default */ }
      return { ok: false, error: msg };
    }
    if (data?.error) return { ok: false, error: data.error };
    return { ok: true, emailedTo: data?.emailedTo, stripePaymentUrl: data?.stripePaymentUrl };
  } catch {
    return { ok: false, error: 'Could not send the payment link. Please try again.' };
  }
}
