// Fails when a `ct-` utility names something Tailwind will not emit a rule for.
//
// A Tailwind class that does not resolve is silent. No build error, no console
// warning, no visual clue beyond the property simply not being applied — and
// "this element has no background" reads as a design choice, not a bug. The v2
// cutover produced three separate flavours of it:
//
//   bg-ct-surface-20            a token that does not exist (fixed in #183)
//   bg-ct-teal/[0.14]/50        a stray second opacity modifier, from mapping
//                               `bg-emerald-50/50` and leaving the /50 behind
//   border-ct-teal/300/20       the old ramp number riding along from
//                               `border-teal-500/20`
//
// 171 + 52 elements shipped with fills that were never painted. Selected rows
// looked unselected, overdue rows were not highlighted, "Most popular" was not
// marked. None of it failed a build and none of it failed the contrast checks,
// because an unpainted background is not a contrast problem — it is an absent
// one.
//
// So: read the token names straight out of tailwind.config.js, then check every
// ct- utility in the source resolves to one. Pure source, no build, no browser.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const cfg = readFileSync('tailwind.config.js', 'utf8');

// Pull the key names out of each scale rather than hard-coding them, so adding
// a token to the config is enough and this never drifts out of date.
const scaleKeys = (name) => {
  const at = cfg.indexOf(`${name}: {`);
  if (at === -1) return new Set();
  let depth = 0, end = at;
  for (let i = cfg.indexOf('{', at); i < cfg.length; i++) {
    if (cfg[i] === '{') depth++;
    else if (cfg[i] === '}') { depth--; if (!depth) { end = i; break; } }
  }
  const body = cfg.slice(at, end);
  return new Set([...body.matchAll(/^\s*'?([a-zA-Z0-9-]+)'?\s*:/gm)].map((m) => m[1]));
};

// Colours live under `ct:`; the other scales namespace the prefix into the key
// itself (`ct-meta`, `ct-lg`), so strip it to compare like with like.
const strip = (s) => new Set([...s].map((k) => k.replace(/^ct-/, '')));
const COLOURS = scaleKeys('ct');
const SIZES = strip(scaleKeys('fontSize'));
const RADII = strip(scaleKeys('borderRadius'));
const FONTS = strip(scaleKeys('fontFamily'));

// Which scale each utility prefix reads from. `text-` is ambiguous by design in
// Tailwind — it sets colour OR size — so it accepts either.
const PREFIX = {
  bg: COLOURS, border: COLOURS, ring: COLOURS, from: COLOURS, via: COLOURS,
  to: COLOURS, divide: COLOURS, outline: COLOURS, fill: COLOURS, stroke: COLOURS,
  decoration: COLOURS, accent: COLOURS, caret: COLOURS, placeholder: COLOURS,
  shadow: COLOURS,
  text: new Set([...COLOURS, ...SIZES]),
  rounded: RADII,
  font: FONTS,
};

// One opacity modifier, bracketed or plain — and exactly one. A second is the
// bug: Tailwind stops parsing and emits nothing.
const UTILITY = /(?<![\w-])(bg|text|border|ring|from|via|to|divide|outline|fill|stroke|decoration|accent|caret|placeholder|shadow|rounded|font)-ct-([a-zA-Z0-9-]+)((?:\/(?:\[[0-9.]+\]|[0-9]+))*)/g;

const files = execSync("git grep -l -- '-ct-' -- 'src/*'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

const bad = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(UTILITY)) {
      const [full, prefix, token, mods] = m;
      const scale = PREFIX[prefix];
      if (!scale || !scale.size) continue;
      const modCount = (mods.match(/\//g) || []).length;
      if (modCount > 1) {
        bad.push({ file, line: i + 1, cls: full, why: `${modCount} opacity modifiers — Tailwind emits nothing` });
      } else if (!scale.has(token)) {
        bad.push({ file, line: i + 1, cls: full, why: `no \`${token}\` in the ${prefix === 'rounded' ? 'radius' : prefix === 'font' ? 'font' : 'token'} scale` });
      }
    }
  });
}

if (!bad.length) {
  console.log(`every ct- utility resolves to a real token (${files.length} files scanned).`);
  process.exit(0);
}

console.error(`${bad.length} ct- utility/utilities will not render:\n`);
for (const b of bad) console.error(`  ${b.file}:${b.line}  ${b.cls}\n      ${b.why}`);
console.error(`
A class Tailwind cannot parse fails silently — no build error, no warning, the
property just never applies. Check the name against tailwind.config.js, and
remember an opacity modifier can only appear once: bg-ct-teal/[0.14], never
bg-ct-teal/[0.14]/50.`);
process.exit(1);
