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

// Double quotes, not single: execSync on Windows goes through cmd.exe, which
// passes single quotes literally and turns this into a no-match crash.
const files = execSync('git grep -l -- "-ct-" -- "src/*"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

// Comments quote broken classes on purpose — a regression test explaining the
// bug it locks down, or a note saying "this used to be X". Those are prose, not
// markup Tailwind will ever read, and flagging them would fail CI on
// documentation. Strip line comments before matching; `://` is left alone so a
// URL in a string is never mistaken for one.
const stripComment = (line) => {
  const t = line.trimStart();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  // `{/* … */}` is how a comment is written inside JSX, and it is the form a
  // note about a class is most likely to take — the surrounding markup is the
  // thing being explained. It does not start with `/*` (the brace comes first),
  // so the prefix test above walks straight past it. Strip closed block spans
  // before the `//` scan so a documented class name is prose, not a finding.
  const withoutBlocks = line.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '');
  const at = withoutBlocks.search(/(?<!:)\/\//);
  return at === -1 ? withoutBlocks : withoutBlocks.slice(0, at);
};

// A font size written in px cannot be scaled by the user. `rem` resolves
// against the root font size, which is what the text-size setting moves; `px`
// is absolute and ignores it entirely. So a single `text-[13px]` is not a
// rounding difference — it is a line of text that stays 13px while every line
// around it grows, and the larger the user's setting the more conspicuously it
// is left behind. 434 of them had to be converted by hand to make the setting
// work at all; this stops the 435th.
//
// Scoped to typography deliberately. `min-h-[44px]` is the mobile touch target
// and MUST stay absolute — a tap target that shrinks with a smaller text
// setting is a worse bug than the one this prevents. Same for the `min-w`,
// `max-w` and `w` layout values: those size boxes, not text.
const SCALE_BLOCKING = /(?<![\w-])(text|leading)-\[(?:length:)?([0-9.]+)px\]/g;

const scaling = [];
const pxFiles = (() => {
  try {
    // Its own file list, not the ct- one above: a hard-coded size can land in a
    // file that uses no ct- utility at all, and scanning only ct- files would
    // wave it straight through.
    //
    // `--untracked` because the file most likely to carry a fresh `text-[13px]`
    // is a brand-new component the author has not git-added yet. CI never sees
    // that state, but the developer running this locally before committing does,
    // and catching it there is the entire point of a guard rather than a report.
    return execSync('git grep -l --untracked -E -- "(text|leading)-\\[(length:)?[0-9.]+px\\]" -- "src/*"', { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no matches, which is the state we want.
  }
})();

for (const file of pxFiles) {
  readFileSync(file, 'utf8').split('\n').forEach((rawLine, i) => {
    const line = stripComment(rawLine);
    for (const m of line.matchAll(SCALE_BLOCKING)) {
      const [full, prefix, px] = m;
      const rem = +(parseFloat(px) / 16).toFixed(4);
      scaling.push({ file, line: i + 1, cls: full, fix: `${prefix}-[${rem}rem]` });
    }
  });
}

const bad = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((rawLine, i) => {
    const line = stripComment(rawLine);
    for (const m of line.matchAll(UTILITY)) {
      const [full, prefix, token, mods] = m;
      const scale = PREFIX[prefix];
      if (!scale || !scale.size) continue;
      const modCount = (mods.match(/\//g) || []).length;
      // Trailing garbage after a well-formed utility. The regex above stops at
      // the end of the opacity modifier, so `bg-ct-amber/[0.13]0` matched
      // cleanly as `bg-ct-amber/[0.13]` and the stray `0` was never examined —
      // this checker's exact blind spot, found by a compliance.ts unit test in
      // 2026-08-02 rather than by the checker built to catch it. Tailwind reads
      // the WHOLE class token, sees `bg-ct-amber/[0.13]0`, and emits nothing:
      // two status dots shipped colourless on the states meant to draw the eye.
      const nextChar = line[m.index + full.length] ?? '';
      if (/[\w[./]/.test(nextChar)) {
        bad.push({
          file, line: i + 1, cls: `${full}${nextChar}…`,
          why: `trailing "${nextChar}" — Tailwind reads the whole token and emits nothing`,
        });
      } else if (modCount > 1) {
        bad.push({ file, line: i + 1, cls: full, why: `${modCount} opacity modifiers — Tailwind emits nothing` });
      } else if (!scale.has(token)) {
        bad.push({ file, line: i + 1, cls: full, why: `no \`${token}\` in the ${prefix === 'rounded' ? 'radius' : prefix === 'font' ? 'font' : 'token'} scale` });
      }
    }
  });
}

if (!bad.length && !scaling.length) {
  console.log(`every ct- utility resolves to a real token (${files.length} files scanned).`);
  console.log('no px font sizes — text scaling is unblocked.');
  process.exit(0);
}

if (bad.length) {
  console.error(`${bad.length} ct- utility/utilities will not render:\n`);
  for (const b of bad) console.error(`  ${b.file}:${b.line}  ${b.cls}\n      ${b.why}`);
  console.error(`
A class Tailwind cannot parse fails silently — no build error, no warning, the
property just never applies. Check the name against tailwind.config.js, and
remember an opacity modifier can only appear once: bg-ct-teal/[0.14], never
bg-ct-teal/[0.14]/50.`);
}

if (scaling.length) {
  if (bad.length) console.error('');
  console.error(`${scaling.length} px font size/sizes ignore the text-size setting:\n`);
  for (const s of scaling) console.error(`  ${s.file}:${s.line}  ${s.cls}\n      use ${s.fix}`);
  console.error(`
px is absolute, so this text stays put while everything around it scales. Divide
by 16 and write rem. Layout values are a different case and are not checked here:
min-h-[44px] is the touch target and must stay absolute.`);
}

process.exit(1);
