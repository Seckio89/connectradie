#!/usr/bin/env node
/**
 * Type-check ratchet.
 *
 * The repo has a backlog of pre-existing type errors. Failing CI on all of them
 * would block every commit; ignoring them is how three runtime crashes shipped
 * (the CI "Type Check" step ran `npx tsc --noEmit`, which checks NOTHING because
 * the root tsconfig is solution-style — it always exited 0).
 *
 * So: fail on NEW errors only, and let the number ratchet down over time.
 *
 *   node scripts/typecheck-ratchet.mjs            # check (CI)
 *   node scripts/typecheck-ratchet.mjs --update   # accept current state as baseline
 *
 * The baseline is per-FILE counts, not a single total: that way a file that
 * silently gains an error can't hide behind another file that lost one. Line
 * numbers are deliberately NOT recorded — they churn on every edit and would
 * make the baseline unmergeable.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = '.typecheck-baseline.json';
const UPDATE = process.argv.includes('--update');

function runTsc() {
  try {
    execFileSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    return ''; // clean
  } catch (err) {
    // tsc exits non-zero when there are errors; the report is on stdout.
    return `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
}

/** `src/foo.tsx(12,5): error TS2345: ...` → { 'src/foo.tsx': 3, ... } */
function countByFile(output) {
  const counts = {};
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+:/);
    if (!m) continue;
    const file = m[1].replace(/\\/g, '/');
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return counts;
}

const output = runTsc();
const current = countByFile(output);
const currentTotal = Object.values(current).reduce((a, b) => a + b, 0);

if (UPDATE) {
  writeFileSync(
    BASELINE,
    JSON.stringify({ total: currentTotal, files: Object.fromEntries(Object.entries(current).sort()) }, null, 2) + '\n',
  );
  console.log(`Baseline written: ${currentTotal} errors across ${Object.keys(current).length} files.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`No ${BASELINE}. Create one with:  npm run typecheck:baseline`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baseFiles = baseline.files ?? {};

const regressions = [];
const improvements = [];
for (const [file, count] of Object.entries(current)) {
  const before = baseFiles[file] ?? 0;
  if (count > before) regressions.push({ file, before, now: count });
}
for (const [file, before] of Object.entries(baseFiles)) {
  const now = current[file] ?? 0;
  if (now < before) improvements.push({ file, before, now });
}

const baseTotal = baseline.total ?? 0;
console.log(`Type errors: ${currentTotal} (baseline ${baseTotal})`);

if (improvements.length) {
  console.log(`\n✅ Improved (${improvements.length} file${improvements.length === 1 ? '' : 's'}):`);
  for (const i of improvements.slice(0, 15)) console.log(`   ${i.file}: ${i.before} → ${i.now}`);
  if (improvements.length > 15) console.log(`   …and ${improvements.length - 15} more`);
}

if (regressions.length) {
  console.error(`\n❌ NEW type errors in ${regressions.length} file${regressions.length === 1 ? '' : 's'}:`);
  for (const r of regressions) console.error(`   ${r.file}: ${r.before} → ${r.now}`);
  console.error('\nThe offending lines:');
  const changed = new Set(regressions.map((r) => r.file));
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error TS\d+:/);
    if (m && changed.has(m[1].replace(/\\/g, '/'))) console.error(`   ${line}`);
  }
  console.error(
    '\nFix them, or if they are genuinely pre-existing and unavoidable, ' +
      'run `npm run typecheck:baseline` and explain why in the commit message.',
  );
  process.exit(1);
}

if (currentTotal < baseTotal) {
  console.log(
    `\n🎉 ${baseTotal - currentTotal} fewer error(s) than baseline. ` +
      'Run `npm run typecheck:baseline` to lock the improvement in so it cannot regress.',
  );
}

console.log('\nNo new type errors.');
process.exit(0);
