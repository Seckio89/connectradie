export const PRICING_CONFIG = {
  tradie: {
    free: {
      name: 'Free',
      monthlyFee: 0,
      platformFee: {
        type: 'sliding' as const,
        tiers: [
          { maxJobValue: 150, rate: 0.10 },
          { maxJobValue: 500, rate: 0.08 },
          { maxJobValue: 1000, rate: 0.06 },
          { maxJobValue: 5000, rate: 0.05 },
          { maxJobValue: Infinity, rate: 0.04 },
        ],
        cap: 400,
      },
      positioning: 'Try us risk-free',
    },
    pro: {
      name: 'Pro',
      monthlyFee: 29,
      platformFee: {
        type: 'sliding' as const,
        tiers: [
          { maxJobValue: 500, rate: 0.05 },
          { maxJobValue: 2500, rate: 0.04 },
          { maxJobValue: Infinity, rate: 0.03 },
        ],
        cap: 250,
      },
      positioning: 'For serious tradies',
    },
    proPlus: {
      name: 'Pro+',
      monthlyFee: 59,
      platformFee: {
        type: 'flat' as const,
        rate: 0.025,
        cap: 200,
      },
      positioning: 'For high-volume operators',
    },
  },
  propertyManager: {
    starter: {
      name: 'PM Starter',
      monthlyFee: 99,
      platformFeeRate: 0.04,
      maxProperties: 20,
      maxUsers: 3,
      positioning: 'Property managers, 20 properties',
    },
    pro: {
      name: 'PM Pro',
      monthlyFee: 149,
      platformFeeRate: 0.03,
      maxProperties: 50,
      maxUsers: 10,
      positioning: 'Property managers, 50 properties',
    },
    enterprise: {
      name: 'PM Enterprise',
      monthlyFee: null as null, // Custom pricing
      platformFeeRate: 0.02,
      maxProperties: Infinity,
      maxUsers: Infinity,
      positioning: 'Enterprise, unlimited',
    },
  },
  processing: {
    stripePercentage: 0.0175,
    stripeFixed: 0.30,
    platformProcessingMargin: 0.012,
  },
  freeTierGuarantees: [
    'Finding work',
    'Submitting quotes',
    'Escrow payments',
    'Messaging',
    'Dispute resolution',
  ],
} as const;

export type TradieTier = keyof typeof PRICING_CONFIG.tradie;
export type PMTier = keyof typeof PRICING_CONFIG.propertyManager;
