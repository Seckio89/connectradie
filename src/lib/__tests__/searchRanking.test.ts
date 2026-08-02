// searchRanking decides which tradie a client sees first. The tests below pin
// the PROPERTIES the ranking has to hold — monotonicity, the weight budget, the
// Bayesian rating guard, clamping — rather than the arithmetic of any one score,
// so the weights can be retuned without the suite going red for no reason.

import { describe, it, expect } from 'vitest';
import {
  buildScoringFactors,
  calculateTradeScore,
  type TradieScoringFactors,
} from '../searchRanking';

const base: TradieScoringFactors = {
  distanceKm: 10,
  averageRating: 4,
  reviewCount: 20,
  responseRate: 0.5,
  isAbnVerified: false,
  isLicenseVerified: false,
  profileCompleteness: 0.5,
  recentActivityDays: 10,
  jobsCompleted: 10,
};

const score = (over: Partial<TradieScoringFactors> = {}) =>
  calculateTradeScore({ ...base, ...over });

describe('calculateTradeScore — bounds and determinism', () => {
  it('is deterministic for identical input', () => {
    expect(score()).toBe(score());
  });

  it('stays within 0-100 at both extremes', () => {
    const best = score({
      distanceKm: 0,
      averageRating: 5,
      reviewCount: 500,
      responseRate: 1,
      isAbnVerified: true,
      isLicenseVerified: true,
      profileCompleteness: 1,
      recentActivityDays: 0,
      jobsCompleted: 500,
    });
    const worst = score({
      distanceKm: 500,
      averageRating: 0,
      reviewCount: 0,
      responseRate: 0,
      isAbnVerified: false,
      isLicenseVerified: false,
      profileCompleteness: 0,
      recentActivityDays: 500,
      jobsCompleted: 0,
    });
    expect(best).toBeLessThanOrEqual(100);
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(best).toBeGreaterThan(worst);
  });

  it('does not go negative on nonsense negative input', () => {
    expect(score({ responseRate: -5, jobsCompleted: -10, recentActivityDays: -10, distanceKm: -10 }))
      .toBeGreaterThanOrEqual(0);
  });

  it('sorts a list into a stable, repeatable order', () => {
    const tradies = [
      { id: 'far', f: { ...base, distanceKm: 45 } },
      { id: 'near', f: { ...base, distanceKm: 2 } },
      { id: 'mid', f: { ...base, distanceKm: 20 } },
    ];
    const rank = () =>
      [...tradies]
        .sort((a, b) => calculateTradeScore(b.f) - calculateTradeScore(a.f))
        .map((t) => t.id);
    expect(rank()).toEqual(['near', 'mid', 'far']);
    expect(rank()).toEqual(rank());
  });
});

describe('calculateTradeScore — distance', () => {
  it('ranks a closer tradie above a further one, all else equal', () => {
    expect(score({ distanceKm: 1 })).toBeGreaterThan(score({ distanceKm: 30 }));
  });

  it('is monotonically non-increasing as distance grows', () => {
    const steps = [0, 5, 10, 25, 40, 49, 50].map((d) => score({ distanceKm: d }));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
    }
  });

  it('caps at 50 km — beyond that, distance stops discriminating', () => {
    expect(score({ distanceKm: 50 })).toBe(score({ distanceKm: 200 }));
  });

  it('treats zero and negative distance identically (both are "here")', () => {
    expect(score({ distanceKm: 0 })).toBe(score({ distanceKm: -3 }));
  });

  it('is worth exactly 25 points between 0 km and the 50 km cap', () => {
    expect(score({ distanceKm: 0 }) - score({ distanceKm: 50 })).toBeCloseTo(25, 10);
  });
});

