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
// Mirrors src/lib/paymentRelease.ts (`isDestinationRouted`,
// `creditedToBalanceCents`). Deno can't import from src/, so the two copies are
// kept deliberately identical — change both.
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
 * Sum the escrow still held for a tradie. Takes the union of however many
 * queries the caller ran (rows anchor on the job for off-app payments and on
 * metadata.tradie_id for in-app ones) and de-duplicates by payment id.
 */
export function sumEscrowReserveCents(rows: EscrowRow[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const row of rows) {
    if (row.id) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
    }
    if (!isDestinationRouted(row) || !isStillHeld(row)) continue;
    total += creditedToBalanceCents(row);
  }
  return total;
}

/**
 * Runs the two anchor queries and returns the tradie's held escrow.
 *
 * Rows anchor differently depending on who paid: accept-and-pay and
 * pay-price-increase stamp metadata.tradie_id, while public-quote and
 * invoice-contact serve off-app clients with no profile, so those rows carry no
 * tradie_id and are only reachable through the job. Missing either anchor leaves
 * client escrow unreserved and payable.
 *
 * THROWS if either query fails. Callers must not treat an error as "no escrow
 * held" — that is how you pay out client funds.
 */
export async function fetchEscrowReserveCents(
  supabase: SupabaseLike,
  tradieId: string,
): Promise<number> {
  const [jobAnchored, metaAnchored] = await Promise.all([
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
  ]);

  if (jobAnchored.error || metaAnchored.error) {
    throw new Error(
      `escrow reserve query failed: ${JSON.stringify(jobAnchored.error ?? metaAnchored.error)}`,
    );
  }

  return sumEscrowReserveCents([
    ...((jobAnchored.data ?? []) as EscrowRow[]),
    ...((metaAnchored.data ?? []) as EscrowRow[]),
  ]);
}
