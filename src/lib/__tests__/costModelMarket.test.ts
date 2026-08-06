// Market calibration: does the margin check agree with what the Australian
// market actually pays?
//
// costModel.test.ts proves the arithmetic. costModelScenarios.test.ts proves the
// integration with the fee engine. This file asks the question neither can: are
// the SHIPPED DEFAULTS right about the real world?
//
// Every price band below is a researched 2026 Australian market rate, not an
// invented figure. Sources are listed in docs/quote-pricing-calibration.md.
//
// These assertions deliberately document calibration rather than merely passing.
// If a band's verdict changes — because the defaults were retuned, or the fee
// schedule moved — a test here SHOULD fail, because that is a change in what the
// product tells tradies about their livelihood.

import { describe, it, expect } from 'vitest';
import { checkMargin } from '../costModel';
import type { CostBasis, MarginStatus } from '../costModel';
import { calculatePlatformFee } from '../subscription';
import type { SubscriptionTier } from '../subscription';

// The shipped defaults, on an Australian cleaner's wage. Changing these numbers
// is the whole subject of this file's finding.
const CLEANER: CostBasis = {
  staffWageCents: 3400,      // ~$34/hr — Indeed AU average for a cleaner
  labourBurdenPct: 30,       // super 12% + workers' comp + payroll tax + leave loading
  overheadRecoveryPct: 20,   // shipped default
  profitTargetPct: 20,       // shipped default
  minimumJobValueCents: 0,
};

interface Segment {
  label: string;
  hours: number;
  workers: number;
  materials: number;         // dollars, at cost
  low: number;               // dollars ex-GST
  mid: number;
  high: number;
  /** How the market quotes this work, for the report. */
  basisNote: string;
}

// Production rate for a builders clean: 90 sq ft/person-hr from the source
// worksheet ≈ 8.4 m²/person-hr.
const BUILDERS_M2_PER_HR = 8.4;
const BUILDERS_AREA = 200;

const SEGMENTS: Segment[] = [
  {
    label: 'Commercial cleaning, hourly (national)',
    hours: 4, workers: 1, materials: 0,
    low: 35 * 4, mid: 50 * 4, high: 65 * 4,
    basisNote: '$35–65/hr',
  },
  {
    label: 'Commercial cleaning, hourly (Syd/Melb)',
    hours: 4, workers: 1, materials: 0,
    low: 50 * 4, mid: 65 * 4, high: 80 * 4,
    basisNote: '$50–80/hr',
  },
  {
    label: 'Bond clean, 2 bed',
    hours: 5, workers: 1, materials: 25,
    low: 280, mid: 365, high: 450,
    basisNote: '$280–450 flat',
  },
  {
    label: 'Bond clean, 3 bed',
    hours: 7, workers: 1, materials: 35,
    low: 350, mid: 500, high: 650,
    basisNote: '$350–650 flat',
  },
  {
    label: 'Builders clean, hourly',
    hours: 8, workers: 1, materials: 40,
    low: 50 * 8, mid: 62.5 * 8, high: 75 * 8,
    basisNote: '$50–75/hr',
  },
  {
    label: `Builders clean, ${BUILDERS_AREA} m²`,
    hours: BUILDERS_AREA / BUILDERS_M2_PER_HR, workers: 1, materials: 60,
    low: 8 * BUILDERS_AREA, mid: 12 * BUILDERS_AREA, high: 16 * BUILDERS_AREA,
    basisNote: '$8–16/m²',
  },
];

function gradeAt(seg: Segment, quotedExGst: number, tier: SubscriptionTier, basis: CostBasis) {
  const labour = Math.max(0, quotedExGst - seg.materials);
  const feeDollars = calculatePlatformFee(labour, tier);
  return checkMargin({
    hours: seg.hours,
    workers: seg.workers,
    materialsCostCents: Math.round(seg.materials * 100),
    quotedExGstCents: Math.round(quotedExGst * 100),
    platformFeeCents: Math.round(feeDollars * 100),
    basis,
  })!;
}

/**
 * Lowest ex-GST price reaching a target verdict. Binary search rather than
 * algebra because the platform fee is piecewise (floor, cap, minimum), so the
 * relationship isn't cleanly invertible — but it IS monotonic in price, which is
 * all bisection needs.
 */
