// Deno tests for funding-payment selection.
//
//   deno test supabase/functions/_shared/selectFundingPayment.test.ts
//
// The case that matters most is the one the old .maybeSingle() got wrong: a
// milestone job with more than one completed job_funding row, where approve and
// decline both 500'd and the client could not action the variation at all.

import { strictEqual as assertEquals } from "node:assert/strict";
import {
  selectFundingPaymentForTopUp,
  selectFundingPaymentForVariation,
} from "./selectFundingPayment.ts";

Deno.test("single escrow deposit — the only row wins", () => {
  const rows = [{ id: "escrow", metadata: { deposit_type: "escrow" } }];
  assertEquals(selectFundingPaymentForTopUp(rows)?.id, "escrow");
});

Deno.test("milestone job — picks the most recent stage, not a PGRST116", () => {
  // pay-milestone writes one job_funding row per milestone, ordered oldest
  // first by the caller. This used to be .maybeSingle() and blew up here.
  const rows = [
    { id: "m1", metadata: { milestone_id: "one" } },
    { id: "m2", metadata: { milestone_id: "two" } },
    { id: "m3", metadata: { milestone_id: "three" } },
  ];
  assertEquals(selectFundingPaymentForTopUp(rows)?.id, "m3");
});

Deno.test("escrow deposit outranks a later milestone row", () => {
  const rows = [
    { id: "escrow", metadata: { deposit_type: "escrow" } },
    { id: "m1", metadata: { milestone_id: "one" } },
  ];
  assertEquals(selectFundingPaymentForTopUp(rows)?.id, "escrow");
});

Deno.test("a live pending_increase wins over the escrow row", () => {
  // Otherwise the caller's in-flight check reads a row with no slot, concludes
  // nothing is pending, and stamps a second increase over the first.
  const rows = [
    { id: "escrow", metadata: { deposit_type: "escrow" } },
    { id: "m2", metadata: { pending_increase: { variation_id: "var-1" } } },
  ];
  assertEquals(selectFundingPaymentForTopUp(rows)?.id, "m2");
});

Deno.test("no rows — undefined, so the caller can send its own 400", () => {
  assertEquals(selectFundingPaymentForTopUp([]), undefined);
  assertEquals(selectFundingPaymentForTopUp(null), undefined);
  assertEquals(selectFundingPaymentForTopUp(undefined), undefined);
});

Deno.test("null metadata does not throw", () => {
  const rows = [{ id: "bare", metadata: null }];
  assertEquals(selectFundingPaymentForTopUp(rows)?.id, "bare");
});

Deno.test("decline finds the row holding THIS variation's slot", () => {
  const rows = [
    { id: "m1", metadata: { milestone_id: "one" } },
    { id: "m2", metadata: { pending_increase: { variation_id: "var-2" } } },
    { id: "m3", metadata: { pending_increase: { variation_id: "var-9" } } },
  ];
  assertEquals(selectFundingPaymentForVariation(rows, "var-2")?.id, "m2");
});

Deno.test("decline falls back to the first row when no slot is held", () => {
  // holdsOurSlot still requires a variation_id match, so this row is only ever
  // used to answer "there is nothing of ours to clear".
  const rows = [
    { id: "m1", metadata: {} },
    { id: "m2", metadata: { pending_increase: { variation_id: "someone-else" } } },
  ];
  assertEquals(selectFundingPaymentForVariation(rows, "var-2")?.id, "m1");
});
