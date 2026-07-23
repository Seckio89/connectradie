// ---------------------------------------------------------------------------
// Shared pricing configuration for edge functions
// Source of truth mirrors: src/config/pricing.ts
// ---------------------------------------------------------------------------

export const PRICING_CONFIG = {
  tradie: {
    free: {
      platformFee: {
        type: "sliding" as const,
        tiers: [
          { maxJobValue: 150, rate: 0.10 },
          { maxJobValue: 500, rate: 0.08 },
          { maxJobValue: 1000, rate: 0.06 },
          { maxJobValue: 5000, rate: 0.05 },
          { maxJobValue: Infinity, rate: 0.04 },
        ],
        cap: 400,
      },
    },
    pro: {
      platformFee: {
        type: "sliding" as const,
        tiers: [
          { maxJobValue: 500, rate: 0.05 },
          { maxJobValue: 2500, rate: 0.04 },
          { maxJobValue: Infinity, rate: 0.03 },
        ],
        cap: 250,
      },
    },
    pro_plus: {
      platformFee: {
        type: "flat" as const,
        rate: 0.025,
        cap: 200,
      },
    },
  },
  propertyManager: {
    pm_starter: { platformFeeRate: 0.04 },
    pm_pro: { platformFeeRate: 0.03 },
    pm_enterprise: { platformFeeRate: 0.02 },
  },
  processing: {
    stripePercentage: 0.0175,
    stripeFixed: 0.30,
    platformProcessingMargin: 0.0175,
  },
  becsProcessing: {
    stripePercentage: 0.01,      // 1% (vs card 1.75%)
    stripeFixed: 0.30,            // $0.30 fixed
    platformProcessingMargin: 0.0175, // matches card margin for consistency
  },
} as const;

export type TradieTier = "free" | "pro" | "pro_plus" | "pm";
export type PMTier = "pm_starter" | "pm_pro" | "pm_enterprise";

export interface FeeBreakdown {
  jobValue: number;
  platformFee: number;
  platformFeePercentage: number;
  processingFee: number;
  totalFees: number;
  tradieReceives: number;
}

// ---------------------------------------------------------------------------
// Resolve DB subscription_tier value to TradieTier
// ---------------------------------------------------------------------------
export function resolveTradieTier(subscriptionTier: string | null | undefined): TradieTier {
  if (subscriptionTier === "pro" || subscriptionTier === "business") return "pro";
  if (subscriptionTier === "pro_plus") return "pro_plus";
  // Property-Manager tiers charge the single advertised PM schedule (3% / 1.5%
  // above $3k, cap $270). Previously these fell through to "free", so PM jobs
  // routed through escrow were billed the Free rate — fixed here.
  if (subscriptionTier === "pm_starter" || subscriptionTier === "pm_pro" || subscriptionTier === "pm_enterprise") {
    return "pm";
  }
  return "free";
}

// ---------------------------------------------------------------------------
// Platform fee calculation
// ---------------------------------------------------------------------------
export function calculatePlatformFee(
  jobValueDollars: number,
  tier: TradieTier,
  overrideBps?: number | null,
): number {
  // Live money path now charges the ADVERTISED V2 schedule (see /pricing and
  // TIER_SCHEDULES below): Free 10% / cap $900, Pro 7% / cap $630, PM 3% / cap
  // $270 — with the reduced marginal rate on the part of a job above $3,000.
  // This replaces the legacy sliding brackets so what a tradie is charged equals
  // what the pricing page promises. pro_plus (retired, unadvertised) settles at
  // the Pro schedule.
  //
  // overrideBps (profiles.platform_fee_override_bps) forces a flat rate on the
  // whole amount, still subject to the tier cap. Used for grandfathering and for
  // the platform owner's 0% commission (override 0 → zero fee; V2 treats 0 as a
  // real rate, not "no override").
  const schedule =
    tier === "pm" ? TIER_SCHEDULES.pm :
    tier === "free" ? TIER_SCHEDULES.free :
    TIER_SCHEDULES.pro; // pro + pro_plus
  const cents = Math.round(Math.max(0, jobValueDollars) * 100);
  return calculatePlatformFeeCentsV2(cents, schedule, overrideBps).feeCents / 100;
}

