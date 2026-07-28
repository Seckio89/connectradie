// ─────────────────────────────────────────────────────────────────────────────
// Charge-time fee resolution (pricing v2.1 Phase 3).
//
// THE single entry point every charge path uses to work out what the platform
// takes. Call sites must never assemble a fee themselves — that is how the old
// system ended up with the same arithmetic duplicated across sixteen functions.
//
// It resolves, in one place:
//   • the labour / materials split (falling back to all-labour when unknown)
//   • the repeat-client rate (server-side lookup, never client-supplied)
//   • the at-cost materials processing rate (platform_config)
//   • the per-profile override (grandfathering / platform owner 0%)
//
// and returns both the Stripe application_fee_amount and the exact rows/metadata
// to persist, so the breakdown a tradie sees is always the one that was charged.
// ─────────────────────────────────────────────────────────────────────────────

import {
  calculateFeeV21,
  resolveTierScheduleV21,
  DEFAULT_MATERIALS_PROCESSING_BPS,
  type TradieTier,
  type FeeBreakdownV21,
} from "./pricing.ts";
import { isRepeatClientPair } from "./repeatClient.ts";

/** Minimal structural type — avoids importing the Supabase SDK here. */
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface ChargeFeeInput {
  /** The amount actually being collected now, in cents. Authoritative. */
  amountCents: number;
  /** Labour portion from the quote, if known. */
  labourCents?: number | null;
  /** Materials portion from the quote, if known. */
  materialsCents?: number | null;
  tier: TradieTier;
  /**
   * @deprecated FALLBACK ONLY — do not rely on this.
   * resolveChargeFee now looks profiles.platform_fee_override_bps up itself from
   * `tradieId`, because a caller passing null here silently produces a full-rate
   * overcharge. This value is used only if that lookup can't run or fails.
   */
  overrideBps?: number | null;
  tradieId?: string | null;
  clientId?: string | null;
  jobId?: string | null;
  /** Skip the repeat lookup (e.g. non-job charges that can't have a pair). */
  skipRepeatCheck?: boolean;
}

export interface ResolvedChargeFee {
  breakdown: FeeBreakdownV21;
  /** Stripe application_fee_amount = commission + at-cost materials processing. */
  applicationFeeAmount: number;
  materialsProcessingBps: number;
  isRepeatClient: boolean;
  /** Freeze into Stripe/session metadata (all values stringified). */
  metadata: Record<string, string>;
  /** Columns to write on the payments row. */
  paymentColumns: Record<string, unknown>;
}

/**
 * Reads a frozen money value (cents) out of payment/PI metadata.
 *
 * SHARED deliberately: release-escrow and auto-release-payments both compute the
 * payout amount and share a Stripe idempotency key, so if they ever disagree by
 * a cent the racing retry is rejected. They must read frozen fees identically.
 *
 * This replaces a bare `typeof x === "number"` check that was a live foot-gun:
 * several charge paths wrote platform_fee as a STRING and those were silently
 * read as 0 — releasing the FULL amount to the tradie even though Stripe had
 * already taken the application fee at charge time. Rather than trust every
 * writer, the reader is tolerant: number or numeric string, and only genuinely
 * missing/unparseable values become 0.
 */
export function frozenCents(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return 0;
}

/**
 * Reads the at-cost materials processing rate. Falls back to the launch default
 * if the row is missing so a config blip can never zero the pass-through (which
 * would silently make materials-heavy jobs unprofitable).
 */
export async function getMaterialsProcessingBps(supabase: SupabaseLike): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("platform_config")
      .select("value_int")
      .eq("key", "materials_processing_bps")
      .maybeSingle();
    if (error || data?.value_int == null) return DEFAULT_MATERIALS_PROCESSING_BPS;
    return Number(data.value_int);
  } catch {
    return DEFAULT_MATERIALS_PROCESSING_BPS;
  }
}

