// Unit table for the V2 platform fee — the SOLE fee computation of the pricing
// rebuild (supabase/functions/_shared/pricing.ts). Integer cents, GST-inclusive,
// marginal reduced rate above $3k, capped. All caps land exactly at $15,000.

import { describe, it, expect } from 'vitest';
import {
  calculatePlatformFeeCentsV2,
  TIER_SCHEDULES,
} from '../../../supabase/functions/_shared/pricing';

const { free, pro, pm } = TIER_SCHEDULES;
const fee = (cents: number, s = free, override?: number | null) =>
  calculatePlatformFeeCentsV2(cents, s, override);

describe('calculatePlatformFeeCentsV2 — Free (10% / 5% >$3k / cap $900)', () => {
  it('$100 job → $10.00', () => expect(fee(10_000).feeCents).toBe(1_000));
  it('$1,000 job → $100.00', () => expect(fee(100_000).feeCents).toBe(10_000));
  it('$3,000 boundary → $300.00 (all at full rate)', () =>
    expect(fee(300_000).feeCents).toBe(30_000));
  it('$3,000.01 → still $300.00 (1c above threshold rounds away)', () =>
    expect(fee(300_001).feeCents).toBe(30_000));
  it('$5,000 → $300 + 5% × $2,000 = $400.00', () =>
    expect(fee(500_000).feeCents).toBe(40_000));
  it('$15,000 → exactly the $900 cap, not flagged capped', () => {
    const r = fee(1_500_000);
    expect(r.feeCents).toBe(90_000);
    expect(r.capped).toBe(false);
  });
  it('$20,000 → capped at $900', () => {
    const r = fee(2_000_000);
    expect(r.feeCents).toBe(90_000);
    expect(r.capped).toBe(true);
  });
});

describe('Pro (7% / 3.5% >$3k / cap $630)', () => {
  it('$1,000 → $70.00', () => expect(fee(100_000, pro).feeCents).toBe(7_000));
  it('$3,000 → $210.00', () => expect(fee(300_000, pro).feeCents).toBe(21_000));
  it('$10,000 → $210 + 3.5% × $7,000 = $455.00', () =>
    expect(fee(1_000_000, pro).feeCents).toBe(45_500));
  it('$15,000 → exactly the $630 cap', () =>
    expect(fee(1_500_000, pro).feeCents).toBe(63_000));
  it('$30,000 → capped at $630', () => {
    const r = fee(3_000_000, pro);
    expect(r.feeCents).toBe(63_000);
    expect(r.capped).toBe(true);
  });
});

describe('PM (3% / 1.5% >$3k / cap $270)', () => {
  it('$1,000 → $30.00', () => expect(fee(100_000, pm).feeCents).toBe(3_000));
  it('$3,000 → $90.00', () => expect(fee(300_000, pm).feeCents).toBe(9_000));
  it('$15,000 → exactly the $270 cap', () =>
    expect(fee(1_500_000, pm).feeCents).toBe(27_000));
  it('$50,000 → capped at $270', () =>
    expect(fee(5_000_000, pm).feeCents).toBe(27_000));
});

describe('GST-inclusive component (1/11 of the fee)', () => {
  it('$900.00 fee → $81.82 GST component', () =>
    expect(fee(2_000_000).gstOnFeeCents).toBe(Math.round(90_000 / 11)));
  it('$10.00 fee → $0.91 GST component', () =>
    expect(fee(10_000).gstOnFeeCents).toBe(91));
});

describe('per-profile override (grandfathering)', () => {
  it('2.5% override on $10,000 → $250.00 flat', () => {
    const r = fee(1_000_000, free, 250);
    expect(r.feeCents).toBe(25_000);
    expect(r.capped).toBe(false);
  });
  it('override still bounded by the tier cap', () => {
    const r = fee(50_000_000, free, 250); // $500,000 at 2.5% would be $12,500
    expect(r.feeCents).toBe(90_000); // free cap $900
    expect(r.capped).toBe(true);
  });
  it('0 bps override → zero fee (fully grandfathered account)', () =>
    expect(fee(1_000_000, free, 0).feeCents).toBe(0));
  it('null override → normal schedule', () =>
    expect(fee(100_000, free, null).feeCents).toBe(10_000));
});

describe('integer-cents hygiene', () => {
  it('zero amount → zero everything', () => {
    const r = fee(0);
    expect(r).toEqual({ feeCents: 0, gstOnFeeCents: 0, effectiveRateBps: 0, capped: false });
  });
  it('negative amount → zero fee', () => expect(fee(-5_000).feeCents).toBe(0));
  it('fractional cents input is floored, output stays integer', () => {
    const r = fee(1050.7);
    expect(Number.isInteger(r.feeCents)).toBe(true);
    expect(r.feeCents).toBe(105); // 10% of 1050c
  });
  it('odd amounts round the fee to a whole cent', () => {
    expect(fee(3_333).feeCents).toBe(333); // 333.3 → 333
    expect(Number.isInteger(fee(3_333).gstOnFeeCents)).toBe(true);
  });
  it('effective blended rate reflects the cap', () => {
    // $20,000 free-tier: $900 / $20,000 = 4.5% = 450 bps
    expect(fee(2_000_000).effectiveRateBps).toBe(450);
  });
});
