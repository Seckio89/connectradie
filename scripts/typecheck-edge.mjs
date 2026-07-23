#!/usr/bin/env node
/**
 * Deno type-check ratchet for Supabase Edge Functions.
 *
 * `npm run typecheck` covers src/ only — edge functions are Deno and had never
 * been type-checked anywhere. Turning a hard check on today would fail CI on 8
 * pre-existing failures, so this uses the same ratchet idea as the frontend:
 * a known-failing allowlist, fail on anything NEW.
 *
 *   node scripts/typecheck-edge.mjs            # check (CI)
 *   node scripts/typecheck-edge.mjs --update   # accept current state
 *
 * Deno isn't a repo dependency; `npx deno@2` is used so nothing needs installing.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';
const BASELINE = '.edge-typecheck-baseline.json';
const UPDATE = process.argv.includes('--update');

const fns = readdirSync(ROOT)
  .filter((d) => !d.startsWith('_') && statSync(join(ROOT, d)).isDirectory())
  .filter((d) => existsSync(join(ROOT, d, 'index.ts')))
  .sort();

function check(fn) {
  try {
    execFileSync('npx', ['--yes', 'deno@2', 'check', '--node-modules-dir=auto', join(ROOT, fn, 'index.ts')], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    return true;
  } catch {
    return false;
  }
}

console.log(`Type-checking ${fns.length} edge functions with Deno…`);
const failing = [];
for (const fn of fns) {
  if (!check(fn)) {
    failing.push(fn);
    process.stdout.write('✗');
  } else {
    process.stdout.write('.');
  }
}
console.log(`\n${fns.length - failing.length} passed, ${failing.length} failed.`);

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify({ knownFailing: failing }, null, 2) + '\n');
  console.log(`Baseline written: ${failing.length} known-failing functions.`);
  process.exit(0);
}

const known = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).knownFailing ?? [] : [];
const regressions = failing.filter((f) => !known.includes(f));
const fixed = known.filter((f) => !failing.includes(f));

if (fixed.length) {
  console.log(`\n✅ Now passing (remove from ${BASELINE}): ${fixed.join(', ')}`);
}

if (regressions.length) {
  console.error(`\n❌ NEW edge-function type failures: ${regressions.join(', ')}`);
  console.error('Run this locally to see why:');
  for (const fn of regressions) {
    console.error(`   npx deno@2 check --node-modules-dir=auto ${ROOT}/${fn}/index.ts`);
  }
  process.exit(1);
}

console.log('\nNo new edge-function type failures.');
process.exit(0);
