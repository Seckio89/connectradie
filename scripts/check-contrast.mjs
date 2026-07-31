// WCAG AA contrast sweep against the built app, in a real browser.
//
// This exists because `check:ink` cannot see the thing that matters most. That
// script reads class strings, so it only ever knows the fill an element
// declares ON ITSELF. When the fill is on a parent and the text colour on a
// child — the Settings profile banner, an icon inside a teal tile — the two
// live in different strings and nothing static can connect them. Seven real
// defects hid in exactly that gap.
//
// A browser resolves it for free: walk up from each text node compositing
// backgrounds until an opaque one is found, and you have the colour actually
// painted behind the glyphs, gradients and alpha layers included.
//
// Two things the previous version of this sweep did not do, each of which hid
// live bugs from a run that reported zero:
//
//   PUBLIC ROUTES.  Its route list was 14 authenticated app screens. Every
//   signed-out page — the landing page, /hire, the find-a-tradie pages, the
//   footer on all of them — was never loaded. The /hire hero headline was
//   sitting at 1:1, the same colour as its background, on a page anyone can
//   open without an account.
//
//   MODALS.  It measured `main *`, and modals render outside `main`. Even had
//   one been open it would not have been looked at. So it walked past every
//   dialog, sheet and confirm in the app. This version measures the whole
//   document, opens each candidate modal on every app route, and measures
//   again with it open.
//
// Serves the production build and fakes the session client side; every
// Supabase call is answered from fixtures in scripts/contrast/fixtures.mjs.
// No credentials, no network, nothing leaves the machine — which is what makes
// it safe to run in CI, unlike audit:nav.
//
//   npm run build && npm run preview &
//   npm run check:contrast
import { chromium } from 'playwright';
import { TABLES, UID, tradieProfile } from './contrast/fixtures.mjs';

//   node scripts/check-contrast.mjs --baseline         (CI: fail on NEW only)
//   node scripts/check-contrast.mjs --update-baseline
//
// Contrast failures ALWAYS fail, baseline or not — those are the point. What
// the baseline holds is the routes this harness cannot currently measure: six
// of them redirect, crash or render near-empty under the fixtures. Without it
// CI would sit permanently red on a codebase with zero contrast failures,
// which is how a check teaches people to ignore it. With it, a route that
// STOPS rendering still fails, which is the hole the sweep exists to close.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173';
const REF = 'uoqygmizupdpanplpvor';
const ONLY = process.env.ROUTES ? process.env.ROUTES.split(',') : null;
const USE_BASELINE = process.argv.includes('--baseline');
const UPDATE_BASELINE = process.argv.includes('--update-baseline');
const BASELINE_FILE = '.contrast-baseline.json';

// Signed-out. These render without a session and were the sweep's blind half.
const PUBLIC_ROUTES = [
  '/', '/hire', '/login', '/register', '/pricing', '/help', '/contact',
  '/terms', '/privacy', '/how-fees-work', '/explore', '/careers', '/search',
  '/find/plumber', '/find/plumber/sydney-nsw-2000', '/find-in/sydney-nsw-2000',
  '/costs/plumber', '/payment-success', '/payment-cancelled',
];

// Signed-in. Modals are opened on these.
const APP_ROUTES = [
  '/dashboard', '/leads', '/messages', '/settings', '/my-profile', '/schedule',
  '/calendar-import', '/clients', '/work', '/performance', '/payouts',
  '/analytics', '/notifications', '/payments', '/projects', '/post-lead',
  '/my-trades', '/workforce',
];