/**
 * Splits the amount being charged into labour + materials.
 *
 * The amount actually collected is authoritative — NOT the quote. If the two
 * disagree (a deposit, a partial payment, a later price adjustment), materials
 * are pro-rated to the real amount so labour + materials always reconciles to
 * what was charged. Commission can therefore never be levied on money that was
 * not collected.
 */
export function splitAmount(
  amountCents: number,
  labourCents?: number | null,
  materialsCents?: number | null,
): { labourCents: number; materialsCents: number } {
  const amount = Math.max(0, Math.round(amountCents));
  const mat = materialsCents == null ? null : Math.max(0, Math.round(materialsCents));
  const lab = labourCents == null ? null : Math.max(0, Math.round(labourCents));

  // Unknown split → treat the whole charge as labour. This preserves the
  // pre-v2.1 behaviour (commission on everything) for paths that have no quote
  // behind them, e.g. invoices, bonuses, recurring services.
  if (mat == null) return { labourCents: amount, materialsCents: 0 };

  const declaredTotal = (lab ?? 0) + mat;
  if (declaredTotal <= 0) return { labourCents: amount, materialsCents: 0 };
  if (declaredTotal === amount) return { labourCents: lab ?? amount - mat, materialsCents: mat };

  // Partial / drifted — keep the materials share proportional to the real amount.
  const proRatedMaterials = Math.min(amount, Math.round(amount * (mat / declaredTotal)));
  return { labourCents: amount - proRatedMaterials, materialsCents: proRatedMaterials };
}

/**
 * Records an immutable ledger row for commission actually charged (spec §7A).
 *
 * Deliberately BEST-EFFORT: it swallows and logs every error. Issuing a tax
 * invoice must never be able to fail a payout — the money moving is what
 * matters, and a missing ledger row can be reconciled later from the payment.
 *
 * Idempotent via the UNIQUE constraint on payment_id, so a retried release can
 * never bill the same commission twice.
 *
 * commission is GST-INCLUSIVE: gst = round(commission / 11), ex = commission − gst.
 * materialsProcessing is stored for the accountant but is NOT invoiced — it is
 * Stripe's cost at cost, not platform revenue.
 */
export async function recordFeeCharge(
  supabase: SupabaseLike,
  input: {
    tradieProfileId: string | null | undefined;
    paymentId: string;
    jobId?: string | null;
    commissionCents: number;
    materialsProcessingCents?: number;
    feeRateBps?: number | null;
    feeRateType?: string | null;
  },
): Promise<void> {
  try {
    if (!input.tradieProfileId || !(input.commissionCents > 0)) return; // nothing billable
    const commission = Math.round(input.commissionCents);
    const gst = Math.round(commission / 11);
    const { error } = await supabase.from("platform_fee_charges").insert({
      tradie_profile_id: input.tradieProfileId,
      payment_id: input.paymentId,
      job_id: input.jobId ?? null,
      commission_cents: commission,
      gst_cents: gst,
      ex_gst_cents: commission - gst,
      materials_processing_cents: Math.round(input.materialsProcessingCents ?? 0),
      fee_rate_bps: input.feeRateBps ?? null,
      fee_rate_type: input.feeRateType === "repeat_client" ? "repeat_client" : "standard",
      kind: "commission",
    });
    // 23505 = already recorded for this payment; that's the idempotent path.
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[recordFeeCharge] failed (payout unaffected)", input.paymentId, error);
    }
  } catch (err) {
    console.error("[recordFeeCharge] threw (payout unaffected)", err);
  }
}

