// Deno tests for recording the instant-payout fee as platform revenue.
//
//   deno test supabase/functions/_shared/instantPayoutFee.test.ts
//
// Stripe's platform pricing scheme collects this fee, so it IS revenue and it
// lands on the tradie's tax invoice. The GST split therefore has to be right,
// and recording must never be able to fail a payout that already happened.

import { strictEqual as assertEquals } from "node:assert/strict";
import { recordFeeRefund, recordInstantPayoutFee } from "./feeContext.ts";

/** Captures the row an insert would write. */
function stubClient(result: { error?: unknown } = {}) {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);
          return Promise.resolve(result);
        },
      };
    },
  };
}

Deno.test("splits the fee GST-INCLUSIVE, the same way commission is", () => {
  // $2.00 collected → ex-GST $1.82 + GST $0.18. The tradie was shown $2.00 and
  // Stripe took $2.00, so GST comes OUT of it, never on top.
  const c = stubClient();
  return recordInstantPayoutFee(c, { tradieProfileId: "t1", payoutId: "po_1", feeCents: 200 })
    .then(() => {
      const row = c.inserted[0];
      assertEquals(row.commission_cents, 200);
      assertEquals(row.gst_cents, 18);
      assertEquals(row.ex_gst_cents, 182);
      // The invariant the table CHECKs.
      assertEquals(
        (row.ex_gst_cents as number) + (row.gst_cents as number),
        row.commission_cents,
      );
    });
});

Deno.test("the totals invariant holds across a wide range of fees", async () => {
  for (const fee of [200, 201, 205, 750, 1500, 12_345, 99_999]) {
    const c = stubClient();
    await recordInstantPayoutFee(c, { tradieProfileId: "t1", payoutId: `po_${fee}`, feeCents: fee });
    const row = c.inserted[0];
    assertEquals((row.ex_gst_cents as number) + (row.gst_cents as number), fee);
  }
});

Deno.test("marks the row as an instant payout, anchored on the payout id", async () => {
  const c = stubClient();
  await recordInstantPayoutFee(c, {
    tradieProfileId: "t1",
    payoutId: "po_abc",
    feeCents: 200,
    paymentId: "pay_1",
    jobId: "job_1",
    feeRateBps: 150,
  });
  const row = c.inserted[0];
  assertEquals(row.kind, "instant_payout");
  assertEquals(row.payout_id, "po_abc");
  assertEquals(row.payment_id, "pay_1");
  assertEquals(row.job_id, "job_1");
  // Never carries materials processing — that's a commission-row concern.
  assertEquals(row.materials_processing_cents, 0);
});

Deno.test("the balance-anchored button path records with no payment", async () => {
  const c = stubClient();
  await recordInstantPayoutFee(c, { tradieProfileId: "t1", payoutId: "po_x", feeCents: 200 });
  const row = c.inserted[0];
  assertEquals(row.payment_id, null);
  assertEquals(row.job_id, null);
  assertEquals(row.payout_id, "po_x");
});

Deno.test("records nothing when there is nothing billable", async () => {
  for (const input of [
    { tradieProfileId: null, payoutId: "po_1", feeCents: 200 },
    { tradieProfileId: "t1", payoutId: "", feeCents: 200 },
    { tradieProfileId: "t1", payoutId: "po_1", feeCents: 0 },
    { tradieProfileId: "t1", payoutId: "po_1", feeCents: -5 },
  ]) {
    const c = stubClient();
    await recordInstantPayoutFee(c, input);
    assertEquals(c.inserted.length, 0);
  }
});

Deno.test("never throws — the payout has already happened", async () => {
  // A duplicate (23505) is the idempotent path; anything else is logged, not thrown.
  await recordInstantPayoutFee(stubClient({ error: { code: "23505" } }), {
    tradieProfileId: "t1", payoutId: "po_1", feeCents: 200,
  });
  await recordInstantPayoutFee(stubClient({ error: { code: "42501" } }), {
    tradieProfileId: "t1", payoutId: "po_1", feeCents: 200,
  });
  // A client that blows up entirely must still not propagate.
  await recordInstantPayoutFee(
    { from() { throw new Error("connection reset"); } },
    { tradieProfileId: "t1", payoutId: "po_1", feeCents: 200 },
  );
});

// ── recordFeeRefund: a failed lookup must be LOUD ────────────────────────────
// .maybeSingle() errors when more than one row matches, and this table now
// allows a commission AND an instant_payout row per payment. A copy of
// feeContext deployed without the kind filter fails exactly there — silently,
// on every refund of an instantly-released job, leaving commission billed.

function refundStub(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select() { return builder; },
    eq() { return builder; },
    maybeSingle() { return Promise.resolve(result); },
    delete() { return builder; },
    is() { return Promise.resolve({ error: null }); },
    insert() { return Promise.resolve({ error: null }); },
  };
  return { from() { return builder; } };
}

/** Captures console.error without swallowing real failures. */
async function withCapturedErrors(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try { await fn(); } finally { console.error = original; }
  return lines;
}

Deno.test("a failed charge lookup is logged, not silently swallowed", async () => {
  const logged = await withCapturedErrors(() =>
    recordFeeRefund(refundStub({ error: { code: "PGRST116", message: "multiple rows returned" } }), "pay_1")
  );
  assertEquals(logged.length, 1);
  assertEquals(logged[0].includes("pay_1"), true);
  assertEquals(logged[0].includes("COULD NOT LOAD THE CHARGE"), true);
});

Deno.test("no charge at all stays quiet — nothing was ever billed", async () => {
  const logged = await withCapturedErrors(() =>
    recordFeeRefund(refundStub({ data: null }), "pay_2")
  );
  assertEquals(logged.length, 0);
});