// ---------------------------------------------------------------------------
// Processing fee calculation (in dollars)
// ---------------------------------------------------------------------------
export function calculateProcessingFee(jobValueDollars: number): number {
  return (
    jobValueDollars * PRICING_CONFIG.processing.stripePercentage +
    PRICING_CONFIG.processing.stripeFixed +
    jobValueDollars * PRICING_CONFIG.processing.platformProcessingMargin
  );
}

// ---------------------------------------------------------------------------
// Processing fee calculation (in cents, for edge functions working in cents)
// ---------------------------------------------------------------------------
export function calculateProcessingFeeCents(amountCents: number): number {
  return Math.round(
    amountCents * PRICING_CONFIG.processing.stripePercentage +
    PRICING_CONFIG.processing.stripeFixed * 100 +
    amountCents * PRICING_CONFIG.processing.platformProcessingMargin
  );
}

// ---------------------------------------------------------------------------
// GST calculation (10% on base amount, in cents)
// ---------------------------------------------------------------------------
export const GST_RATE = 0.10;

export function calculateGstCents(amountCents: number): number {
  return Math.round(amountCents * GST_RATE);
}

export function calculateGst(amountDollars: number): number {
  return Math.round(amountDollars * GST_RATE * 100) / 100;
}

// ---------------------------------------------------------------------------
// Full fee breakdown
// ---------------------------------------------------------------------------
export function calculateTradieFees(jobValue: number, tier: TradieTier): FeeBreakdown {
  const platformFee = calculatePlatformFee(jobValue, tier);
  const processingFee = calculateProcessingFee(jobValue);
  const totalFees = platformFee + processingFee;

  return {
    jobValue,
    platformFee: Math.round(platformFee * 100) / 100,
    platformFeePercentage: (platformFee / jobValue) * 100,
    processingFee: Math.round(processingFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    tradieReceives: Math.round((jobValue - totalFees) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// BECS Direct Debit processing fee (in dollars)
// ---------------------------------------------------------------------------
export function calculateBecsProcessingFee(jobValueDollars: number): number {
  return (
    jobValueDollars * PRICING_CONFIG.becsProcessing.stripePercentage +
    PRICING_CONFIG.becsProcessing.stripeFixed +
    jobValueDollars * PRICING_CONFIG.becsProcessing.platformProcessingMargin
  );
}

// ---------------------------------------------------------------------------
// BECS Direct Debit processing fee (in cents)
// ---------------------------------------------------------------------------
export function calculateBecsProcessingFeeCents(amountCents: number): number {
  return Math.round(
    amountCents * PRICING_CONFIG.becsProcessing.stripePercentage +
    PRICING_CONFIG.becsProcessing.stripeFixed * 100 +
    amountCents * PRICING_CONFIG.becsProcessing.platformProcessingMargin
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FEE MODEL V2 — "one fee, one side, one moment": the tradie, on completion,
// capped. This is the SOLE computation for the new pricing system; at cutover it
// replaces the legacy calculators above (which live edge functions still use).
//
// Rules:
//   • Integer CENTS in, integer cents out. Never floats in money.
//   • Rates in basis points (bps). GST-INCLUSIVE: the fee IS the total the
//     tradie pays; gstOnFeeCents = the GST component (1/11 of the fee).
//   • Marginal reduced rate: rate_bps on the first `reducedThresholdCents`,
//     reduced_rate_bps on the remainder. All seeded caps land at $15,000 —
//     confirming the marginal reading.
//   • Per-profile override (grandfathering): a flat bps rate on the whole
//     amount, still subject to the tier cap.
//   • Clients are NEVER charged a platform fee. Tradies are NEVER charged to quote.
// ═════════════════════════════════════════════════════════════════════════════

export interface TierFeeSchedule {
  /** Commission on the first `reducedThresholdCents`, in basis points. */
  rateBps: number;
  /** Commission above the threshold, in basis points. */
  reducedRateBps: number;
  /** Threshold where the reduced rate kicks in (cents). */
  reducedThresholdCents: number;
  /** Absolute cap on the fee per job (cents). */
  feeCapCents: number;
}

/** Mirrors the pricing_tiers seed — used when the DB row isn't at hand. */
export const TIER_SCHEDULES: Record<"free" | "pro" | "pm", TierFeeSchedule> = {
  free: { rateBps: 1000, reducedRateBps: 500, reducedThresholdCents: 300_000, feeCapCents: 90_000 },
  pro:  { rateBps: 700,  reducedRateBps: 350, reducedThresholdCents: 300_000, feeCapCents: 63_000 },
  pm:   { rateBps: 300,  reducedRateBps: 150, reducedThresholdCents: 300_000, feeCapCents: 27_000 },
};

export interface PlatformFeeResult {
  /** The fee, GST-inclusive, integer cents. */
  feeCents: number;
  /** GST component of the fee (1/11, rounded), integer cents. */
  gstOnFeeCents: number;
  /** Effective blended rate actually applied, basis points. */
  effectiveRateBps: number;
  /** True when the cap bound the fee. */
  capped: boolean;
}

/**
 * V2 platform fee. `overrideBps` (profiles.platform_fee_override_bps) replaces
 * the schedule's rates with a flat rate on the whole amount; the tier cap still
 * applies. Amounts ≤ 0 yield a zero fee.
 */
export function calculatePlatformFeeCentsV2(
  amountCents: number,
  schedule: TierFeeSchedule,
  overrideBps?: number | null,
): PlatformFeeResult {
  const amount = Math.max(0, Math.floor(amountCents));
  if (amount === 0) return { feeCents: 0, gstOnFeeCents: 0, effectiveRateBps: 0, capped: false };

  let raw: number;
  if (overrideBps != null && overrideBps >= 0) {
    raw = Math.round((amount * overrideBps) / 10_000);
  } else {
    const atFull = Math.min(amount, schedule.reducedThresholdCents);
    const above = Math.max(0, amount - schedule.reducedThresholdCents);
    raw = Math.round((atFull * schedule.rateBps + above * schedule.reducedRateBps) / 10_000);
  }

  const capped = raw > schedule.feeCapCents;
  const feeCents = capped ? schedule.feeCapCents : raw;
  // GST-inclusive: the GST component of a GST-inclusive amount is 1/11.
  const gstOnFeeCents = Math.round(feeCents / 11);
  const effectiveRateBps = Math.round((feeCents * 10_000) / amount);

  return { feeCents, gstOnFeeCents, effectiveRateBps, capped };
}

export function calculatePMFees(jobValue: number, _tier: PMTier): FeeBreakdown {
  // All PM tiers now settle at the single advertised PM schedule (3% / 1.5%
  // above $3k, cap $270) — matching /pricing and the live charge. The old
  // per-subtier flat rates (4% / 3% / 2%) are retired.
  const platformFee =
    calculatePlatformFeeCentsV2(Math.round(Math.max(0, jobValue) * 100), TIER_SCHEDULES.pm).feeCents / 100;
  const processingFee = calculateProcessingFee(jobValue);
  const totalFees = platformFee + processingFee;

  return {
    jobValue,
    platformFee: Math.round(platformFee * 100) / 100,
    platformFeePercentage: jobValue > 0 ? (platformFee / jobValue) * 100 : 0,
    processingFee: Math.round(processingFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    tradieReceives: Math.round((jobValue - totalFees) * 100) / 100,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// FEE MODEL V2.1 — "one fee, one side, one moment: the tradie, on LABOUR, at
// completion, capped, and cheaper the longer you stay." (pricing-system-spec v2.1)
//
// This is the NEW engine. It is NOT yet wired into any charge path — the live
// money flow still calls calculatePlatformFeeCentsV2 above (full-value, threshold
// sliding). Phase 3 cuts the charge path and the DB rates over to this model in
// one deliberate step. Until then this exists so its full test suite is green and
// the numbers are locked before any real payment touches it.
//
// What changes from V2 → V2.1:
//   • Commission on LABOUR only. Materials pass through escrow untouched.
//   • Flat rate per tier (no $3k threshold), plus a cheaper REPEAT-CLIENT rate.
//   • A 2.5%-of-labour floor under the cap, so the cap can never go underwater
//     (V2's cap lost money on very large jobs).
//   • Card processing on the MATERIALS portion passed through AT COST
//     (materials_processing_bps, platform config — 193 at launch), never marked
//     up, never inside the commission cap.
//   • GST-inclusive; gstComponentCents = 1/11 of commission (reporting only).
// ═════════════════════════════════════════════════════════════════════════════

export interface TierScheduleV21 {
  /** Standard commission on labour, basis points. */
  rateBps: number;
  /** Repeat-client commission on labour (2nd job onward for the pair), bps. */
  repeatRateBps: number;
  /** Absolute cap on commission per job (cents). */
  feeCapCents: number;
  /** Floor under the cap: commission never below this % of labour (bps). */
  capFloorBps: number;
  /** Minimum commission (cents), itself clamped so it never exceeds labour. */
  minFeeCents: number;
}

/**
 * Mirrors the pricing_tiers V2.1 columns (rate_bps / repeat_rate_bps /
 * cap_floor_bps / min_fee_cents / fee_cap_cents). Used when the DB row isn't at
 * hand. NOTE: the DB rows still carry the LIVE V2 values until the Phase 3
 * cutover — these constants are the V2.1 targets and are the source of truth for
 * this engine's tests.
 */
export const TIER_SCHEDULES_V21: Record<"free" | "pro" | "pm", TierScheduleV21> = {
  free: { rateBps: 800, repeatRateBps: 500, feeCapCents: 50_000, capFloorBps: 250, minFeeCents: 500 },
  pro:  { rateBps: 500, repeatRateBps: 400, feeCapCents: 40_000, capFloorBps: 250, minFeeCents: 500 },
  pm:   { rateBps: 300, repeatRateBps: 300, feeCapCents: 27_000, capFloorBps: 250, minFeeCents: 500 },
};

/** Stripe's effective inc-GST card rate, passed through on materials at cost. */
export const DEFAULT_MATERIALS_PROCESSING_BPS = 193;

export interface FeeInputV21 {
  labourCents: number;
  materialsCents: number;
  tier: TierScheduleV21;
  isRepeatClient: boolean;
  /** Platform config, NOT per-tier. Stripe's effective inc-GST rate in bps. */
  materialsProcessingBps: number;
}

export interface FeeBreakdownV21 {
  /** Platform's earnings (GST-inclusive), integer cents. */
  commissionCents: number;
  /** GST component of the commission (1/11) — for the tax invoice, not an extra charge. */
  gstComponentCents: number;
  /** At-cost card processing on materials; NOT platform revenue. */
  materialsProcessingCents: number;
  /** commission + materialsProcessing — this is Stripe's application_fee_amount. */
  totalDeductionCents: number;
  /** Rate actually used (standard or repeat), basis points. */
  rateApplied: number;
  rateType: "standard" | "repeat_client";
  wasCapped: boolean;
  /** True if the 2.5% floor overrode the cap. */
  floorApplied: boolean;
  labourCents: number;
  materialsCents: number;
  /** labour + materials − totalDeduction. */
  netToTradieCents: number;
}

/**
 * V2.1 platform fee. Commission is charged on LABOUR only; materials pass through
 * with just at-cost card processing deducted. Integer cents in, integer cents out.
 * Throws on non-integer / negative inputs — money must never be a float here.
 */
export function calculateFeeV21(input: FeeInputV21): FeeBreakdownV21 {
  const { labourCents, materialsCents, tier, isRepeatClient, materialsProcessingBps } = input;

  if (!Number.isInteger(labourCents) || labourCents < 0) throw new Error("INVALID_LABOUR");
  if (!Number.isInteger(materialsCents) || materialsCents < 0) throw new Error("INVALID_MATERIALS");

  const rateBps = isRepeatClient ? tier.repeatRateBps : tier.rateBps;
  const raw = Math.round((labourCents * rateBps) / 10_000);

  // Cap, but never below the floor (2.5% of labour) — the cap can't go underwater.
  const floorCents = Math.round((labourCents * tier.capFloorBps) / 10_000);
  const capped = Math.min(raw, Math.max(tier.feeCapCents, floorCents));

  // Min fee, itself never more than the labour (so a $3 job pays $3, not $5).
  const minFee = Math.min(tier.minFeeCents, labourCents);
  const commissionCents = Math.max(capped, minFee);

  // At-cost card processing on the materials portion. Excluded from the cap.
  const materialsProcessingCents = Math.round((materialsCents * materialsProcessingBps) / 10_000);

  const totalDeductionCents = commissionCents + materialsProcessingCents;

  return {
    commissionCents,
    gstComponentCents: Math.round(commissionCents / 11),
    materialsProcessingCents,
    totalDeductionCents,
    rateApplied: rateBps,
    rateType: isRepeatClient ? "repeat_client" : "standard",
    wasCapped: capped < raw,
    floorApplied: floorCents > tier.feeCapCents && capped === floorCents,
    labourCents,
    materialsCents,
    netToTradieCents: labourCents + materialsCents - totalDeductionCents,
  };
}