describe('calculateTradeScore — rating and the Bayesian guard', () => {
  // The whole reason for the Bayesian blend: a lone 5-star review is not
  // evidence, and letting it top the list is how a marketplace gets gamed.
  it('ranks 4.7 from 50 reviews above 5.0 from 1 review', () => {
    expect(score({ averageRating: 4.7, reviewCount: 50 }))
      .toBeGreaterThan(score({ averageRating: 5, reviewCount: 1 }));
  });

  it('pulls a single 5-star review well below its face value', () => {
    // Blended toward the 3.5 platform mean, a 5.0 from one review is worth less
    // than a 5.0 from many.
    expect(score({ averageRating: 5, reviewCount: 1 }))
      .toBeLessThan(score({ averageRating: 5, reviewCount: 200 }));
  });

  it('compresses the gap between a great and a terrible rating when reviews are few', () => {
    // The review-count component cancels within each pair, so this isolates the
    // confidence blend: one review barely separates 5.0 from 1.0, two hundred
    // separate them decisively.
    const gapAtOne = score({ averageRating: 5, reviewCount: 1 }) - score({ averageRating: 1, reviewCount: 1 });
    const gapAtMany = score({ averageRating: 5, reviewCount: 200 }) - score({ averageRating: 1, reviewCount: 200 });
    expect(gapAtOne).toBeGreaterThan(0);
    expect(gapAtMany).toBeGreaterThan(gapAtOne * 3);
  });

  it('prefers a higher rating at the same review count', () => {
    expect(score({ averageRating: 4.8, reviewCount: 30 }))
      .toBeGreaterThan(score({ averageRating: 3.2, reviewCount: 30 }));
  });

  // With no reviews the rating component is a flat neutral (0.4), so nothing a
  // tradie claims about their own rating can move the ranking.
  it('ignores averageRating entirely when there are no reviews', () => {
    expect(score({ averageRating: 5, reviewCount: 0 })).toBe(score({ averageRating: 0, reviewCount: 0 }));
    expect(score({ averageRating: 5, reviewCount: 0 })).toBe(score({ averageRating: 3.5, reviewCount: 0 }));
  });

  // Characterisation, not endorsement: review VOLUME is worth 10 points and is
  // scored independently of review QUALITY, so a badly-rated tradie with a long
  // history still ranks above an unrated newcomer who is otherwise identical.
  it('ranks a poorly-rated established tradie above an unrated one', () => {
    expect(score({ averageRating: 1, reviewCount: 200 }))
      .toBeGreaterThan(score({ averageRating: 0, reviewCount: 0 }));
  });

  it('gives review count diminishing returns', () => {
    const gainEarly = score({ reviewCount: 10 }) - score({ reviewCount: 5 });
    const gainLate = score({ reviewCount: 105 }) - score({ reviewCount: 100 });
    expect(gainEarly).toBeGreaterThan(gainLate);
  });

  it('stops rewarding review count past the 100-review ceiling', () => {
    const at100 = score({ reviewCount: 100, averageRating: 4 });
    const at5000 = score({ reviewCount: 5000, averageRating: 4 });
    // Only the rating component may still move, and only slightly.
    expect(at5000 - at100).toBeLessThan(1);
  });
});

describe('calculateTradeScore — verification', () => {
  it('is worth 15 points for both credentials together', () => {
    const none = score({ isAbnVerified: false, isLicenseVerified: false });
    const both = score({ isAbnVerified: true, isLicenseVerified: true });
    expect(both - none).toBeCloseTo(15, 10);
  });

  it('splits the 15 points evenly between ABN and licence', () => {
    const none = score({ isAbnVerified: false, isLicenseVerified: false });
    const abnOnly = score({ isAbnVerified: true, isLicenseVerified: false });
    const licenceOnly = score({ isAbnVerified: false, isLicenseVerified: true });
    expect(abnOnly - none).toBeCloseTo(7.5, 10);
    expect(licenceOnly - none).toBeCloseTo(7.5, 10);
    expect(abnOnly).toBeCloseTo(licenceOnly, 10);
  });

  it('outweighs the whole profile-completeness component', () => {
    // A verified tradie with a bare profile beats an unverified one with a
    // perfect profile — verification is the stronger trust signal.
    expect(score({ isAbnVerified: true, isLicenseVerified: true, profileCompleteness: 0 }))
      .toBeGreaterThan(score({ isAbnVerified: false, isLicenseVerified: false, profileCompleteness: 1 }));
  });
});

