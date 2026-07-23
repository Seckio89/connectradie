// Unit table for splitAmount() — the charge-time labour/materials split
// (supabase/functions/_shared/feeContext.ts).
//
// This is the highest-risk arithmetic in the v2.1 cutover: deposits, milestones
// and staged payments all charge a PORTION of a job, and this decides how much
// of that portion counts as materials (0% commission) vs labour (commission).
// Get it wrong and every partial payment is mis-charged.
//
// The governing invariant: labour + materials ALWAYS reconciles to the amount
// actually collected, so commission can never be levied on uncollected money.

import { describe, it, expect } from 'vitest';
import { splitAmount } from '../../../supabase/functions/_shared/feeContext';

describe('splitAmount — unknown split falls back to all-labour', () => {
  it('null materials → whole amount is labour', () =>
    expect(splitAmount(100_000, null, null)).toEqual({ labourCents: 100_000, materialsCents: 0 }));
  it('undefined materials → whole amount is labour', () =>
    expect(splitAmount(100_000)).toEqual({ labourCents: 100_000, materialsCents: 0 }));
  it('labour known but materials unknown → still all-labour (no guessing)', () =>
    expect(splitAmount(100_000, 60_000, null)).toEqual({ labourCents: 100_000, materialsCents: 0 }));
  it('declared total of zero → all-labour rather than divide-by-zero', () =>
    expect(splitAmount(100_000, 0, 0)).toEqual({ labourCents: 100_000, materialsCents: 0 }));
});

describe('splitAmount — full payment matches the quote exactly', () => {
  it('the hot-water case: $800 labour + $1,600 materials paid in full', () =>
    expect(splitAmount(240_000, 80_000, 160_000)).toEqual({
      labourCents: 80_000,
      materialsCents: 160_000,
    }));
  it('materials-only job', () =>
    expect(splitAmount(50_000, 0, 50_000)).toEqual({ labourCents: 0, materialsCents: 50_000 }));
  it('labour-only job', () =>
    expect(splitAmount(100_000, 100_000, 0)).toEqual({ labourCents: 100_000, materialsCents: 0 }));
});

describe('splitAmount — partial payments pro-rate materials', () => {
  it('a 50% deposit on the hot-water job splits 50/50 by share', () => {
    // materials are 2/3 of the job, so 2/3 of the deposit is materials
    expect(splitAmount(120_000, 80_000, 160_000)).toEqual({
      labourCents: 40_000,
      materialsCents: 80_000,
    });
  });
  it('a 20% deposit keeps the same labour:materials ratio', () => {
    const r = splitAmount(48_000, 80_000, 160_000);
    expect(r).toEqual({ labourCents: 16_000, materialsCents: 32_000 });
    expect(r.materialsCents / r.labourCents).toBe(2); // original ratio preserved
  });
  it('commission base shrinks with the deposit — never the full job labour', () => {
    const deposit = splitAmount(24_000, 80_000, 160_000);
    expect(deposit.labourCents).toBeLessThan(80_000);
  });
});

describe('splitAmount — drift between quote and amount collected', () => {
  it('amount ABOVE the quoted total scales materials up proportionally', () =>
    expect(splitAmount(480_000, 80_000, 160_000)).toEqual({
      labourCents: 160_000,
      materialsCents: 320_000,
    }));
  it('materials larger than the amount collected are clamped to it', () => {
    const r = splitAmount(10_000, 0, 160_000);
    expect(r.materialsCents).toBeLessThanOrEqual(10_000);
    expect(r.labourCents).toBeGreaterThanOrEqual(0);
  });
});

describe('splitAmount — hygiene', () => {
  it('zero amount → zeroes', () =>
    expect(splitAmount(0, 80_000, 160_000)).toEqual({ labourCents: 0, materialsCents: 0 }));
  it('negative amount is floored to zero, never negative commission base', () => {
    const r = splitAmount(-5_000, 80_000, 160_000);
    expect(r.labourCents).toBeGreaterThanOrEqual(0);
    expect(r.materialsCents).toBeGreaterThanOrEqual(0);
  });
  it('negative inputs are clamped rather than trusted', () => {
    const r = splitAmount(100_000, -10, -10);
    expect(r.labourCents).toBeGreaterThanOrEqual(0);
    expect(r.materialsCents).toBeGreaterThanOrEqual(0);
  });
});

describe('splitAmount — the reconciliation invariant', () => {
  const amounts = [0, 1, 999, 24_000, 48_000, 120_000, 240_000, 480_000, 5_000_000];
  const quotes: Array<[number | null, number | null]> = [
    [null, null],
    [80_000, 160_000],
    [0, 50_000],
    [100_000, 0],
    [1, 2],
    [333_333, 666_667],
  ];

  for (const amount of amounts) {
    for (const [lab, mat] of quotes) {
      it(`amount=${amount} quote=(${lab},${mat}) reconciles exactly`, () => {
        const r = splitAmount(amount, lab, mat);
        // The whole point: the split always adds back up to what was collected.
        expect(r.labourCents + r.materialsCents).toBe(Math.max(0, Math.round(amount)));
        expect(Number.isInteger(r.labourCents)).toBe(true);
        expect(Number.isInteger(r.materialsCents)).toBe(true);
        expect(r.labourCents).toBeGreaterThanOrEqual(0);
        expect(r.materialsCents).toBeGreaterThanOrEqual(0);
      });
    }
  }
});
