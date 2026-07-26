// Deno tests for the containment guarantees of dispute-evidence-summary.
//
//   deno test --allow-read supabase/functions/dispute-evidence-summary/index.test.ts
//
// The feature spec has one hard constraint: NO AI-EXECUTED FUND MOVEMENT.
// "The function doesn't touch money" is easy to say in a review and easy to
// break six months later when someone adds a convenient import. These tests
// make it a property of the file: they read the real source and fail if a
// payment path appears in it.
//
// A source scan is a blunt instrument, and deliberately so — it is the only
// check that still works when the reviewer has forgotten why the rule exists.

import { assert, assertEquals } from "jsr:@std/assert@1";

const SOURCE = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

/** Source with comments stripped, so prose about Stripe doesn't fail a test. */
const CODE = SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

Deno.test("holds no Stripe client and no Stripe import", () => {
  assert(!/from\s+["'][^"']*stripe/i.test(CODE), "imports a Stripe module");
  assert(!/STRIPE_[A-Z_]*KEY/.test(CODE), "reads a Stripe API key");
  assert(!/api\.stripe\.com/i.test(CODE), "calls the Stripe API directly");
});

Deno.test("writes to exactly one table, and it is not a money table", () => {
  // Every table selected by a `.from(...)` that is followed by a write verb.
  // (Written without a literal table name in quotes — `npm run check:columns`
  // scans comments too, and would read the example as a real query.)
  const writes = new Set<string>();
  const re = /\.from\(\s*["']([a-z_]+)["']\s*\)([\s\S]{0,200})/g;
  for (const m of CODE.matchAll(re)) {
    const [, table, following] = m;
    if (/\.(insert|update|upsert|delete)\s*\(/.test(following)) writes.add(table);
  }

  assertEquals(
    [...writes].sort(),
    ["dispute_evidence_summaries"],
    "the only table this function may write is dispute_evidence_summaries",
  );
});

Deno.test("never writes the tables that decide or move money", () => {
  // Reading `jobs`/`quotes` is the whole point — it's writing them that would
  // let a model's opinion become an action. Checked explicitly rather than
  // relying on the set above, so the intent survives a refactor of that test.
  for (const table of ["payments", "disputes", "jobs", "job_milestones", "platform_fee_charges"]) {
    const re = new RegExp(`\\.from\\(\\s*["']${table}["']\\s*\\)[\\s\\S]{0,200}`, "g");
    for (const m of CODE.matchAll(re)) {
      assert(
        !/\.(insert|update|upsert|delete)\s*\(/.test(m[0]),
        `writes to \`${table}\` — this function must not change payment or dispute state`,
      );
    }
  }
});

Deno.test("the only outbound host is the Anthropic API", () => {
  const hosts = [...CODE.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
  assertEquals(hosts, ["https://api.anthropic.com/v1/messages"]);
});

Deno.test("provenance columns are all present on the insert payload", () => {
  // The migration makes these NOT NULL, so a missing one fails at runtime on a
  // real dispute rather than in CI. Cheaper to catch here.
  const payload = CODE.slice(CODE.indexOf('Insert<"dispute_evidence_summaries">'));
  for (const field of ["dispute_id", "summary", "model", "prompt_version", "raw_input", "raw_output"]) {
    assert(new RegExp(`\\b${field}:`).test(payload), `insert payload is missing \`${field}\``);
  }
});

Deno.test("records the model that answered, not the model we asked for", () => {
  // A server-side fallback means another model produced the message. Storing
  // the requested id would make the audit trail quietly wrong.
  assert(/data\.model/.test(CODE), "does not read the responding model from the API response");
});
