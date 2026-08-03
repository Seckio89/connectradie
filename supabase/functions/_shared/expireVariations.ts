// Lapse a job's outstanding variations when its escrow goes out.
//
// Both release paths strip pending_increase from the funding payment but used
// to leave job_variations alone, so a variation nobody actioned before release
// stayed 'pending' forever: it kept rendering as an actionable amber block with
// no route left to fund it, because approve-variation's funding lookup filters
// status='completed' and release sets 'released'.
//
// 'expired', not 'rejected'. The client did not decline it — the window closed.
// VariationsHistory renders 'rejected' as "Declined" and
// dispute-evidence-summary hands that word to a dispute officer, so conflating
// the two would misreport what happened on exactly the jobs where it matters.
//
// This lives in _shared because four call sites strip pending_increase
// (release-escrow twice, auto-release-payments twice) and a fifth would drift —
// the same reasoning that put priceAdjustment.ts here.
//
// Callers must treat this as best-effort and wrap it: a notification failure
// must never abort a payout that has already left Stripe.

// Matches the alias in feeContext.ts. Edge functions construct their client
// untyped, and `npm run typecheck` does not cover this directory.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export async function expirePendingVariations(
  supabase: SupabaseLike,
  jobId: string,
): Promise<number> {
  if (!jobId) return 0;

  // The status filter is what makes this idempotent — the reconciler and the
  // two release paths can all run over the same job.
  const { data: lapsed, error } = await supabase
    .from("job_variations")
    .update({ status: "expired" })
    .eq("job_id", jobId)
    .eq("status", "pending")
    .select("id, additional_amount, description");

  if (error) {
    console.error(`Failed to expire pending variations for job ${jobId}:`, error);
    return 0;
  }

  if (!lapsed || lapsed.length === 0) return 0;

  const { data: job } = await supabase
    .from("jobs")
    .select("tradie_id, title")
    .eq("id", jobId)
    .maybeSingle();

  console.info(`Expired ${lapsed.length} unactioned variation(s) on job ${jobId}`);

  if (job?.tradie_id) {
    for (const variation of lapsed) {
      try {
        await supabase.from("notifications").insert({
          user_id: job.tradie_id,
          type: "variation_expired",
          title: "Additional cost no longer payable",
          message: `The payment for ${
            job.title || "this job"
          } has been released, so your $${
            Number(variation.additional_amount).toFixed(2)
          } additional cost can no longer be approved. Invoice the homeowner directly for that work.`,
          job_id: jobId,
          metadata: {
            variation_id: variation.id,
            additional_amount: Number(variation.additional_amount),
          },
          read: false,
        });
      } catch {
        // Non-critical
      }
    }
  }

  return lapsed.length;
}
