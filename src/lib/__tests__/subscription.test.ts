import {
  isPro,
  getCurrentTier,
  canAcceptJob,
  canUnlockLead,
  getRemainingJobAccepts,
  getRemainingLeadUnlocks,
  getFeatureLabel,
  getFeatureDescription,
  FREE_LIMITS,
  PRO_FEATURES,
  TIER_PRICING,
} from '../subscription';

describe('subscription', () => {
  describe('constants', () => {
    it('has correct free tier limits', () => {
      expect(FREE_LIMITS.JOB_ACCEPTS_PER_MONTH).toBe(5);
      expect(FREE_LIMITS.LEAD_UNLOCKS_PER_MONTH).toBe(3);
      expect(FREE_LIMITS.MAX_TRADE_CATEGORIES).toBe(1);
    });

    it('has correct pro pricing', () => {
      expect(TIER_PRICING.pro.monthly).toBe(45);
      expect(TIER_PRICING.pro.annual).toBe(432);
      expect(TIER_PRICING.pro.annualMonthly).toBe(36);
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

  describe('canAcceptJob', () => {
    it('always returns true for pro users', () => {
      expect(canAcceptJob(true, 0)).toBe(true);
      expect(canAcceptJob(true, 100)).toBe(true);
    });

    it('returns true when under free limit', () => {
      expect(canAcceptJob(false, 0)).toBe(true);
      expect(canAcceptJob(false, 4)).toBe(true);
    });

    it('returns false when at or over free limit', () => {
      expect(canAcceptJob(false, 5)).toBe(false);
      expect(canAcceptJob(false, 10)).toBe(false);
    });
  });

  describe('canUnlockLead', () => {
    it('always returns true for pro users', () => {
      expect(canUnlockLead(true, 0)).toBe(true);
      expect(canUnlockLead(true, 100)).toBe(true);
    });

    it('returns true when under free limit', () => {
      expect(canUnlockLead(false, 0)).toBe(true);
      expect(canUnlockLead(false, 2)).toBe(true);
    });

    it('returns false when at or over free limit', () => {
      expect(canUnlockLead(false, 3)).toBe(false);
      expect(canUnlockLead(false, 10)).toBe(false);
    });
  });

  describe('getRemainingJobAccepts', () => {
    it('returns null for pro users', () => {
      expect(getRemainingJobAccepts(true, 0)).toBeNull();
      expect(getRemainingJobAccepts(true, 100)).toBeNull();
    });

    it('returns correct remaining count', () => {
      expect(getRemainingJobAccepts(false, 0)).toBe(5);
      expect(getRemainingJobAccepts(false, 3)).toBe(2);
      expect(getRemainingJobAccepts(false, 5)).toBe(0);
    });

    it('never returns negative', () => {
      expect(getRemainingJobAccepts(false, 10)).toBe(0);
    });
  });

  describe('getRemainingLeadUnlocks', () => {
    it('returns null for pro users', () => {
      expect(getRemainingLeadUnlocks(true, 0)).toBeNull();
    });

    it('returns correct remaining count', () => {
      expect(getRemainingLeadUnlocks(false, 0)).toBe(3);
      expect(getRemainingLeadUnlocks(false, 2)).toBe(1);
      expect(getRemainingLeadUnlocks(false, 3)).toBe(0);
    });

    it('never returns negative', () => {
      expect(getRemainingLeadUnlocks(false, 10)).toBe(0);
    });
  });

  describe('getFeatureLabel', () => {
    it('returns correct labels for all features', () => {
      expect(getFeatureLabel(PRO_FEATURES.VERIFIED_BADGE)).toBe('Verified Pro Badge');
      expect(getFeatureLabel(PRO_FEATURES.UNLIMITED_JOB_ACCEPTS)).toBe('Unlimited Job Accepts');
      expect(getFeatureLabel(PRO_FEATURES.ZERO_SERVICE_FEES)).toBe('100% Payout');
      expect(getFeatureLabel(PRO_FEATURES.GOOGLE_CALENDAR_SYNC)).toBe('Google Calendar Sync');
      expect(getFeatureLabel(PRO_FEATURES.TEAM_MANAGEMENT)).toBe('Team Management');
    });
  });

  describe('getFeatureDescription', () => {
    it('returns correct descriptions', () => {
      expect(getFeatureDescription(PRO_FEATURES.VERIFIED_BADGE)).toContain('verified badge');
      expect(getFeatureDescription(PRO_FEATURES.ZERO_SERVICE_FEES)).toContain('100%');
    });
  });
});
