// Deno tests for the escrow reserve.
//
//   deno test supabase/functions/_shared/escrowReserve.test.ts
//
// This is the number that stops a tradie instant-paying-out a client's escrowed
// funds, so the cases that matter most are the ones it used to MISS.

import { strictEqual as assertEquals } from "node:assert/strict";
import { creditedToBalanceCents, fetchEscrowReserveCents, sumEscrowReserveCents } from "./escrowReserve.ts";

Deno.test("reserves off-app funded jobs, which stamp routing and no tradie_id", () => {
  // public-quote / invoice-contact rows. The old `flow`-only filter skipped
  // these entirely, leaving the client's escrow payable.
  const rows = [{ id: "a", amount: 10_000, metadata: { routing: "destination", off_app: true, platform_fee: 510, gst: "0" } }];
  assertEquals(sumEscrowReserveCents(rows), 9_490);
});

Deno.test("reserves the credited amount, not the gross base", () => {
  // $70 job, $5.10 platform fee, no GST → Stripe credited $64.90.
  const rows = [{ id: "a", amount: 7_000, metadata: { flow: "destination", platform_fee: 510, gst: "0" } }];
  assertEquals(sumEscrowReserveCents(rows), 6_490);
});

Deno.test("includes GST, which the client paid on top of the base", () => {
  const rows = [{ id: "a", amount: 10_000, metadata: { flow: "destination", platform_fee: 500, gst: "1000" } }];
  assertEquals(sumEscrowReserveCents(rows), 10_500);
});

Deno.test("drops released rows", () => {
  const rows = [
    { id: "a", amount: 7_000, metadata: { flow: "destination", platform_fee: 0, gst: "0", payout_id: "po_1" } },
    { id: "b", amount: 5_000, metadata: { flow: "destination", platform_fee: 0, gst: "0", transfer_id: "tr_1" } },
    { id: "c", amount: 3_000, metadata: { flow: "destination", platform_fee: 0, gst: "0" } },
  ];
  assertEquals(sumEscrowReserveCents(rows), 3_000);
});

Deno.test("de-duplicates rows returned by more than one anchor query", () => {
  const row = { id: "a", amount: 7_000, metadata: { flow: "destination", tradie_id: "t1", platform_fee: 0, gst: "0" } };
  assertEquals(sumEscrowReserveCents([row, { ...row }]), 7_000);
});

Deno.test("ignores payments that never routed to the tradie's balance", () => {
  const rows = [{ id: "a", amount: 7_000, metadata: { deposit_type: "escrow" } }];
  assertEquals(sumEscrowReserveCents(rows), 0);
});

Deno.test("falls back to gross when fee metadata is missing or unusable", () => {
  assertEquals(creditedToBalanceCents({ amount: 7_000, metadata: { flow: "destination" } }), 7_000);
  // Legacy rows stored the fee as a string; release-escrow's typeof guard reads
  // those as 0, so we must not quietly treat one as a real deduction here.
  assertEquals(creditedToBalanceCents({ amount: 7_000, metadata: { platform_fee: "510", gst: "0" } }), 7_000);
  assertEquals(creditedToBalanceCents({ amount: 7_000, metadata: { platform_fee: 510, gst: "abc" } }), 7_000);
});

Deno.test("never returns a negative credit", () => {
  assertEquals(creditedToBalanceCents({ amount: 100, metadata: { platform_fee: 500, gst: "0" } }), 0);
});

// ── fetchEscrowReserveCents ──────────────────────────────────────────────────
// The union of the two anchor queries, and the fail-closed contract. A query
// error read as "no escrow held" is how client funds get paid out.

/** Minimal thenable stand-in for the supabase builder. Each `.from()` call
 *  shifts the next queued result off the list. */
function stubClient(results: Array<{ data?: unknown[]; error?: unknown }>) {
  const calls: string[] = [];
  return {
    calls,
    from() {
      const result = results.shift() ?? { data: [] };
      const builder: Record<string, unknown> = {
        select(cols: string) { calls.push(cols); return builder; },
        eq() { return builder; },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve(result).then(resolve); },
      };
      return builder;
    },
  };
}

Deno.test("unions both anchors and de-duplicates the overlap", async () => {
  // The same payment matched by BOTH queries must be counted once.
  const shared = { id: "a", amount: 7_000, metadata: { flow: "destination", tradie_id: "t1", platform_fee: 0, gst: "0" } };
  const client = stubClient([
    { data: [shared] },
    { data: [{ ...shared }] },
  ]);
  assertEquals(await fetchEscrowReserveCents(client, "t1"), 7_000);
});

Deno.test("catches escrow only the job anchor can see", async () => {
  // public-quote / invoice-contact rows: routing, off_app, no tradie_id.
  const client = stubClient([
    { data: [{ id: "a", amount: 10_000, metadata: { routing: "destination", off_app: true, platform_fee: 510, gst: "0" } }] },
    { data: [] },
  ]);
  assertEquals(await fetchEscrowReserveCents(client, "t1"), 9_490);
});

Deno.test("throws when either query fails — never reports zero", async () => {
  for (const results of [
    [{ error: { message: "boom" } }, { data: [] }],
    [{ data: [] }, { error: { message: "boom" } }],
  ]) {
    let threw = false;
    try {
      await fetchEscrowReserveCents(stubClient(results), "t1");
    } catch {
      threw = true;
    }
    assertEquals(threw, true);
  }
});

Deno.test("queries the job anchor and the metadata anchor", async () => {
  const client = stubClient([{ data: [] }, { data: [] }]);
  await fetchEscrowReserveCents(client, "t1");
  assertEquals(client.calls.length, 2);
  assertEquals(client.calls[0].includes("jobs!inner(tradie_id)"), true);
});
