// Applying a settled price adjustment — shared by stripe-webhook and
// reconcile-payments.
//
// A "price adjustment" is an extra charge on an already-funded job. Two shapes
// arrive here:
//
//   • a VARIATION — the tradie found something mid-job. Carries variation_id,
//     and moves the budget by the variation's own amount. There is no accepted
//     quote to read a final price from.
//   • a QUOTE ADJUSTMENT after a site inspection. No variation_id; the final
//     price lives on the accepted quote.
//
// This lives in _shared because three separate paths can be the one that
// notices the money landed — checkout.session.completed, the
// payment_intent.succeeded fallback, and the reconciler — and they must not
// drift. Everything here is idempotent: Stripe fires both events for every
// hosted checkout and retries each of them, and the reconciler runs on a timer
// over the same rows.

// Matches the alias in feeContext.ts. Edge functions construct their client
// untyped, and `npm run typecheck` does not cover this directory.
type SupabaseLike = any;

export interface PriceAdjustmentContext {
  /** The job_funding payment holding the pending_increase slot. */
  parentPaymentId: string | null;
  jobId: string | null;
  /** Set only when this adjustment came from a job variation. */
  variationId: string | null;
}

export async function applyPriceAdjustment(
  supabase: SupabaseLike,
  { parentPaymentId, jobId, variationId }: PriceAdjustmentContext,
): Promise<void> {
  if (parentPaymentId) {
    const { data: parentPayment } = await supabase
      .from("payments")
      .select("metadata")
      .eq("id", parentPaymentId)
      .maybeSingle();

    if (parentPayment) {
      const meta = { ...(parentPayment.metadata || {}) };
      // Leaving this set would 409 every future increase on the job.
      delete meta.pending_increase;
      meta.increase_completed = true;
      meta.increase_completed_at = new Date().toISOString();

      await supabase.from("payments").update({ metadata: meta }).eq("id", parentPaymentId);
      console.info(`Cleared pending_increase from parent payment ${parentPaymentId}`);
    }
  }

  if (!jobId) return;

  if (variationId) {
    const { data: variation } = await supabase
      .from("job_variations")
      .select("id, additional_amount, status, job_id")
      .eq("id", variationId)
      .maybeSingle();

    if (!variation) {
      console.error(`Variation ${variationId} not found for completed payment`);
      return;
    }
    if (variation.status === "approved") {
      console.info(`Variation ${variationId} already approved — skipping`);
      return;
    }
    if (variation.job_id !== jobId) {
      console.error(
        `Variation ${variationId} belongs to job ${variation.job_id}, not ${jobId} — refusing`,
      );
      return;
    }

    // The status filter is the idempotency guard: approving twice would raise
    // the budget twice for one payment.
    const { data: flipped, error: varErr } = await supabase
      .from("job_variations")
      .update({ status: "approved" })
      .eq("id", variationId)
      .eq("status", "pending")
      .select("id");

    if (varErr) {
      console.error(`Failed to approve variation ${variationId}:`, varErr);
      return;
    }
    if (!flipped || flipped.length === 0) {
      console.info(`Variation ${variationId} was approved concurrently — budget left alone`);
      return;
    }

    const { data: jobRow } = await supabase
      .from("jobs")
      .select("budget_amount")
      .eq("id", jobId)
      .maybeSingle();

    // budget_amount and additional_amount are both DOLLARS; payments.amount is
    // CENTS. Do not mix them.
    const newBudget = Number(jobRow?.budget_amount || 0) + Number(variation.additional_amount || 0);
    const { error: budgetErr } = await supabase
      .from("jobs")
      .update({ budget_amount: newBudget })
      .eq("id", jobId);

    if (budgetErr) {
      // Loud, because the variation is already 'approved' and the guard above
      // makes a retry early-return — so nothing will come back to fix this.
      console.error(
        `ALERT variation ${variationId} approved but budget update FAILED for job ${jobId}: ${budgetErr.message}. Job is under-valued by ${variation.additional_amount}.`,
      );
      return;
    }
    console.info(`Approved variation ${variationId}; job ${jobId} budget now ${newBudget}`);
    return;
  }

  const { data: acceptedQuote } = await supabase
    .from("quotes")
    .select("final_price")
    .eq("job_id", jobId)
    .eq("status", "accepted")
    .maybeSingle();

  if (acceptedQuote?.final_price) {
    await supabase.from("jobs").update({ budget_amount: acceptedQuote.final_price }).eq("id", jobId);
    console.info(`Updated job ${jobId} budget to ${acceptedQuote.final_price}`);
  }
}
