#!/usr/bin/env node
/**
 * check-navigability — the pub test, run against the source.
 *
 * WHY THIS EXISTS
 * A route can be perfectly implemented, fully type-checked, RLS-correct, and
 * still be *unfindable*. Nothing in the toolchain catches that. `npm run build`
 * is happy to ship a page that no menu links to, a breadcrumb labelled for a
 * route that was deleted six months ago, or a redirect that silently eats the
 * query string a Stripe callback depends on. TypeScript cannot see any of it:
 * every one of these is a fact about the *graph* between files, not about types
 * inside one.
 *
 * The bug class, all of it observed in this repo:
 *
 *   • /tax-invoice/:invoiceId    -> zero inbound links; reachable only if you
 *                                   already know the URL
 *   • /admin/custom-tasks        -> route + guard + page all correct, absent
 *                                   from adminNavItems, so one buried tile on
 *                                   AdminOverview is the only door
 *   • Breadcrumbs ROUTE_LABELS   -> still labels `jobs` and `team`, both of
 *                                   which became <Navigate> redirects
 *   • PAGE_TITLES                -> keyed on exact pathname, so every dynamic
 *                                   route (/tradie/:id, /quote/:token, …) sets
 *                                   the browser tab to the bare word
 *                                   "ConnecTradie"
 *   • /jobs?payment=success      -> /jobs is <Navigate to="/work" replace />;
 *                                   React Router drops the query string, so the
 *                                   Stripe result params never arrive
 *
 * Each check below maps to one of six questions an ordinary person would ask,
 * which is what "would it pass the pub test" means in practice:
 *
 *   1. Where am I?              (page titles, breadcrumbs)
 *   2. How do I get out?        (checked live — see e2e/navigability.spec.ts)
 *   3. Can I find it at all?    (orphans, menu absence, broken links)
 *   4. What do I do next?       (checked live)
 *   5. Do I understand the words? (jargon, inconsistent labels)
 *   6. Does it work on my phone? (checked live)
 *
 * This scanner owns the questions answerable from source. The Playwright spec
 * owns the ones that need a rendered page.
 *
 * Usage:  node scripts/check-navigability.mjs [--verbose] [--json]
 *         node scripts/check-navigability.mjs --baseline   (CI: fail on NEW only)
 *         node scripts/check-navigability.mjs --update-baseline
 * Exit:   0 clean, 1 findings.
 *
 * The baseline works like .typecheck-baseline.json: findings already triaged
 * into an audit report do not block CI, but a newly-introduced one does. Update
 * it deliberately, never to make a red build green.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const VERBOSE = process.argv.includes('--verbose');
const AS_JSON = process.argv.includes('--json');
const USE_BASELINE = process.argv.includes('--baseline');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const BASELINE_FILE = '.nav-baseline.json';

const APP = 'src/App.tsx';
const BREADCRUMBS = 'src/components/Breadcrumbs.tsx';
const LAYOUT = 'src/components/DashboardLayout.tsx';
// Every file that is chrome rather than page body. A link living in one of
// these is "in a menu"; a link in a page body is not.
const NAV_SURFACES = [LAYOUT, 'src/components/Navbar.tsx', 'src/components/Footer.tsx'];

const findings = [];
const add = (sev, check, title, where, fix) =>
  findings.push({ sev, check, title, where, fix });

// ── generic source helpers ───────────────────────────────────────────────────

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/** Every .ts/.tsx under a root, excluding tests and generated types. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'test') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full.split(sep).join('/'));
    }
  }
  return out;
}

/** Balanced-brace slice starting at the `{` at or after `from`. Returns inner text. */
function braceBlock(text, from) {
  const start = text.indexOf('{', from);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start + 1, i);
  }
  return '';
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ── 1. route inventory (N1) ──────────────────────────────────────────────────
//
// Reads the opening <Route …> tag by scanning for the '>' that sits at brace
// depth 0. Naive regex cannot do this: `element={<ProtectedRoute requireAdmin>`
// contains '>' characters nested inside the element expression.