describe('calculateTradeScore — response rate, activity and jobs', () => {
  it('clamps response rate above 1', () => {
    expect(score({ responseRate: 1 })).toBe(score({ responseRate: 7 }));
  });

  it('clamps response rate below 0', () => {
    expect(score({ responseRate: 0 })).toBe(score({ responseRate: -7 }));
  });

  it('is worth 10 points across the full response-rate range', () => {
    expect(score({ responseRate: 1 }) - score({ responseRate: 0 })).toBeCloseTo(10, 10);
  });

  it('ranks a recently active tradie above a dormant one', () => {
    expect(score({ recentActivityDays: 1 })).toBeGreaterThan(score({ recentActivityDays: 60 }));
  });

  it('stops penalising dormancy past 90 days', () => {
    expect(score({ recentActivityDays: 90 })).toBe(score({ recentActivityDays: 900 }));
  });

  it('is worth 10 points between active today and 90 days dormant', () => {
    expect(score({ recentActivityDays: 0 }) - score({ recentActivityDays: 90 })).toBeCloseTo(10, 10);
  });

  it('rewards completed jobs with diminishing returns', () => {
    expect(score({ jobsCompleted: 20 })).toBeGreaterThan(score({ jobsCompleted: 5 }));
    const gainEarly = score({ jobsCompleted: 10 }) - score({ jobsCompleted: 5 });
    const gainLate = score({ jobsCompleted: 205 }) - score({ jobsCompleted: 200 });
    expect(gainEarly).toBeGreaterThan(gainLate);
  });

  it('treats zero and negative completed jobs as nothing earned', () => {
    expect(score({ jobsCompleted: 0 })).toBe(score({ jobsCompleted: -5 }));
  });

  it('scales profile completeness linearly over 5 points', () => {
    expect(score({ profileCompleteness: 1 }) - score({ profileCompleteness: 0 })).toBeCloseTo(5, 10);
  });
});

describe('calculateTradeScore — relative weight of the components', () => {
  it('lets proximity outweigh a perfect review record 50 km away', () => {
    const nearAndBare = score({
      distanceKm: 0,
      averageRating: 0,
      reviewCount: 0,
      responseRate: 0,
      profileCompleteness: 0,
      jobsCompleted: 0,
    });
    const farAndGood = score({
      distanceKm: 50,
      averageRating: 5,
      reviewCount: 100,
      responseRate: 0,
      profileCompleteness: 0,
      jobsCompleted: 0,
    });
    expect(nearAndBare).toBeGreaterThan(farAndGood);
  });

  it('never lets one component move the total by more than its weight', () => {
    const budget: Array<[Partial<TradieScoringFactors>, Partial<TradieScoringFactors>, number]> = [
      [{ distanceKm: 0 }, { distanceKm: 50 }, 25],
      [{ averageRating: 5, reviewCount: 20 }, { averageRating: 0, reviewCount: 20 }, 20],
      [{ responseRate: 1 }, { responseRate: 0 }, 10],
      [{ recentActivityDays: 0 }, { recentActivityDays: 90 }, 10],
      [{ profileCompleteness: 1 }, { profileCompleteness: 0 }, 5],
    ];
    for (const [hi, lo, weight] of budget) {
      const delta = score(hi) - score(lo);
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(weight + 1e-9);
    }
  });
});

describe('buildScoringFactors — defaults', () => {
  it('uses mid-range defaults when nothing is known', () => {
    const f = buildScoringFactors({});
    expect(f.distanceKm).toBe(25);
    expect(f.recentActivityDays).toBe(30);
    expect(f.responseRate).toBe(0.5);
    expect(f.averageRating).toBe(0);
    expect(f.reviewCount).toBe(0);
    expect(f.jobsCompleted).toBe(0);
  });

  it('keeps a supplied zero distance instead of falling back to 25', () => {
    expect(buildScoringFactors({ distanceKm: 0 }).distanceKm).toBe(0);
  });

  it('keeps a supplied zero activity age instead of falling back to 30', () => {
    expect(buildScoringFactors({ recentActivityDays: 0 }).recentActivityDays).toBe(0);
  });

  it('produces a scoreable object — no NaN reaches the ranking', () => {
    expect(Number.isFinite(calculateTradeScore(buildScoringFactors({})))).toBe(true);
  });
});

