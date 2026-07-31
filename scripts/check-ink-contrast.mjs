// Fails when `text-ct-ink` is painted on a fill it cannot be read against.
//
// --ink (#07100F) is the PAGE BACKGROUND. It is a valid TEXT colour on exactly
// one kind of fill: a bright one (teal, amber, rose, paper at full strength).
// On a dark surface it measures 1.15:1–1.46:1 — not "low contrast", invisible.
//
// The v2 dark cutover mapped light-mode pairs onto tokens wholesale:
//
//   bg-secondary-600 text-white hover:bg-secondary-700
//     → bg-ct-surface-2 text-ct-ink hover:bg-ct-surface-2
//
// Both halves moved, so the hover resolved to the base colour and the control
// went invisible at rest. 153 elements shipped that way across 69 files,
// including the /hire hero headline and the footer wordmark on public,
// signed-out pages.
//
// Why static and not the Playwright contrast sweep: that sweep measures a
// route at rest. It reported 0 failures on the same tree, because it never
// opened a modal, never rendered a sent message, never hovered, and its route
// list was 14 authenticated app screens with no public page among them. This
// reads every branch of every ternary in every file instead, so a modal body
// is no harder to see than a landing page.
//
// Runs on source, needs no browser and no build.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Channel values mirror the token block at the top of src/index.css.
const T = {
  ink: [7, 16, 15], 'ink-2': [12, 26, 23], surface: [15, 33, 29],
  'surface-2': [19, 42, 37], line: [27, 50, 44], 'line-soft': [22, 41, 36],
  teal: [18, 211, 180], 'teal-deep': [10, 140, 121], amber: [245, 165, 36],
  rose: [242, 97, 122], paper: [243, 246, 245], mute: [127, 149, 143],
  'mute-2': [169, 189, 184],
};
const AA = 4.5;

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};
// A tinted fill is composited over the card it sits on, not over nothing.
const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));

// bg-ct-teal · bg-ct-teal/20 · bg-ct-amber/[0.13]
const parseBg = (cls) => {
  const m = cls.match(/^!?bg-ct-([a-z0-9-]+?)(?:\/(?:\[([0-9.]+)\]|([0-9]+)))?$/);
  if (!m || !T[m[1]]) return null;
  const alpha = m[2] ? parseFloat(m[2]) : m[3] ? parseInt(m[3], 10) / 100 : 1;
  return { label: alpha === 1 ? `ct-${m[1]}` : `ct-${m[1]}/${alpha}`, rgb: alpha === 1 ? T[m[1]] : over(T[m[1]], alpha, T.surface) };
};

const files = execSync("git grep -l 'text-ct-ink' -- 'src/*'", { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

const fails = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (!/text-ct-ink\b/.test(line)) return;
    // Per quoted segment, so a ternary's branches are judged independently.
    for (const seg of line.split(/['"`]/)) {
      const tokens = seg.split(/\s+/).filter(Boolean);
      // Resting state only. `hover:text-ct-ink` belongs to `hover:bg-*`.
      if (!tokens.some((t) => /^!?text-ct-ink$/.test(t))) continue;
      const bgs = tokens.filter((t) => /^!?bg-ct-/.test(t) && !t.includes(':')).map(parseBg).filter(Boolean);
      // No own fill means it inherits an ancestor's, which this cannot see.
      // Silent by design: flagging those would drown the real hits.
      for (const bg of bgs) {
        const cr = ratio(T.ink, bg.rgb);
        if (cr < AA) fails.push({ file, line: i + 1, bg: bg.label, cr: cr.toFixed(2) });
      }
    }
  });
}

if (!fails.length) {
  console.log(`text-ct-ink: every resting fill is bright enough to read against (${files.length} files scanned).`);
  process.exit(0);
}

console.error(`text-ct-ink is unreadable on its own fill in ${fails.length} place(s):\n`);
for (const f of fails) console.error(`  ${f.file}:${f.line}  ${f.cr}:1 on ${f.bg}`);
console.error(`
--ink is the page background. On a dark fill it is invisible, not merely dim.

  a solid dark fill   →  the control was meant to be a primary action:
                         bg-ct-teal text-ct-ink hover:bg-ct-teal-deep
  a dim/tinted fill   →  carry the SOLID colour as text:
                         bg-ct-amber/[0.13] text-ct-amber hover:bg-ct-amber hover:text-ct-ink
  plain text          →  text-ct-paper`);
process.exit(1);
