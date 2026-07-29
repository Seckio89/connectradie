import { test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// The pub test, run against a real browser.
//
// scripts/check-navigability.mjs answers everything you can learn from source.
// This answers the rest: does the page actually render, can you tell where you
// are, and — the one that matters most — is there a way out. A page with no
// visible link to anywhere else is a dead end, and a dead end fails the pub test
// no matter how good the code behind it is.
//
//   npm run audit:nav
//
// STRICTLY READ-ONLY. It navigates by URL and reads the DOM. It never clicks
// anything that could submit, pay, send, release or delete. The allowlist below
// is the guarantee; do not widen it.
// ─────────────────────────────────────────────────────────────────────────────

const inventory = JSON.parse(
  execFileSync('node', ['scripts/check-navigability.mjs', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }),
) as {
  routes: Array<{
    path: string;
    component: string | null;
    redirect: string | null;
    dynamic: boolean;
    guard: 'protected' | 'public-only' | 'public';
    role: 'admin' | 'tradie' | 'client' | null;
  }>;
};

// Stand-in values for dynamic segments. The UUID is deliberately one that cannot
// exist: a deep link to a deleted job is exactly the case where an app strands
// someone, so "does it strand you" is the thing worth measuring.
const SAMPLE: Record<string, string> = {
  ':trade': 'plumber',
  ':locationSlug': 'sydney-nsw-2000',
  ':id': '00000000-0000-0000-0000-000000000000',
  ':jobId': '00000000-0000-0000-0000-000000000000',
  ':paymentId': '00000000-0000-0000-0000-000000000000',
  ':invoiceId': '00000000-0000-0000-0000-000000000000',
  ':token': 'not-a-real-token',
};

const fill = (path: string) =>
  path
    .split('/')
    .map((seg) => (seg.startsWith(':') ? SAMPLE[seg] ?? 'sample' : seg))
    .join('/');

type Persona = 'anon' | 'client' | 'tradie';
type Finding = {
  persona: string;
  viewport: string;
  route: string;
  check: string;
  rubric: string;
  detail: string;
};

const findings: Finding[] = [];

/** Which routes this persona is allowed to land on. */
function routesFor(persona: Persona) {
  return inventory.routes.filter((r) => {
    if (r.redirect) return false;
    if (r.guard === 'public') return true;
    if (persona === 'anon') return false;
    if (r.guard === 'public-only') return false;
    if (r.role === 'admin') return false; // no admin account in the test project
    if (r.role && r.role !== persona) return false;
    return true;
  });
}

/** A deep link with a made-up id is expected to show "not found", not a full page. */
const isSyntheticId = (path: string) =>
  path.includes(':id') || path.includes(':jobId') || path.includes(':paymentId') ||
  path.includes(':invoiceId') || path.includes(':token');

async function visit(page: Page, url: string) {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Network noise from a deliberately-missing record is not a nav defect.
    if (/favicon|404|Failed to load resource|PGRST116/i.test(t)) return;
    consoleErrors.push(t.slice(0, 200));
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  // Let lazy chunks and the auth boot settle.
  await page.waitForTimeout(400);
  return consoleErrors;
}

for (const persona of ['anon', 'client', 'tradie'] as const) {
  const routes = routesFor(persona);

  test.describe(`${persona}`, () => {
    // test.info(), not a testInfo parameter. Playwright reads a callback's first
    // parameter as a fixture request — it inspects the source text, so a plain
    // identifier is rejected outright since 1.59 — and the modifier callback no
    // longer receives testInfo as a second argument, so it arrives undefined.
    test.skip(() => !test.info().project.name.startsWith(persona), 'other persona');

    for (const route of routes) {
      test(`${route.path}`, async ({ page }, testInfo) => {
        const viewport = testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';
        const url = fill(route.path);
        const record = (check: string, rubric: string, detail: string) =>
          findings.push({ persona, viewport, route: route.path, check, rubric, detail });

        const consoleErrors = await visit(page, url);
        const landed = new URL(page.url()).pathname;

        // ── L1 — did anything render at all? ──────────────────────────────
        const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
        if (bodyText.length < 20) {
          record('L1', 'Where am I?', `blank page — ${bodyText.length} chars of visible text`);
        }
        if (await page.locator('text=/something went wrong|unexpected error/i').first().isVisible().catch(() => false)) {
          record('L1', 'Where am I?', 'error boundary rendered');
        }
        if (consoleErrors.length) {
          record('L1', 'Where am I?', `${consoleErrors.length} console error(s): ${consoleErrors[0]}`);
        }

        // ── L6 — bounced somewhere without saying why ─────────────────────
        if (landed !== url) {
          const explains = await page
            .locator('text=/sign in|log in|not allowed|no access|permission|complete.*profile/i')
            .first().isVisible().catch(() => false);
          record(
            'L6',
            'Where am I?',
            `redirected to ${landed}${explains ? ' (explained)' : ' with NO explanation on the destination'}`,
          );
        }

        // ── L2 — can you tell what page this is? ──────────────────────────
        const h1s = await page.locator('h1:visible').allInnerTexts();
        if (h1s.length === 0) {
          record('L2', 'Where am I?', 'no visible <h1>');
        } else if (h1s.length > 1) {
          record('L2', 'Where am I?', `${h1s.length} competing <h1>s: ${h1s.map((h) => h.trim()).join(' | ').slice(0, 120)}`);
        }
        const title = await page.title();
        if (!title || title === 'ConnecTradie') {
          record('L2', 'Where am I?', `browser tab reads "${title}" — no page name`);
        }

        // ── L3 — is there a way out? The dead-end check. ──────────────────
        const exits = await page.locator('a[href^="/"]:visible').count();
        const hubExit = await page
          .locator('a[href="/"]:visible, a[href="/dashboard"]:visible, a[href="/work"]:visible, a[href="/leads"]:visible')
          .count();
        const backButton = await page.locator('button:has-text("Back"), a:has-text("Back")').count();
        if (exits === 0 && backButton === 0) {
          record('L3', 'How do I get out?', 'DEAD END — no visible internal link and no back control');
        } else if (hubExit === 0 && backButton === 0) {
          record('L3', 'How do I get out?', `${exits} links but none to a hub (home/dashboard/work/leads) and no back control`);
        }

        // ── L4 — is the next step obvious? ────────────────────────────────
        const ctas = await page.locator('[class*="bg-emerald-500"]:visible, [class*="bg-emerald-600"]:visible').count();
        if (ctas > 3) {
          record('L4', 'What do I do next?', `${ctas} primary-styled buttons competing for attention`);
        }

        // ── L5 — phone ────────────────────────────────────────────────────
        if (viewport === 'mobile') {
          const { scroll, width } = await page.evaluate(() => ({
            scroll: document.body.scrollWidth,
            width: window.innerWidth,
          }));
          if (scroll > width + 5) {
            record('L5', 'Does it work on my phone?', `horizontal overflow — content ${scroll}px in a ${width}px viewport`);
          }

          // ⚠️ Tap-target measurement is ONLY meaningful under touch emulation.
          // The 44px floor in mobile-responsive.css is gated on
          // `@media (pointer: coarse)`, so a desktop browser merely resized to
          // 375px has no floor at all and will report hundreds of false
          // failures — this audit did exactly that once and "found" 376
          // undersized targets on /explore that were all 44px on a real phone.
          // The `mobile` project uses devices['iPhone 13'], which sets hasTouch,
          // so this path is correct. Do not measure this from *-desktop.
          const small = await page.evaluate(() => {
            // WCAG 2.5.8 has an explicit inline exception: a target sitting in a
            // sentence, sized by the surrounding line-height, is exempt. Without
            // this the audit reports every "Contact us" and mailto: in the Terms
            // and Privacy prose, and the only way to "fix" those is to wreck the
            // paragraph they live in. Standalone links and buttons still count.
            const inSentence = (el: Element): boolean => {
              const p = el.parentElement;
              if (!p) return false;
              if (!/^(P|LI|SPAN|EM|STRONG|LABEL|BLOCKQUOTE|TD|SMALL)$/.test(p.tagName)) return false;
              // Prose = the parent holds real text besides this link.
              const own = (el.textContent || '').trim();
              const all = (p.textContent || '').trim();
              return all.length > own.length + 1;
            };

            const out: string[] = [];
            for (const el of document.querySelectorAll('a, button, [role="button"]')) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (inSentence(el)) continue;
              if (r.height < 44) {
                out.push(`${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 24)}" ${Math.round(r.height)}px`);
              }
            }
            return out;
          });
          if (small.length) {
            record('L5', 'Does it work on my phone?', `${small.length} tap target(s) under 44px: ${small.slice(0, 3).join(', ')}`);
          }
        }

        // ── L8 — empty state, or just nothing? ────────────────────────────
        if (!isSyntheticId(route.path) && bodyText.length >= 20) {
          const looksEmpty = /no .{0,20}(jobs|leads|clients|messages|results|payments|notifications|quotes)|nothing here|get started/i.test(bodyText);
          if (looksEmpty) {
            const cta = await page.locator('a[href^="/"]:visible, button:visible').count();
            if (cta === 0) record('L8', 'What do I do next?', 'empty state with no call to action');
          }
        }

        mkdirSync(`audit-findings/nav/${testInfo.project.name}`, { recursive: true });
        await page.screenshot({
          path: `audit-findings/nav/${testInfo.project.name}/${route.path.replace(/[/:]/g, '_') || 'root'}.png`,
          fullPage: false,
        });
      });
    }
  });
}

