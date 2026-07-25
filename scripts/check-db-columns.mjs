#!/usr/bin/env node
/**
 * check-db-columns — catches columns and tables that do not exist.
 *
 * WHY THIS EXISTS
 * TypeScript cannot catch this class. postgrest-js declares
 *
 *   update<Row extends Relation['Update']>(values: Row)
 *
 * — the payload binds to a NAKED GENERIC, so TS infers `Row` from the argument.
 * Inference erases object-literal freshness, and freshness is what drives
 * excess-property checking. The payload then only has to be *assignable* to the
 * constraint, and assignability permits extra properties. So `.update()` can
 * essentially never flag an unknown column, and no `satisfies` or annotation at
 * the call site changes it (the constraint is applied after inference).
 *
 * `.select()` is checked only LAZILY — a bad column resolves the row type to
 * `SelectQueryError<...>` and errors just at the point of use, which any cast
 * suppresses.
 *
 * And `supabase/functions/**` is outside tsconfig.app.json entirely, with every
 * client created as untyped `createClient(...)` (Database = any), so nothing
 * there is checked at all — not even table names. Those are the money paths.
 *
 * Real bugs this class produced, all shipped and all silent:
 *   • abuse_reports.admin_notes    -> every admin moderation action 400'd
 *   • payments.tradie_id (insert)  -> bonus payments never worked
 *   • payments.tradie_id (select)  -> price-reduction flow never worked
 *   • tradie_details.abn           -> ABN missing from every tax invoice
 *   • recurring_jobs.status        -> cancelled services rendered as active
 *
 * Schema source is the GENERATED src/types/supabase.ts: in-repo, versioned, no
 * credentials, works in CI. Regenerate it whenever migrations land.
 *
 * Usage:  node scripts/check-db-columns.mjs [--verbose]
 * Exit:   0 clean, 1 findings.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'supabase/functions'];
const TYPES_FILE = 'src/types/supabase.ts';
const VERBOSE = process.argv.includes('--verbose');

// ── schema ──────────────────────────────────────────────────────────────────

/** Balanced-brace slice starting at the `{` at or after `from`. */
function block(text, from) {
  const start = text.indexOf('{', from);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return '';
}

function parseSchema() {
  const src = readFileSync(TYPES_FILE, 'utf8');
  const schema = new Map();
  // Views are readable but not writable, so they carry only a Row. They must be
  // parsed too or every `.from('public_vacancies')` looks like an unknown table.
  for (const group of ['Tables', 'Views']) {
    const blk0 = block(src, src.indexOf(`${group}: {`));
    for (const m of blk0.matchAll(/\n {6}(\w+): \{\n/g)) {
      const blk = block(blk0, m.index + m[0].length - 2);
      const section = (name) => {
        const i = blk.indexOf(`${name}: {`);
        if (i < 0) return new Set();
        return new Set([...block(blk, i).matchAll(/\n\s{10,}(\w+)\??:/g)].map((x) => x[1]));
      };
      schema.set(m[1], {
        Row: section('Row'),
        Insert: section('Insert'),
        Update: section('Update'),
        isView: group === 'Views',
      });
    }
  }
  return schema;
}

// ── source scanning ─────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p.replaceAll('\\', '/'));
  }
  return out;
}

/**
 * Top-level keys of an object literal. String- and comment-aware: an apostrophe
 * in JSX body text ("don't") would otherwise open a fake string and swallow
 * every call site after it, and a word before a colon inside a comment would
 * otherwise register as a phantom key. Both bit the prototype.
 */
