import {
  isPro,
  getCurrentTier,
  getFeatureLabel,
  getFeatureDescription,
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
      expect(TIER_PRICING.pro.monthly).toBe(29);
      expect(TIER_PRICING.pro.annual).toBe(249);
      expect(TIER_PRICING.pro.annualMonthly).toBe(20.75);
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

  describe('getFeatureLabel', () => {
    it('returns correct labels for all features', () => {
      expect(getFeatureLabel(PRO_FEATURES.VERIFIED_BADGE)).toBe('Verified Pro Badge');
      expect(getFeatureLabel(PRO_FEATURES.REDUCED_FEES)).toBe('5% Platform Fee (save 50%)');
      expect(getFeatureLabel(PRO_FEATURES.GOOGLE_CALENDAR_SYNC)).toBe('Google Calendar Sync');
      expect(getFeatureLabel(PRO_FEATURES.TEAM_MANAGEMENT)).toBe('Team Management');
    });
  });

  describe('getFeatureDescription', () => {
    it('returns correct descriptions', () => {
      expect(getFeatureDescription(PRO_FEATURES.VERIFIED_BADGE)).toContain('verified badge');
      expect(getFeatureDescription(PRO_FEATURES.REDUCED_FEES)).toContain('95%');
    });
  });
});