// Whole surfaces render only for a particular ACCOUNT STATE, and a sweep that
// visits each route once with one fixture never sees them. That is not a
// hypothetical: the Settings "Fully Verified" card, the Payouts "Account
// Active" banner and the Pro upgrade gate were each a full-strength teal fill
// with teal text on it — 1.00:1 — and this sweep reported /settings, /payouts
// and /search clean, because under the default fixture none of the three
// rendered at all.
//
// `verification_status` is the specific miss worth naming: the fixture set
// license_verified/abn_verified/is_identity_verified, which LOOKS verified, but
// VerificationCenter keys off verification_status and nothing set it.
const VARIANTS = [
  {
    name: 'pro-verified',
    profile: { verification_status: 'verified' },
    // Blanket {ok:true} left accountDetails.connected undefined, so both
    // branches of the Payouts banner were dead code to this sweep. Keys are
    // camelCase because that is what ConnectAccountDetails declares in
    // src/lib/stripe.ts — snake_case here made Payouts throw on
    // `requirements.currentlyDue.length` and render its error boundary.
    edge: {
      'stripe-connect-account': {
        connected: true, payouts: [],
        balance: { available: 6590, pending: 450 },
        bankAccount: { last4: '4321', bankName: 'Test Bank', currency: 'aud' },
        account: {
          chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true,
          requirements: { currentlyDue: [], pastDue: [] },
        },
      },
    },
    routes: ['/settings', '/payouts', '/dashboard'],
    tabs: ['Verify', 'Pay', 'Notify', 'Pro', 'Security'],
  },
  {
    name: 'free-unverified',
    // onboarding_completed stays true: the ROUTER keys off it and bounces to
    // /onboarding when false, so every route in this variant measured nothing.
    // The checklist keys off onboarding_stage, which is what we actually want low.
    profile: {
      verification_status: 'pending', subscription_tier: 'free', is_premium: false,
      onboarding_stage: 1, onboarding_completed: true,
      stripe_connect_onboarding_complete: false, stripe_connect_account_id: null,
    },
    edge: {
      'stripe-connect-account': {
        connected: true, payouts: [],
        balance: { available: 0, pending: 0 }, bankAccount: null,
        account: {
          chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false,
          requirements: { currentlyDue: ['external_account'], pastDue: [] },
        },
      },
    },
    routes: ['/settings', '/payouts', '/dashboard', '/search', '/leads'],
    tabs: ['Verify', 'Pay'],
  },
];

const VIEWPORTS = [
  { name: '390', width: 390, height: 844, mobile: true },
  { name: '1440', width: 1440, height: 900, mobile: false },
];

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = [
  b64url({ alg: 'HS256', typ: 'JWT' }),
  b64url({ sub: UID, aud: 'authenticated', role: 'authenticated', exp, email: 'sweep@local' }),
  'sig',
].join('.');
const user = {
  id: UID, aud: 'authenticated', role: 'authenticated', email: 'sweep@local',
  email_confirmed_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' },
  user_metadata: {}, identities: [], phone: '',
};
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: exp, refresh_token: 'r', user };

// ── measurement, runs inside the page ───────────────────────────────────────
const MEASURE = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });

  // The whole point: resolve what is ACTUALLY painted behind the glyphs by
  // walking ancestors and compositing until something opaque turns up.
  //
  // Gradients need care. `bg-gradient-to-r from-ct-teal to-ct-teal` paints
  // through background-IMAGE, so backgroundColor is transparent and a naive
  // walk reads straight past it to the card underneath — reporting ink-on-teal
  // (10:1, correct) as ink-on-surface (1.15:1, a bug that isn't there). So
  // pull the colour stops out of the gradient and treat each as a candidate
  // fill. Text has to be readable over every stop, because it sits over all of
  // them, so the worst stop is the one that counts.
  const stops = (bgImage) => {
    if (!bgImage || bgImage === 'none' || !bgImage.includes('gradient')) return [];
    return (bgImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter((c) => c && c.a > 0);
  };

  const effectiveBg = (el) => {
    const stack = [];
    let n = el, gradient = null;
    while (n && n !== document.documentElement.parentElement) {
      const cs = getComputedStyle(n);
      const g = stops(cs.backgroundImage);
      if (g.length && !gradient) gradient = g;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      // An opaque gradient hides everything behind it; stop walking.
      if (g.length && g.every((s) => s.a === 1)) break;
      n = n.parentElement;
    }
    let acc = stack.length ? stack.pop() : { r: 255, g: 255, b: 255, a: 1 };
    while (stack.length) acc = over(stack.pop(), acc);
    // Candidates: the solid stack, plus each gradient stop over it.
    const candidates = gradient
      ? gradient.map((s) => (s.a < 1 ? over(s, acc) : s))
      : [acc];
    return { candidates, gradient: !!gradient };
  };

  const out = [];
  let checked = 0;
  // `body *`, not `main *`. Modals, toasts and sheets all render outside main;
  // scoping to main is how an entire class of surface went unmeasured.
  for (const el of document.querySelectorAll('body *')) {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    // An inactive control is exempt from 1.4.3 and SHOULD read as unavailable.
    // Judged from the live element, not from a class name — the mistake that
    // once made check:ink skip most of the app's buttons.
    if (el.closest('[disabled],[aria-disabled="true"]')) continue;

    const fg = parse(cs.color);
    if (!fg || fg.a === 0) continue;
    const { candidates, gradient } = effectiveBg(el);
    checked++;

    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    // Worst stop wins: the text sits over the whole gradient, so it has to
    // clear AA against every part of it.
    let got = Infinity, bg = candidates[0], fgc = fg;
    for (const c of candidates) {
      const f = fg.a < 1 ? over(fg, c) : fg;
      const r2 = ratio(f, c);
      if (r2 < got) { got = r2; bg = c; fgc = f; }
    }
    if (got < need) {
      out.push({
        text: own.slice(0, 46),
        fg: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Math.round(got * 100) / 100, need, px: Math.round(px), gradient,
        cls: (el.className || '').toString().slice(0, 120),
      });
    }
  }
  return { checked, bodyEls: document.querySelectorAll('body *').length, fails: out };
};

