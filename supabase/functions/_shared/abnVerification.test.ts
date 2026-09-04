// Deno tests for the ABN checksum and business-name matcher.
//
//   deno test supabase/functions/_shared/abnVerification.test.ts

import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";
const assertFalse = (v: unknown) => assert(!v);
import {
  businessNameMatches,
  classifyAbnResult,
  formatAbn,
  isValidAbnChecksum,
  normaliseAbn,
  normaliseBusinessName,
} from "./abnVerification.ts";

// The ATO's own worked example (abr.business.gov.au/Help/AbnFormat).
const VALID = "51824753556";

Deno.test("checksum: accepts the ATO worked example", () => {
  assert(isValidAbnChecksum(VALID));
});

Deno.test("checksum: rejects a single transposed digit", () => {
  assertFalse(isValidAbnChecksum("51824753565"));
});

Deno.test("checksum: rejects wrong length and non-digits", () => {
  assertFalse(isValidAbnChecksum("5182475355"));
  assertFalse(isValidAbnChecksum("518247535561"));
  assertFalse(isValidAbnChecksum("5182475355A"));
  assertFalse(isValidAbnChecksum(""));
});

Deno.test("checksum: a formatted ABN must be normalised first", () => {
  assertFalse(isValidAbnChecksum("51 824 753 556"));
  assert(isValidAbnChecksum(normaliseAbn("51 824 753 556")));
  assert(isValidAbnChecksum(normaliseAbn("51-824-753-556")));
});

Deno.test("formatAbn: groups 2-3-3-3 and leaves partial input alone", () => {
  assertEquals(formatAbn("51824753556"), "51 824 753 556");
  assertEquals(formatAbn("5182"), "5182");
});

Deno.test("normaliseBusinessName: strips Pty Ltd variants and punctuation", () => {
  assertEquals(normaliseBusinessName("Smith's Plumbing Pty. Ltd."), "smith plumbing");
  assertEquals(normaliseBusinessName("SMITH PLUMBING P/L"), "smith plumbing");
  assertEquals(normaliseBusinessName("Smith Plumbing Proprietary Limited"), "smith plumbing");
  assertEquals(normaliseBusinessName("The Trustee for SMITH FAMILY TRUST"), "smith family trust");
});

Deno.test("name match: exact", () => {
  assert(businessNameMatches("Smith Plumbing", ["SMITH PLUMBING"]));
});

Deno.test("name match: Pty Ltd variants", () => {
  assert(businessNameMatches("Smith Plumbing Pty Ltd", ["Smith Plumbing Pty. Ltd."]));
  assert(businessNameMatches("Smith Plumbing", ["SMITH PLUMBING P/L"]));
  assert(businessNameMatches("Smith Plumbing P/L", ["Smith Plumbing Pty Limited"]));
});

Deno.test("name match: against any registered business name, not just the entity", () => {
  assert(businessNameMatches("Smith Plumbing", ["SMITH, JOHN", "Smith Plumbing", "Smith Gas Services"]));
});

Deno.test("name match: token subset in either direction, two tokens minimum", () => {
  assert(businessNameMatches("John Smith Plumbing", ["Smith Plumbing"]));
  // A single shared generic word is not a match.
  assertFalse(businessNameMatches("Plumbing", ["Smith Plumbing"]));
  assertFalse(businessNameMatches("Jones Plumbing", ["Smith Plumbing"]));
});

Deno.test("name match: no candidates, empty claim", () => {
  assertFalse(businessNameMatches("Smith Plumbing", []));
  assertFalse(businessNameMatches("", ["Smith Plumbing"]));
  assertFalse(businessNameMatches("Smith Plumbing", [null, undefined, ""]));
});

Deno.test("classify: Active + match = verified, Active alone = review, else failed", () => {
  assertEquals(classifyAbnResult("Active", true), "verified");
  assertEquals(classifyAbnResult("Active", false), "review");
  assertEquals(classifyAbnResult("Cancelled", true), "failed");
  assertEquals(classifyAbnResult("NotFound", false), "failed");
  assertEquals(classifyAbnResult(null, true), "failed");
});
