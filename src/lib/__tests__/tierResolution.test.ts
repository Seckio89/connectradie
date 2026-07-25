// What the frontend DISCLOSES must equal what the backend CHARGES, for every
// raw subscription_tier value the database can actually hold.
//
// WHY THIS EXISTS
// There are two types both named `SubscriptionTier`, and they mean different
// things:
//   • src/types/database.ts  — the RAW column value.
//     tradie_details.subscription_tier CHECKs ('free','pro','pro_plus','business')
//   • src/lib/subscription.ts — the RESOLVED tier used to pick a fee schedule.
//     Deliberately narrower ('free','pro','pro_plus') so a raw DB string can
//     never index PLATFORM_FEES unnormalised.
//
// `business` is a legacy marketing name that resolves to Pro on BOTH sides —
// `getChargedTier` (frontend) and `resolveTradieTier` (backend) each map it
// explicitly. That looks like a missing fee schedule if you only read the
// narrow union, and it has already been misread that way once: the absence of a
// `business` key in PLATFORM_FEES was reported as a silent-overcharge bug. It
// is not. Adding one would create a fourth schedule that could drift from the
// money path, which is exactly what the narrow type prevents.
//
// So this pins the real invariant instead of the shape of a lookup table: for
// every storable value, the fee we show equals the fee we take.

import { describe, it, expect } from 'vitest';
import { getChargedTier, calculatePlatformFee } from '../subscription';
import {
  resolveTradieTier,
  calculateFeeV21,
  resolveTierScheduleV21,
  DEFAULT_MATERIALS_PROCESSING_BPS,
} from '../../../supabase/functions/_shared/pricing';

/** The fee the money path would actually take, from the raw column value. */
function backendFee(rawTier: string, labourDollars: number): number {
  return calculateFeeV21({
    labourCents: Math.round(labourDollars * 100),
    materialsCents: 0,
    tier: resolveTierScheduleV21(resolveTradieTier(rawTier)),
    isRepeatClient: false,
    materialsProcessingBps: DEFAULT_MATERIALS_PROCESSING_BPS,
  }).commissionCents / 100;
}

/** The fee the UI would disclose, from the same raw column value. */
function disclosedFee(rawTier: string, labourDollars: number): number {
  return calculatePlatformFee(labourDollars, getChargedTier(rawTier));
}

// Exactly the values tradie_details.subscription_tier permits. Keep in sync
// with the CHECK constraint — a new tier must be added here too.
const STORABLE_TIERS = ['free', 'pro', 'pro_plus', 'business'] as const;

const LABOUR_AMOUNTS = [100, 500, 1_000, 5_000, 10_000, 50_000];

describe('disclosed fee === charged fee, for every storable tier', () => {
  for (const tier of STORABLE_TIERS) {
    it(`${tier}`, () => {
      for (const labour of LABOUR_AMOUNTS) {
        expect(disclosedFee(tier, labour)).toBe(backendFee(tier, labour));
      }
    });
  }
});

describe('business is Pro on both sides — do NOT give it its own schedule', () => {
  it('resolves to pro in the frontend and the backend', () => {
    expect(getChargedTier('business')).toBe('pro');
    expect(resolveTradieTier('business')).toBe('pro');
  });

  it('is charged exactly the Pro rate at every amount', () => {
    for (const labour of LABOUR_AMOUNTS) {
      expect(backendFee('business', labour)).toBe(backendFee('pro', labour));
    }
  });

  it('is charged the Pro rate rather than the Free rate, where the two differ', () => {
    // Only meaningful below the convergence point — see the test below.
    for (const labour of [100, 500, 1_000, 5_000, 10_000]) {
      expect(backendFee('business', labour)).not.toBe(backendFee('free', labour));
    }
  });
});

describe('tiers converge on large jobs — this is by design, not a bug', () => {
  // calculateFeeV21 caps the commission but never below a floor of 2.5% of
  // labour ("the cap can't go underwater"). That floor is the SAME for every
  // tier, so once it overtakes a tier's cap the tiers stop differing:
  //   Free  cap $500 -> floor overtakes it at $20,000 labour
  //   Pro   cap $400 -> floor overtakes it at $16,000 labour
  // Above $20k every tier pays 2.5%. Worth pinning so a future reader doesn't
  // "fix" the apparent loss of Pro's discount on big jobs.
  it('below $20k labour, Free costs more than Pro', () => {
    expect(backendFee('free', 10_000)).toBeGreaterThan(backendFee('pro', 10_000));
  });

  it('at and above $20k labour, all tiers pay the same 2.5% floor', () => {
    for (const labour of [20_000, 50_000, 100_000]) {
      const expected = labour * 0.025;
      expect(backendFee('free', labour)).toBe(expected);
      expect(backendFee('pro', labour)).toBe(expected);
      expect(backendFee('business', labour)).toBe(expected);
    }
  });
});

describe('an unknown tier fails safe', () => {
  it('falls back to Free rather than throwing or charging nothing', () => {
    // A tier added to the DB but not to the resolvers must not silently become
    // a zero fee. Free is the safe default: it is the highest rate, so the
    // platform is never short-changed by a config gap.
    expect(getChargedTier('some_future_tier')).toBe('free');
    expect(resolveTradieTier('some_future_tier')).toBe('free');
    expect(backendFee('some_future_tier', 1_000)).toBe(backendFee('free', 1_000));
  });

  it('handles null/undefined the same way', () => {
    expect(getChargedTier(null)).toBe('free');
    expect(getChargedTier(undefined)).toBe('free');
    expect(resolveTradieTier(null)).toBe('free');
    expect(resolveTradieTier(undefined)).toBe('free');
  });
});
