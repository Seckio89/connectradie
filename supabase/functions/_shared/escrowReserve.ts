// ─────────────────────────────────────────────────────────────────────────────
// Escrow reserve — client money sitting in a tradie's Connect balance.
//
// Escrow in this system IS the manual payout schedule. accept-and-pay and the
// other funding paths use destination charges, so the client's funds land in
// the TRADIE'S Connect balance at charge time and sit in `available` looking
// exactly like earned money. Anything that pays out the raw available balance
// would hand the tradie the client's escrow before the work is done and before
// the homeowner approves release — and a later refund would then reverse
// against an empty balance, pushing the account negative.
//
// It also reserves one thing that is not escrow: a dispute-split remainder the
// tradie is owed but has not been paid yet (see isPendingSplitPayout). Both are
// the same question for a caller — how much of this balance is not free to send.
//
// Mirrors src/lib/paymentRelease.ts (`isDestinationRouted`,
// `creditedToBalanceCents`). Deno can't import from src/, so the two copies are
// kept deliberately identical — change both. The split logic has no src/
// counterpart: nothing client-side computes a payable balance.
// ─────────────────────────────────────────────────────────────────────────────

export interface EscrowRow {
  id?: string;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
}

/** Minimal structural type — avoids importing the Supabase SDK here, matching
 *  the convention in feeContext.ts. */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

/**
 * Two writers, two key names, one meaning. accept-and-pay / pay-price-increase
 * stamp `metadata.flow`; invoice-contact / public-quote / the BECS + recurring
 * invoice paths stamp `metadata.routing`. auto-release-payments already treats
 * them as equivalent. Checking only `flow` left every off-app funded job
 * unreserved and therefore instantly payable.
 */
export function isDestinationRouted(row: EscrowRow): boolean {
  const meta = row.metadata ?? null;
  return meta?.flow === "destination" || meta?.routing === "destination";
}

/** Released money has moved and is no longer escrow. */
export function isStillHeld(row: EscrowRow): boolean {
  const meta = row.metadata ?? null;
  return !meta?.transfer_id && !meta?.payout_id;
}

/**
 * What the destination charge actually credited to the Connect balance.
 *
 * `payments.amount` is the GST-EXCLUSIVE base, but Stripe credits
 * `base + gst - application_fee`. Reserving the gross amount over-reserves by
 * the platform fee on every held job, understating what the tradie can take.
 *
 * `gst` is a string in accept-and-pay metadata and a number in
 * pay-price-increase, so both are parsed. Anything missing or unparseable falls
 * back to the gross amount — over-reserving is the safe direction.
 */
export function creditedToBalanceCents(row: EscrowRow): number {
  const gross = row.amount ?? 0;
  const meta = row.metadata ?? null;
  if (!meta) return gross;

  const fee = meta.platform_fee;
  const feeCents = typeof fee === "number" ? fee : Number.NaN;
  if (!Number.isFinite(feeCents)) return gross;

  const gstRaw = meta.gst;
  const gstCents = typeof gstRaw === "number"
    ? gstRaw
    : typeof gstRaw === "string"
    ? Number(gstRaw)
    : Number.NaN;
  if (!Number.isFinite(gstCents)) return gross;

  return Math.max(0, gross + gstCents - feeCents);
}

/**
 * Same semantics as `frozenCents` in feeContext.ts, deliberately duplicated
 * rather than imported: this module has no imports, and three functions bundle
 * it. Importing feeContext would drag pricing.ts and repeatClient.ts into all
 * three deploys for a seven-line number parse.
 *
 * Anything unparseable reads as 0. For a reserve, under-reserving is the unsafe
 * direction — but a NaN is worse than either, because it propagates through the
 * sweep's arithmetic and turns the whole balance into a payout.
 */
function splitCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return 0;
}

