import { PRICING_CONFIG, TradieTier, PMTier } from '../config/pricing';

export interface FeeBreakdown {
  jobValue: number;
  platformFee: number;
  platformFeePercentage: number;
  processingFee: number;
  totalFees: number;
  tradieReceives: number;
}

export function calculateTradieFees(
  jobValue: number,
  tier: TradieTier
): FeeBreakdown {
  const tierConfig = PRICING_CONFIG.tradie[tier];
  let platformFee: number;
  let effectiveRate: number;

  if (tierConfig.platformFee.type === 'flat') {
    effectiveRate = tierConfig.platformFee.rate;
    platformFee = jobValue * effectiveRate;
  } else {
    // Sliding scale - find applicable rate
    const applicableTier = tierConfig.platformFee.tiers.find(
      (t) => jobValue <= t.maxJobValue
    ) ?? tierConfig.platformFee.tiers[tierConfig.platformFee.tiers.length - 1];
    effectiveRate = applicableTier.rate;
    platformFee = jobValue * effectiveRate;
  }

  // Apply cap
  platformFee = Math.min(platformFee, tierConfig.platformFee.cap);

  // Calculate processing fees
  const processingFee =
    jobValue * PRICING_CONFIG.processing.stripePercentage +
    PRICING_CONFIG.processing.stripeFixed +
    jobValue * PRICING_CONFIG.processing.platformProcessingMargin;

  const totalFees = platformFee + processingFee;
  const tradieReceives = jobValue - totalFees;

  return {
    jobValue,
    platformFee: Math.round(platformFee * 100) / 100,
    platformFeePercentage: (platformFee / jobValue) * 100,
    processingFee: Math.round(processingFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    tradieReceives: Math.round(tradieReceives * 100) / 100,
  };
}

export function calculatePMFees(
  jobValue: number,
  tier: PMTier
): FeeBreakdown {
  const tierConfig = PRICING_CONFIG.propertyManager[tier];
  const platformFee = jobValue * tierConfig.platformFeeRate;

  const processingFee =
    jobValue * PRICING_CONFIG.processing.stripePercentage +
    PRICING_CONFIG.processing.stripeFixed +
    jobValue * PRICING_CONFIG.processing.platformProcessingMargin;

  const totalFees = platformFee + processingFee;
  const tradieReceives = jobValue - totalFees;

  return {
    jobValue,
    platformFee: Math.round(platformFee * 100) / 100,
    platformFeePercentage: tierConfig.platformFeeRate * 100,
    processingFee: Math.round(processingFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    tradieReceives: Math.round(tradieReceives * 100) / 100,
  };
}

export function formatFeeDisplay(fee: number): string {
  return `${fee.toFixed(2)}`;
}

export function formatPercentage(rate: number): string {
  return `${rate.toFixed(1)}%`;
}
