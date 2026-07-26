// Deno tests for the JOB-LEVEL fee cap in resolveChargeFee.
//
//   deno test --allow-env --allow-net supabase/functions/_shared/feeContext.test.ts
//
// The property under test is convergence: splitting a job across N instalments
// must collect exactly the same total commission as charging it in one go. That
// is what "capped at $500 per job" means, and it was false before this fix —
// a $20,000 job paid as 4 milestones was charged $1,600.
//
// These call the REAL resolveChargeFee against a stub client rather than
// re-implementing the arithmetic, so a regression in the production path fails
// the test rather than being mirrored by it.

import { assertEquals } from "jsr:@std/assert@1";
import { resolveChargeFee } from "./feeContext.ts";

/**
 * Minimal stand-in for the supabase client. Every builder method returns `this`,
 * and the builder is thenable so `await supabase.from(...).select(...)` resolves
 * — which is how the job-cap query is written.
 */
function stubClient(opts: {
  priorPayments?: Array<{ commission_cents: number | null; labour_cents: number | null }>;
  overrideBps?: number | null;
  failPaymentsQuery?: boolean;
}) {
  const { priorPayments = [], overrideBps = null, failPaymentsQuery = false } = opts;

  const makeBuilder = (table: string) => {
    const result = () => {
      if (table === "payments") {
        return failPaymentsQuery
          ? { data: null, error: { message: "boom" } }
          : { data: priorPayments, error: null };
      }
      if (table === "profiles") {
        return { data: { platform_fee_override_bps: overrideBps }, error: null };
      }
      // platform_config -> fall back to the DEFAULT_MATERIALS_PROCESSING_BPS path
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(result()),
      single: () => Promise.resolve(result()),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return builder;
  };

  return { from: (table: string) => makeBuilder(table) };
}

const JOB = "11111111-1111-1111-1111-111111111111";

/** Charge `labour` against a job that has already been charged `prior`. */
async function chargeOnJob(
  labour: number,
  prior: Array<{ commission_cents: number; labour_cents: number }>,
  tier: "free" | "pro" | "pm" = "free",
) {
  const fee = await resolveChargeFee(stubClient({ priorPayments: prior }), {
    amountCents: labour,
    labourCents: labour,
    materialsCents: 0,
    tier,
    jobId: JOB,
    skipRepeatCheck: true,
  });
  return fee.breakdown.commissionCents;
}

/** Total commission when a job's labour is split evenly into `parts` charges. */
async function totalAcrossSplit(totalLabour: number, parts: number, tier: "free" | "pro" | "pm" = "free") {
  const each = Math.round(totalLabour / parts);
  const prior: Array<{ commission_cents: number; labour_cents: number }> = [];
  let total = 0;
  for (let i = 0; i < parts; i++) {
    const c = await chargeOnJob(each, prior, tier);
    total += c;
    prior.push({ commission_cents: c, labour_cents: each });
  }
  return total;
}

Deno.test("cap-bound job: 4 milestones collect the same as one charge", async () => {
  const TOTAL = 2_000_000; // $20,000 labour, free tier -> $500 cap
  const single = await chargeOnJob(TOTAL, []);
  const split = await totalAcrossSplit(TOTAL, 4);
  assertEquals(single, 50_000, "single charge should hit the $500 cap");
  // Before the fix this was 160_000 ($1,600) — 3.2x the advertised cap.
  assertEquals(split, single, "split must equal single");
});

Deno.test("floor-bound job: the 2.5% floor also converges", async () => {
  const TOTAL = 10_000_000; // $100,000 labour -> floor 2.5% = $2,500 beats the $500 cap
  const single = await chargeOnJob(TOTAL, []);
  const split = await totalAcrossSplit(TOTAL, 4);
  assertEquals(single, 250_000, "single charge should hit the 2.5% floor");
  assertEquals(split, single, "split must equal single");
});

Deno.test("small job under the cap is unaffected", async () => {
  const TOTAL = 100_000; // $1,000 labour, 8% = $80, well under the cap
  const single = await chargeOnJob(TOTAL, []);
  const split = await totalAcrossSplit(TOTAL, 2);
  assertEquals(single, 8_000);
  assertEquals(split, single, "splitting a sub-cap job must not change the fee");
});

Deno.test("pro tier converges too (floor beats the cap at this size)", async () => {
  const TOTAL = 2_000_000; // $20,000 labour
  const single = await chargeOnJob(TOTAL, [], "pro");
  const split = await totalAcrossSplit(TOTAL, 5, "pro");
  // NOT the $400 pro cap: the 2.5% floor is $500 here, and the floor wins.
  // This is the documented tier convergence above ~$20k labour — pro and free
  // land on the same number, which is why the floor must be part of the
  // job-level ceiling and not just the per-charge one.
  assertEquals(single, 50_000, "floor ($500) should beat the pro cap ($400)");
  assertEquals(split, single, "split must equal single");
});

Deno.test("a job already at its ceiling is charged nothing further", async () => {
  const c = await chargeOnJob(500_000, [{ commission_cents: 50_000, labour_cents: 1_500_000 }]);
  assertEquals(c, 0, "no headroom left, so no further commission");
});

Deno.test("commission never goes negative if prior charges exceed the ceiling", async () => {
  const c = await chargeOnJob(500_000, [{ commission_cents: 999_999, labour_cents: 100 }]);
  assertEquals(c, 0);
});

Deno.test("a 0 bps override still yields zero, and the cap logic cannot resurrect it", async () => {
  const fee = await resolveChargeFee(stubClient({ overrideBps: 0 }), {
    amountCents: 2_000_000,
    labourCents: 2_000_000,
    materialsCents: 0,
    tier: "free",
    jobId: JOB,
    // tradieId is REQUIRED for the server-side override lookup to run at all.
    tradieId: "22222222-2222-2222-2222-222222222222",
    skipRepeatCheck: true,
  });
  assertEquals(fee.breakdown.commissionCents, 0);
});

Deno.test("a failed job-cap lookup falls back to per-charge and is flagged", async () => {
  const fee = await resolveChargeFee(stubClient({ failPaymentsQuery: true }), {
    amountCents: 2_000_000,
    labourCents: 2_000_000,
    materialsCents: 0,
    tier: "free",
    jobId: JOB,
    skipRepeatCheck: true,
  });
  // Falls back to the old per-charge cap (over-collects rather than under-collects)
  // but must say so, so the daily fee audit can catch it.
  assertEquals(fee.breakdown.commissionCents, 50_000);
  assertEquals(fee.metadata.job_cap_lookup_failed, "true");
});

Deno.test("a charge with no jobId is unchanged (no job to cap against)", async () => {
  const fee = await resolveChargeFee(stubClient({}), {
    amountCents: 2_000_000,
    labourCents: 2_000_000,
    materialsCents: 0,
    tier: "free",
    skipRepeatCheck: true,
  });
  assertEquals(fee.breakdown.commissionCents, 50_000);
  assertEquals(fee.metadata.job_cap_applied, undefined);
});
