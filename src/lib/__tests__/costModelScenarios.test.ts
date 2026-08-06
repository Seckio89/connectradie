// End-to-end scenarios for the margin check: costModel driven through the SAME
// platform-fee engine the quote flows use (calculatePlatformFee), on realistic
// Australian jobs across several trades.
//
// costModel.test.ts proves the arithmetic in isolation. This file proves the
// integration — that commission actually lands where the verdict can see it, and
// that the ex-GST rule is load-bearing rather than decorative.

import { describe, it, expect } from 'vitest';
import { checkMargin } from '../costModel';
import type { CostBasis } from '../costModel';
import { calculatePlatformFee } from '../subscription';
import type { SubscriptionTier } from '../subscription';

const d = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Price a job the way the quote flows do, then grade it. */
function grade(opts: {
  hours: number;
  workers: number;
  quotedExGst: number;      // dollars, ex-GST
  materialsCost: number;    // dollars, at cost
  tier: SubscriptionTier;
  basis: CostBasis;
}) {
  const labour = Math.max(0, opts.quotedExGst - opts.materialsCost);
  const feeDollars = calculatePlatformFee(labour, opts.tier);
  const check = checkMargin({
    hours: opts.hours,
    workers: opts.workers,
    materialsCostCents: Math.round(opts.materialsCost * 100),
    quotedExGstCents: Math.round(opts.quotedExGst * 100),
    platformFeeCents: Math.round(feeDollars * 100),
    basis: opts.basis,
  })!;
  return { check, feeDollars };
}

// A solo Australian cleaner paying themselves $34/hr on the tools.
const CLEANER: CostBasis = {
  staffWageCents: 3400,
  labourBurdenPct: 30,
  overheadRecoveryPct: 20,
  profitTargetPct: 20,
  minimumJobValueCents: 0,
};

// An electrical contractor with an apprentice on the books — heavier burden.
const SPARKY: CostBasis = {
  staffWageCents: 4800,
  labourBurdenPct: 38,
  overheadRecoveryPct: 25,
  profitTargetPct: 20,
  minimumJobValueCents: 18000, // $180 minimum callout
};

describe('scenario: the post-construction clean from the source worksheet, in AUD', () => {
  // 3,000 sq ft ≈ 279 m² final clean, 30 person-hours, minimal materials.
  it('flags the underpriced version', () => {
    const { check, feeDollars } = grade({
      hours: 30, workers: 1, quotedExGst: 1485, materialsCost: 70,
      tier: 'free', basis: CLEANER,
    });

    console.log('\n  UNDERPRICED CLEAN — quoted $1,485 ex-GST, 30 h');
    console.log(`    loaded rate      ${d(check.loadedHourlyCents)}/h`);
    console.log(`    labour           ${d(check.labourCostCents)}`);
    console.log(`    direct cost      ${d(check.directCostCents)}`);
    console.log(`    + overhead       ${d(check.withOverheadCents)}`);
    console.log(`    minimum viable   ${d(check.minViableCents)}`);
    console.log(`    platform fee     $${feeDollars.toFixed(2)}`);
    console.log(`    tradie receives  ${d(check.netToTradieCents)}`);
    console.log(`    cushion          ${d(check.cushionCents)}  → ${check.status.toUpperCase()}`);

    expect(check.loadedHourlyCents).toBe(4420); // $34 × 1.30
    expect(check.status).toBe('below');
    expect(check.cushionCents).toBeLessThan(0);
  });

  it('goes green once priced to clear cost', () => {
    const { check } = grade({
      hours: 30, workers: 1, quotedExGst: 2600, materialsCost: 70,
      tier: 'free', basis: CLEANER,
    });
    console.log(`\n  PRICED CORRECTLY — quoted $2,600 ex-GST → cushion ${d(check.cushionCents)} (${check.status})`);
    expect(check.status).toBe('healthy');
  });
});

describe('scenario: commission is load-bearing, not cosmetic', () => {
  it('a job that reads healthy gross can be thin or below once the fee comes off', () => {
    const gross = checkMargin({
      hours: 20, workers: 1, materialsCostCents: 0,
      quotedExGstCents: 145000, platformFeeCents: 0, basis: CLEANER,
    })!;

    const free = grade({ hours: 20, workers: 1, quotedExGst: 1450, materialsCost: 0, tier: 'free', basis: CLEANER });
    const pro = grade({ hours: 20, workers: 1, quotedExGst: 1450, materialsCost: 0, tier: 'pro', basis: CLEANER });

    console.log('\n  SAME $1,450 JOB, 20 h — what the tier does to the verdict');
    console.log(`    ignoring commission   cushion ${d(gross.cushionCents)}  → ${gross.status}`);
    console.log(`    free tier  (fee $${free.feeDollars.toFixed(2)})  cushion ${d(free.check.cushionCents)}  → ${free.check.status}`);
    console.log(`    pro tier   (fee $${pro.feeDollars.toFixed(2)})  cushion ${d(pro.check.cushionCents)}  → ${pro.check.status}`);

    // The fee is real money and must move the cushion.
    expect(free.feeDollars).toBeGreaterThan(0);
    expect(free.check.cushionCents).toBeLessThan(gross.cushionCents);
    // Free tier pays more commission than pro, so it always fares worse.
    expect(free.check.cushionCents).toBeLessThan(pro.check.cushionCents);
  });
});