function parseRoutes(src) {
  const routes = [];
  let i = 0;
  while ((i = src.indexOf('<Route', i)) !== -1) {
    let depth = 0;
    let quote = null;
    let end = -1;
    for (let j = i; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === quote && src[j - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = j; break; }
    }
    if (end === -1) break;

    const tag = src.slice(i, end);
    const path = /path="([^"]*)"/.exec(tag)?.[1];
    if (path) {
      const elementAt = tag.indexOf('element=');
      const element = elementAt === -1 ? '' : braceBlock(tag, elementAt);
      const redirect = /<Navigate\s+to="([^"]+)"/.exec(element)?.[1] ?? null;
      const component =
        redirect ? null
          : (element.match(/<([A-Z][A-Za-z0-9]*)/g) ?? [])
              .map((m) => m.slice(1))
              .find((n) => n !== 'ProtectedRoute' && n !== 'PublicRoute' && n !== 'Navigate') ?? null;

      routes.push({
        path,
        line: lineOf(src, i),
        component,
        redirect,
        dynamic: path.includes(':'),
        guard:
          element.includes('<ProtectedRoute') ? 'protected'
            : element.includes('<PublicRoute') ? 'public-only'
              : 'public',
        role:
          /requireAdmin/.test(element) ? 'admin'
            : /requireTradie/.test(element) ? 'tradie'
              : /requireClient/.test(element) ? 'client'
                : null,
        skipsOnboarding: /requireOnboarding=\{false\}/.test(element),
      });
    }
    i = end;
  }
  return routes;
}

const appSrc = read(APP);
const routes = parseRoutes(appSrc).filter((r) => r.path !== '*');

if (!routes.length) {
  console.error('check-navigability: parsed 0 routes from src/App.tsx — the parser is broken, not the app.');
  process.exit(1);
}