// Buttons likely to open something. Deliberately broad, and matched ANYWHERE
// in the label rather than at the start: anchoring to the start missed "Bulk
// Add Slots" and "Sync Google Calendar", which is most of a route's dialogs.
// A trigger that opens nothing costs one wasted click and is filtered out
// below; a trigger missed costs a whole surface.
const TRIGGER_RE = /\b(new|add|create|edit|invite|upload|view|manage|book|request|send|post|complete|unlock|upgrade|change|set|connect|sync|withdraw|pay|approve|dispute|report|share|filter|export|import|schedule|assign|resend|show)\b/i;

// An error boundary renders a tidy little page with a button on it and no
// contrast failures whatsoever. Reporting that as a pass is the same silent
// zero this sweep exists to stop.
const CRASHED_RE = /reload page|something went wrong|unexpected error/i;

const findings = [];
// Prefer an explicit path, then the preinstalled sandbox binary IF it is
// actually there, then let Playwright resolve its own. Hard-coding the sandbox
// path breaks on a CI runner, where `playwright install` puts it elsewhere.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath = process.env.CHROMIUM_PATH
  || (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const measurePage = async (page, route, vp, surface) => {
  const res = await page.evaluate(MEASURE);
  // Zero failures on a blank page is not a pass. This is the check that turns
  // "nothing found" into something worth believing.
  if (res.bodyEls < 20) {
    findings.push({ route, vp: vp.name, surface, kind: 'BLANK', detail: `body rendered ${res.bodyEls} elements` });
    return res;
  }
  for (const f of res.fails) findings.push({ route, vp: vp.name, surface, kind: 'contrast', ...f });
  return res;
};

// Passes, not a hard-coded pair: the variants below are extra authenticated
// passes over a small route subset, each with its own account state.
const PASSES = [
  { name: 'public', authed: false, routes: PUBLIC_ROUTES, variant: null },
  { name: 'app', authed: true, routes: APP_ROUTES, variant: null },
  ...VARIANTS.map((v) => ({ name: v.name, authed: true, routes: v.routes, variant: v })),
];

for (const vp of VIEWPORTS) {
  for (const { authed, routes, variant } of PASSES) {
    const list = ONLY ? routes.filter((r) => ONLY.includes(r)) : routes;
    if (!list.length) continue;
    const activeProfile = variant ? { ...tradieProfile, ...variant.profile } : tradieProfile;
    const activeEdge = variant?.edge ?? {};

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.mobile, isMobile: vp.mobile, deviceScaleFactor: vp.mobile ? 3 : 1,
    });
    if (authed) {
      await ctx.addInitScript(
        ([r, s]) => localStorage.setItem(`sb-${r}-auth-token`, JSON.stringify(s)), [REF, session]);
    }

    await ctx.route('**://*.supabase.co/**', async (route) => {
      const url = route.request().url();
      const wantsOne = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object');
      let body;
      if (url.includes('/auth/v1/user')) body = authed ? user : { error: 'no session' };
      else if (url.includes('/auth/v1/token')) body = authed ? session : { error: 'no session' };
      else if (url.includes('/functions/v1/')) {
        const fn = url.split('/functions/v1/')[1].split(/[?/]/)[0];
        body = activeEdge[fn] ?? { ok: true };
      } else if (url.includes('/rest/v1/rpc/')) body = 0;
      else {
        const t = (url.match(/\/rest\/v1\/([a-z_]+)/) || [])[1];
        // The signed-in profile has to come from the variant, not the fixture,
        // or every variant renders as the default persona.
        let rows = t === 'profiles'
          ? [activeProfile, ...(TABLES.profiles ?? []).slice(1)]
          : TABLES[t] ?? [];
        const qs = new URLSearchParams(url.split('?')[1] || '');
        for (const [col, raw] of qs.entries()) {
          if (['select', 'order', 'limit', 'offset'].includes(col)) continue;
          if (raw.startsWith('eq.')) {
            const w = raw.slice(3);
            rows = rows.filter((r) => r[col] === undefined || String(r[col]) === w);
          }
        }
        body = wantsOne ? (rows[0] ?? (t === 'profiles' ? activeProfile : {})) : rows;
      }
      const n = Array.isArray(body) ? body.length : 1;
      await route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*', 'content-range': `0-${Math.max(n - 1, 0)}/${n}` },
        body: JSON.stringify(body),
      });
    });
    await ctx.route('**://maps.googleapis.com/**', (r) => r.abort());
    await ctx.route('**://fonts.googleapis.com/**', (r) => r.abort());
    await ctx.route('**://js.stripe.com/**', (r) => r.abort());

    for (const path of list) {
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 25000 });
        // Poll for content rather than sleeping. Several routes pull scripts
        // that are blocked here and stall first paint; a flat wait reported
        // them as blank when they render fine.
        await page.waitForFunction(
          () => document.querySelectorAll('body *').length > 20, null, { timeout: 15000 },
        ).catch(() => {});
        await page.waitForTimeout(900);

        const landed = new URL(page.url()).pathname;
        if (landed !== path) {
          // A public route bouncing to /login means it is not public; an app
          // route bouncing means the fake session did not take. Either way the
          // page we meant to measure was not measured, and saying so beats a
          // silent zero.
          findings.push({ route: path, vp: vp.name, surface: 'page', kind: 'redirected', detail: `→ ${landed}` });
          await page.close();
          continue;
        }

        const crashed = await page.evaluate(
          (re) => new RegExp(re, 'i').test(document.body.innerText || ''),
          CRASHED_RE.source,
        );
        if (crashed) {
          findings.push({ route: path, vp: vp.name, surface: 'page', kind: 'CRASHED', detail: 'error boundary rendered' });
          await page.close();
          continue;
        }

        // Findings carry the pass name so a variant-only surface is not
        // mistaken for a regression on the default one, and so the baseline
        // keys them apart.
        const tag = variant ? `page[${variant.name}]` : 'page';
        const res = await measurePage(page, path, vp, tag);
        let opened = 0;

        // Tabbed pages hide most of their surfaces behind a tab that no
        // trigger word matches: "Verify" and "Pay" are nouns here, not verbs.
        // The Settings verification card lived behind exactly that.
        if (variant?.tabs && res.bodyEls >= 20) {
          for (const label of variant.tabs) {
            const tab = await page.$(`button:visible:has-text("${label}")`);
            if (!tab) continue;
            try {
              await tab.click({ timeout: 1500 });
              await page.waitForTimeout(650);
              await measurePage(page, path, vp, `tab:${label}[${variant.name}]`);
            } catch { /* tab not clickable in this state — nothing to measure */ }
          }
        }

        if (authed && res.bodyEls >= 20) {
          const triggers = await page.$$('button:visible, [role="button"]:visible');
          const before = await page.evaluate(() => document.querySelectorAll('body *').length);
          for (const t of triggers.slice(0, 40)) {
            let label = '';
            try { label = ((await t.innerText()) || '').trim().replace(/\s+/g, ' '); } catch { continue; }
            if (!label || !TRIGGER_RE.test(label)) continue;
            try {
              await t.click({ timeout: 1500 });
              await page.waitForTimeout(550);
              // Did a modal actually appear? A fixed full-bleed overlay is how
              // every dialog in this app renders, Modal.tsx and hand-rolled
              // alike. Compare against the resting DOM so a no-op click is not
              // measured twice as if it were a new surface.
              const isOpen = await page.evaluate((n) => {
                const grown = document.querySelectorAll('body *').length > n + 5;
                const overlay = [...document.querySelectorAll('body > div *, body > div')].some((e) => {
                  const cs = getComputedStyle(e);
                  const r = e.getBoundingClientRect();
                  return cs.position === 'fixed' && r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.4;
                });
                return grown && overlay;
              }, before);
              if (isOpen) {
                opened++;
                await measurePage(page, path, vp, `modal: ${label.slice(0, 40)}`);
              }
              await page.keyboard.press('Escape').catch(() => {});
              await page.waitForTimeout(250);
            } catch { /* trigger vanished or was covered — not a finding */ }
          }
        }
        process.stderr.write(`  ${path} @${vp.name}: ${res.fails.length} fail / ${res.checked} text nodes`
          + (authed ? `, ${opened} modal(s)\n` : '\n'));
      } catch (e) {
        findings.push({ route: path, vp: vp.name, surface: 'page', kind: 'error', detail: String(e).slice(0, 140) });
      }
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();