/**
 * Records the Stripe instant-payout fee as platform revenue.
 *
 * Stripe's platform pricing scheme collects this as an application fee, so it is
 * money we actually receive — unlike materials processing, which is Stripe's
 * cost passed through at cost and deliberately never invoiced. It therefore
 * belongs on the tradie's tax invoice, as its own line.
 *
 * Same contract as recordFeeCharge: BEST-EFFORT. The payout has already left
 * Stripe by the time this runs; failing to write paperwork must never make the
 * caller believe the payout failed.
 *
 * Idempotent via the partial UNIQUE index on payout_id. Stripe payout ids are
 * globally unique, which is what lets the balance-anchored button path (no
 * payments row at all) be recorded safely.
 *
 * feeCents is GST-INCLUSIVE — it is exactly what the tradie was shown and what
 * Stripe collected — so gst = round(fee / 11), matching commission.
 */
export async function recordInstantPayoutFee(
  supabase: SupabaseLike,
  input: {
    tradieProfileId: string | null | undefined;
    /** Stripe payout id — the idempotency anchor. */
    payoutId: string;
    feeCents: number;
    /** Set when the payout came from releasing a specific payment. */
    paymentId?: string | null;
    jobId?: string | null;
    feeRateBps?: number | null;
  },
): Promise<void> {
  try {
    if (!input.tradieProfileId || !input.payoutId || !(input.feeCents > 0)) return; // nothing billable
    const fee = Math.round(input.feeCents);
    const gst = Math.round(fee / 11);
    const { error } = await supabase.from("platform_fee_charges").insert({
      tradie_profile_id: input.tradieProfileId,
      payment_id: input.paymentId ?? null,
      payout_id: input.payoutId,
      job_id: input.jobId ?? null,
      kind: "instant_payout",
      commission_cents: fee, // the amount column, whatever the kind
      gst_cents: gst,
      ex_gst_cents: fee - gst,
      materials_processing_cents: 0,
      fee_rate_bps: input.feeRateBps ?? null,
      // Not a commission rate. The CHECK only allows standard|repeat_client, and
      // 'standard' is the honest reading: this tradie's configured instant rate.
      fee_rate_type: "standard",
    });
    // 23505 = already recorded for this payout; that's the idempotent path.
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[recordInstantPayoutFee] failed (payout unaffected)", input.payoutId, error);
    }
  } catch (err) {
    console.error("[recordInstantPayoutFee] threw (payout unaffected)", err);
  }
}

/**
 * Reverses a commission charge after a refund (spec §7A).
 *
 * Two cases, and the difference matters legally:
 *
 *   • The charge was never invoiced — no tax document exists, so the ledger row
 *     is simply removed. Nothing to offset.
 *   • The charge IS on an issued invoice — under AU rules that invoice cannot be
 *     edited or deleted. It must be offset by an ADJUSTMENT NOTE: a second
 *     document with negative amounts pointing at the original.
 *
 * Best-effort like recordFeeCharge: the refund itself has already happened at
 * Stripe, and failing to write paperwork must never make the caller think the
 * refund failed. Errors are logged loudly instead.
 */