// ── L7 — how many clicks to reach each page from the dashboard? ─────────────
//
// Walks the navigation chrome the way a person does, following only links that
// are actually rendered and visible. A route the graph says is reachable but
// that takes four clicks to find is, for pub-test purposes, not reachable.
for (const persona of ['client', 'tradie'] as const) {
  test(`${persona} — clicks to reach each page`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith(persona), 'other persona');
    test.setTimeout(120_000);

    const depth = new Map<string, number>([['/dashboard', 0]]);
    let frontier = ['/dashboard'];

    for (let hop = 1; hop <= 3 && frontier.length; hop++) {
      const next: string[] = [];
      for (const from of frontier) {
        await visit(page, from);
        const hrefs = await page.locator('a[href^="/"]:visible').evaluateAll((els) =>
          els.map((e) => (e as HTMLAnchorElement).getAttribute('href') || ''),
        );
        for (const raw of hrefs) {
          const path = raw.split('?')[0].split('#')[0];
          if (!path.startsWith('/') || depth.has(path)) continue;
          depth.set(path, hop);
          next.push(path);
        }
      }
      frontier = next;
    }

    const viewport = testInfo.project.name.endsWith('mobile') ? 'mobile' : 'desktop';
    for (const route of routesFor(persona)) {
      if (route.dynamic || route.guard === 'public') continue;
      const d = depth.get(route.path);
      if (d === undefined) {
        findings.push({
          persona, viewport, route: route.path, check: 'L7', rubric: 'Can I find it at all?',
          detail: 'not reachable by clicking within 3 hops of the dashboard',
        });
      } else if (d > 3) {
        findings.push({
          persona, viewport, route: route.path, check: 'L7', rubric: 'Can I find it at all?',
          detail: `${d} clicks from the dashboard`,
        });
      }
    }
  });
}

test.afterAll(async ({}, testInfo) => {
  if (!findings.length) return;
  mkdirSync('audit-findings/nav', { recursive: true });
  writeFileSync(
    `audit-findings/nav/findings-${testInfo.project.name}.json`,
    JSON.stringify(findings, null, 2),
  );
});