/** '/find/:trade/:locationSlug' → regex that also accepts ':param' placeholders. */
function matcher(pattern) {
  const body = pattern
    .split('/')
    .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${body}$`);
}
const routeMatchers = routes.map((r) => ({ route: r, rx: matcher(r.path) }));
const resolveRoute = (path) => routeMatchers.find((m) => m.rx.test(path))?.route ?? null;

// ── 2. link graph (N2) ───────────────────────────────────────────────────────

const LINK_PATTERNS = [
  /\bto=["']([^"']+)["']/g,
  /\bto=\{\s*`([^`]+)`/g,
  /\bto=\{\s*['"]([^'"]+)['"]/g,
  /\bnavigate\(\s*['"]([^'"]+)['"]/g,
  /\bnavigate\(\s*`([^`]+)`/g,
  /\bhref=["'](\/[^"']*)["']/g,
  /\bhref=\{\s*`(\/[^`]+)`/g,
  // Link tables — Footer's `{ name: 'Pricing', href: '/pricing' }` and every
  // NavItem[] in DashboardLayout. Object property, not a JSX attribute, so the
  // `href=` patterns above miss it entirely.
  /\bhref:\s*['"](\/[^'"]*)['"]/g,
  // Path-building helpers — `return `/find/${tradeSlug}`` in seoContent/slugs.ts.
  // Without this every SEO landing page reads as an orphan.
  /`(\/[a-zA-Z][^`]*)`/g,
];
// Links built as absolute URLs for email/SMS — `${window.location.origin}/quote/${t}`.
const ABSOLUTE_MARKER = /origin|connectradie\.com|APP_URL/;
// The trailing `\?…` group matters: a Stripe return URL is only a bug *because*
// it carries a query string into a redirect route. Stop at the '?' and the
// evidence disappears.
const ABSOLUTE_PATH = /(\/[a-z][a-z0-9-]*(?:\/(?:\$\{[^}]*\}|[a-z0-9:-]+))*(?:\?[^`'"\s]*)?)/gi;
// Supabase REST/storage/auth paths share the leading-slash shape but are not
// app routes.
const NOT_A_ROUTE = /^\/(storage|rest|auth|functions|realtime)\//;

/** Strip query/hash, collapse `${expr}` to ':param'. Null for non-app links. */
function normalize(raw) {
  let s = raw.trim();
  if (!s.startsWith('/')) return null;
  if (/^\/\//.test(s)) return null; // protocol-relative
  if (NOT_A_ROUTE.test(s)) return null;
  const hasQuery = s.includes('?');
  s = s.split('?')[0].split('#')[0];
  if (s === '') s = '/';
  if (/\.[a-z0-9]{2,5}$/i.test(s)) return null; // static asset
  s = s.replace(/\$\{[^}]*\}/g, ':param');
  if (s.length > 1) s = s.replace(/\/$/, '');
  return { path: s, hasQuery };
}

const links = []; // { path, hasQuery, file, line, inNavSurface }
const sourceFiles = walk('src');

for (const file of sourceFiles) {
  const src = read(file);
  const inNavSurface = NAV_SURFACES.includes(file);
  const seen = new Set();

  const push = (raw, index) => {
    const n = normalize(raw);
    if (!n) return;
    const key = `${n.path}|${n.hasQuery}|${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ ...n, file, line: lineOf(src, index), inNavSurface });
  };

  for (const rx of LINK_PATTERNS) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(src)) !== null) push(m[1], m.index);
  }

  // Absolute-URL construction, line by line so the marker stays local.
  src.split('\n').forEach((line, idx) => {
    if (!ABSOLUTE_MARKER.test(line)) return;
    const after = line.slice(line.search(ABSOLUTE_MARKER));
    ABSOLUTE_PATH.lastIndex = 0;
    let m;
    while ((m = ABSOLUTE_PATH.exec(after)) !== null) {
      const n = normalize(m[1]);
      if (n && resolveRoute(n.path)) {
        links.push({ ...n, file, line: idx + 1, inNavSurface });
      }
    }
  });
}

// ── 3. nav surfaces + labels ─────────────────────────────────────────────────

const layoutSrc = read(LAYOUT);
const navHrefs = new Set(links.filter((l) => l.inNavSurface).map((l) => l.path));

/** name/href pairs out of the three `NavItem[]` arrays, children included. */
function parseNavItems(name) {
  const at = layoutSrc.indexOf(`const ${name}: NavItem[] =`);
  if (at === -1) return [];
  const start = layoutSrc.indexOf('[', at);
  let depth = 0;
  let end = start;
  for (let i = start; i < layoutSrc.length; i++) {
    if (layoutSrc[i] === '[') depth++;
    else if (layoutSrc[i] === ']' && --depth === 0) { end = i; break; }
  }
  const block = layoutSrc.slice(start, end);
  const out = [];
  const rx = /name:\s*'([^']+)',\s*href:\s*'([^']+)'/g;
  let m;
  while ((m = rx.exec(block)) !== null) {
    out.push({ label: m[1], href: m[2], source: name, line: lineOf(layoutSrc, at + m.index) });
  }
  return out;
}

const navItems = [
  ...parseNavItems('clientNavItems'),
  ...parseNavItems('tradieNavItems'),
  ...parseNavItems('adminNavItems'),
];

// ── 4. checks ────────────────────────────────────────────────────────────────

// Routes that are *meant* to be entered from outside the app. Being absent from
// a menu is correct for these, so they are exempt — but they are listed in the
// report rather than silently dropped, because "exempt" is a judgement someone
// should be able to disagree with.
const BY_DESIGN = {
  '/payment-success': 'Stripe redirects here after checkout',
  '/payment-cancelled': 'Stripe redirects here when checkout is abandoned',
  '/quote/:token': 'tokenised link emailed to the client',
  '/workforce/claim': 'tokenised invite link emailed/SMSed to the worker by worker-invite',
  '/onboarding': 'ProtectedRoute redirects here until onboarding completes',
  '/find/:trade/:locationSlug': 'SEO landing page — entered from search results',
  '/find/:trade': 'SEO landing page — entered from search results',
  '/find-in/:locationSlug': 'SEO landing page — entered from search results',
  '/costs/:trade': 'SEO landing page — entered from search results',
  '/hire': 'second marketing entry point — linked from the landing page and footer',

  // ── Added 2026-07-31, audit finding #9. Each was checked individually; none
  // of the four wants a sidebar entry, and one must NOT have one.
  //
  // This scanner reads src/ only, so it cannot see a link that originates in an
  // Edge Function, and it cannot tell a live <Link> from one inside a
  // `{false && …}` branch. Both blind spots are represented below.
  '/tax-invoice/:invoiceId':
    'emailed to the tradie by the issue-fee-invoices cron ' +
    '(supabase/functions/issue-fee-invoices/index.ts:255) — no in-app list exists, ' +
    'so the email is the only way in',
  '/explore':
    'marketing browse page — entered from the landing page category grid ' +
    '(CategoriesSection.tsx); the signed-in equivalent is /search',
  '/how-fees-work':
    'fee explainer, read in context rather than navigated to — linked from the ' +
    'quote fee disclosure, Payouts and Pricing',
  '/calendar-import':
    'PARKED, not finished: its only entry point is disabled behind `{false && …}` ' +
    'in Schedule.tsx until the Google Calendar import issue is fixed, and when it ' +
    'resumes it belongs in Settings rather than back on Schedule. Do not add a ' +
    'menu entry to satisfy this checker',
};

// N3 — link points at nothing.
const brokenSeen = new Set();
for (const l of links) {
  if (resolveRoute(l.path)) continue;
  const key = `${l.path}|${l.file}`;
  if (brokenSeen.has(key)) continue;
  brokenSeen.add(key);
  add('error', 'N3', `Link to "${l.path}" matches no route — lands on the 404 page`,
    `${l.file}:${l.line}`, 'Fix the path, or add the route in src/App.tsx');
}

// N4 — orphan routes. A link from inside the route's own page does not count as
// a way IN, so self-links are excluded before deciding.
const componentFile = (c) => (c ? `src/pages/${c}.tsx` : null);
for (const r of routes) {
  if (r.redirect) continue;
  const inbound = links.filter((l) => {
    if (!matcher(r.path).test(l.path)) return false;
    return l.file !== componentFile(r.component);
  });
  if (inbound.length === 0 && !BY_DESIGN[r.path]) {
    add('warn', 'N4', `Route "${r.path}" has no inbound links anywhere in src/`,
      `${APP}:${r.line}`,
      'Link it from a menu or a page, or delete the route');
  }
}

// N5 — reachable, but not from any menu.
for (const r of routes) {
  if (r.redirect || r.path === '/') continue;
  if (r.guard === 'public-only' || BY_DESIGN[r.path]) continue;
  const inNav = [...navHrefs].some((h) => matcher(r.path).test(h));
  if (inNav) continue;
  const inbound = links.filter((l) => matcher(r.path).test(l.path) && l.file !== componentFile(r.component));
  if (!inbound.length) continue; // already reported as an orphan
  const topLevel = r.path.split('/').filter(Boolean).length === 1 && !r.dynamic;
  add(topLevel ? 'warn' : 'info', 'N5',
    `"${r.path}" is in no navigation menu — only reachable from ${inbound.length === 1 ? 'one link' : `${inbound.length} links`} inside a page`,
    `${APP}:${r.line}`,
    topLevel
      ? 'Add to clientNavItems / tradieNavItems / adminNavItems in DashboardLayout.tsx'
      : `Deep-link only. Entry point: ${inbound[0].file}:${inbound[0].line}`);
}

// N6 — redirect that eats a query string.
for (const r of routes) {
  if (!r.redirect) continue;
  const callers = links.filter((l) => l.hasQuery && l.path === r.path && l.file !== APP);
  for (const c of callers) {
    add('error', 'N6',
      `"${r.path}" is a <Navigate to="${r.redirect}"> redirect, but this caller passes a query string — React Router drops it`,
      `${c.file}:${c.line}`,
      `Point the caller straight at "${r.redirect.split('?')[0]}" so the params survive`);
  }
}

// N7 — page titles.
const titlesBlock = braceBlock(appSrc, appSrc.indexOf('const PAGE_TITLES'));
const titleKeys = [...titlesBlock.matchAll(/'([^']+)':/g)].map((m) => m[1]);
const titleLine = lineOf(appSrc, appSrc.indexOf('const PAGE_TITLES'));
const PAGE_TITLE_OF = (path) =>
  new RegExp(`'${path.replace(/[/-]/g, '\\$&')}':\\s*'([^']+)'`).exec(titlesBlock)?.[1] ?? 'ConnecTradie';

// RouteTracker falls back to DYNAMIC_TITLES for slug/id-bearing paths, so a
// route matching one of those patterns does get a real title.
const dynamicTitled = (() => {
  const at = appSrc.indexOf('const DYNAMIC_TITLES');
  if (at === -1) return [];
  const end = appSrc.indexOf('\n];', at);
  return [...appSrc.slice(at, end).matchAll(/\[\/\^(.+?)\$\/,/g)]
    .map((m) => { try { return new RegExp(`^${m[1]}$`); } catch { return null; } })
    .filter(Boolean);
})();
/** Concrete sample path for a route, so the patterns can be tested against it. */
const sample = (p) => p.split('/').map((s) => (s.startsWith(':') ? 'x' : s)).join('/');
const titleCovered = (r) => dynamicTitled.some((rx) => rx.test(sample(r.path)));

for (const r of routes) {
  if (r.redirect || titleCovered(r)) continue;
  if (r.dynamic) {
    add('warn', 'N7',
      `"${r.path}" is dynamic, so it can never match PAGE_TITLES — the browser tab reads "ConnecTradie"`,
      `${APP}:${r.line}`,
      'Add a pattern to DYNAMIC_TITLES in src/App.tsx');
  } else if (!titleKeys.includes(r.path)) {
    add('warn', 'N7', `"${r.path}" has no PAGE_TITLES entry — the browser tab reads "ConnecTradie"`,
      `${APP}:${r.line}`, `Add '${r.path}': '… | ConnecTradie' to PAGE_TITLES`);
  }
}
for (const key of titleKeys) {
  const target = resolveRoute(key);
  if (!target) {
    add('info', 'N7', `PAGE_TITLES has an entry for "${key}", which is not a route`,
      `${APP}:${titleLine}`, 'Remove the dead entry');
  } else if (target.redirect) {
    add('info', 'N7', `PAGE_TITLES titles "${key}", but it only redirects to "${target.redirect}"`,
      `${APP}:${titleLine}`, 'Remove it — the title is overwritten immediately by the redirect target');
  }
}

// Two mechanisms both claim document.title. That is worth knowing about even
// while RouteTracker is deliberately the winner, because the day helmet starts
// working these pages will silently change title.
const seoPages = routes.filter((r) => {
  const file = componentFile(r.component);
  return file && existsSync(file) && /<SEO\b/.test(read(file));
});
if (seoPages.length) {
  add('info', 'N7',
    `${seoPages.length} pages render <SEO> (react-helmet) as well as being titled by RouteTracker`,
    `${APP}:${titleLine}`,
    'Helmet is currently inert, so RouteTracker wins — revisit if helmet is ever fixed');
}

// N8 — breadcrumb labels.
const crumbSrc = read(BREADCRUMBS);
const crumbBlock = braceBlock(crumbSrc, crumbSrc.indexOf('const ROUTE_LABELS'));
const crumbLabels = [...crumbBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => ({
  segment: m[1],
  label: m[2],
  line: lineOf(crumbSrc, crumbSrc.indexOf(`'${m[1]}':`)),
}));
const allSegments = new Set(routes.flatMap((r) => r.path.split('/').filter(Boolean)));

for (const c of crumbLabels) {
  const route = routes.find((r) => r.path === `/${c.segment}`);
  if (!allSegments.has(c.segment)) {
    add('warn', 'N8', `Breadcrumb labels "${c.segment}", which is not a segment of any route`,
      `${BREADCRUMBS}:${c.line}`, 'Remove the dead label');
  } else if (route?.redirect && !routes.some((r) => !r.redirect && r.path.startsWith(`/${c.segment}/`))) {
    // A redirect-only segment that is also a prefix (/admin → /admin/overview)
    // still renders as a crumb, so it legitimately needs a label.
    add('warn', 'N8', `Breadcrumb labels "${c.segment}" as "${c.label}", but /${c.segment} is only a redirect to "${route.redirect}"`,
      `${BREADCRUMBS}:${c.line}`, 'Remove it — the crumb can never render');
  }
  const nav = navItems.find((n) => n.href === `/${c.segment}`);
  if (nav && nav.label !== c.label) {
    add('warn', 'N8', `"/${c.segment}" is "${nav.label}" in the sidebar but "${c.label}" in the breadcrumb`,
      `${BREADCRUMBS}:${c.line}`, `Rename the crumb to "${nav.label}" — the sidebar is the name people learn first`);
  }
}

// N10 — one destination, two names. The sidebar is treated as canonical.
const byHref = new Map();
for (const n of navItems) {
  if (!byHref.has(n.href)) byHref.set(n.href, []);
  byHref.get(n.href).push(n);
}
for (const [href, items] of byHref) {
  const names = [...new Set(items.map((i) => i.label))];
  if (names.length > 1) {
    add('warn', 'N10', `"${href}" is called ${names.map((n) => `"${n}"`).join(' and ')} in different menus`,
      `${LAYOUT}:${items[0].line}`, 'Pick one name and use it everywhere');
  }
  const title = titlesBlock.match(new RegExp(`'${href.replace(/[/-]/g, '\\$&')}':\\s*'([^'|]+)`))?.[1]?.trim();
  if (title && !names.some((n) => n.toLowerCase() === title.toLowerCase())) {
    add('info', 'N10', `"${href}" is "${names[0]}" in the menu but "${title}" in the browser tab`,
      `${APP}:${titleLine}`, `Align the tab title with the menu label`);
  }
}

// N9 — words a punter would not know, in the places they cannot avoid reading:
// menu labels, headings and buttons.
const JARGON = [
  ['escrow', 'say "held securely until the work is done"'],
  ['BECS', 'say "direct debit"'],
  ['bps', 'say "%"'],
  ['basis points', 'say "%"'],
  ['geofenc', 'say "site check-in"'],
  ['remit', 'say "pay out"'],
  ['disburse', 'say "pay out"'],
  ['reconcil', 'say "check against"'],
  ['payload', 'internal term — remove'],
  ['idempot', 'internal term — remove'],
  ['webhook', 'internal term — remove'],
  ['upsert', 'internal term — remove'],
  ['RLS', 'internal term — remove'],
  ['JWT', 'internal term — remove'],
  ['endpoint', 'internal term — remove'],
  ['lead', 'a homeowner posts a "job", not a "lead"'],
];

function visibleStrings(src, file) {
  const out = [];
  const push = (text, index) => {
    const clean = text.replace(/\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean && /[a-z]/i.test(clean)) out.push({ text: clean, line: lineOf(src, index) });
  };
  for (const m of src.matchAll(/<h([1-3])[^>]*>([\s\S]{0,300}?)<\/h\1>/g)) push(m[2], m.index);
  for (const m of src.matchAll(/<button[^>]*>([\s\S]{0,200}?)<\/button>/g)) push(m[1], m.index);
  return out.map((o) => ({ ...o, file }));
}

const jargonHits = [];
for (const item of navItems) {
  for (const [word, fix] of JARGON) {
    if (new RegExp(`\\b${word}`, 'i').test(item.label)) {
      jargonHits.push({ word, fix, text: item.label, where: `${LAYOUT}:${item.line}`, surface: 'menu label' });
    }
  }
}
for (const file of sourceFiles.filter((f) => f.startsWith('src/pages/') || f.startsWith('src/components/'))) {
  for (const s of visibleStrings(read(file), file)) {
    for (const [word, fix] of JARGON) {
      if (new RegExp(`\\b${word}`, 'i').test(s.text)) {
        jargonHits.push({ word, fix, text: s.text.slice(0, 80), where: `${s.file}:${s.line}`, surface: 'heading/button' });
      }
    }
  }
}
const jargonByWord = new Map();
for (const h of jargonHits) {
  if (!jargonByWord.has(h.word)) jargonByWord.set(h.word, []);
  jargonByWord.get(h.word).push(h);
}
for (const [word, hits] of jargonByWord) {
  const menu = hits.filter((h) => h.surface === 'menu label');
  add(menu.length ? 'warn' : 'info', 'N9',
    `"${word}" appears in ${hits.length} heading${hits.length === 1 ? '' : 's'}/button${hits.length === 1 ? '' : 's'}${menu.length ? ` and ${menu.length} menu label${menu.length === 1 ? '' : 's'}` : ''}`,
    hits[0].where, hits[0].fix);
}

// N11 — page files with no route and no importer.
const routedComponents = new Set(routes.map((r) => r.component).filter(Boolean));
for (const file of sourceFiles.filter((f) => f.startsWith('src/pages/'))) {
  const name = file.split('/').pop().replace(/\.tsx?$/, '');
  if (routedComponents.has(name)) continue;
  const imported = sourceFiles.some((f) => f !== file && new RegExp(`from '[^']*/${name}'`).test(read(f)));
  if (!imported) {
    add('info', 'N11', `${name}.tsx has no route and nothing imports it — dead file`,
      file, 'Delete it, or route it');
  }
}

// ── 5. report ────────────────────────────────────────────────────────────────

const RUBRIC = {
  N3: 'Can I find it at all?',
  N4: 'Can I find it at all?',
  N5: 'Can I find it at all?',
  N6: 'Can I find it at all?',
  N7: 'Where am I?',
  N8: 'Where am I?',
  N9: 'Do I understand the words?',
  N10: 'Do I understand the words?',
  N11: 'Can I find it at all?',
};

if (AS_JSON) {
  console.log(JSON.stringify({
    routes: routes.map((r) => ({
      ...r,
      inNav: [...navHrefs].some((h) => matcher(r.path).test(h)),
      inboundLinks: links.filter((l) => matcher(r.path).test(l.path) && l.file !== componentFile(r.component)).length,
    })),
    navItems,
    findings: findings.map((f) => ({ ...f, rubric: RUBRIC[f.check] })),
  }, null, 2));
  process.exit(findings.some((f) => f.sev === 'error') ? 1 : 0);
}

// ── baseline ────────────────────────────────────────────────────────────────
// Identity is check + title + location: enough that moving a finding to a new
// file surfaces it again, but not so tight that an unrelated edit above it does.
const keyOf = (f) => `${f.check}|${f.title}|${f.where}`;

if (UPDATE_BASELINE) {
  writeFileSync(BASELINE_FILE, JSON.stringify({ generated: routes.length, findings: findings.map(keyOf).sort() }, null, 2) + '\n');
  console.log(`\nBaseline written — ${findings.length} known finding(s) in ${BASELINE_FILE}.`);
  console.log('These no longer fail CI. New ones will.\n');
  process.exit(0);
}

let known = new Set();
if (USE_BASELINE && existsSync(BASELINE_FILE)) {
  known = new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).findings ?? []);
}
const fresh = USE_BASELINE ? findings.filter((f) => !known.has(keyOf(f))) : findings;

const ICON = { error: '❌', warn: '⚠️ ', info: '🔵' };
const RANK = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => RANK[a.sev] - RANK[b.sev] || a.check.localeCompare(b.check));

const errors = findings.filter((f) => f.sev === 'error').length;
const warns = findings.filter((f) => f.sev === 'warn').length;
const infos = findings.filter((f) => f.sev === 'info').length;

console.log('\nNavigability check — would it pass the pub test?\n');

console.log('1. Scope');
console.log(`  ✅ ${routes.length} routes parsed from ${APP} (${routes.filter((r) => r.redirect).length} redirects)`);
console.log(`  ✅ ${links.length} internal links across ${sourceFiles.length} source files`);
console.log(`  ✅ ${navHrefs.size} distinct destinations in the navigation chrome`);

console.log(`\n2. Findings${USE_BASELINE ? ` (${known.size} known finding(s) baselined — showing new only)` : ''}`);
const shown = USE_BASELINE ? fresh : findings;
if (!shown.length) {
  console.log(USE_BASELINE ? '  ✅ no new findings' : '  ✅ nothing found');
} else {
  let group = null;
  for (const f of shown) {
    const rubric = RUBRIC[f.check];
    if (rubric !== group) {
      group = rubric;
      console.log(`\n  ── ${group} ──`);
    }
    console.log(`  ${ICON[f.sev]} [${f.check}] ${f.title}`);
    console.log(`       ${f.where}`);
    console.log(`       → ${f.fix}`);
  }
}

console.log('\n3. Exempt — no menu entry, by design');
for (const [path, why] of Object.entries(BY_DESIGN)) {
  if (routes.some((r) => r.path === path)) console.log(`  ·  ${path.padEnd(30)} ${why}`);
}

if (VERBOSE) {
  console.log('\n4. Route map\n');
  console.log('  Route                          Guard      In nav  Links  Title');
  console.log('  ' + '─'.repeat(66));
  for (const r of routes) {
    const inNav = [...navHrefs].some((h) => matcher(r.path).test(h));
    const inbound = links.filter((l) => matcher(r.path).test(l.path) && l.file !== componentFile(r.component)).length;
    const guard = r.redirect ? 'redirect' : r.role ? r.role : r.guard === 'protected' ? 'auth' : r.guard === 'public-only' ? 'anon' : 'public';
    const hasTitle = r.redirect ? '—' : titleKeys.includes(r.path) ? 'yes' : titleCovered(r) ? 'pattern' : 'NO';
    console.log(
      `  ${r.path.padEnd(30)} ${guard.padEnd(10)} ${(inNav ? 'yes' : 'no').padEnd(7)} ${String(inbound).padEnd(6)} ${hasTitle}`,
    );
  }
}

console.log('\n  Coverage caveats — this scanner reads source only. It cannot see');
console.log('  whether a page renders, whether a link is visible, whether a menu');
console.log('  item is hidden behind a feature flag, or anything about mobile.');
console.log('  Run `npm run audit:nav` for the questions that need a browser.\n');

console.log(`${errors} errors · ${warns} warnings · ${infos} info`);
if (USE_BASELINE) {
  console.log(`${fresh.length} new since the baseline.`);
  if (fresh.length) console.log('Fix them, or record them deliberately: node scripts/check-navigability.mjs --update-baseline');
}
console.log('');
process.exit((USE_BASELINE ? fresh.length : findings.length) ? 1 : 0);
