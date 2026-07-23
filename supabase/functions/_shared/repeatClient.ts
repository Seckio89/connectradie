// ─────────────────────────────────────────────────────────────────────────────
// Repeat-client lookup (pricing v2.1 §1.2 / §2.3).
//
// A "repeat client" is a (tradie, client) pair with at least one PRIOR job that
// both completed AND had its payment released. That pair is charged the cheaper
// repeat rate from the 2nd job onward — the structural anti-bypass mechanism:
// staying on-platform gets cheaper than leaving.
//
// Deliberately NOT in _shared/pricing.ts: that module is imported by the frontend
// (src/lib/subscription.ts) and must stay dependency-free and pure. Anything that
// touches the database lives here instead.
//
// This is checked SERVER-SIDE at fee-calculation time only. It must never be
// derived from anything the client sends, or the cheaper rate is forgeable.
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal structural type so this file needn't import the Supabase SDK. */
interface QueryBuilderLike {
  select(columns: string): QueryBuilderLike;
  eq(column: string, value: unknown): QueryBuilderLike;
  neq(column: string, value: unknown): QueryBuilderLike;
  limit(n: number): QueryBuilderLike;
  then<TResult>(
    onfulfilled: (value: { data: unknown[] | null; error: unknown }) => TResult,
  ): Promise<TResult>;
}

interface SupabaseLike {
  from(table: string): QueryBuilderLike;
}

/**
 * True when this (tradie, client) pair has a prior completed + released job.
 *
 * `currentJobId` is excluded so the job being paid for right now can never count
 * itself as its own prior job.
 *
 * Fails CLOSED (returns false → standard rate) if the lookup errors, and logs
 * loudly. Rationale: an error must not silently hand out a discount. The tradeoff
 * is that a database blip charges the standard rate on a job that deserved the
 * repeat rate, so the error is logged at error level to make that visible rather
 * than quietly eroding the loyalty promise.
 */
export async function isRepeatClientPair(
  supabase: SupabaseLike,
  tradieId: string | null | undefined,
  clientId: string | null | undefined,
  currentJobId: string | null | undefined,
): Promise<boolean> {
  if (!tradieId || !clientId) return false;

  try {
    let query = supabase
      .from("payments")
      // !inner makes the embedded jobs filters act as a JOIN, not a left-join.
      .select("id, jobs!inner(id, tradie_id, client_id, status)")
      .eq("status", "released")
      .eq("jobs.tradie_id", tradieId)
      .eq("jobs.client_id", clientId)
      .eq("jobs.status", "completed");

    if (currentJobId) query = query.neq("jobs.id", currentJobId);

    const { data, error } = await query.limit(1);

    if (error) {
      console.error("[repeatClient] lookup failed — defaulting to standard rate", {
        tradieId,
        clientId,
        currentJobId,
        error,
      });
      return false;
    }

    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error("[repeatClient] lookup threw — defaulting to standard rate", err);
    return false;
  }
}
