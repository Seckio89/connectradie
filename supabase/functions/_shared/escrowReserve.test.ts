// Deno tests for the escrow reserve.
//
//   deno test supabase/functions/_shared/escrowReserve.test.ts
//
// This is the number that stops a tradie instant-paying-out a client's escrowed
// funds, so the cases that matter most are the ones it used to MISS.

import { strictEqual as assertEquals } from "node:assert/strict";
import { creditedToBalanceCents, sumEscrowReserveCents } from "./escrowReserve.ts";

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