// ── report ──────────────────────────────────────────────────────────────────
const broken = findings.filter((f) => f.kind !== 'contrast');
const contrast = findings.filter((f) => f.kind === 'contrast');

// Group by the offending colour pair, so the fix list is per-component rather
// than per-node — one bad class can produce fifty findings.
const groups = new Map();
for (const f of contrast) {
  const key = `${f.fg} on ${f.bg}`;
  if (!groups.has(key)) groups.set(key, { ratio: f.ratio, need: f.need, gradient: f.gradient, hits: [] });
  groups.get(key).hits.push(f);
}

// Identity is route + kind, deliberately NOT the viewport or the detail
// string: a route that crashes at one width and redirects at the other is the
// same unmeasured route, and "body rendered 14 elements" would churn on any
// unrelated edit. Tight enough that a newly-unmeasurable route surfaces.
const keyOf = (b) => `${b.route}|${b.kind}`;

if (UPDATE_BASELINE) {
  const keys = [...new Set(broken.map(keyOf))].sort();
  writeFileSync(BASELINE_FILE, JSON.stringify({
    note: 'Routes this harness cannot measure. Contrast failures are never baselined.',
    routes: keys,
  }, null, 2) + '\n');
  console.log(`\nBaseline written — ${keys.length} unmeasurable route(s) in ${BASELINE_FILE}.`);
  console.log('These no longer fail CI. A route that newly stops rendering will.\n');
  process.exit(0);
}

