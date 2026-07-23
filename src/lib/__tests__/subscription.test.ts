import {
  isPro,
  getCurrentTier,
  getFeatureLabel,
  getFeatureDescription,
  calculatePlatformFee,
  calculateMaterialsProcessing,
  FREE_LIMITS,
  PRO_FEATURES,
  TIER_PRICING,
} from '../subscription';

describe('subscription', () => {
  describe('constants', () => {
    it('has correct free tier limits', () => {
      expect(FREE_LIMITS.MAX_TRADE_CATEGORIES).toBe(1);
    });

    it('has correct pro pricing (v2.1: $49 → $39)', () => {
      expect(TIER_PRICING.pro.monthly).toBe(39);
      expect(TIER_PRICING.pro.annual).toBe(420);
      expect(TIER_PRICING.pro.annualMonthly).toBe(35);
    });
  });

  describe('isPro', () => {
    it('returns true for pro tier', () => {
      expect(isPro('pro')).toBe(true);
    });

    it('returns true for business tier', () => {
      expect(isPro('business')).toBe(true);
    });

    it('returns true when isPremium is true', () => {
      expect(isPro(undefined, true)).toBe(true);
      expect(isPro('free', true)).toBe(true);
    });

    it('returns false for free tier without premium', () => {
      expect(isPro('free')).toBe(false);
      expect(isPro('free', false)).toBe(false);
    });

    it('returns false when both undefined', () => {
      expect(isPro()).toBe(false);
      expect(isPro(undefined, undefined)).toBe(false);
    });
  });

  describe('getCurrentTier', () => {
    it('returns pro for pro/business tiers', () => {
      expect(getCurrentTier('pro')).toBe('pro');
      expect(getCurrentTier('business')).toBe('pro');
    });

    it('returns pro when isPremium is true', () => {
      expect(getCurrentTier(undefined, true)).toBe('pro');
    });

    it('returns free for free tier', () => {
      expect(getCurrentTier('free')).toBe('free');
      expect(getCurrentTier()).toBe('free');
    });
  });

  // v2.1: a FLAT rate on the tradie's LABOUR only (never the job total), with a
  // cheaper repeat-client rate, capped — but never below a 2.5%-of-labour floor,
  // so the cap can't go underwater on very large jobs.
  describe('calculatePlatformFee — matches the advertised v2.1 schedule', () => {
    it('Free: 8% of labour ($400 labour → $32)', () => {
      expect(calculatePlatformFee(400, 'free')).toBe(32);
    });
    it('Pro: 5% of labour ($400 labour → $20)', () => {
      expect(calculatePlatformFee(400, 'pro')).toBe(20);
    });
    it('flat — no $3k threshold discount ($5,000 labour → 8% = $400)', () => {
      expect(calculatePlatformFee(5000, 'free')).toBe(400);
    });
    it('Free cap binds at $500 ($10,000 labour → $500, not $800)', () => {
      expect(calculatePlatformFee(10000, 'free')).toBe(500);
    });
    it('Pro cap binds at $400 ($10,000 labour → $400, not $500)', () => {
      expect(calculatePlatformFee(10000, 'pro')).toBe(400);
    });
    it('the 2.5% floor overrides the cap on big jobs ($50,000 labour → $1,250)', () => {
      // 2.5% of $50k = $1,250 > the $500 cap. v1/V2 lost money here; v2.1 cannot.
      expect(calculatePlatformFee(50000, 'free')).toBe(1250);
      expect(calculatePlatformFee(50000, 'pro')).toBe(1250);
    });

    it('repeat clients pay less, every tier', () => {
      expect(calculatePlatformFee(400, 'free', null, true)).toBe(20); // 5%
      expect(calculatePlatformFee(400, 'pro', null, true)).toBe(16);  // 4%
    });

    it('a 0 bps override means zero commission (platform owner)', () => {
      expect(calculatePlatformFee(1000, 'free', 0)).toBe(0);
    });

    it('commission is on LABOUR only — materials never enter it', () => {
      // The hot-water case: $800 labour + $1,600 materials, free tier.
      // Old model would have charged 10% of $2,400 = $240.
      expect(calculatePlatformFee(800, 'free')).toBe(64);
    });
  });

  describe('calculateMaterialsProcessing — at cost, no markup', () => {
    it('$1,600 of materials → $30.88 (1.93%)', () => {
      expect(calculateMaterialsProcessing(1600)).toBe(30.88);
    });
    it('no materials → nothing', () => {
      expect(calculateMaterialsProcessing(0)).toBe(0);
    });
    it('never exceeds the materials themselves', () => {
      expect(calculateMaterialsProcessing(100)).toBeLessThan(100);
    });
  });

  describe('getFeatureLabel', () => {
    it('returns correct labels for all features', () => {
      expect(getFeatureLabel(PRO_FEATURES.VERIFIED_BADGE)).toBe('Verified Pro Badge');
      expect(getFeatureLabel(PRO_FEATURES.REDUCED_FEES)).toBe('5% on your labour (capped $400)');
      expect(getFeatureLabel(PRO_FEATURES.GOOGLE_CALENDAR_SYNC)).toBe('Google Calendar Sync');
      expect(getFeatureLabel(PRO_FEATURES.TEAM_MANAGEMENT)).toBe('Team Management');
    });
  });

  describe('getFeatureDescription', () => {
    it('returns correct descriptions', () => {
      expect(getFeatureDescription(PRO_FEATURES.VERIFIED_BADGE)).toContain('verified badge');
      expect(getFeatureDescription(PRO_FEATURES.REDUCED_FEES)).toContain('5%');
    });
  });
});
