// Regression suite for the server-side fee-override lookup in resolveChargeFee()
// (supabase/functions/_shared/feeContext.ts).
//
// WHY THIS EXISTS
// On 2026-07-24 a $70 job was billed $5.00 commission even though the tradie
// held platform_fee_override_bps = 0, which must yield exactly zero. $5.00 is
// the standard Pro path — 5% of $70 is $3.50, lifted to the $5.00 min fee — so
// the override simply never reached the engine. An identical charge ~23h
// earlier was correct. The cause was never established: the applied rate wasn't
// recorded anywhere, so after the fact the value at charge time was unknowable.
//
// The fix made the override something resolveChargeFee looks up ITSELF from
// tradieId, instead of trusting each of the 20 call sites across 14 edge
// functions to remember to select the column and pass it in. Case (b) below is
// the one that matters: it reproduces the failure exactly — override present in
// the DB, absent from what the caller supplied — and pins the behaviour that a
// forgetful caller can no longer cause a silent overcharge.
//
// Every case passes skipRepeatCheck so repeat-client rates stay out of scope;
// those are covered by feeV21.test.ts.

import { describe, it, expect } from 'vitest';
import { resolveChargeFee } from '../../../supabase/functions/_shared/feeContext';

const TRADIE = 'cee4e052-a6de-479d-b9d1-530fc1e6faba';
const MATERIALS_BPS = 193;

/** The $70 all-labour job from the incident. Pro tier: 5% → $3.50 → $5.00 min. */
const SEVENTY_DOLLARS = 7_000;

interface MockOpts {
  /** Value of profiles.platform_fee_override_bps the lookup finds. */
  dbOverrideBps?: number | null;
  /** Simulate the profiles row not existing at all (data === null). */
  profileMissing?: boolean;
  /** Simulate a transient DB failure on the profiles lookup. */
  profileThrows?: boolean;
}

/**
 * Minimal supabase double. resolveChargeFee types its client as `any`, and only
 * two chains are reachable here: platform_config (materials rate) and profiles
 * (the override) — both `.from().select().eq().maybeSingle()`.
 */
function makeSupabase(opts: MockOpts = {}) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'platform_config') {
            return { data: { value_int: MATERIALS_BPS }, error: null };
          }
          if (table === 'profiles') {
            if (opts.profileThrows) throw new Error('connection reset by peer');
            if (opts.profileMissing) return { data: null, error: null };
            return {
              data: { platform_fee_override_bps: opts.dbOverrideBps ?? null },
              error: null,
            };
          }
          throw new Error(`unexpected table in fee path: ${table}`);
        },
      };
      return chain;
    },
  };
}

describe('resolveChargeFee — a 0 bps override charges nothing', () => {
  it('caller passes the override too (the happy path)', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 0 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      overrideBps: 0,
      skipRepeatCheck: true,
    });

    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.applicationFeeAmount).toBe(0);
    expect(res.metadata.platform_fee).toBe('0');
    expect(res.metadata.commission).toBe('0');
    expect(res.metadata.override_bps_applied).toBe('0');
    // The $5 min fee must NOT be reinstated by the floor logic.
    expect(res.breakdown.floorApplied).toBe(false);
    expect(res.breakdown.rateApplied).toBe(0);
  });

  it('THE INCIDENT: caller passes null, DB holds 0 → still charges zero', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 0 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      overrideBps: null, // the failure mode: caller forgot / column not selected
      skipRepeatCheck: true,
    });

    // Before the fix this was 500 — the $5.00 that was actually charged.
    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.applicationFeeAmount).toBe(0);
    expect(res.metadata.override_bps_applied).toBe('0');
    expect(res.metadata.override_lookup_failed).toBeUndefined();
  });

  it('omitting overrideBps entirely behaves the same as passing null', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 0 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      skipRepeatCheck: true,
    });

    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.metadata.override_bps_applied).toBe('0');
  });
});

describe('resolveChargeFee — ordinary tradies are unaffected', () => {
  it('no override in the DB → normal Pro pricing, min fee still applies', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: null }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      skipRepeatCheck: true,
    });

    // 5% of $70 = $3.50, lifted to the $5.00 minimum.
    expect(res.breakdown.commissionCents).toBe(500);
    expect(res.metadata.platform_fee).toBe('500');
    expect(res.breakdown.rateApplied).toBe(500);
    // Empty string, not "null" — the audit distinguishes unset from 0.
    expect(res.metadata.override_bps_applied).toBe('');
  });

  it('a non-zero override still applies (grandfathered rate)', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 200 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      skipRepeatCheck: true,
    });

    // 2% of $70 = $1.40, and the override bypasses the $5 min fee.
    expect(res.breakdown.commissionCents).toBe(140);
    expect(res.metadata.override_bps_applied).toBe('200');
  });

  it('the DB wins over a caller passing a stale value', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 0 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      overrideBps: 500, // stale/wrong — must be ignored
      skipRepeatCheck: true,
    });

    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.metadata.override_bps_applied).toBe('0');
  });
});

describe('resolveChargeFee — a failed lookup degrades safely, never fatally', () => {
  it('lookup throws → falls back to the caller and marks the charge', async () => {
    const res = await resolveChargeFee(makeSupabase({ profileThrows: true }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      overrideBps: 0,
      skipRepeatCheck: true,
    });

    // Payments must keep working on a DB blip — this must not reject.
    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.metadata.override_lookup_failed).toBe('true');
  });

  it('lookup throws AND caller had nothing → overcharges, but VISIBLY', async () => {
    const res = await resolveChargeFee(makeSupabase({ profileThrows: true }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      skipRepeatCheck: true,
    });

    // This is the unavoidable worst case. The point is the breadcrumb: the
    // daily audit (check_v21_fee_invariants) can now see it, where the original
    // incident left no trace at all.
    expect(res.breakdown.commissionCents).toBe(500);
    expect(res.metadata.override_lookup_failed).toBe('true');
  });

  it('profiles row missing → keeps the caller value rather than zeroing it', async () => {
    const res = await resolveChargeFee(makeSupabase({ profileMissing: true }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      tradieId: TRADIE,
      overrideBps: 0,
      skipRepeatCheck: true,
    });

    expect(res.breakdown.commissionCents).toBe(0);
    expect(res.metadata.override_bps_applied).toBe('0');
    // A missing row isn't an error, so nothing is flagged.
    expect(res.metadata.override_lookup_failed).toBeUndefined();
  });

  it('no tradieId → no lookup, caller value used as-is', async () => {
    const res = await resolveChargeFee(makeSupabase({ dbOverrideBps: 0 }), {
      amountCents: SEVENTY_DOLLARS,
      tier: 'pro',
      overrideBps: null,
      skipRepeatCheck: true,
    });

    expect(res.breakdown.commissionCents).toBe(500);
    expect(res.metadata.override_bps_applied).toBe('');
    expect(res.metadata.override_lookup_failed).toBeUndefined();
  });
});
