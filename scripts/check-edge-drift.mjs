#!/usr/bin/env node
/**
 * check:edge-drift — is production running the code in this repo?
 *
 * `check:drift` answers that for the DATABASE. This answers it for EDGE
 * FUNCTIONS, which drifted from master twice on 2026-07-29 alone:
 *
 *   1. The `job_funding` PaymentIntent fallback lived only on an unmerged
 *      branch. Deploying stripe-webhook from master would have silently
 *      stripped 45 lines production depended on.
 *   2. A dispute fix was deployed straight from a branch and carried a
 *      money-loss regression — auto-release paid out a lost chargeback. It ran
 *      in production for ~2 hours before the dispute E2E caught it.
 *
 * Both were found by hand, by downloading the deployed bundle and diffing it.
 * This is that check, automated.
 *
 *   npm run check:edge-drift              # money-path functions vs origin/master
 *   npm run check:edge-drift -- --all     # every function in supabase/functions
 *   npm run check:edge-drift -- --worktree            # compare against local files
 *   npm run check:edge-drift -- --git-ref HEAD        # compare against another rev
 *   npm run check:edge-drift -- release-escrow        # just these slugs
 *
 * Needs the Supabase CLI authenticated (`npx supabase login`, or
 * SUPABASE_ACCESS_TOKEN). Downloads are written to a temp dir and removed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const PROD_REF = process.env.SUPABASE_PROJECT_REF || "uoqygmizupdpanplpvor";

// Default set: anything that moves money or gates access. These are the ones
// where "prod is running something else" is a money or security problem rather
// than a cosmetic one. --all covers the rest.
// DERIVED, not hand-listed. A hand-maintained list goes stale silently: the
// original one omitted reconcile-payments, so the default run reported all-clear
// while production was still on a floating `npm:stripe@14` import.
//
// Anything importing a money-shaped shared helper is money path by definition,
// and that set updates itself as imports change. MONEY_EXTRAS covers the few
// that move money without importing one of those helpers.
const MONEY_HELPERS = ["feeContext", "pricing", "escrowReserve", "instantPayout"];
const MONEY_EXTRAS = ["issue-fee-invoices", "respond-to-dispute", "reconcile-payments"];

function moneyPathSlugs() {
  const dir = join(repoRoot, "supabase", "functions");
  const found = new Set(MONEY_EXTRAS);
  for (const slug of readdirSync(dir)) {
    if (slug.startsWith("_")) continue;
    const entry = join(dir, slug, "index.ts");
    if (!existsSync(entry)) continue;
    const src = readFileSync(entry, "utf8");
    if (MONEY_HELPERS.some((h) => src.includes(`_shared/${h}`))) found.add(slug);
  }
  return [...found].sort();
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const slugArgs = argv.filter((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--git-ref");

const useWorktree = has("--worktree");
const gitRef = valueOf("--git-ref") || "origin/master";
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function allSlugs() {
  const dir = join(repoRoot, "supabase", "functions");
  return readdirSync(dir)
    .filter((n) => !n.startsWith("_") && statSync(join(dir, n)).isDirectory())
    .sort();
}

const slugs = slugArgs.length ? slugArgs : has("--all") ? allSlugs() : moneyPathSlugs();

// Slugs reach a shell on Windows (see the download call below), so they must be
// exactly what a Supabase function slug can be — nothing else.
for (const s of slugs) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s)) {
    console.error(`refusing to run: '${s}' is not a valid function slug`);
    process.exit(2);
  }
}

/** Repo-side contents of a path, from the chosen git rev or the working tree. */
function repoFile(relPath) {
  const posix = relPath.split(sep).join("/");
  if (useWorktree) {
    const p = join(repoRoot, relPath);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  }
  try {
    return execFileSync("git", ["show", `${gitRef}:${posix}`], { encoding: "utf8", cwd: repoRoot });
  } catch {
    return null; // not present at that rev
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Line endings and a trailing newline are not drift — the deploy pipeline is
// allowed to normalise those. Anything else is.
const normalise = (s) => s.replace(/\r\n/g, "\n").replace(/\s+$/, "");

console.log(`\nedge drift — production (${PROD_REF}) vs ${useWorktree ? "working tree" : gitRef}`);
console.log(`checking ${slugs.length} function(s)${slugArgs.length || has("--all") ? "" : " (money path; --all for every one)"}\n`);

const drifted = [];
const missing = [];
let checked = 0;

for (const slug of slugs) {
  const tmp = mkdtempSync(join(tmpdir(), "edge-drift-"));
  try {
    try {
      // Windows needs a shell to run npx (a .cmd shim); Node refuses to spawn it
      // directly with EINVAL. A shell concatenates rather than escapes args, so
      // the slug is validated above before it can reach one.
      execFileSync("npx", ["supabase", "functions", "download", slug, "--project-ref", PROD_REF], {
        cwd: tmp, stdio: "pipe", shell: process.platform === "win32",
      });
    } catch (e) {
      const msg = String(e.stderr || e.message || "").trim().split("\n").pop();
      console.log(`  ⚠️  ${slug} — could not download: ${msg}`);
      missing.push(slug);
      continue;
    }

    const base = join(tmp, "supabase", "functions");
    if (!existsSync(base)) { console.log(`  ⚠️  ${slug} — nothing downloaded`); missing.push(slug); continue; }

    const diffs = [];
    for (const file of walk(base)) {
      const rel = join("supabase", "functions", relative(base, file));
      const deployed = readFileSync(file, "utf8");
      const repo = repoFile(rel);
      if (repo === null) diffs.push(`${rel.split(sep).join("/")} — deployed but ABSENT from the repo`);
      else if (normalise(deployed) !== normalise(repo)) diffs.push(`${rel.split(sep).join("/")} — differs`);
    }

    checked++;
    if (diffs.length) {
      drifted.push({ slug, diffs });
      console.log(`  ❌ ${slug}`);
      for (const d of diffs) console.log(`       ${d}`);
    } else {
      console.log(`  ✅ ${slug}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("");

// "Could not check" is NOT "matches". Reporting green on zero verified functions
// is how a guard becomes decoration — exit non-zero so a broken checker fails
// loudly instead of certifying nothing.
if (missing.length) {
  console.log(`❌ ${missing.length} function(s) could not be checked: ${missing.join(", ")}`);
  console.log("\nThis is a FAILURE, not a pass — nothing was verified for them.");
  console.log("Usually the Supabase CLI is not authenticated: npx supabase login,");
  console.log("or export SUPABASE_ACCESS_TOKEN=sbp_...\n");
  process.exit(1);
}

if (drifted.length) {
  console.log(`❌ ${drifted.length} of ${checked} deployed function(s) do not match ${useWorktree ? "the working tree" : gitRef}.\n`);
  console.log("Production is running code that is not in this repo, or the repo has moved on");
  console.log("without a deploy. Either way, deploying from here changes prod in ways nobody");
  console.log("reviewed. Land the deployed code on the branch, or redeploy from it.\n");
  console.log("  npx supabase functions download <slug> --project-ref " + PROD_REF);
  console.log("  # then diff it against supabase/functions/<slug>/\n");
  process.exit(1);
}

console.log(`✅ all ${checked} checked function(s) match ${useWorktree ? "the working tree" : gitRef}.\n`);
