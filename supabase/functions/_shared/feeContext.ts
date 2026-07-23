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
  /** profiles.platform_fee_override_bps */
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

  const breakdown = calculateFeeV21({
    labourCents,
    materialsCents,
    tier: resolveTierScheduleV21(input.tier),
    isRepeatClient: isRepeat,
    materialsProcessingBps,
    overrideBps: input.overrideBps ?? null,
  });

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
