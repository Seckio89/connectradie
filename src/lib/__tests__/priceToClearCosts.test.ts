import { describe, it, expect } from 'vitest';
import { priceToClearCostsCents, checkMargin, COST_BASIS_DEFAULTS } from '../costModel';
import type { CostBasis } from '../costModel';

// The number this produces is quoted to a client, so it is held to the standard
// of the money maths rather than the copy: every case below asserts that quoting
// the returned price actually clears the floor, not merely that it looks close.

/** Flat percentage fee, uncapped — the simple case the closed form would handle. */
const flatFee = (pct: number) => (labourCents: number) => Math.round(labourCents * (pct / 100));

/** Percentage fee with a cap, which is what makes this a fixed point and not algebra. */
const cappedFee = (pct: number, capCents: number) => (labourCents: number) =>
  Math.min(capCents, Math.round(labourCents * (pct / 100)));

const basis = (over: Partial<CostBasis> = {}): CostBasis => ({
  ...COST_BASIS_DEFAULTS,
  staffWageCents: 3300,
  ...over,
});

describe('priceToClearCostsCents', () => {
  it('covers the floor plus the commission the extra revenue itself attracts', () => {
    // Naively floor + 8% of floor would be 10_800 and land short, because the
    // added revenue is taxed too. The true answer solves p − 0.08p = 10_000.
    const p = priceToClearCostsCents(10_000, 0, flatFee(8));
    expect(p).toBe(10_870); // ceil(10_000 / 0.92)
    expect(p - flatFee(8)(p)).toBeGreaterThanOrEqual(10_000);
  });

  it('never returns a price that leaves the tradie short', () => {
    for (const floor of [1_000, 9_999, 24_255, 100_000]) {
      for (const pct of [0, 3, 5, 8]) {
        const p = priceToClearCostsCents(floor, 0, flatFee(pct));
        expect(p - flatFee(pct)(p)).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('honours a fee cap instead of over-quoting past it', () => {
    // Floor far above the cap: once the fee pegs at $400 the answer is just
    // floor + cap, and must not keep inflating as an uncapped solve would.
    const capCents = 40_000;
    const p = priceToClearCostsCents(1_000_000, 0, cappedFee(8, capCents));
    expect(p).toBe(1_040_000);
    expect(p - cappedFee(8, capCents)(p)).toBeGreaterThanOrEqual(1_000_000);
  });

  it('excludes materials from the fee base, since commission is on labour only', () => {
    const materials = 20_000;
    const p = priceToClearCostsCents(50_000, materials, flatFee(8));
    // Fee applies to (price − materials), so the gross-up is smaller than it
    // would be on the whole price.
    expect(p).toBeLessThan(priceToClearCostsCents(50_000, 0, flatFee(8)));
    expect(p - flatFee(8)(Math.max(0, p - materials))).toBeGreaterThanOrEqual(50_000);
  });

  it('returns the floor itself when there is no fee', () => {
    expect(priceToClearCostsCents(24_255, 0, () => 0)).toBe(24_255);
  });

  it('handles a zero floor and a materials-heavy job without going negative', () => {
    expect(priceToClearCostsCents(0, 0, flatFee(8))).toBe(0);
    // Materials larger than the floor must not push the fee base below zero.
    expect(priceToClearCostsCents(5_000, 90_000, flatFee(8))).toBe(5_000);
  });

  it('clamps a negative floor rather than propagating it', () => {
    expect(priceToClearCostsCents(-5_000, 0, flatFee(8))).toBe(0);
  });

  it('turns a below-costs quote into a passing one at the price it names', () => {
    // End to end against checkMargin: take a losing quote, requote at the
    // suggested price, and confirm the verdict flips.
    const b = basis();
    const shared = { hours: 2.5, workers: 2, materialsCostCents: 0, basis: b };
    const losing = checkMargin({ ...shared, quotedExGstCents: 21_300, platformFeeCents: flatFee(8)(21_300) })!;
    expect(losing.status).toBe('below');

    const target = priceToClearCostsCents(losing.minViableCents, losing.materialsCostCents, flatFee(8));
    const requoted = checkMargin({ ...shared, quotedExGstCents: target, platformFeeCents: flatFee(8)(target) })!;
    expect(requoted.cushionCents).toBeGreaterThanOrEqual(0);
    expect(requoted.status).not.toBe('below');
  });
});

describe('checkMargin labourHoursTotal', () => {
  it('reports billable hours as hours × workers', () => {
    const c = checkMargin({
      hours: 2.5, workers: 2, materialsCostCents: 0,
      quotedExGstCents: 30_000, platformFeeCents: 0, basis: basis(),
    })!;
    expect(c.labourHoursTotal).toBe(5);
  });

  it('is 0 for a job with no hours, so per-hour framing can be skipped', () => {
    const c = checkMargin({
      hours: 0, workers: 3, materialsCostCents: 5_000,
      quotedExGstCents: 30_000, platformFeeCents: 0, basis: basis(),
    })!;
    expect(c.labourHoursTotal).toBe(0);
  });
});
