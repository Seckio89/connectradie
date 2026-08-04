// Choosing which job_funding payment a variation's top-up attaches to.
//
// A job can carry MORE THAN ONE completed job_funding row. accept-and-pay and
// create-job-deposit each write one escrow deposit, but pay-milestone writes a
// fresh job_funding row per milestone — so a twelve-stage HIA schedule ends up
// with twelve of them.
//
// approve-variation and decline-variation both used to fetch that row with
// .maybeSingle(), which is only correct when exactly one exists. On any job
// with two or more settled milestones PostgREST returned PGRST116 and both
// functions 500'd, leaving the client unable to approve OR decline — a dead
// amber block with no way out. auto-release-payments already treats this as a
// many-row relationship; this brings the variation path in line.
//
// Pure and dependency-free so it can be tested without a Supabase client — the
// edge functions cannot be exercised locally (jsr.io is blocked in CI's sandbox
// and in dev containers), so the selection rule is the part worth pinning down.

export interface FundingPaymentLike {
  id: string;
  metadata?: Record<string, unknown> | null;
}

/** The pending_increase slot, as approve-variation writes it. */
function pendingIncreaseOf(
  payment: FundingPaymentLike,
): { variation_id?: string } | undefined {
  return (payment.metadata ?? undefined)?.pending_increase as
    | { variation_id?: string }
    | undefined;
}

/**
 * The row a NEW top-up should attach to, or the one already holding it.
 *
 * Order matters:
 *   1. a row already holding a pending_increase — whichever row it was parked
 *      on. The caller's in-flight check reads the slot off the row this
 *      returns, so picking a different one would miss a live increase and let
 *      two run at once, silently overwriting each other.
 *   2. the escrow deposit (accept-and-pay / create-job-deposit stamp
 *      metadata.deposit_type='escrow') — the natural home for a top-up on an
 *      ordinary quote-funded job.
 *   3. otherwise the most recent row, which on a milestone job is the stage
 *      being worked now.
 *
 * Callers pass only status='completed' rows, so released money is never
 * selected — a top-up must never attach to funds that have already gone out.
 */
export function selectFundingPaymentForTopUp<T extends FundingPaymentLike>(
  payments: T[] | null | undefined,
): T | undefined {
  if (!payments || payments.length === 0) return undefined;

  return (
    payments.find((p) => pendingIncreaseOf(p)) ??
      payments.find((p) => (p.metadata ?? {})?.deposit_type === "escrow") ??
      payments[payments.length - 1]
  );
}

/**
 * The row holding THIS variation's slot, for the decline path.
 *
 * Declining only ever needs the row it is actually parked on. Falling back to
 * the first row keeps the caller's `holdsOurSlot` check well-defined when no
 * slot is held at all — that check requires a variation_id match, so a fallback
 * row can never be mistaken for one that holds the slot.
 */
export function selectFundingPaymentForVariation<T extends FundingPaymentLike>(
  payments: T[] | null | undefined,
  variationId: string,
): T | undefined {
  if (!payments || payments.length === 0) return undefined;

  return (
    payments.find((p) => pendingIncreaseOf(p)?.variation_id === variationId) ??
      payments[0]
  );
}