export async function recordFeeRefund(
  supabase: SupabaseLike,
  paymentId: string,
): Promise<void> {
  try {
    // kind='commission' is REQUIRED, not decorative. Uniqueness on this table is
    // now (payment_id, kind), so a payment released instantly carries a second
    // instant_payout row — and .maybeSingle() errors when a query matches more
    // than one. Refunding a job's commission must not be affected by, or reverse,
    // a separate instant transfer fee the tradie chose to pay.
    const { data: charge, error } = await supabase
      .from("platform_fee_charges")
      .select("id, tradie_profile_id, commission_cents, gst_cents, ex_gst_cents, invoice_id")
      .eq("payment_id", paymentId)
      .eq("kind", "commission")
      .maybeSingle();

    if (error || !charge) return; // nothing was ever billed for this payment

    // Not yet invoiced → no tax document references it. Drop the ledger row so
    // the next invoicing run doesn't bill a commission that was refunded.
    if (!charge.invoice_id) {
      const { error: delErr } = await supabase
        .from("platform_fee_charges")
        .delete()
        .eq("id", charge.id)
        .is("invoice_id", null); // guard: never delete something since invoiced
      if (delErr) console.error("[recordFeeRefund] could not drop uninvoiced charge", paymentId, delErr);
      return;
    }

    // Already invoiced → issue an adjustment note offsetting it.
    //
    // Idempotent via the partial UNIQUE index on adjusts_charge_id: a refund
    // that runs twice for the same payment (concurrent requests, or a retry
    // after the payments UPDATE failed) must not emit a SECOND adjustment note
    // and double-credit the commission on paper. We key on the charge — NOT on
    // adjusts_invoice_id — because a monthly consolidated invoice covers many
    // charges, so distinct payments refunded against the same invoice each need
    // their own adjustment note.
    const today = new Date().toISOString().slice(0, 10);
    const { error: adjErr } = await supabase.from("platform_fee_invoices").insert({
      tradie_profile_id: charge.tradie_profile_id,
      period_start: today,
      period_end: today,
      subtotal_ex_gst_cents: -charge.ex_gst_cents,
      gst_cents: -charge.gst_cents,
      total_cents: -charge.commission_cents,
      kind: "adjustment",
      adjusts_invoice_id: charge.invoice_id,
      adjusts_charge_id: charge.id,
    });
    // 23505 = an adjustment note already exists for this charge; that's the
    // idempotent path, not a failure.
    if (adjErr && (adjErr as { code?: string }).code !== "23505") {
      console.error("[recordFeeRefund] ADJUSTMENT NOTE FAILED — invoice", charge.invoice_id,
        "still stands against a refunded payment", paymentId, adjErr);
    }
  } catch (err) {
    console.error("[recordFeeRefund] threw (refund itself unaffected)", paymentId, err);
  }
}

/**
 * Pulls the labour/materials split from a job's accepted quote.
 *
 * Deposits, milestones and staged payments all charge a PORTION of the job, so
 * the split is returned whole and `splitAmount` pro-rates it to whatever is
 * actually being collected. Returns nulls when there is no accepted quote (the
 * caller then falls back to all-labour).
 */
export async function getJobQuoteSplit(
  supabase: SupabaseLike,
  jobId: string | null | undefined,
): Promise<{ labourCents: number | null; materialsCents: number | null }> {
  if (!jobId) return { labourCents: null, materialsCents: null };
  try {
    const { data, error } = await supabase
      .from("quotes")
      .select("labour_cents, materials_cents")
      .eq("job_id", jobId)
      .eq("status", "accepted")
      .maybeSingle();
    if (error || !data || data.labour_cents == null) {
      return { labourCents: null, materialsCents: null };
    }
    return {
      labourCents: Number(data.labour_cents),
      materialsCents: Number(data.materials_cents ?? 0),
    };
  } catch {
    return { labourCents: null, materialsCents: null };
  }
}

/**
 * Resolve the platform's take for a charge. Always await this at charge time —
 * the repeat-client rate is a live server-side lookup and must not be cached
 * across jobs.
 */
