#!/usr/bin/env node
/**
 * Fails when production has applied a migration this repo has no file for.
 *
 * WHY THIS EXISTS
 * Schema reaches production through paths that write no file: the dashboard SQL
 * editor, an MCP `apply_migration`, a psql session. The object lands in the
 * database, the migration file never lands in the repo, and a rebuild from
 * supabase/migrations silently produces a different database. The 2026-07-28
 * audit found 45 objects that had arrived that way — 3 functions, 3 tables, 11
 * columns, 26 policies and a CHECK value, every one reachable from application
 * code.
 *
 * It happened again on 2026-08-06: 20260806072210 was applied straight to
 * production by an agent session and existed nowhere in the repo until someone
 * noticed by hand.
 *
 * WHY NOT check:drift
 * check-schema-drift.mjs is the thorough answer — it replays every migration
 * into a second project and fingerprints 11 object classes against production,
 * so it catches objects altered in place with no migration row at all. But it
 * needs that second project provisioned and kept replayed, which is real money
 * and real upkeep, and a stale rebuild produces false positives people learn to
 * ignore. Its CI job has never once executed.
 *
 * This check is the cheap 80%: one query against production's own ledger, one
 * directory listing. No second project. It catches every migration that was
 * recorded on the way in — which is how all of the above actually arrived.
 * What it cannot see is a change made with no migration row; that is the gap
 * check:drift exists to close, and the reason to keep it around.
 *
 * WHY A BASELINE
 * 152 production versions already have no repo file, and they are not a
 * backlog of missing work — they are the clock-stamped counterparts of files
 * whose names carry hand-rounded stamps (production 20260805010933, repo
 * 20260805010000). Audited on 2026-08-06 and found benign; see
 * audit-findings/2026-08-06-migration-ledger-drift.md. They are grandfathered
 * so this check reports only what appears from now on.
 *
 *   node scripts/check-ledger-drift.mjs            # check
 *   node scripts/check-ledger-drift.mjs --update   # re-baseline against prod
 *   node scripts/check-ledger-drift.mjs --self-test  # verify the diff, no token
 *
 * Needs SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * and a production ref from DRIFT_PROD_REF or VITE_SUPABASE_URL. Exits 0 with a
 * notice when the token is absent, so it can sit in CI on forks.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = '.ledger-baseline.json';
const DIR = 'supabase/migrations';
const ARGS = process.argv.slice(2);
const flag = (n) => ARGS.includes(n);

function loadEnvFiles() {
  for (const file of ['.env.e2e', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

const refFromUrl = (url) => (url || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? null;

/** Versions this repo carries a file for. */
export function repoVersions(dir = DIR) {
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, 14)));
}

/**
 * Applied in production, no file here, not grandfathered.
 * Pure, so the interesting part is testable without a token.
 */
export function unfiled(applied, repo, baseline) {
  return applied.filter((v) => !repo.has(v) && !baseline.has(v)).sort();
}

async function appliedVersions(ref, token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'select version from supabase_migrations.schema_migrations order by version',
    }),
  });
  if (!res.ok) throw new Error(`${ref}: HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`${ref}: unexpected response shape`);
  return rows.map((r) => String(r.version));
}

function selfTest() {
  const repo = new Set(['20260101010101', '20260102020202']);
  const base = new Set(['20260103030303']);
  const cases = [
    [['20260101010101'], [], 'a version with a file is not reported'],
    [['20260103030303'], [], 'a grandfathered version is not reported'],
    [['20260104040404'], ['20260104040404'], 'an unfiled new version IS reported'],
    [
      ['20260101010101', '20260103030303', '20260104040404'],
      ['20260104040404'],
      'only the unfiled one is reported out of a mixed set',
    ],
  ];
  let failed = 0;
  for (const [applied, want, label] of cases) {
    const got = unfiled(applied, repo, base);
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : ` — got ${JSON.stringify(got)}`}`);
  }
  console.log(failed ? `\n${failed} self-test(s) failed.` : '\nself-test passed.');
  return failed ? 1 : 0;
}

async function main() {
  if (flag('--self-test')) return selfTest();

  loadEnvFiles();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.log(`check-ledger-drift skipped — no SUPABASE_ACCESS_TOKEN.

It reads production's own migration ledger, which needs a personal access
token: https://supabase.com/dashboard/account/tokens

Verify the comparison without one:  npm run check:ledger -- --self-test`);
    return 0;
  }

  const ref = process.env.DRIFT_PROD_REF || refFromUrl(process.env.VITE_SUPABASE_URL);
  if (!ref) {
    console.error('Set DRIFT_PROD_REF (or VITE_SUPABASE_URL) to the production project ref.');
    return 1;
  }

  const applied = await appliedVersions(ref, token);
  const repo = repoVersions();

  if (flag('--update')) {
    const versions = applied.filter((v) => !repo.has(v)).sort();
    writeFileSync(BASELINE, `${JSON.stringify({ versions }, null, 2)}\n`);
    console.log(`grandfathered ${versions.length} production-only version(s) into ${BASELINE}.`);
    return 0;
  }

  const baseline = existsSync(BASELINE)
    ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).versions)
    : new Set();

  const missing = unfiled(applied, repo, baseline);
  if (!missing.length) {
    console.log(
      `every migration applied to ${ref} has a file here (${applied.length} applied, ${baseline.size} grandfathered).`,
    );
    return 0;
  }

  console.error(`${missing.length} migration(s) applied to production with no file in ${DIR}:\n`);
  for (const v of missing) console.error(`  ${v}`);
  console.error(`
Production ran these; this repo cannot reproduce them. A rebuild from
${DIR} would produce a database that differs from production by whatever
they did, and nothing else would notice — the 2026-07-28 audit found 45 objects
that had arrived exactly this way.

Recover the SQL and commit it as a migration named for the version production
recorded, so the two agree:

  select array_to_string(statements, E'\\n')
  from supabase_migrations.schema_migrations where version = '<version>';

If a version is genuinely expected to have no file, add it to ${BASELINE}
with a note in the commit message saying why.`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`check-ledger-drift failed: ${e.message}`);
    process.exit(1);
  });
