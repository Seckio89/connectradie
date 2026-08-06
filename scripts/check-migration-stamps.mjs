#!/usr/bin/env node
/**
 * Fails when a NEW migration's filename stamp is one production could never
 * have recorded.
 *
 * WHY THIS EXISTS
 * Production's ledger and this repo's filenames disagree, and have for months.
 * 179 of 340 files carry hand-rounded stamps (20260805010000) where production
 * recorded the real clock (20260805010933). Same logical migration, different
 * recorded version — so `supabase db push` reads ~122 already-applied
 * migrations as pending. 73 of those carry CREATE POLICY with no
 * DROP POLICY IF EXISTS guard and 68 carry INSERT INTO seeds, which means a
 * push against production either aborts on the first policy or duplicates
 * seed data on a live marketplace.
 *
 * The historical drift was audited and is benign — every one of the 43 files
 * with no ledger counterpart was verified present in production's schema, and
 * the reason they matched nothing is that production recorded 46 entries in
 * that date band with a NULL name. Nothing is missing. But nothing was
 * stopping the next one either, and two of these landed the same week this
 * check was written.
 *
 * WHY A BASELINE RATHER THAN A SWEEP
 * 197 of the 340 existing files would fail rule 2. Failing them all would
 * block every commit, and editing them is barred outright — migrations are
 * append-only. So the 340 versions that exist today are grandfathered into
 * .migration-stamp-baseline.json, and only genuinely new files are checked.
 * Same shape as .typecheck-baseline.json and the five other baselines here.
 *
 * WHY THIS CHECK AND NOT check:drift
 * check-schema-drift.mjs is the real answer to "does the repo still rebuild
 * production", but it needs SUPABASE_ACCESS_TOKEN and so cannot run on a fork
 * — its CI job has never once executed. This one is pure filesystem, so it can
 * be blocking where that cannot.
 *
 *   node scripts/check-migration-stamps.mjs            # check (CI)
 *   node scripts/check-migration-stamps.mjs --update   # grandfather current state
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'supabase/migrations';
const BASELINE = '.migration-stamp-baseline.json';
const UPDATE = process.argv.includes('--update');

const NAME_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

if (UPDATE) {
  writeFileSync(BASELINE, `${JSON.stringify({ files }, null, 2)}\n`);
  console.log(`grandfathered ${files.length} existing migrations into ${BASELINE}.`);
  process.exit(0);
}

// Grandfathered by FILENAME, not by version. Baselining versions would mean a
// new migration that reuses an old version — the one collision most worth
// catching — matched the baseline and was skipped without being checked.
const baseline = existsSync(BASELINE)
  ? new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).files)
  : new Set();

// Every version in the tree, so a new file can be checked for collision and
// ordering against the whole history rather than just the new arrivals.
const seen = new Map(); // version -> [filenames]
for (const f of files) {
  const v = f.slice(0, 14);
  if (!seen.has(v)) seen.set(v, []);
  seen.get(v).push(f);
}
const highest = files.length ? files[files.length - 1].slice(0, 14) : '0';

const problems = [];

for (const f of files) {
  const v = f.slice(0, 14);
  if (baseline.has(f)) continue; // grandfathered

  const m = NAME_RE.exec(f);
  if (!m) {
    problems.push({
      file: f,
      why: 'name must be <14-digit UTC stamp>_<lower_snake_case>.sql',
      fix: 'rename it — the CLI orders migrations by this prefix and ignores files it cannot parse',
    });
    continue;
  }

  // 1a. The stamp has to be a time that exists. The repo already carries one
  //     that is not — 20260726260000, hour 26 — which sorts fine and means
  //     nothing.
  const [hh, mi, ss] = [v.slice(8, 10), v.slice(10, 12), v.slice(12, 14)].map(Number);
  const mo = Number(v.slice(4, 6));
  const dd = Number(v.slice(6, 8));
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh > 23 || mi > 59 || ss > 59) {
    problems.push({
      file: f,
      why: `${v} is not a real UTC timestamp`,
      fix: 'use the real time: date -u +%Y%m%d%H%M%S',
    });
  }

  // 1b. A stamp whose seconds are 00 is a hand-rounded one. Production records
  //    the real clock, so a rounded stamp is guaranteed never to match the
  //    ledger entry the same migration gets on the way in.
  if (v.endsWith('00')) {
    problems.push({
      file: f,
      why: `seconds are "00" — this is a hand-rounded stamp, not a clock reading`,
      fix: 'use the real time: date -u +%Y%m%d%H%M%S',
    });
  }

  // 2. Two files on one version means replay order is undefined between them,
  //    and only one of them can ever match a ledger row.
  const others = seen.get(v).filter((o) => o !== f);
  if (others.length) {
    problems.push({
      file: f,
      why: `version ${v} is already used by ${others.join(', ')}`,
      fix: 'regenerate the stamp — two migrations must never share a version',
    });
  }

  // 3. A new migration sorting below an existing one replays in the wrong
  //    order on a rebuild, and is skipped entirely on a database already past
  //    that point.
  if (v < highest && !seen.get(highest).includes(f)) {
    problems.push({
      file: f,
      why: `version ${v} sorts below the newest existing migration (${highest})`,
      fix: 'regenerate the stamp so this migration replays last',
    });
  }
}

if (!problems.length) {
  const newCount = files.filter((f) => !baseline.has(f)).length;
  console.log(
    newCount
      ? `${newCount} new migration(s) carry a stamp production can record.`
      : 'no new migrations — nothing to check.',
  );
  process.exit(0);
}

console.error(`${problems.length} problem(s) with new migration filenames:\n`);
for (const p of problems) console.error(`  ${DIR}/${p.file}\n      ${p.why}\n      ${p.fix}\n`);
console.error(`A filename stamp is the only thing tying a migration to the row production
records when it is applied. When the two disagree the CLI treats an applied
migration as pending, and re-running it is what duplicates seed data or aborts
on an existing policy. Existing files are grandfathered in ${BASELINE};
this only applies to migrations added since.`);
process.exit(1);