let known = new Set();
if (USE_BASELINE && existsSync(BASELINE_FILE)) {
  known = new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).routes ?? []);
}
const freshBroken = USE_BASELINE ? broken.filter((b) => !known.has(keyOf(b))) : broken;

if (broken.length) {
  const shown = USE_BASELINE ? freshBroken : broken;
  const skipped = broken.length - freshBroken.length;
  if (shown.length) {
    console.error(`\nRoutes that could not be measured (${shown.length}):`);
    for (const b of shown) console.error(`  ${b.route} @${b.vp}  ${b.kind}: ${b.detail}`);
  }
  if (skipped) console.error(`\n${skipped} unmeasurable route/viewport result(s) known and baselined.`);
}

if (!groups.size) {
  const variantSurfaces = VARIANTS.reduce((n, v) => n + v.routes.length * (1 + (v.tabs?.length ?? 0)), 0);
  console.log(`\nNo AA contrast failures. ${PUBLIC_ROUTES.length} public + ${APP_ROUTES.length} app routes, `
    + `plus ${VARIANTS.length} account-state variant(s) over ${variantSurfaces} route/tab surface(s), `
    + 'both viewports, modals opened.');
  if (freshBroken.length) {
    console.error(`\nFailing on ${freshBroken.length} newly unmeasurable route result(s) — a route that stops`);
    console.error('rendering is exactly the blind spot this sweep exists to close. If the change');
    console.error('is deliberate: npm run check:contrast:baseline');
  }
  process.exit(freshBroken.length ? 1 : 0);
}

console.error(`\n${contrast.length} AA failure(s) in ${groups.size} colour pair(s):\n`);
for (const [pair, g] of [...groups].sort((a, b) => a[1].ratio - b[1].ratio)) {
  console.error(`  ${pair} — ${g.ratio}:1 (needs ${g.need})${g.gradient ? ' [gradient]' : ''}  ×${g.hits.length}`);
  const seen = new Set();
  for (const h of g.hits) {
    const k = `${h.route}|${h.surface}|${h.cls}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.error(`      ${h.route} @${h.vp} · ${h.surface}`);
    console.error(`        "${h.text}"  ${h.px}px`);
    if (h.cls) console.error(`        ${h.cls}`);
  }
  console.error('');
}
process.exit(1);
