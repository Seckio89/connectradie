#!/usr/bin/env node
/**
 * check:secrets — is a live credential committed to this repository?
 *
 * This exists because one was, for about two months, in a PUBLIC repo, and
 * every scan in that window reported "no exposed secrets".
 *
 * A Google OAuth client secret sat in `.claude/settings.json`, inside a
 * `permissions.allow` entry that recorded a one-off `supabase secrets set`
 * invocation with the value inline. PR #227 removed it from HEAD. It is still
 * in history, and the repo is public, so the credential itself has to be
 * rotated — no checker un-exposes it.
 *
 * The old scanner (Scheduled/security-scanner/SKILL.md, since disabled) missed
 * it twice over, and both misses are designed against here:
 *
 *   1. Its patterns were sk_live_ / sk_test_ / eyJ / SUPABASE_SERVICE_ROLE.
 *      Nothing matched Google's `GOCSPX-` prefix. So the pattern list below is
 *      keyed on issuer prefixes, not on the word "secret".
 *   2. It scanned src/, supabase/, config files and .env*. It never looked in
 *      `.claude/`, which is exactly where the credential lived. So this scans
 *      EVERY tracked file and allowlists the exceptions, rather than picking
 *      directories to look in. A scanner that chooses where to look will always
 *      be wrong about somewhere.
 *
 * It was also prose handed to a nightly LLM. This is a script wired into CI, so
 * it fails on the pull request that introduces the credential rather than up to
 * 24h later.
 *
 *   npm run check:secrets              # tracked files at HEAD (what CI runs)
 *   npm run check:secrets:history      # every blob in every commit — slow
 *   node scripts/check-secrets.mjs --file <path>   # one file, for testing
 *
 * NEVER prints a matched value. Findings report file, line and pattern name
 * only: this output goes to CI logs, which for a public repo are public.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const HISTORY = args.includes("--history");
const fileArgIdx = args.indexOf("--file");
const SINGLE_FILE = fileArgIdx !== -1 ? args[fileArgIdx + 1] : null;

const git = (a) =>
  execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
// Each requires a value-shaped body, not just the prefix. Docs legitimately say
// 'starts with `sk_test_`' (STRIPE_SETUP.md does, six times) and .env.example
// carries bare prefixes as placeholders; matching the prefix alone would fire on
// all of it, and a checker that cries wolf gets switched off — which is the
// failure mode this whole file exists to correct.
const PATTERNS = [
  {
    name: "google-oauth-client-secret",
    // The one that actually leaked. Real values are GOCSPX- plus ~28 chars.
    re: /GOCSPX-[A-Za-z0-9_-]{20,}/g,
    why: "Google OAuth client secret",
  },
  {
    name: "stripe-secret-key",
    re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g,
    why: "Stripe secret/restricted key",
  },
  {
    name: "stripe-webhook-secret",
    re: /\bwhsec_[A-Za-z0-9]{20,}/g,
    why: "Stripe webhook signing secret",
  },
  {
    name: "google-api-key",
    re: /\bAIza[A-Za-z0-9_-]{35}\b/g,
    why: "Google API key",
  },
  {
    name: "private-key-block",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    why: "private key block",
  },
  {
    name: "generic-assignment",
    // A safety net for issuers with no recognisable prefix. Deliberately strict,
    // because the loose version of this rule is what makes secret scanners
    // useless: `_KEY` was in here at first and matched 17 things, every one of
    // them a localStorage or cache key NAME (STORAGE_KEY, CACHE_KEY,
    // TOKEN_CACHE_KEY, RECENT_SEARCHES_KEY). In a TypeScript codebase `_KEY`
    // overwhelmingly means "key into a map", not "secret", so it is gone.
    //
    // The identifier must END at the keyword — `TOKEN_CACHE_KEY = 'foo'` is not
    // a token assignment, `API_TOKEN = '…'` is — and the VALUE must survive
    // looksLikeCredential() below.
    re: /\b[A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_?TOKEN|AUTH_?TOKEN|ACCESS_?TOKEN|API_?KEY)\s*[=:]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/g,
    why: "credential-shaped assignment",
    capture: 1,
  },
];

// A JWT is handled separately: the anon key is public BY DESIGN and ships in the
// browser bundle, so firing on it would be a permanent false positive. Only a
// token whose payload declares service_role is a finding.
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------
// Seeded from the sweep run when this was written, so it starts green on a repo
// that is genuinely clean at HEAD. Every entry is a deliberate judgement, not a
// convenience — add to it only with the reason written down.
const ALLOW_PATHS = [
  // Placeholder values, by definition.
  /^\.env\.example$/,
  /^\.env\.e2e\.example$/,
  // Documentation that quotes key prefixes while explaining where to find them.
  /^STRIPE_SETUP\.md$/,
  // Past scan reports quote the patterns they searched for.
  /^audit-findings\//,
  /^AUDIT-REPORT-.*\.md$/,
  /^PLATFORM-AUDIT-REPORT\.md$/,
  // The retired scanner skill lists its own grep patterns.
  /^Scheduled\/security-scanner\/SKILL\.md$/,
  // This file: the patterns above are literally credential shapes.
  /^scripts\/check-secrets\.mjs$/,
];

// Specific known-benign values, allowlisted by what they are rather than by
// file, so moving them does not silently un-cover them.
const ALLOW_FINDINGS = [
  {
    // Supabase anon key hardcoded in the OG-image endpoint. Public by design —
    // it ships in the browser bundle regardless. RLS is what protects the data.
    path: /^api\/quote-og\.ts$/,
    name: "supabase-service-role-jwt",
    onlyIfRole: "anon",
  },
  {
    // Transistor Software background-geolocation licence, scoped to
    // com.connectradie.app. Android resources are extractable from any APK, so
    // the vendor embeds it by design.
    path: /^android\/app\/src\/main\/res\/values\/strings\.xml$/,
    name: "generic-assignment",
  },
];

const PLACEHOLDER_WORDS =
  /^(?:your|my|the|xxx+|placeholder|example|changeme|replace|insert|todo|dummy|test|sample|fake|redacted|masked|removed|abc123|1234)/i;

// Markers strong enough to excuse a value wherever they appear, not just at the
// start — docs write `whsec_PLACEHOLDER`, where the giveaway sits AFTER the
// issuer prefix and an anchored test misses it.
//
// Deliberately excludes "test": `sk_test_51H…` is a real Stripe test-mode
// credential, and excusing every value containing "test" would wave those
// through. Test-mode keys still buy an attacker a working Stripe session.
const PLACEHOLDER_MARKERS =
  /(?:placeholder|changeme|change_me|redacted|dummy|example|notarealkey|xxxx)/i;

function looksLikePlaceholder(value) {
  if (PLACEHOLDER_WORDS.test(value)) return true;
  if (PLACEHOLDER_MARKERS.test(value)) return true;
  if (/^[xX*.•…]+$/.test(value)) return true;
  if (value.includes("…") || value.includes("...")) return true;
  // Indirection, not a value: env(...) in supabase/config.toml, ${VAR} in
  // shell/CI, and the three runtimes' env objects.
  if (/^(?:env\(|\$\{|process\.env|import\.meta\.env|Deno\.env)/.test(value)) {
    return true;
  }
  // A single repeated character is nobody's credential.
  if (new Set(value).size <= 2) return true;
  return false;
}

/** Shannon entropy in bits per character. */
function entropy(s) {
  const freq = new Map();
  for (const c of s) freq.set(c, (freq.get(c) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Does this VALUE look like a credential rather than an identifier?
 *
 * Only applied to the generic catch-all — the issuer-prefixed patterns above
 * are self-evidently credentials and skip this. Real secrets are dense and
 * mixed-class; the things that were false-positiving are readable snake_case
 * and kebab-case names, which this rejects on shape rather than on a wordlist.
 */
function looksLikeCredential(value) {
  // connectradie_recent_searches, ci-contrast-sweep-placeholder,
  // instant_payouts_status — separator-joined lowercase words.
  if (/^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/.test(value)) return false;
  // A single all-lowercase or all-uppercase run with no digits reads as a word.
  if (/^[a-z]+$/.test(value) || /^[A-Z]+$/.test(value)) return false;
  const mixedClass =
    /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
  return mixedClass || entropy(value) >= 3.6;
}

function isAllowedPath(path) {
  return ALLOW_PATHS.some((re) => re.test(path));
}

function isAllowedFinding(path, name, role) {
  return ALLOW_FINDINGS.some(
    (a) =>
      a.path.test(path) &&
      a.name === name &&
      (a.onlyIfRole === undefined || a.onlyIfRole === role),
  );
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------
function scanContent(path, content, findings) {
  if (isAllowedPath(path)) return;
  // Binary-ish: skip rather than emit noise for every compiled asset.
  if (content.includes(" ")) return;

  const lines = content.split("\n");

  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      let m;
      while ((m = p.re.exec(line)) !== null) {
        const value = p.capture ? m[p.capture] : m[0];
        if (!value) continue;
        if (looksLikePlaceholder(value)) continue;
        // The generic net alone has to justify itself on the value's shape;
        // an issuer prefix is already proof enough on its own.
        if (p.name === "generic-assignment" && !looksLikeCredential(value)) {
          continue;
        }
        if (isAllowedFinding(path, p.name, null)) continue;
        findings.push({ path, line: i + 1, name: p.name, why: p.why });
      }
    }

    JWT_RE.lastIndex = 0;
    let j;
    while ((j = JWT_RE.exec(line)) !== null) {
      const role = jwtRole(j[0]);
      // Only service_role is a finding. anon is public by design; an
      // undecodable token is not evidence of anything.
      if (role !== "service_role") continue;
      if (isAllowedFinding(path, "supabase-service-role-jwt", role)) continue;
      findings.push({
        path,
        line: i + 1,
        name: "supabase-service-role-jwt",
        why: "JWT whose payload declares role=service_role — bypasses RLS entirely",
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Config hygiene — cheap assertions, folded in rather than given their own file
// ---------------------------------------------------------------------------
function checkHygiene(problems) {
  const gitignore = existsSync(".gitignore")
    ? readFileSync(".gitignore", "utf8")
    : "";
  const ignored = new Set(
    gitignore
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
  for (const needed of [".env", ".env.e2e"]) {
    if (!ignored.has(needed)) {
      problems.push(`${needed} is not listed in .gitignore`);
    }
  }

  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  for (const f of tracked) {
    const base = f.split("/").pop();
    if (base.startsWith(".env") && !base.endsWith(".example")) {
      problems.push(`${f} is tracked — .env files must never be committed`);
    }
  }

  // A .env that ever existed in history is a leak even if deleted since.
  const histEnv = git([
    "log", "--all", "--pretty=format:", "--name-only", "--diff-filter=A",
  ])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => {
      const base = f.split("/").pop();
      return base.startsWith(".env") && !base.endsWith(".example");
    });
  for (const f of [...new Set(histEnv)]) {
    problems.push(`${f} appears in git history — treat its contents as leaked`);
  }
}

// ---------------------------------------------------------------------------
const findings = [];
const hygiene = [];
let scanned = 0;

if (SINGLE_FILE) {
  // --file takes a path on disk and scans it under that name. Used by the
  // acceptance test to prove this fires on the commit that carried the leak.
  scanContent(SINGLE_FILE, readFileSync(SINGLE_FILE, "utf8"), findings);
  scanned = 1;
} else if (HISTORY) {
  // Every blob ever added, addressed by the path it was added at. Slow by
  // design; not wired into CI.
  const entries = git(["rev-list", "--all", "--objects"])
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const sp = l.indexOf(" ");
      return sp === -1 ? null : { sha: l.slice(0, sp), path: l.slice(sp + 1) };
    })
    .filter(Boolean);

  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.sha)) continue;
    seen.add(e.sha);
    let content;
    try {
      content = execFileSync("git", ["cat-file", "-p", e.sha], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      continue; // trees, submodule refs, unreadable blobs
    }
    scanContent(e.path, content, findings);
    scanned++;
  }
} else {
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  for (const f of tracked) {
    let content;
    try {
      content = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    scanContent(f, content, findings);
    scanned++;
  }
  checkHygiene(hygiene);
}

// ---------------------------------------------------------------------------
// Report. Position and pattern name only — never the value.
// ---------------------------------------------------------------------------
if (!findings.length && !hygiene.length) {
  console.log(
    HISTORY
      ? `no credentials found across ${scanned} historical blobs.`
      : `no committed credentials (${scanned} tracked files scanned, env hygiene clean).`,
  );
  process.exit(0);
}

// De-duplicate: history mode sees the same value across many commits.
const seenKey = new Set();
const unique = findings.filter((f) => {
  const k = `${f.path}:${f.line}:${f.name}`;
  if (seenKey.has(k)) return false;
  seenKey.add(k);
  return true;
});

if (unique.length) {
  console.error(`${unique.length} possible credential(s) committed:\n`);
  for (const f of unique) {
    console.error(`  ${f.path}:${f.line}  [${f.name}]\n      ${f.why}`);
  }
}
if (hygiene.length) {
  console.error(`\n${hygiene.length} env-hygiene problem(s):\n`);
  for (const h of hygiene) console.error(`  ${h}`);
}

console.error(`
Removing a credential from HEAD does not un-expose it: it stays in git history,
and this repository is public. Rotate it at the issuer first, then remove it.
If a finding is legitimately safe to commit, add it to ALLOW_PATHS or
ALLOW_FINDINGS in scripts/check-secrets.mjs with the reason written down —
never by loosening a pattern, which would re-open the class.`);
process.exit(1);
