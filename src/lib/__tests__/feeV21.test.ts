// Acceptance suite for the V2.1 fee engine (pricing-system-spec v2.1 §1.4).
// Commission on LABOUR only; materials pass through with at-cost card processing.
// Integer cents, GST-inclusive. All cases use materialsProcessingBps = 193.

import { describe, it, expect } from 'vitest';
import {
  calculateFeeV21,
  TIER_SCHEDULES_V21,
  type FeeInputV21,
} from '../../../supabase/functions/_shared/pricing';

const { free, pro, pm } = TIER_SCHEDULES_V21;
const MP = 193; // materials_processing_bps at launch

const fee = (
  labourCents: number,
  materialsCents: number,
  tier = free,
  isRepeatClient = false,
  materialsProcessingBps = MP,
): FeeInputV21 => ({ labourCents, materialsCents, tier, isRepeatClient, materialsProcessingBps });

describe('§1.4 acceptance table — commission / materials-processing / total', () => {
  // [label, input, expectedCommission, expectedMatProc, expectedTotal]
  const cases: Array<[string, FeeInputV21, number, number, number]> = [
    ['$800 lab / $1600 mat / free — the hot-water case', fee(80_000, 160_000), 6_400, 3_088, 9_488],
    ['$800 / $1600 / free / REPEAT — margin-positive', fee(80_000, 160_000, free, true), 4_000, 3_088, 7_088],
    ['$50 / $0 / free — min fee (=10% here)', fee(5_000, 0), 500, 0, 500],
    // Spec table prints "$30 → $3.00"; by the §1.3 formula that is only true for
    // $3 labour (min fee clamped to labour). Treating the "$30" as a spec typo and
    // testing the real behaviour the row is demonstrating: min fee never exceeds labour.
    ['$3 / $0 / free — min fee never exceeds labour', fee(300, 0), 300, 0, 300],
    ['$1,000 / $0 / free', fee(100_000, 0), 8_000, 0, 8_000],
    ['$1,000 / $400 / free — average-job reference', fee(100_000, 40_000), 8_000, 772, 8_772],
    ['$1,000 / $0 / free / REPEAT', fee(100_000, 0, free, true), 5_000, 0, 5_000],
    ['$6,250 / $0 / free — exactly at cap', fee(625_000, 0), 50_000, 0, 50_000],
    ['$10,000 / $2,000 / free — cap on commission, mat proc excluded', fee(1_000_000, 200_000), 50_000, 3_860, 53_860],
    ['$25,000 / $10,000 / free — floor active (2.5% > cap)', fee(2_500_000, 1_000_000), 62_500, 19_300, 81_800],
    ['$50,000 / $0 / free — floor scales, never underwater', fee(5_000_000, 0), 125_000, 0, 125_000],
    ['$1,000 / $0 / pro', fee(100_000, 0, pro), 5_000, 0, 5_000],
    ['$1,000 / $500 / pro / REPEAT', fee(100_000, 50_000, pro, true), 4_000, 965, 4_965],
    ['$10,000 / $0 / pm — PM cap', fee(1_000_000, 0, pm), 27_000, 0, 27_000],
    ['$0 / $500 / free — materials-only: no commission, processing still at cost', fee(0, 50_000), 0, 965, 965],
  ];

  it.each(cases)('%s', (_label, input, commission, matProc, total) => {
    const r = calculateFeeV21(input);
    expect(r.commissionCents).toBe(commission);
    expect(r.materialsProcessingCents).toBe(matProc);
    expect(r.totalDeductionCents).toBe(total);
  });
});

describe('§1.4 flags — wasCapped / floorApplied / rateType', () => {
  it('$6,250 free lands exactly on the cap but is not flagged capped', () => {
    const r = calculateFeeV21(fee(625_000, 0));
    expect(r.wasCapped).toBe(false);
    expect(r.floorApplied).toBe(false);
  });
  it('$10,000 free — cap binds, floor does not', () => {
    const r = calculateFeeV21(fee(1_000_000, 200_000));
    expect(r.wasCapped).toBe(true);
    expect(r.floorApplied).toBe(false);
  });
  it('$25,000 free — floor overrides the cap', () => {
    const r = calculateFeeV21(fee(2_500_000, 1_000_000));
    expect(r.wasCapped).toBe(true);
    expect(r.floorApplied).toBe(true);
  });
  it('rateType reflects repeat vs standard', () => {
    expect(calculateFeeV21(fee(100_000, 0)).rateType).toBe('standard');
    expect(calculateFeeV21(fee(100_000, 0, free, true)).rateType).toBe('repeat_client');
    expect(calculateFeeV21(fee(100_000, 0)).rateApplied).toBe(800);
    expect(calculateFeeV21(fee(100_000, 0, free, true)).rateApplied).toBe(500);
  });
});

describe('§1.4 GST component (round(commission / 11))', () => {
  it('commission $80.00 → GST $7.27', () =>
    expect(calculateFeeV21(fee(100_000, 0)).gstComponentCents).toBe(727));
  it('commission $64.00 → GST $5.82', () =>
    expect(calculateFeeV21(fee(80_000, 160_000)).gstComponentCents).toBe(582));
});

