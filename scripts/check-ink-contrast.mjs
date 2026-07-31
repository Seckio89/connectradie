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

// A fill can be declared three ways, and missing any of them is how this class
// of bug survives: bg-ct-teal · bg-ct-teal/20 · bg-ct-amber/[0.13], and the
// gradient stops from-/via-/to-ct-*, which paint just as opaquely but carry no
// `bg-` prefix. Treating a gradient as "no fill" once turned a correct
// `text-ct-ink` on teal into an unreadable `text-ct-paper`.
const parseBg = (cls) => {
  const m = cls.match(/^!?(?:bg|from|via|to)-ct-([a-z0-9-]+?)(?:\/(?:\[([0-9.]+)\]|([0-9]+)))?$/);
  if (!m || !T[m[1]]) return null;
  const alpha = m[2] ? parseFloat(m[2]) : m[3] ? parseInt(m[3], 10) / 100 : 1;
  return { label: alpha === 1 ? `ct-${m[1]}` : `ct-${m[1]}/${alpha}`, rgb: alpha === 1 ? T[m[1]] : over(T[m[1]], alpha, T.surface) };
};

const listFiles = () => execSync(
  "git grep -l -E 'text-ct-' -- 'src/*'", { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

// Every text token against every fill, not just ink and paper. Checking only
// those two missed `text-ct-teal` on a solid teal fill — 1.00:1, the Settings
// profile banner's heading simply absent from the page — because neither the
// text nor the fill was one of the two colours being watched.
const TEXT = Object.keys(T).map((k) => [`text-ct-${k}`, T[k]]);

// WCAG 1.4.3 exempts inactive controls, and a disabled button SHOULD read as
// unavailable. `bg-ct-line text-ct-mute` is the app's disabled pairing at
// 4.29:1; raising it would make disabled look live.
const INACTIVE = /cursor-not-allowed|disabled:|\bopacity-(?:[0-5]?[0-9])\b/;

const files = listFiles();
const fails = [];
for (const file of files) {
  const all = readFileSync(file, 'utf8').split('\n');
  all.forEach((line, i) => {
    // A ternary branch carries the colours but not the `disabled:` markers —
    // those sit on the element, several lines up. Judge inactivity from the
    // enclosing attribute block, the same reason the fill lookup has to.
    const element = all.slice(Math.max(0, i - 8), i + 2).join(' ');
    // Per quoted segment, so a ternary's branches are judged independently.
    for (const seg of line.split(/['"`]/)) {
      const tokens = seg.split(/\s+/).filter(Boolean);
      const bgs = tokens.filter((t) => /^!?(bg|from|via|to)-ct-/.test(t) && !t.includes(':')).map(parseBg).filter(Boolean);
      // KNOWN LIMIT: no own fill means the element inherits an ancestor's, and
      // this does not resolve the JSX tree. Silent by design — flagging every
      // such element would drown the provable hits. It is a real gap, not a
      // safe one: seven elements were missed this way, an icon coloured
      // text-ct-paper sitting inside a parent div filled `from-ct-teal`, the
      // fill and the text in separate class strings. Reviewing a token
      // migration means reading the ancestor by hand, or measuring computed
      // styles in a browser. This check cannot do it for you.
      if (!bgs.length) continue;
      if (INACTIVE.test(element)) continue;
      for (const [cls, rgb] of TEXT) {
        // Resting state only. `hover:text-ct-ink` belongs to `hover:bg-*`.
        if (!tokens.some((t) => t === cls || t === `!${cls}`)) continue;
        for (const bg of bgs) {
          const cr = ratio(rgb, bg.rgb);
          if (cr < AA) fails.push({ file, line: i + 1, text: cls, bg: bg.label, cr: cr.toFixed(2) });
        }
      }
    }
  });
}

// A gradient declares two or three stops of the same colour, so the same
// element reports once per stop. Collapse to one finding per site and colour.
const seen = new Set();
const unique = fails.filter((f) => {
  const k = `${f.file}:${f.line}:${f.text}:${f.bg}`;
  return seen.has(k) ? false : (seen.add(k), true);
});

if (!unique.length) {
  console.log(`every resting fill is readable against its own text (${files.length} files scanned).`);
  process.exit(0);
}

console.error(`Text is unreadable on its own fill in ${unique.length} place(s):\n`);
for (const f of unique) console.error(`  ${f.file}:${f.line}  ${f.text} on ${f.bg} — ${f.cr}:1`);
console.error(`
--ink is the page background and --paper is the primary text colour. Each is
readable on exactly the fills the other is not, so a mis-read fill does not
degrade contrast, it inverts it.

  text-ct-ink on a dark fill — invisible, not merely dim:
    a solid dark fill  →  the control was meant to be a primary action:
                          bg-ct-teal text-ct-ink hover:bg-ct-teal-deep
    a dim/tinted fill  →  carry the SOLID colour as text:
                          bg-ct-amber/[0.13] text-ct-amber hover:bg-ct-amber hover:text-ct-ink
    plain text         →  text-ct-paper

  text-ct-paper on a bright fill — the same failure mirrored:
    →  text-ct-ink. Note that a gradient paints its fill through
       from-/via-/to-ct-*, with no bg- prefix to notice.`);
process.exit(1);