function topLevelKeys(obj) {
  const keys = [];
  let depth = 0, i = 0, quote = null;
  while (i < obj.length) {
    const c = obj[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '/' && obj[i + 1] === '/') { i = obj.indexOf('\n', i) + 1 || obj.length; continue; }
    if (c === '/' && obj[i + 1] === '*') { i = obj.indexOf('*/', i) + 2 || obj.length; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; continue; }
    if (depth === 1) {
      const m = /^\s*(\w+)\s*:/.exec(obj.slice(i));
      if (m && /[{,]$/.test(obj.slice(0, i).trimEnd())) { keys.push(m[1]); i += m[0].length; continue; }
    }
    i++;
  }
  return keys;
}

/** Split a PostgREST select list on top-level commas (embeds carry parens). */
function splitTop(sel) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of sel) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Walk a select list, yielding [table, column] pairs. Recurses into embeds. */
function selectColumns(sel, table, schema, out = []) {
  for (const item of splitTop(sel)) {
    const embed = /^(?:(\w+)\s*:\s*)?(\w+)(?:!\w+)?\s*\((.*)\)$/s.exec(item);
    if (embed) {
      const [, alias, name, inner] = embed;
      // `alias:real_table(...)` — the real table is the one before the parens.
      // If neither alias nor name is a known table, it's a relationship name we
      // cannot resolve statically; skip rather than guess.
      const target = schema.has(name) ? name : schema.has(alias) ? alias : null;
      if (target) selectColumns(inner, target, schema, out);
      continue;
    }
    const col = item.replace(/^\w+\s*:\s*/, '').trim();       // strip `alias:`
    if (!col || col === '*' || col.includes('*')) continue;    // count(), *, etc.
    if (/[->()]/.test(col)) continue;                          // json paths, fns
    out.push([table, col]);
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────────

const schema = parseSchema();
const findings = [];
const unverifiable = [];
let writes = 0, selects = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const fm of text.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
      const table = fm[1];
      const line = text.slice(0, fm.index).split('\n').length;
      const where = `${file}:${line}`;
      const win = text.slice(fm.index + fm[0].length, fm.index + fm[0].length + 3000);

      // `supabase.storage.from('avatars')` is a BUCKET, not a table. Same method
      // name, entirely different namespace — look back for the storage receiver.
      if (/\.storage\s*$/.test(text.slice(Math.max(0, fm.index - 40), fm.index))) continue;

      if (!schema.has(table)) {
        findings.push({ where, table, what: table, kind: 'unknown table/view' });
        continue;
      }

      // ── writes ──
      const wm = /^\s*(?:\.\w+\([^)]*\)\s*)*?\.(update|insert|upsert)\(\s*\{/s.exec(win);
      if (wm) {
        writes++;
        const obj = block(win, wm.index + wm[0].length - 1);
        const valid = new Set([
          ...schema.get(table)[wm[1] === 'update' ? 'Update' : 'Insert'],
          ...schema.get(table).Row,
        ]);
        for (const k of topLevelKeys(obj)) {
          if (!valid.has(k)) findings.push({ where, table, what: k, kind: `unknown column in .${wm[1]}()` });
        }
      } else if (/^\s*(?:\.\w+\([^)]*\)\s*)*?\.(update|insert|upsert)\(/s.test(win)) {
        // Payload is a variable/spread — no static view of the keys.
        unverifiable.push(`${where}  ${table}  (payload is a variable or spread)`);
      }

      // ── selects ──
      const sm = /^\s*(?:\.\w+\([^)]*\)\s*)*?\.select\(\s*([`'"])([\s\S]*?)\1/s.exec(win);
      if (sm && sm[2].includes('${')) {
        // Interpolated select list — the columns aren't knowable statically.
        unverifiable.push(`${where}  ${table}  (select list is a template literal)`);
      } else if (sm) {
        selects++;
        for (const [t, c] of selectColumns(sm[2], table, schema)) {
          if (!schema.has(t)) continue;
          if (!schema.get(t).Row.has(c)) {
            findings.push({ where, table: t, what: c, kind: 'unknown column in .select()' });
          }
        }
      }
    }
  }
}

const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.where}|${f.table}|${f.what}|${f.kind}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log(`schema: ${schema.size} tables from ${TYPES_FILE}`);
console.log(`scanned: ${writes} write payloads, ${selects} select lists\n`);

if (unique.length) {
  console.log('FINDINGS');
  for (const f of unique) console.log(`  ${f.where}\n     ${f.table}.${f.what} — ${f.kind}`);
  console.log('');
}

// A clean run must not imply coverage we don't have.
console.log(`${unverifiable.length} write payload(s) not statically checkable (variable/spread) — audit by hand.`);
if (VERBOSE) for (const u of unverifiable) console.log(`  ${u}`);

if (unique.length) {
  console.log(`\n${unique.length} finding(s). These do NOT fail typecheck — see the header for why.`);
  process.exit(1);
}
console.log('\nNo unknown columns or tables.');
