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
import { execFileSync } from 'node:child_process';

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

// argv array, not a shell string. execSync goes through cmd.exe on Windows,
// which does NOT strip single quotes, so git received 'text-ct-' and 'src/*'
// with the quotes attached, matched nothing, and exited 1 — which execSync
// turns into a thrown error. This check could not be run on Windows at all; it
// only ever passed because CI is Linux. Every other script here already invokes
// git this way (see check-edge-drift.mjs).
const listFiles = () => {
  let out;
  try {
    out = execFileSync('git', ['grep', '-l', '-E', 'text-ct-', '--', 'src/*'], { encoding: 'utf8' });
  } catch (err) {
    // git grep exits 1 for "no matches", which is not a failure. A real fault —
    // a bad flag, no repo — exits 129 with a populated stderr, so keying on 1
    // is specific rather than a blanket swallow.
    if (err.status === 1) return [];
    throw err;
  }
  return out.trim().split('\n').filter(Boolean);
};

// Every text token against every fill, not just ink and paper. Checking only
// those two missed `text-ct-teal` on a solid teal fill — 1.00:1, the Settings
// profile banner's heading simply absent from the page — because neither the
// text nor the fill was one of the two colours being watched.
const TEXT = Object.keys(T).map((k) => [`text-ct-${k}`, T[k]]);

// WCAG 1.4.3 exempts inactive controls, and a disabled button SHOULD read as
// unavailable. This app states that with one pairing, `bg-ct-line
// text-ct-mute` at 4.29:1; raising it would make disabled look live.
//
// Exempt that ONE pair by token. The obvious alternative — skip any element
// carrying `disabled:` or `cursor-not-allowed` — is worse than useless:
// `disabled:opacity-50` sits on nearly every primary CTA in the app and says
// nothing whatever about that button's RESTING colours. Keying off it made
// this check skip most buttons in the codebase. Injecting `text-ct-paper` on
// `bg-ct-teal` (1.76:1, the exact bug this script exists to catch) into a live
// submit button and watching the run report clean is how that was found.
const EXEMPT = new Set(['text-ct-mute on ct-line']);

// One class string in, findings out.
const scanSegment = (seg) => {
  const out = [];
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
  if (!bgs.length) return out;
  for (const [cls, rgb] of TEXT) {
    // Resting state only. `hover:text-ct-ink` belongs to `hover:bg-*`.
    if (!tokens.some((t) => t === cls || t === `!${cls}`)) continue;
    for (const bg of bgs) {
      if (EXEMPT.has(`${cls} on ${bg.label}`)) continue;
      const cr = ratio(rgb, bg.rgb);
      if (cr < AA) out.push({ text: cls, bg: bg.label, cr: cr.toFixed(2) });
    }
  }
  return out;
};

// This script's own failure mode is reporting clean because it stopped
// looking, which is indistinguishable from success. Three real defects
// shipped behind exactly that. So prove it can still see, on every run,
// before trusting a pass.
const SELF_TEST = [
  // The bug this exists to catch, on a button shaped like a real one.
  ['px-4 py-2 bg-ct-teal text-ct-paper rounded-ct-md disabled:opacity-50', true],
  // Gradient stops paint a fill despite carrying no bg- prefix.
  ['bg-gradient-to-r from-ct-teal to-ct-teal text-ct-paper', true],
  // Ink on a dark fill — the original direction.
  ['bg-ct-surface-2 text-ct-ink', true],
  // Correct pairings must NOT be reported, or the check is just noise.
  ['bg-ct-teal text-ct-ink hover:bg-ct-teal-deep', false],
  ['bg-ct-surface text-ct-paper', false],
  ['bg-ct-amber/[0.13] text-ct-amber', false],
];
for (const [seg, shouldFail] of SELF_TEST) {
  if (scanSegment(seg).length > 0 !== shouldFail) {
    console.error(`check-ink-contrast self-test failed on: ${seg}`);
    console.error(shouldFail
      ? 'Expected a finding and got none — the check has been blinded and a pass means nothing.'
      : 'Flagged a correct pairing — the check would fail valid code.');
    process.exit(2);
  }
}

const files = listFiles();

// A scan of nothing is not a clean tree. Without this the script would print
// "every resting fill is readable (0 files scanned)" and exit 0 — a green pass
// having looked at nothing. The self-test above does not cover it: it runs on
// inline sample segments and passes no matter what the file scan returned.
// Exit 2 (the checker is broken), not 1 (real findings).
if (files.length === 0) {
  console.error('check:ink scanned NO FILES — nothing under src/ matched `text-ct-`.');
  console.error('That means this checker is broken, not that the tree is clean.');
  process.exit(2);
}

const fails = [];
for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    // Per quoted segment, so a ternary's branches are judged independently.
    for (const seg of line.split(/['"`]/)) {
      for (const f of scanSegment(seg)) fails.push({ file, line: i + 1, ...f });
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