/**
 * A dispute split that has refunded the client but not yet paid the tradie.
 *
 * resolve-dispute-split runs two legs — refund the client, then pay the tradie
 * the remainder. When leg 2 cannot pay immediately (the normal case: on AU cards
 * the charge is still settling, so the function pre-flights the balance and
 * defers) it writes the row as status='released' with `split_payout_cents` and
 * NO `payout_id`, deliberately, so the cron cannot pay the full amount. The
 * remainder then waits in the tradie's balance for the split sweep in
 * auto-release-payments to complete it under the dispute's idempotency key.
 *
 * That money is spoken for. It is not escrow — the client's share has already
 * been refunded — but it is not free balance either, and anything that pays out
 * the raw available balance would pre-empt a specific pending payout. The split
 * sweep would then find an empty balance and skip forever, leaving the row
 * permanently `payout_pending` with no way to tell whether the tradie was paid.
 */
export function isPendingSplitPayout(row: EscrowRow): boolean {
  const meta = row.metadata ?? null;
  if (!meta) return false;
  return meta.split_payout_cents !== undefined &&
    meta.split_payout_cents !== null &&
    !meta.payout_id;
}

/**
 * Sum what a tradie's Connect balance holds that is not theirs to take: client
 * escrow, plus any dispute-split remainder still awaiting its payout. Takes the
 * union of however many queries the caller ran (rows anchor on the job for
 * off-app payments and on metadata.tradie_id for in-app ones) and de-duplicates
 * by payment id.
 */
export function sumEscrowReserveCents(rows: EscrowRow[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const row of rows) {
    if (row.id) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
    }
    // MUST come first. A pending split is destination-routed and still held, so
    // the escrow branch below would reserve creditedToBalanceCents — the FULL
    // pre-split amount, over-reserving by the share already refunded to the
    // client and blocking the tradie from money that is genuinely theirs.
    if (isPendingSplitPayout(row)) {
      total += splitCents(row.metadata?.split_payout_cents);
      continue;
    }
    if (!isDestinationRouted(row) || !isStillHeld(row)) continue;
    total += creditedToBalanceCents(row);
  }
  return total;
}

/**
 * Runs the anchor queries and returns what the tradie's balance is holding for
 * someone else — client escrow, plus any pending dispute-split remainder.
 *
 * Rows anchor differently depending on who paid: accept-and-pay and
 * pay-price-increase stamp metadata.tradie_id, while public-quote and
 * invoice-contact serve off-app clients with no profile, so those rows carry no
 * tradie_id and are only reachable through the job. Missing either anchor leaves
 * client escrow unreserved and payable.
 *
 * The third query catches pending dispute splits, which the first two cannot:
 * they sit at status='released', not 'completed'. It anchors on the job only —
 * a split always has one, since a dispute is raised against a job — and the
 * union de-duplicates anything a second anchor would have repeated.
 *
 * THROWS if any query fails. Callers must not treat an error as "nothing held"
 * — that is how you pay out someone else's funds.
 */
export async function fetchEscrowReserveCents(
  supabase: SupabaseLike,
  tradieId: string,
): Promise<number> {
  const [jobAnchored, metaAnchored, pendingSplits] = await Promise.all([
    supabase
      .from("payments")
      .select("id, amount, metadata, jobs!inner(tradie_id)")
      .eq("jobs.tradie_id", tradieId)
      .eq("status", "completed"),
    supabase
      .from("payments")
      .select("id, amount, metadata")
      .eq("metadata->>tradie_id", tradieId)
      .eq("status", "completed"),
    supabase
      .from("payments")
      .select("id, amount, metadata, jobs!inner(tradie_id)")
      .eq("jobs.tradie_id", tradieId)
      .eq("status", "released")
      .not("metadata->>split_payout_cents", "is", null)
      .is("metadata->>payout_id", null),
  ]);

  const failure = jobAnchored.error ?? metaAnchored.error ?? pendingSplits.error;
  if (failure) {
    throw new Error(`escrow reserve query failed: ${JSON.stringify(failure)}`);
  }

  return sumEscrowReserveCents([
    ...((jobAnchored.data ?? []) as EscrowRow[]),
    ...((metaAnchored.data ?? []) as EscrowRow[]),
    ...((pendingSplits.data ?? []) as EscrowRow[]),
  ]);
}