describe('§1.4 net to tradie = labour + materials − totalDeduction', () => {
  it('hot-water case → $2,305.12', () => {
    const r = calculateFeeV21(fee(80_000, 160_000));
    expect(r.netToTradieCents).toBe(80_000 + 160_000 - 9_488); // 230_512
  });
});

describe('input validation — money is never a float', () => {
  it('non-integer labour throws', () =>
    expect(() => calculateFeeV21(fee(100.5 as number, 0))).toThrow('INVALID_LABOUR'));
  it('negative labour throws', () =>
    expect(() => calculateFeeV21(fee(-1, 0))).toThrow('INVALID_LABOUR'));
  it('non-integer materials throws', () =>
    expect(() => calculateFeeV21(fee(100_000, 12.3 as number))).toThrow('INVALID_MATERIALS'));
  it('negative materials throws', () =>
    expect(() => calculateFeeV21(fee(100_000, -1))).toThrow('INVALID_MATERIALS'));
});

describe('per-profile override (platform owner 0% + grandfathered rates)', () => {
  const withOverride = (labour: number, materials: number, overrideBps: number | null, tier = free) =>
    calculateFeeV21({ ...fee(labour, materials, tier), overrideBps });

  it('0 bps → zero commission, and the $5 min fee does NOT resurrect it', () => {
    const r = withOverride(100_000, 0, 0);
    expect(r.commissionCents).toBe(0);
    expect(r.gstComponentCents).toBe(0);
  });
  it('0 bps on a tiny job → still zero (min fee bypassed)', () =>
    expect(withOverride(5_000, 0, 0).commissionCents).toBe(0));
  it('2.5% override on $10,000 labour → $250 flat', () =>
    expect(withOverride(1_000_000, 0, 250).commissionCents).toBe(25_000));
  it('override is still bounded by the tier cap', () =>
    expect(withOverride(5_000_000, 0, 2_000).commissionCents).toBe(50_000));
  it('override BYPASSES the 2.5% floor (1% on $25k → $250, not the $625 floor)', () => {
    const r = withOverride(2_500_000, 0, 100);
    expect(r.commissionCents).toBe(25_000);
    expect(r.floorApplied).toBe(false);
  });
  it('override still pays at-cost materials processing (not platform revenue)', () => {
    const r = withOverride(100_000, 160_000, 0);
    expect(r.commissionCents).toBe(0);
    expect(r.materialsProcessingCents).toBe(3_088);
    expect(r.totalDeductionCents).toBe(3_088);
  });
  it('rateApplied reports the override rate', () =>
    expect(withOverride(100_000, 0, 250).rateApplied).toBe(250));
  it('null override → normal tier schedule', () =>
    expect(withOverride(100_000, 0, null).commissionCents).toBe(8_000));
  it('undefined override → normal tier schedule', () =>
    expect(calculateFeeV21(fee(100_000, 0)).commissionCents).toBe(8_000));
  it('override wins over the repeat rate', () => {
    const r = calculateFeeV21({ ...fee(100_000, 0, free, true), overrideBps: 0 });
    expect(r.commissionCents).toBe(0);
  });
});

describe('property invariants across a labour × materials grid', () => {
  const labours = [0, 300, 5_000, 100_000, 625_000, 2_500_000, 5_000_000];
  const materials = [0, 50_000, 160_000, 1_000_000];
  const tiers = [free, pro, pm];

  for (const tier of tiers) {
    for (const L of labours) {
      for (const M of materials) {
        for (const repeat of [false, true]) {
          const r = calculateFeeV21(fee(L, M, tier, repeat));
          it(`L=${L} M=${M} repeat=${repeat} tier.rate=${tier.rateBps} holds every invariant`, () => {
            // integer, non-negative
            expect(Number.isInteger(r.commissionCents)).toBe(true);
            expect(r.commissionCents).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(r.materialsProcessingCents)).toBe(true);
            expect(r.materialsProcessingCents).toBeGreaterThanOrEqual(0);
            // commission never consumes materials
            expect(r.commissionCents).toBeLessThanOrEqual(L);
            // materials processing never exceeds materials
            expect(r.materialsProcessingCents).toBeLessThanOrEqual(M);
            // GST is exactly 1/11 of commission
            expect(r.gstComponentCents).toBe(Math.round(r.commissionCents / 11));
            // totals reconcile
            expect(r.totalDeductionCents).toBe(r.commissionCents + r.materialsProcessingCents);
            expect(r.netToTradieCents).toBe(L + M - r.totalDeductionCents);
            // no job loses the platform money: above min-fee territory the
            // commission is at least the 2.5% floor of labour.
            if (r.commissionCents > tier.minFeeCents) {
              expect(r.commissionCents).toBeGreaterThanOrEqual(Math.round((L * tier.capFloorBps) / 10_000));
            }
          });
        }
      }
    }
  }

  it('repeat total deduction ≤ standard for identical inputs, every tier', () => {
    for (const tier of tiers) {
      for (const L of labours) {
        for (const M of materials) {
          const std = calculateFeeV21(fee(L, M, tier, false)).totalDeductionCents;
          const rep = calculateFeeV21(fee(L, M, tier, true)).totalDeductionCents;
          expect(rep).toBeLessThanOrEqual(std);
        }
      }
    }
  });
});
