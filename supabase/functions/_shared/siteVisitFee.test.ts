// Deno tests for the paid site-visit fee floor.
//
//   deno test supabase/functions/_shared/siteVisitFee.test.ts
//
// The case that prompted this: a client paid a $20 call-out fee, the tradie
// then submitted a $1 final quote, and acceptance tried to charge $0.

// node:assert rather than jsr:@std/assert so this runs with no network access.
import { strictEqual as assertEquals } from "node:assert/strict";
import { paidVisitFeeCents } from "./siteVisitFee.ts";

Deno.test("a paid fee is returned in full", () => {
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: 2000 }), 2000);
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: 10000 }), 10000);
});

Deno.test("string cents (metadata round-trips) still count", () => {
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: "2000" as unknown as number }), 2000);
});

Deno.test("only status 'paid' counts — unbooked, free and credited fees do not", () => {
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: null, call_out_fee_cents: 2000 }), 0);
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: undefined, call_out_fee_cents: 2000 }), 0);
  // Credited = acceptance already consumed the fee; it must not block a re-quote.
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "credited", call_out_fee_cents: 2000 }), 0);
});

Deno.test("a free visit ($0 fee) never imposes a floor", () => {
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: 0 }), 0);
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: null }), 0);
});

Deno.test("a corrupt fee fails open to 0, not NaN", () => {
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: "garbage" as unknown as number }), 0);
  assertEquals(paidVisitFeeCents({ site_visit_fee_status: "paid", call_out_fee_cents: -500 }), 0);
});

Deno.test("a missing quote reads as nothing paid", () => {
  assertEquals(paidVisitFeeCents(null), 0);
  assertEquals(paidVisitFeeCents(undefined), 0);
});
