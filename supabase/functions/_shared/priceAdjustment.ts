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
//
// A variation arriving here may be 'expired' rather than 'pending': escrow
// release lapses outstanding variations (see expireVariations.ts), and that can
// happen while the client is still on the Stripe page. Settled money outranks
// the clock, so both states are accepted and approved.

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
    //
    // 'expired' is in the list because escrow release can lapse a variation
    // while the client is still on the Stripe page. Accepting only 'pending'
    // would mean that client's card is charged, the money reaches the tradie's
    // Connect balance, and the budget silently never moves. Money that landed
    // always wins over a clock that ran out. Idempotency survives: after this
    // update the row is 'approved', which matches neither value.
    const { data: flipped, error: varErr } = await supabase
      .from("job_variations")
      .update({ status: "approved" })
      .eq("id", variationId)
      .in("status", ["pending", "expired"])
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
      .select("budget_amount, tradie_id, title")
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

    // The tradie raised this and then heard nothing either way. try/catch is
    // not politeness here: an unhandled throw after the budget has already
    // moved would surface as a webhook failure and have Stripe retry a settled
    // path.
    if (jobRow?.tradie_id) {
      try {
        await supabase.from("notifications").insert({
          user_id: jobRow.tradie_id,
          type: "variation_approved",
          title: "Additional cost approved and paid",
          message: `The homeowner approved and paid your $${
            Number(variation.additional_amount).toFixed(2)
          } additional cost on ${jobRow.title || "this job"}. It's held safely by Stripe with the rest of the job.`,
          job_id: jobId,
          metadata: {
            variation_id: variationId,
            additional_amount: Number(variation.additional_amount),
            new_budget: newBudget,
          },
          read: false,
        });
      } catch {
        // Non-critical
      }
    }
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