function breakEven(
  seg: Segment,
  tier: SubscriptionTier,
  basis: CostBasis,
  target: 'covers-cost' | 'healthy',
): number {
  let lo = 0;
  let hi = 1_000_000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const c = gradeAt(seg, mid, tier, basis);
    const reached = target === 'covers-cost' ? c.cushionCents >= 0 : c.status === 'healthy';
    if (reached) hi = mid; else lo = mid;
  }
  return hi;
}

const pad = (s: string, n: number) => s.padEnd(n);
const rate = (dollars: number, hours: number) => `$${(dollars / hours).toFixed(2)}/h`;
const mark = (s: MarginStatus) => (s === 'healthy' ? '✓ healthy' : s === 'thin' ? '~ thin  ' : '✗ below ');

describe('market calibration — shipped defaults vs real Australian rates', () => {
  it('prints the calibration table', () => {
    console.log(`\n  Persona: cleaner · wage $34/h · burden 30% · overhead 20% · profit 20%`);
    console.log(`  Loaded cost $${(3400 * 1.3 / 100).toFixed(2)}/h · free tier commission\n`);
    console.log(`  ${pad('Segment', 38)}${pad('Market', 14)}${pad('low', 10)}${pad('mid', 10)}${pad('high', 10)}${pad('break-even', 12)}`);
    console.log(`  ${'-'.repeat(94)}`);

    for (const seg of SEGMENTS) {
      const lo = gradeAt(seg, seg.low, 'free', CLEANER);
      const md = gradeAt(seg, seg.mid, 'free', CLEANER);
      const hi = gradeAt(seg, seg.high, 'free', CLEANER);
      const be = breakEven(seg, 'free', CLEANER, 'healthy');
      console.log(
        `  ${pad(seg.label, 38)}${pad(seg.basisNote, 14)}` +
        `${pad(mark(lo.status), 10)}${pad(mark(md.status), 10)}${pad(mark(hi.status), 10)}` +
        `${pad(rate(be, seg.hours), 12)}`,
      );
    }
    console.log('');
    expect(SEGMENTS.length).toBe(6);
  });

  it('FINDING: commodity hourly cleaning at the market mid does NOT clear the defaults', () => {
    const seg = SEGMENTS[0]; // national commercial cleaning, $50/h mid
    const md = gradeAt(seg, seg.mid, 'free', CLEANER);
    const beHealthy = breakEven(seg, 'free', CLEANER, 'healthy');
    const beCost = breakEven(seg, 'free', CLEANER, 'covers-cost');

    console.log(`\n  Commercial cleaning @ $50/h market mid → ${md.status}`);
    console.log(`    covers cost from   ${rate(beCost, seg.hours)}`);
    console.log(`    healthy from       ${rate(beHealthy, seg.hours)}`);
    console.log(`    market band        $35–65/h  (mid $50/h)`);

    expect(md.status).not.toBe('healthy');
    // The rate needed to grade healthy sits above the national market mid — the
    // core calibration finding.
    expect(beHealthy / seg.hours).toBeGreaterThan(50);
  });

  it('FINDING: only the very top of the metro band clears — $80/h', () => {
    const seg = SEGMENTS[1]; // Syd/Melb band, $50–80/h
    const md = gradeAt(seg, seg.mid, 'free', CLEANER); //  $65/h
    const hi = gradeAt(seg, seg.high, 'free', CLEANER); // $80/h
    console.log(`  Syd/Melb cleaning: $65/h → ${md.status}, $80/h → ${hi.status}`);

    // $65/h is close but still short: a $44.20/h loaded cost over 4 h is a
    // $254.59 floor, and 8% commission on $260 leaves $239.20.
    expect(md.status).toBe('below');
    expect(hi.status).toBe('healthy');
  });

  it('FINDING: the basis matters more than the rate — hourly vs per-m² on identical work', () => {
    const hourlyBasis = SEGMENTS[4];
    const areaBasis = SEGMENTS[5];
    const hourly = gradeAt(hourlyBasis, hourlyBasis.mid, 'free', CLEANER);
    const area = gradeAt(areaBasis, areaBasis.mid, 'free', CLEANER);

    // Same 200 m² builders clean, both at researched market mid rates, differing
    // ONLY in how the market quotes it.
    const hourlyOnSameJob = 62.5 * areaBasis.hours;
    const gap = areaBasis.mid - hourlyOnSameJob;

    console.log(`\n  Same ${BUILDERS_AREA} m² builders clean, ${areaBasis.hours.toFixed(1)} h:`);
    console.log(`    quoted hourly @ $62.50/h → $${hourlyOnSameJob.toFixed(2)}  (${hourly.status})`);
    console.log(`    quoted @ $12/m²          → $${areaBasis.mid.toFixed(2)}  (${area.status}, ${rate(areaBasis.mid, areaBasis.hours)} effective)`);
    console.log(`    left on the table quoting hourly: $${gap.toFixed(2)}\n`);

    expect(hourly.status).toBe('below');
    expect(area.status).toBe('healthy');
    // The area basis is worth materially more on the same work — the single most
    // actionable finding here.
    expect(gap).toBeGreaterThan(800);
  });

  it('bond cleans sit near the boundary — the band straddles the floor', () => {
    for (const seg of [SEGMENTS[2], SEGMENTS[3]]) {
      const lo = gradeAt(seg, seg.low, 'free', CLEANER);
      const hi = gradeAt(seg, seg.high, 'free', CLEANER);
      console.log(`  ${seg.label}: $${seg.low} → ${lo.status}, $${seg.high} → ${hi.status}`);
      // Bottom of the advertised band never clears; top of it does. A tradie
      // quoting the low end of the market is working for nothing.
      expect(lo.status).toBe('below');
      expect(hi.status).toBe('healthy');
    }
  });

  it('commission alone moves the break-even by a real amount', () => {
    const seg = SEGMENTS[0];
    const free = breakEven(seg, 'free', CLEANER, 'healthy');
    const pro = breakEven(seg, 'pro', CLEANER, 'healthy');
    const gap = (free - pro) / seg.hours;
    console.log(`\n  Break-even to healthy: free ${rate(free, seg.hours)} vs pro ${rate(pro, seg.hours)} → $${gap.toFixed(2)}/h`);
    expect(free).toBeGreaterThan(pro);
  });
});

