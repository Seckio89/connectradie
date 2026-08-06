#!/usr/bin/env node
/**
 * check:sinks — has a new injection sink appeared?
 *
 * Restores the "unsafe eval / innerHTML / SQL interpolation" half of step 4 of
 * the retired security scanner (Scheduled/security-scanner/SKILL.md), which was
 * dropped rather than merged when that skill was folded into the nightly audit
 * on 2026-07-01.
 *
 * A RATCHET, not a gate, and that is the whole design. Every sink in this repo
 * today is legitimate: the print/PDF/email HTML-string generators that CLAUDE.md
 * explicitly exempts (InvoiceViewModal, LicenseCertificate, JobTracking,
 * Payouts) build markup destined for a print window or an email body, where
 * React cannot help and CSS variables do not resolve. There are zero
 * `dangerouslySetInnerHTML` and zero `eval(` calls.
 *
 * So a checker that simply failed on any match would fail on day one for
 * entirely correct code, and would be silenced within a week. Instead the
 * current set is baselined and only a NEW sink fails — the same convention as
 * .nav-baseline.json and .contrast-baseline.json.
 *
 *   npm run check:sinks             # fail on any sink not in the baseline
 *   npm run check:sinks:baseline    # re-record after a deliberate addition
 *
 * Keyed on file + matched snippet, NOT on line number: keying a baseline on
 * line numbers means every unrelated edit above a sink re-reports it, which is
 * the failure mode #195 fixed for the navigability baseline.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASELINE = ".sinks-baseline.json";
const UPDATE = process.argv.includes("--update");

const SINKS = [
  {
    name: "dangerouslySetInnerHTML",
    re: /dangerouslySetInnerHTML/,
    why: "React's explicit XSS escape hatch — the content must be sanitised or provably ours",
  },
  {
    name: "innerHTML-assignment",
    // Assignment only. Reading .innerHTML (as the print helpers do to capture a
    // rendered node) injects nothing.
    re: /\.innerHTML\s*(?:\+)?=/,
    why: "writes raw markup into the DOM",
  },
  {
    name: "eval",
    re: /(?:^|[^A-Za-z0-9_$.])eval\s*\(/,
    why: "executes a string as code",
  },
  {
    name: "new-Function",
    re: /new\s+Function\s*\(/,
    why: "executes a string as code",
  },
  {
    name: "sql-template-interpolation",
    // Must be an EXECUTION sink, not merely a SQL-shaped word near a template.
    //
    // The first version of this matched any of select/insert/update/delete
    // followed by a template literal with a substitution, and every single hit
    // was a false positive in a different language: JSX `<select value={…}>`
    // elements in NewQuoteModal and QuoteEstimator, and PostgREST builder calls
    // — `.select(`*, ${joinSelect}`)` in ongoingServices, `.update({ msg: `…` })`
    // in auto-release-recurring-payouts. Those are supabase-js, which
    // parameterises; interpolating a column list into .select() is not
    // injection.
    //
    // App code never issues raw SQL here — supabase-js is the whole data path,
    // and hand-written SQL lives in reviewed migration files. So this targets
    // the things that actually execute a string: execute_sql and sql`` tagged
    // templates. It matches nothing today, which is the correct answer rather
    // than a baseline full of JSX.
    re: /(?:execute_?sql\s*\(|(?:^|[^A-Za-z0-9_$])sql\s*`)[^`]*\$\{/i,
    why: "raw SQL assembled by interpolation — use parameters",
  },
];

const SCAN_DIRS = ["src/", "supabase/functions/", "api/", "scripts/"];
const SKIP = [
  /^scripts\/check-sinks\.mjs$/, // this file names the patterns
  /\.test\.(ts|tsx)$/, // tests fabricate DOM deliberately
  /__tests__\//,
];

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => SCAN_DIRS.some((d) => f.startsWith(d)))
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
  .filter((f) => !SKIP.some((re) => re.test(f)));

const found = [];
for (const f of files) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  content.split("\n").forEach((line, i) => {
    // A commented line is documentation, not a sink. The print helpers carry
    // long explanatory comments that name innerHTML.
    const code = line.trim();
    if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) {
      return;
    }
    for (const s of SINKS) {
      if (s.re.test(line)) {
        found.push({ file: f, sink: s.name, why: s.why, line: i + 1 });
      }
    }
  });
}

// file + sink name, deliberately not the line number.
const key = (f) => `${f.file}::${f.sink}`;
const currentKeys = found.map(key);

if (UPDATE) {
  const uniq = [...new Set(currentKeys)].sort();
  writeFileSync(BASELINE, `${JSON.stringify({ sinks: uniq }, null, 2)}\n`);
  console.log(`baseline updated: ${uniq.length} known sink site(s) recorded.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(
    `${BASELINE} missing. Run \`npm run check:sinks:baseline\` to record the current set.`,
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, "utf8")).sinks);
const seen = new Set();
const novel = found.filter((f) => {
  const k = key(f);
  if (baseline.has(k) || seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (!novel.length) {
  console.log(
    `no new injection sinks (${found.length} known site(s) across ${files.length} files).`,
  );
  process.exit(0);
}

console.error(`${novel.length} new injection sink(s):\n`);
for (const n of novel) {
  console.error(`  ${n.file}:${n.line}  [${n.sink}]\n      ${n.why}`);
}
console.error(`
If this is deliberate and the input is provably safe — the print/PDF/email
generators are the established case, where the markup is ours and the
destination is a print window, not the app DOM — record it with
\`npm run check:sinks:baseline\` and say why in the code. If the content can
carry anything a user typed, sanitise it instead.`);
process.exit(1);
