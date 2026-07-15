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

export type TradieTier = "free" | "pro" | "pro_plus";
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
  return "free";
}

// ---------------------------------------------------------------------------
// Platform fee calculation
// ---------------------------------------------------------------------------
export function calculatePlatformFee(jobValueDollars: number, tier: TradieTier): number {
  const config = PRICING_CONFIG.tradie[tier].platformFee;
  let fee: number;

  if (config.type === "flat") {
    fee = jobValueDollars * (config as { type: "flat"; rate: number; cap: number }).rate;
  } else {
    const slidingConfig = config as {
      type: "sliding";
      tiers: { maxJobValue: number; rate: number }[];
      cap: number;
    };
    const applicableTier =
      slidingConfig.tiers.find((t) => jobValueDollars <= t.maxJobValue) ??
      slidingConfig.tiers[slidingConfig.tiers.length - 1];
    fee = jobValueDollars * applicableTier.rate;
  }

  return Math.min(fee, config.cap);
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

export function calculatePMFees(jobValue: number, tier: PMTier): FeeBreakdown {
  const tierConfig = PRICING_CONFIG.propertyManager[tier];
  const platformFee = jobValue * tierConfig.platformFeeRate;
  const processingFee = calculateProcessingFee(jobValue);
  const totalFees = platformFee + processingFee;

  return {
    jobValue,
    platformFee: Math.round(platformFee * 100) / 100,
    platformFeePercentage: tierConfig.platformFeeRate * 100,
    processingFee: Math.round(processingFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    tradieReceives: Math.round((jobValue - totalFees) * 100) / 100,
  };
}
