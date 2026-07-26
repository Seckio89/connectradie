#!/usr/bin/env node
/**
 * check-edge-fn-docs — keeps the documented Edge Function list matching the repo.
 *
 * WHY THIS EXISTS
 * CLAUDE.md claimed 20 edge functions and named 19 while the repo had 65. The
 * count was stale long enough to be copied into .claude/skills/task-router.md
 * (which said 19), so every routing decision made from those docs was working
 * from a list missing 46 functions — including most of the payments surface:
 * accept-and-pay, auto-release-payments, auto-release-recurring-payouts,
 * instant-payout, payout-reconciliation, calculate-job-fees, the BECS group and
 * the invoicing group. Fixed by hand in #112; this stops it recurring.
 *
 * Nothing about a doc list is self-correcting, and adding a function is exactly
 * the moment nobody thinks about CLAUDE.md. So the list is generated from disk
 * and CI fails when it drifts.
 *
 *   node scripts/check-edge-fn-docs.mjs         # check (CI)
 *   node scripts/check-edge-fn-docs.mjs --fix   # rewrite the docs from disk
 *
 * The check compares the SET of names and the counts, not the exact wrapping,
 * so hand-reflowed text stays valid. --fix rewrites with canonical wrapping.
 *
 * Exit: 0 clean, 1 drift.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';
const CLAUDE_MD = 'CLAUDE.md';
const TASK_ROUTER = '.claude/skills/task-router.md';
const WRAP_COLS = 74;
const FIX = process.argv.includes('--fix');

// Same predicate as scripts/typecheck-edge.mjs — keep them in step, or the docs
// and the functions CI actually type-checks will describe different sets.
// `_shared/` is helpers, not a function, which is why a naive ls returns 66.
const fns = readdirSync(ROOT)
  .filter((d) => !d.startsWith('_') && statSync(join(ROOT, d)).isDirectory())
  .filter((d) => existsSync(join(ROOT, d, 'index.ts')))
  .sort();

/** Wrap ` · `-separated names, trailing ` ·` as the continuation marker. */
function wrapList(names) {
  const lines = [];
  let line = '';
  for (const name of names) {
    const candidate = line ? `${line} · ${name}` : name;
    if (candidate.length > WRAP_COLS) {
      lines.push(`${line} ·`);
      line = name;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
const taskRouter = readFileSync(TASK_ROUTER, 'utf8');

// The four places a count or a list can go stale.
const STACK_RE = /(PostgreSQL \+ )(\d+)( Edge Functions \(Deno\))/;
const DIRS_RE = /(supabase\/functions\/ # )(\d+)( Edge Functions)/;
const HEADING_RE = /(## Edge Functions \()(\d+)(\)\n)([\s\S]*?)(\n\n)/;
const ROUTER_RE = /(\b)(\d+)( Edge Functions\.)/;

const problems = [];

function checkCount(label, file, source, re) {
  const m = source.match(re);
  if (!m) {
    problems.push(`${file}: could not find the ${label} — the pattern this script keys on has changed.`);
    return;
  }
  if (Number(m[2]) !== fns.length) {
    problems.push(`${file}: ${label} says ${m[2]}, should be ${fns.length}.`);
  }
}

checkCount('Stack line count', CLAUDE_MD, claudeMd, STACK_RE);
checkCount('Key Directories count', CLAUDE_MD, claudeMd, DIRS_RE);
checkCount('section heading count', CLAUDE_MD, claudeMd, HEADING_RE);
checkCount('count', TASK_ROUTER, taskRouter, ROUTER_RE);

// The list itself — compare as a set, so reflowed text is not a failure.
const headingMatch = claudeMd.match(HEADING_RE);
let missing = [];
let extra = [];
if (headingMatch) {
  const documented = headingMatch[4]
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  const onDisk = new Set(fns);
  const inDocs = new Set(documented);
  missing = fns.filter((f) => !inDocs.has(f));
  extra = documented.filter((d) => !onDisk.has(d));
  if (missing.length) problems.push(`${CLAUDE_MD}: ${missing.length} function(s) missing from the list: ${missing.join(', ')}`);
  if (extra.length) problems.push(`${CLAUDE_MD}: ${extra.length} name(s) listed but not on disk: ${extra.join(', ')}`);
}

if (FIX) {
  const fixed = claudeMd
    .replace(STACK_RE, `$1${fns.length}$3`)
    .replace(DIRS_RE, `$1${fns.length}$3`)
    .replace(HEADING_RE, `$1${fns.length}$3${wrapList(fns)}$5`);
  writeFileSync(CLAUDE_MD, fixed);
  writeFileSync(TASK_ROUTER, taskRouter.replace(ROUTER_RE, `$1${fns.length}$3`));
  console.log(`Rewrote ${CLAUDE_MD} and ${TASK_ROUTER} from disk: ${fns.length} edge functions.`);
  process.exit(0);
}

if (problems.length) {
  console.error(`❌ Edge Function docs are out of date (${fns.length} on disk):\n`);
  for (const p of problems) console.error(`   ${p}`);
  console.error('\nFix with:  npm run check:edge-docs:fix');
  process.exit(1);
}

console.log(`✓ Edge Function docs match the repo (${fns.length} functions).`);
process.exit(0);
