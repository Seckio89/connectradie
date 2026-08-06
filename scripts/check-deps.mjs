#!/usr/bin/env node
/**
 * check:deps — has a NEW dependency vulnerability appeared?
 *
 * Restores step 3 of the retired security scanner
 * (Scheduled/security-scanner/SKILL.md), dropped rather than merged when that
 * skill was folded into the nightly audit on 2026-07-01.
 *
 * A RATCHET, because `npm audit` reports 4 findings today (1 high, 3 moderate,
 * 0 critical). A blocking check that fails on day one for pre-existing reasons
 * gets switched off within a week — which is the exact history this whole
 * effort is correcting. So the current set is baselined by advisory identity
 * and only something NEW fails.
 *
 * The one exception: `critical` ALWAYS fails, baseline or not. A critical
 * advisory in a Stripe/escrow codebase is not something to inherit quietly, and
 * making it un-baselineable is the difference between a ratchet and a rug.
 *
 *   npm run check:deps            # fail on new advisories, or on any critical
 *   npm run check:deps:baseline   # re-record after upgrading or accepting
 *
 * Keyed on `package + advisory URL`, not on the count: counts move when the
 * lockfile is regenerated, and a count-based gate cannot tell "one fixed, one
 * introduced" from "no change".
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASELINE = ".audit-baseline.json";
const UPDATE = process.argv.includes("--update");

let raw;
try {
  // npm audit exits non-zero when it finds anything, so the throw IS the
  // normal path — the payload still arrives on stdout.
  raw = execFileSync("npm", ["audit", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (err) {
  raw = err.stdout;
}

if (!raw) {
  console.error("npm audit produced no output — is the lockfile present?");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch {
  console.error("could not parse `npm audit --json` output.");
  process.exit(1);
}

// npm 7+ shape: { vulnerabilities: { <name>: { severity, via: [...] } } }
const findings = [];
for (const [name, v] of Object.entries(report.vulnerabilities || {})) {
  const vias = Array.isArray(v.via) ? v.via : [];
  const sources = vias.filter((x) => typeof x === "object" && x !== null);
  if (!sources.length) {
    // Purely transitive: no advisory of its own, it inherits one. Recording it
    // by name still distinguishes "new package affected" from "same as before".
    findings.push({
      key: `${name}::transitive`,
      package: name,
      severity: v.severity || "unknown",
      title: "vulnerable via a dependency",
      url: "",
    });
    continue;
  }
  for (const s of sources) {
    findings.push({
      key: `${name}::${s.url || s.title || s.source || "unknown"}`,
      package: name,
      severity: s.severity || v.severity || "unknown",
      title: s.title || "advisory",
      url: s.url || "",
    });
  }
}

if (UPDATE) {
  const uniq = [...new Set(findings.map((f) => f.key))].sort();
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ advisories: uniq }, null, 2)}\n`,
  );
  console.log(`baseline updated: ${uniq.length} known advisory/advisories recorded.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(
    `${BASELINE} missing. Run \`npm run check:deps:baseline\` to record the current set.`,
  );
  process.exit(1);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, "utf8")).advisories);

const seen = new Set();
const novel = [];
const criticals = [];
for (const f of findings) {
  if (f.severity === "critical") criticals.push(f);
  if (baseline.has(f.key) || seen.has(f.key)) continue;
  seen.add(f.key);
  novel.push(f);
}

// Criticals are reported even when baselined; dedupe against novel so a new
// critical is not printed twice.
const novelKeys = new Set(novel.map((f) => f.key));
const baselinedCriticals = criticals.filter((f) => !novelKeys.has(f.key));

if (!novel.length && !baselinedCriticals.length) {
  console.log(
    `no new dependency advisories (${findings.length} known, none critical).`,
  );
  process.exit(0);
}

if (novel.length) {
  console.error(`${novel.length} new dependency advisory/advisories:\n`);
  for (const f of novel) {
    console.error(
      `  ${f.package}  [${f.severity}]  ${f.title}${f.url ? `\n      ${f.url}` : ""}`,
    );
  }
}
if (baselinedCriticals.length) {
  console.error(
    `\n${baselinedCriticals.length} CRITICAL advisory/advisories — not baselineable:\n`,
  );
  for (const f of baselinedCriticals) {
    console.error(
      `  ${f.package}  ${f.title}${f.url ? `\n      ${f.url}` : ""}`,
    );
  }
}

console.error(`
Fix with \`npm audit fix\` where a compatible upgrade exists. If the advisory
does not apply here — a dev-only tool, or a code path this repo never reaches —
record it with \`npm run check:deps:baseline\` and say why in the commit.
Critical advisories cannot be baselined away: this codebase moves money.`);
process.exit(1);
