// ─────────────────────────────────────────────────────────────────────────────
// PRICING_CONFIG — processing-fee constants only.
//
// Platform/subscription fees live in the V2 fee engine
// (supabase/functions/_shared/pricing.ts and src/lib/subscription.ts), which is
// the single source of truth for what tradies are charged. The old per-tier
// `tradie`/`propertyManager` fee tables here were stale ($29 Pro, retired Pro+,
// 5%/flat rates) and unused — they've been removed to avoid drift.
// ─────────────────────────────────────────────────────────────────────────────

export const PRICING_CONFIG = {
  processing: {
    stripePercentage: 0.0175,
    stripeFixed: 0.30,
    platformProcessingMargin: 0.0175,
  },
  freeTierGuarantees: [
    'Finding work',
    'Submitting quotes',
    'Escrow payments',
    'Messaging',
    'Dispute resolution',
  ],
} as const;