describe('scenario: GST must not be counted as income', () => {
  it('grading the GST-inclusive total instead of the subtotal hides a loss', () => {
    const exGst = 1600;
    const incGst = exGst * 1.1; // what a registered tradie's client actually pays

    const correct = grade({ hours: 22, workers: 1, quotedExGst: exGst, materialsCost: 0, tier: 'free', basis: CLEANER });
    const wrong = grade({ hours: 22, workers: 1, quotedExGst: incGst, materialsCost: 0, tier: 'free', basis: CLEANER });

    console.log('\n  GST TRAP — 22 h job quoted $1,600 ex-GST ($1,760 inc)');
    console.log(`    against ex-GST subtotal  cushion ${d(correct.check.cushionCents)}  → ${correct.check.status}   (correct)`);
    console.log(`    against inc-GST total    cushion ${d(wrong.check.cushionCents)}  → ${wrong.check.status}   (would mislead)`);

    // The inclusive figure always flatters the result by roughly the GST on the
    // job — here enough to turn a thin job into a comfortable-looking one, which
    // is exactly the misread the subtotal rule prevents.
    expect(wrong.check.cushionCents).toBeGreaterThan(correct.check.cushionCents);
    expect(correct.check.status).toBe('thin');
    expect(wrong.check.status).toBe('healthy');
  });
});

describe('scenario: the model is trade-agnostic', () => {
  it('grades an electrical job with no cleaning assumptions anywhere', () => {
    // 6 h switchboard upgrade, $900 ex-GST, $320 of materials at cost.
    const { check } = grade({
      hours: 6, workers: 1, quotedExGst: 900, materialsCost: 320,
      tier: 'pro', basis: SPARKY,
    });

    console.log('\n  ELECTRICAL — 6 h switchboard, $900 ex-GST, $320 materials');
    console.log(`    loaded rate      ${d(check.loadedHourlyCents)}/h`);
    console.log(`    direct cost      ${d(check.directCostCents)}  (incl. materials at cost)`);
    console.log(`    minimum viable   ${d(check.minViableCents)}`);
    console.log(`    cushion          ${d(check.cushionCents)}  → ${check.status.toUpperCase()}`);

    expect(check.loadedHourlyCents).toBe(6624); // $48 × 1.38
    expect(check.materialsCostCents).toBe(32000);
    // $580 of labour revenue over 6 h is $96.67/h against a $66.24/h loaded
    // cost — a 46% gross margin, which does not survive 25% overhead and 20%
    // profit compounding on top of direct cost. Materials at cost carry none of
    // that load, so a materials-heavy job needs more labour revenue, not less.
    expect(check.status).toBe('below');
    expect(check.minViableCents).toBe(107616);
  });

  it('reaches healthy on the same electrical job once the labour is priced properly', () => {
    const { check } = grade({
      hours: 6, workers: 1, quotedExGst: 1400, materialsCost: 320,
      tier: 'pro', basis: SPARKY,
    });
    console.log(`  ELECTRICAL REPRICED — $1,400 ex-GST → cushion ${d(check.cushionCents)} (${check.status})`);
    expect(check.status).toBe('healthy');
  });

  it('applies the sparky minimum callout to a 30-minute job', () => {
    const { check } = grade({
      hours: 0.5, workers: 1, quotedExGst: 150, materialsCost: 0,
      tier: 'pro', basis: SPARKY,
    });
    console.log(`\n  TINY CALLOUT — 0.5 h, quoted $150 vs $180 minimum → ${check.status} (minimumApplied=${check.minimumApplied})`);
    expect(check.minimumApplied).toBe(true);
    expect(check.minViableCents).toBe(18000);
    expect(check.status).toBe('below');
  });
});

describe('scenario: a crew multiplies labour cost', () => {
  it('two cleaners on the same job cost twice the labour', () => {
    const solo = grade({ hours: 8, workers: 1, quotedExGst: 900, materialsCost: 0, tier: 'free', basis: CLEANER });
    const pair = grade({ hours: 8, workers: 2, quotedExGst: 900, materialsCost: 0, tier: 'free', basis: CLEANER });

    console.log('\n  CREW — 8 h, $900 ex-GST');
    console.log(`    1 cleaner   labour ${d(solo.check.labourCostCents)}  cushion ${d(solo.check.cushionCents)}  → ${solo.check.status}`);
    console.log(`    2 cleaners  labour ${d(pair.check.labourCostCents)}  cushion ${d(pair.check.cushionCents)}  → ${pair.check.status}`);

    expect(pair.check.labourCostCents).toBe(solo.check.labourCostCents * 2);
    expect(solo.check.status).toBe('healthy');
    expect(pair.check.status).toBe('below');
  });
});