describe('buildScoringFactors — verification flags', () => {
  it('defaults both flags to false when nothing is recorded', () => {
    const f = buildScoringFactors({});
    expect(f.isAbnVerified).toBe(false);
    expect(f.isLicenseVerified).toBe(false);
  });

  it('falls back to verification_status when license_verified is null', () => {
    expect(buildScoringFactors({ license_verified: null, verification_status: 'verified' }).isLicenseVerified)
      .toBe(true);
    expect(buildScoringFactors({ license_verified: null, verification_status: 'pending' }).isLicenseVerified)
      .toBe(false);
  });

  it('lets an explicit false override a verified status — ?? does not catch false', () => {
    expect(buildScoringFactors({ license_verified: false, verification_status: 'verified' }).isLicenseVerified)
      .toBe(false);
  });

  it('passes abn_verified straight through, treating null as unverified', () => {
    expect(buildScoringFactors({ abn_verified: true }).isAbnVerified).toBe(true);
    expect(buildScoringFactors({ abn_verified: null }).isAbnVerified).toBe(false);
  });
});

describe('buildScoringFactors — profile completeness', () => {
  const full = {
    avatar_url: 'https://example.test/a.png',
    has_phone: true,
    postcode: '2000',
    tradie_details: {
      bio: 'Licensed plumber, 12 years.',
      hourly_rate: 95,
      insurance_provider: 'Allianz',
      qualifications: ['Cert III Plumbing'],
    },
  };

  it('is 1 for a fully filled profile and 0 for an empty one', () => {
    expect(buildScoringFactors(full).profileCompleteness).toBe(1);
    expect(buildScoringFactors({}).profileCompleteness).toBe(0);
  });

  it('counts seven fields, so each is worth one seventh', () => {
    const f = buildScoringFactors({ ...full, avatar_url: null });
    expect(f.profileCompleteness).toBeCloseTo(6 / 7, 10);
  });

  it('treats an empty string and a false flag as not filled in', () => {
    expect(buildScoringFactors({ ...full, postcode: '' }).profileCompleteness).toBeCloseTo(6 / 7, 10);
    expect(buildScoringFactors({ ...full, has_phone: false }).profileCompleteness).toBeCloseTo(6 / 7, 10);
  });

  it('ignores a missing tradie_details block entirely', () => {
    const f = buildScoringFactors({ avatar_url: 'x', has_phone: true, postcode: '2000' });
    expect(f.profileCompleteness).toBeCloseTo(3 / 7, 10);
  });

  // BUG: the completeness check rejects null/undefined/''/false, but 0 passes
  // all four. An EMPTY qualifications array yields length 0, which counts as a
  // completed field — so a tradie who has listed no qualifications scores the
  // same as one who listed three. A $0 hourly_rate counts the same way.
  // Asserting current behaviour; not fixing it here.
  it('BUG: an empty qualifications array counts as a completed field', () => {
    const empty = buildScoringFactors({ ...full, tradie_details: { ...full.tradie_details, qualifications: [] } });
    expect(empty.profileCompleteness).toBe(1);
    // Null, by contrast, is correctly counted as missing.
    const nulled = buildScoringFactors({ ...full, tradie_details: { ...full.tradie_details, qualifications: null } });
    expect(nulled.profileCompleteness).toBeCloseTo(6 / 7, 10);
  });

  it('BUG: a zero hourly rate counts as a completed field', () => {
    expect(buildScoringFactors({ ...full, tradie_details: { ...full.tradie_details, hourly_rate: 0 } })
      .profileCompleteness).toBe(1);
  });

  // The `bio` field on the top-level tradie object is accepted by the signature
  // but never read — only tradie_details.bio counts.
  it('ignores the top-level bio field', () => {
    expect(buildScoringFactors({ bio: 'A long and detailed bio.' }).profileCompleteness).toBe(0);
  });
});

describe('buildScoringFactors → calculateTradeScore', () => {
  it('ranks a complete, verified, nearby tradie above a bare distant one', () => {
    const strong = buildScoringFactors({
      abn_verified: true,
      license_verified: true,
      avatar_url: 'x',
      has_phone: true,
      postcode: '2000',
      tradie_details: { bio: 'b', hourly_rate: 95, insurance_provider: 'Allianz', qualifications: ['q'] },
      averageRating: 4.8,
      reviewCount: 40,
      jobsCompleted: 60,
      recentActivityDays: 1,
      distanceKm: 3,
    });
    const weak = buildScoringFactors({ distanceKm: 45 });
    expect(calculateTradeScore(strong)).toBeGreaterThan(calculateTradeScore(weak));
  });
});