export async function resolveChargeFee(
  supabase: SupabaseLike,
  input: ChargeFeeInput,
): Promise<ResolvedChargeFee> {
  const { labourCents, materialsCents } = splitAmount(
    input.amountCents,
    input.labourCents,
    input.materialsCents,
  );

  const materialsProcessingBps = await getMaterialsProcessingBps(supabase);

  const isRepeat = input.skipRepeatCheck
    ? false
    : await isRepeatClientPair(supabase, input.tradieId, input.clientId, input.jobId);

  // ── Fee override: resolved HERE, server-side, not trusted from the caller ──
  // Previously every charge path did its own `profiles` select and passed this
  // in — 20 call sites across 14 functions, so 20 chances for it to arrive null
  // (a column missing from a select, a stale deployed artifact, a partial row).
  // A null override silently falls through to full tier pricing, i.e. a SILENT
  // OVERCHARGE. That is exactly what happened on 2026-07-24: a tradie holding a
  // 0 bps override was billed the standard Pro min fee, and because the applied
  // rate was never recorded the cause could not be established afterwards.
  //
  // Looking it up here makes the override a property of the fee engine that no
  // caller can omit. input.overrideBps is kept only as a FALLBACK for when the
  // lookup can't run or fails.
  let effectiveOverrideBps: number | null = input.overrideBps ?? null;
  let overrideLookupFailed = false;
  if (input.tradieId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("platform_fee_override_bps")
        .eq("id", input.tradieId)
        .maybeSingle();
      if (error) throw error;
      // A found row is authoritative — including when the value is NULL, which
      // legitimately means "no override, charge normal tier rates".
      if (data) {
        effectiveOverrideBps =
          (data as { platform_fee_override_bps: number | null }).platform_fee_override_bps ?? null;
      }
    } catch (err) {
      // Deliberately do NOT throw: that would fail the charge on a transient DB
      // blip and break payments. Fall back to whatever the caller supplied and
      // mark it, so a silent overcharge becomes a VISIBLE one the daily fee
      // audit can flag (check_v21_fee_invariants).
      overrideLookupFailed = true;
      console.error("[resolveChargeFee] override lookup failed for tradie", input.tradieId, err);
    }
  }

  const tierSchedule = resolveTierScheduleV21(input.tier);

  let breakdown = calculateFeeV21({
    labourCents,
    materialsCents,
    tier: tierSchedule,
    isRepeatClient: isRepeat,
    materialsProcessingBps,
    overrideBps: effectiveOverrideBps,
  });

  // ── Job-level fee cap (spec §5) ─────────────────────────────────────────────
  // feeCapCents is documented as "Absolute cap on commission per JOB", and the
  // pricing page promises "capped at $500 per job". But calculateFeeV21 only
  // ever sees ONE charge, so the cap was re-applied in full to every instalment.
  //
  //   $20,000 all-labour job, free tier (800 bps, $500 cap, 250 bps floor):
  //     paid in one charge   -> min(1600, max(500,500)) = $500   correct
  //     paid as 4 x $5,000   -> min( 400, max(500,125)) = $400 each
  //                             = $1,600 total, 3.2x the advertised cap
  //
  // So a tradie was charged more purely because the client paid in stages. Fixed
  // by tracking what this job has already been charged and only ever allowing
  // the remainder of the job's ceiling.
  //
  // The floor (2.5% of labour) is also a per-JOB quantity, so it is recomputed on
  // cumulative labour — which is why this converges to exactly the single-charge
  // answer in both the cap-bound and floor-bound cases:
  //
  //   $100,000 labour, free tier: single charge -> max(500, 2500) = $2,500;
  //   4 x $25,000 -> 625 + 625 + 625 + 625      = $2,500          identical
  //
  // Done here rather than in calculateFeeV21 so the calculator stays a pure
  // function, and centrally rather than per-caller so all 16 charge sites get it.
  let jobCapApplied = false;
  let jobCapLookupFailed = false;
  if (input.jobId) {
    try {
      // Only charges where money was actually taken. A failed/cancelled attempt
      // must not consume the job's cap headroom.
      const { data: priorRows, error: priorError } = await supabase
        .from("payments")
        .select("commission_cents, labour_cents")
        .eq("job_id", input.jobId)
        .in("status", ["completed", "funded", "paid", "released"]);
      if (priorError) throw priorError;

      const priorRowsTyped = (priorRows || []) as Array<{
        commission_cents: number | null;
        labour_cents: number | null;
      }>;
      const priorCommission = priorRowsTyped.reduce(
        (s: number, r) => s + (Number(r.commission_cents) || 0),
        0,
      );
      const priorLabour = priorRowsTyped.reduce(
        (s: number, r) => s + (Number(r.labour_cents) || 0),
        0,
      );

      const hasOverride = effectiveOverrideBps != null && effectiveOverrideBps >= 0;
      const cumulativeLabour = priorLabour + labourCents;
      // An override bypasses the floor entirely, matching calculateFeeV21.
      const jobFloorCents = hasOverride
        ? 0
        : Math.round((cumulativeLabour * tierSchedule.capFloorBps) / 10_000);
      const jobCeilingCents = Math.max(tierSchedule.feeCapCents, jobFloorCents);
      const allowedNowCents = Math.max(0, jobCeilingCents - priorCommission);

      if (breakdown.commissionCents > allowedNowCents) {
        const commissionCents = allowedNowCents;
        const totalDeductionCents = commissionCents + breakdown.materialsProcessingCents;
        breakdown = {
          ...breakdown,
          commissionCents,
          gstComponentCents: Math.round(commissionCents / 11),
          totalDeductionCents,
          wasCapped: true,
          netToTradieCents: labourCents + materialsCents - totalDeductionCents,
        };
        jobCapApplied = true;
      }
    } catch (err) {
      // Never fail a charge over this. Falling through leaves the previous
      // per-charge behaviour, which over-collects rather than under-collects —
      // recoverable, and flagged in metadata for the daily fee audit.
      console.error("[resolveChargeFee] job cap lookup failed for job", input.jobId, err);
      jobCapLookupFailed = true;
    }
  }

  return {
    breakdown,
    // Spec §1.3: application_fee_amount = totalDeductionCents. The old separate
    // processing fee is gone — on labour it is covered inside the commission,
    // and on materials it is this at-cost pass-through.
    applicationFeeAmount: breakdown.totalDeductionCents,
    materialsProcessingBps,
    isRepeatClient: isRepeat,
    metadata: {
      // Kept for backwards compatibility: release-escrow and the webhook read
      // metadata.platform_fee as the total the platform retains.
      platform_fee: String(breakdown.totalDeductionCents),
      commission: String(breakdown.commissionCents),
      materials_processing: String(breakdown.materialsProcessingCents),
      materials_processing_bps: String(materialsProcessingBps),
      labour_cents: String(labourCents),
      materials_cents: String(materialsCents),
      fee_rate_bps: String(breakdown.rateApplied),
      fee_rate_type: breakdown.rateType,
      fee_gst_component: String(breakdown.gstComponentCents),
      fee_floor_applied: String(breakdown.floorApplied),
      // Forensics: what override actually applied to this charge, and whether the
      // server-side lookup failed (in which case the caller's value was used and
      // the fee may be wrong). The daily audit cross-checks these against the
      // tradie's current override — see check_v21_fee_invariants.
      override_bps_applied: effectiveOverrideBps === null ? "" : String(effectiveOverrideBps),
      ...(overrideLookupFailed ? { override_lookup_failed: "true" } : {}),
      // Job-level cap forensics: whether this charge was trimmed because the
      // job's cumulative commission had reached its ceiling, and whether the
      // lookup that decides that failed (in which case the charge fell back to
      // per-charge capping and may OVER-collect).
      ...(jobCapApplied ? { job_cap_applied: "true" } : {}),
      ...(jobCapLookupFailed ? { job_cap_lookup_failed: "true" } : {}),
      fee_model: "v2.1",
    },
    paymentColumns: {
      labour_cents: labourCents,
      materials_cents: materialsCents,
      commission_cents: breakdown.commissionCents,
      materials_processing_cents: breakdown.materialsProcessingCents,
      materials_processing_bps: materialsProcessingBps,
      fee_rate_type: breakdown.rateType,
      fee_floor_applied: breakdown.floorApplied,
      // Existing audit columns keep their meaning.
      platform_fee_cents: breakdown.totalDeductionCents,
      fee_rate_bps: breakdown.rateApplied,
      gst_on_fee_cents: breakdown.gstComponentCents,
      fee_calculated_at: new Date().toISOString(),
    },
  };
}