describe('why the commodity band fails — it is the wage, not the targets', () => {
  it('no realistic overhead/profit pair rescues $50/h on a $34 wage', () => {
    const seg = SEGMENTS[0];
    let anyClearing: { oh: number; profit: number } | null = null;

    console.log(`\n  $50/h commercial clean, 4 h, wage $34 — under looser targets:`);
    for (const oh of [20, 15, 10, 5]) {
      for (const profit of [20, 10, 5, 0]) {
        const basis: CostBasis = { ...CLEANER, overheadRecoveryPct: oh, profitTargetPct: profit };
        const c = gradeAt(seg, seg.mid, 'free', basis);
        if (c.status === 'healthy' && !anyClearing) anyClearing = { oh, profit };
      }
    }
    // Even at 0% overhead and 0% profit the job barely covers its own labour:
    // $176.80 of loaded labour against $184.00 net of commission.
    const zeroTarget = gradeAt(seg, seg.mid, 'free', { ...CLEANER, overheadRecoveryPct: 0, profitTargetPct: 0 });
    console.log(`    even at 0% overhead + 0% profit → ${zeroTarget.status} (cushion $${(zeroTarget.cushionCents / 100).toFixed(2)})`);
    console.log(`    loosest pair that clears: ${anyClearing ? `overhead ${anyClearing.oh}% · profit ${anyClearing.profit}%` : 'none in range'}\n`);

    // Loosening the targets cannot fix it, because the gap is in the wage-to-
    // charge-out ratio: $50/h against a $44.20/h loaded cost is a 1.13×
    // multiplier, and commission takes most of what's left.
    expect(anyClearing).toBeNull();
  });

  it('solves the wage at which $50/h becomes viable', () => {
    const seg = SEGMENTS[0];
    console.log(`  $50/h commercial clean at 20% overhead + 20% profit, by wage:`);
    let viableWage: number | null = null;
    for (const w of [34, 30, 28, 26, 24, 22, 20]) {
      const c = gradeAt(seg, seg.mid, 'free', { ...CLEANER, staffWageCents: w * 100 });
      console.log(`    wage $${w}/h → ${c.status} (cushion $${(c.cushionCents / 100).toFixed(2)})`);
      if (c.status === 'healthy' && viableWage === null) viableWage = w;
    }
    console.log(`  First viable wage: $${viableWage}/h\n`);

    // The $50/h market rate only supports a 20/20 target at a wage well under
    // the Indeed AU average for a cleaner — which is the finding, not a bug.
    expect(viableWage).not.toBeNull();
    expect(viableWage!).toBeLessThan(28);
  });
});
