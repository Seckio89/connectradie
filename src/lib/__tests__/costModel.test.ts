import { describe, it, expect } from 'vitest';
import { checkMargin, hasCostBasis, COST_BASIS_DEFAULTS } from '../costModel';
import type { CostBasis, MarginCheckInput } from '../costModel';

// The basis from the post-construction cleaning worksheet this was modelled on,
// so the numbers below can be checked against a known-good sheet line for line.
const SHEET_BASIS: CostBasis = {
  staffWageCents: 2400,
  labourBurdenPct: 40,
  overheadRecoveryPct: 20,
  profitTargetPct: 25,
  minimumJobValueCents: 25000,
};

const basis = (over: Partial<CostBasis> = {}): CostBasis => ({
  ...COST_BASIS_DEFAULTS,
  staffWageCents: 3000,
  ...over,
});

const input = (over: Partial<MarginCheckInput> = {}): MarginCheckInput => ({
  hours: 10,
  workers: 1,
  materialsCostCents: 0,
  quotedExGstCents: 62000,
  platformFeeCents: 0,
  basis: basis(),
  ...over,
});

describe('checkMargin', () => {
  it('reproduces the source worksheet line for line', () => {
    // 30 person-hours, $24/hr at 1.40 burden, materials 7% of labour.
    const c = checkMargin({
      hours: 30,
      workers: 1,
      materialsCostCents: 7056,
      quotedExGstCents: 148500,
      platformFeeCents: 0,
      basis: SHEET_BASIS,
    });

    expect(c).not.toBeNull();
    expect(c!.loadedHourlyCents).toBe(3360); //   $33.60 fully loaded
    expect(c!.labourCostCents).toBe(100800); //   $1,008.00
    expect(c!.directCostCents).toBe(107856); //   $1,078.56
    expect(c!.withOverheadCents).toBe(129427); // $1,294.27
    expect(c!.minViableCents).toBe(161784); //    $1,617.84 minimum viable
    expect(c!.cushionCents).toBe(-13284); //      −$132.84 cushion
    expect(c!.status).toBe('below');
    expect(c!.minimumApplied).toBe(false);
  });

  it('returns null until a wage is set, so no verdict is shown', () => {
    expect(checkMargin(input({ basis: COST_BASIS_DEFAULTS }))).toBeNull();
    expect(checkMargin(input({ basis: basis({ staffWageCents: 0 }) }))).toBeNull();
    // Everything else defaulted is enough — a wage alone switches it on.
    expect(checkMargin(input({ basis: basis({ staffWageCents: 1 }) }))).not.toBeNull();
  });

  it('grades the cushion against the floor', () => {
    // wage 3000 × 1.30 = 3900/h · 10 h = 39000 direct · +20% = 46800 · +20% = 56160
    const floor = 56160;
    const thin = Math.round(floor * 0.1); // 5616

    expect(checkMargin(input({ quotedExGstCents: floor + thin }))!.status).toBe('healthy');
    expect(checkMargin(input({ quotedExGstCents: floor + thin - 1 }))!.status).toBe('thin');
    expect(checkMargin(input({ quotedExGstCents: floor }))!.status).toBe('thin');
    expect(checkMargin(input({ quotedExGstCents: floor - 1 }))!.status).toBe('below');

    const at = checkMargin(input({ quotedExGstCents: floor }))!;
    expect(at.minViableCents).toBe(floor);
    expect(at.cushionCents).toBe(0);
  });

  it('nets platform commission off before grading — a gross-healthy job can be thin', () => {
    const gross = checkMargin(input({ quotedExGstCents: 62000, platformFeeCents: 0 }))!;
    expect(gross.status).toBe('healthy');
    expect(gross.cushionCents).toBe(5840);

    const net = checkMargin(input({ quotedExGstCents: 62000, platformFeeCents: 500 }))!;
    expect(net.netToTradieCents).toBe(61500);
    expect(net.cushionCents).toBe(5340);
    expect(net.status).toBe('thin');

    // Enough commission and the same quote goes underwater.
    expect(checkMargin(input({ platformFeeCents: 6000 }))!.status).toBe('below');
  });

  it('applies the minimum job value when the cost chain lands under it', () => {
    const c = checkMargin(input({ hours: 0.5, basis: basis({ minimumJobValueCents: 30000 }) }))!;
    // 0.5 h → 1950 direct → 2340 → 2808, well under the $300 minimum.
    expect(c.minimumApplied).toBe(true);
    expect(c.minViableCents).toBe(30000);

    // Once the chain clears the minimum, the minimum stops binding.
    const big = checkMargin(input({ hours: 40, basis: basis({ minimumJobValueCents: 30000 }) }))!;
    expect(big.minimumApplied).toBe(false);
    expect(big.minViableCents).toBeGreaterThan(30000);
  });

  it('counts materials at cost and multiplies labour by the crew', () => {
    const solo = checkMargin(input())!;
    const crew = checkMargin(input({ workers: 3 }))!;
    expect(crew.labourCostCents).toBe(solo.labourCostCents * 3);

    const withMats = checkMargin(input({ materialsCostCents: 10000 }))!;
    expect(withMats.materialsCostCents).toBe(10000);
    expect(withMats.directCostCents).toBe(solo.directCostCents + 10000);
    expect(withMats.minViableCents).toBeGreaterThan(solo.minViableCents);
  });

  it('handles a zero-hours job without dividing by anything', () => {
    const c = checkMargin(input({ hours: 0, materialsCostCents: 0, quotedExGstCents: 5000 }))!;
    expect(c.labourCostCents).toBe(0);
    expect(c.directCostCents).toBe(0);
    expect(c.minViableCents).toBe(0);
    expect(c.cushionCents).toBe(5000);
    expect(c.status).toBe('healthy');
  });

  it('clamps junk input rather than producing NaN', () => {
    const c = checkMargin(input({ hours: Number.NaN, workers: 0 }))!;
    expect(c.labourCostCents).toBe(0);
    expect(Number.isFinite(c.minViableCents)).toBe(true);

    const neg = checkMargin(input({ hours: -5, materialsCostCents: -100, platformFeeCents: -50 }))!;
    expect(neg.labourCostCents).toBe(0);
    expect(neg.materialsCostCents).toBe(0);
    expect(neg.netToTradieCents).toBe(62000);

    // Percentages past the sanity bound are pinned, not honoured.
    const wild = checkMargin(input({ basis: basis({ overheadRecoveryPct: 5000 }) }))!;
    expect(wild.withOverheadCents).toBe(Math.round(39000 * 3));
  });
});

describe('hasCostBasis', () => {
  it('is false until a wage is entered', () => {
    expect(hasCostBasis(null)).toBe(false);
    expect(hasCostBasis(undefined)).toBe(false);
    expect(hasCostBasis(COST_BASIS_DEFAULTS)).toBe(false);
    expect(hasCostBasis(basis({ staffWageCents: 2500 }))).toBe(true);
  });
});
