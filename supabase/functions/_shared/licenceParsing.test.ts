// Deno tests for the licence OCR parsers, pre-checks and register URLs.
//
//   deno test supabase/functions/_shared/licenceParsing.test.ts

import { ok as assert, deepStrictEqual as assertEquals } from "node:assert/strict";
const assertFalse = (v: unknown) => assert(!v);
import {
  buildRegisterUrl,
  holderNameMatches,
  licenceClassMatchesTrade,
  parseAuDate,
  parseLicenceText,
  runPrechecks,
  templateHasDeepLink,
} from "./licenceParsing.ts";

// Fixture OCR strings — what a VLM transcription of a card looks like, with the
// line noise OCR actually produces (mixed case, stray colons, wrapped lines).

const NSW_CARD = `NSW Fair Trading
Contractor Licence
Licence No: 123456C
Name: JOHN ANDREW SMITH
Categories: Plumber, Drainer, Gasfitter
Expires: 14/03/2027
Home Building Act 1989`;

const QLD_CARD = `Queensland Building and Construction Commission
LICENCE
Licence No. 1234567
Licensee: SMITH, JOHN
Licence Class: Plumbing and Drainage
Renewal Due: 30 Jun 2027`;

const VIC_CARD = `Victorian Building Authority
Registration Number DB-U 12345
Practitioner Name: Jane Lee
Category: Domestic Builder (Unlimited)
Expiry Date 2028-01-31`;

Deno.test("parseAuDate: the formats seen on cards", () => {
  assertEquals(parseAuDate("31/12/2027"), "2027-12-31");
  assertEquals(parseAuDate("31-12-27"), "2027-12-31");
  assertEquals(parseAuDate("31.12.2027"), "2027-12-31");
  assertEquals(parseAuDate("31 Dec 2027"), "2027-12-31");
  assertEquals(parseAuDate("31 DEC 27"), "2027-12-31");
  assertEquals(parseAuDate("2027-12-31"), "2027-12-31");
  assertEquals(parseAuDate("Dec 31, 2027"), "2027-12-31");
  assertEquals(parseAuDate("31/02/2027"), null); // not a real date
  assertEquals(parseAuDate("soon"), null);
  assertEquals(parseAuDate(null), null);
});

Deno.test("NSW parser: number, holder, classes, expiry", () => {
  const p = parseLicenceText("NSW", NSW_CARD);
  assertEquals(p.parser, "NSW");
  assertEquals(p.licence_number, "123456C");
  assertEquals(p.licence_holder_name, "John Andrew Smith");
  assertEquals(p.licence_class, "Plumber, Drainer, Gasfitter");
  assertEquals(p.expiry_date, "2027-03-14");
  assertEquals(p.fields_found_ratio, 1);
});

Deno.test("QLD parser: QBCC number, licensee, class, renewal date", () => {
  const p = parseLicenceText("QLD", QLD_CARD);
  assertEquals(p.parser, "QLD");
  assertEquals(p.licence_number, "1234567");
  assertEquals(p.licence_holder_name, "Smith, John");
  assertEquals(p.licence_class, "Plumbing and Drainage");
  assertEquals(p.expiry_date, "2027-06-30");
});

Deno.test("other states fall back to the generic parser and still find what they can", () => {
  const p = parseLicenceText("VIC", VIC_CARD);
  assertEquals(p.parser, "generic");
  assertEquals(p.licence_holder_name, "Jane Lee");
  assertEquals(p.licence_class, "Domestic Builder (Unlimited)");
  assertEquals(p.expiry_date, "2028-01-31");
  assert(p.fields_found_ratio >= 0.75);
});

Deno.test("empty / garbage OCR text yields empty fields, not an error", () => {
  const p = parseLicenceText("NSW", "");
  assertEquals(p.licence_number, null);
  assertEquals(p.expiry_date, null);
  assertEquals(p.fields_found_ratio, 0);
  const q = parseLicenceText("QLD", "~~~ blurry ~~~");
  assertEquals(q.fields_found_ratio, 0);
});

Deno.test("holderNameMatches: card order, middle names, ABR entity format", () => {
  assert(holderNameMatches("SMITH JOHN", ["John Smith"]));
  assert(holderNameMatches("John Andrew Smith", ["John Smith"]));
  assert(holderNameMatches("John Smith", ["SMITH, JOHN ANDREW"]));
  assert(holderNameMatches("Jon Smith", ["John Smith"]));         // OCR slip, Dice >= 0.8
  assertFalse(holderNameMatches("Jane Lee", ["John Smith"]));
  assertFalse(holderNameMatches("", ["John Smith"]));
});

Deno.test("licenceClassMatchesTrade: keyword map, unknown trade is unchecked", () => {
  assertEquals(licenceClassMatchesTrade("Plumber, Drainer, Gasfitter", "plumber"), true);
  assertEquals(licenceClassMatchesTrade("Electrician", "plumber"), false);
  assertEquals(licenceClassMatchesTrade("Electrical Contractor", "electrician"), true);
  assertEquals(licenceClassMatchesTrade("Anything", "handyman"), null);
});

Deno.test("runPrechecks: all three, with injected today", () => {
  const r = runPrechecks({
    expiry_date: "2027-03-14",
    licence_holder_name: "John Smith",
    candidate_names: ["John Smith", "Smith Plumbing Pty Ltd"],
    licence_class: "Plumber, Drainer",
    trade_category: "plumber",
    today: "2026-09-04",
  });
  assertEquals(r, { precheck_expiry_ok: true, precheck_name_match: true, precheck_class_match: true });
});

Deno.test("runPrechecks: expired, wrong name, wrong class", () => {
  const r = runPrechecks({
    expiry_date: "2026-01-01",
    licence_holder_name: "Jane Lee",
    candidate_names: ["John Smith"],
    licence_class: "Electrician",
    trade_category: "plumber",
    today: "2026-09-04",
  });
  assertEquals(r, { precheck_expiry_ok: false, precheck_name_match: false, precheck_class_match: false });
});

Deno.test("runPrechecks: missing fields are null (unchecked), never false", () => {
  const r = runPrechecks({
    expiry_date: null,
    licence_holder_name: null,
    candidate_names: ["John Smith"],
    licence_class: null,
    trade_category: "plumber",
    today: "2026-09-04",
  });
  assertEquals(r, { precheck_expiry_ok: null, precheck_name_match: null, precheck_class_match: null });
});

Deno.test("buildRegisterUrl: substitutes and URL-encodes; landing pages pass through", () => {
  assertEquals(
    buildRegisterUrl("https://example.gov.au/check?licenceNumber={{licence_number}}", "1234 56C"),
    "https://example.gov.au/check?licenceNumber=1234%2056C",
  );
  assertEquals(buildRegisterUrl("https://example.gov.au/search", "123456C"), "https://example.gov.au/search");
  assertEquals(buildRegisterUrl("https://x/{{ licence_number }}", null), "https://x/");
  assert(templateHasDeepLink("https://x/{{licence_number}}"));
  assertFalse(templateHasDeepLink("https://x/search"));
});
