import {
  isPro,
  getCurrentTier,
  getFeatureLabel,
  getFeatureDescription,
  calculatePlatformFee,
  FREE_LIMITS,
  PRO_FEATURES,
  TIER_PRICING,
} from '../subscription';

describe('subscription', () => {
  describe('constants', () => {
    it('has correct free tier limits', () => {
      expect(FREE_LIMITS.MAX_TRADE_CATEGORIES).toBe(1);
    });

    it('has correct pro pricing', () => {
      expect(TIER_PRICING.pro.monthly).toBe(49);
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

  describe('calculatePlatformFee — matches the advertised V2 schedule', () => {
    it('Free: 10% on the first $3k (a $400 job → $40)', () => {
      expect(calculatePlatformFee(400, 'free')).toBe(40);
    });
    it('Pro: 7% on the first $3k (a $400 job → $28)', () => {
      expect(calculatePlatformFee(400, 'pro')).toBe(28);
    });
    it('Free: 5% reduced rate above $3k (a $5,000 job → $300 + $100 = $400)', () => {
      expect(calculatePlatformFee(5000, 'free')).toBe(400);
    });
    it('Pro: 3.5% reduced rate above $3k (a $10,000 job → $210 + $245 = $455)', () => {
      expect(calculatePlatformFee(10000, 'pro')).toBe(455);
    });
    it('Free fee is capped at $900', () => {
      expect(calculatePlatformFee(50000, 'free')).toBe(900);
    });
    it('Pro fee is capped at $630', () => {
      expect(calculatePlatformFee(50000, 'pro')).toBe(630);
    });
  });

  describe('getFeatureLabel', () => {
    it('returns correct labels for all features', () => {
      expect(getFeatureLabel(PRO_FEATURES.VERIFIED_BADGE)).toBe('Verified Pro Badge');
      expect(getFeatureLabel(PRO_FEATURES.REDUCED_FEES)).toBe('7% Platform Fee (capped $630)');
      expect(getFeatureLabel(PRO_FEATURES.GOOGLE_CALENDAR_SYNC)).toBe('Google Calendar Sync');
      expect(getFeatureLabel(PRO_FEATURES.TEAM_MANAGEMENT)).toBe('Team Management');
    });
  });

  describe('getFeatureDescription', () => {
    it('returns correct descriptions', () => {
      expect(getFeatureDescription(PRO_FEATURES.VERIFIED_BADGE)).toContain('verified badge');
      expect(getFeatureDescription(PRO_FEATURES.REDUCED_FEES)).toContain('7%');
    });
  });
});
