import { defineConfig, devices } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Navigability audit config — separate from playwright.config.ts on purpose.
//
// The normal e2e config runs against whatever .env points at, which is
// PRODUCTION. This crawl signs in and walks every page in the app, so it runs
// against the TEST Supabase project from .env.e2e instead. Nothing it does can
// touch real customer data.
//
//   npm run audit:nav
//
// Personas become Playwright projects, each with its own storage state, so the
// spec can ask `testInfo.project.name` who it is currently pretending to be.
// ─────────────────────────────────────────────────────────────────────────────

for (const file of ['.env.e2e', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const E = process.env;
const PROD_REF = 'uoqygmizupdpanplpvor';

// Which backend the dev server talks to.
//   default        — the TEST project from .env.e2e
//   NAV_TARGET=app — whatever .env points at, which is production. Read-only by
//                    construction (see navigability.spec.ts), but opt in on
//                    purpose: NAV_ALLOW_PROD=1.
const target = E.NAV_TARGET === 'app'
  ? { url: E.VITE_SUPABASE_URL, key: E.VITE_SUPABASE_ANON_KEY }
  : { url: E.E2E_SUPABASE_URL, key: E.E2E_SUPABASE_ANON_KEY };

if (!target.url || !target.key) {
  throw new Error('audit:nav has no Supabase target — set E2E_SUPABASE_URL/ANON_KEY, or NAV_TARGET=app with .env present');
}
if (target.url.includes(PROD_REF) && E.NAV_ALLOW_PROD !== '1') {
  throw new Error(
    'audit:nav is pointed at PRODUCTION. The crawl only reads, but say so explicitly:\n' +
    '  NAV_ALLOW_PROD=1 NAV_TARGET=app npm run audit:nav',
  );
}

// A persona is crawled only if it has credentials. Missing ones are reported as
// a coverage gap rather than quietly narrowing the audit.
// E2E_* accounts live in the test project only — they are meaningless against
// any other backend, so they are not used as a fallback when the target changes.
const e2eTarget = E.NAV_TARGET !== 'app';
export const PERSONAS = {
  client: {
    email: E.NAV_CLIENT_EMAIL || (e2eTarget ? E.E2E_CLIENT_EMAIL : undefined),
    password: E.NAV_CLIENT_PASSWORD || (e2eTarget ? E.E2E_CLIENT_PASSWORD : undefined),
  },
  tradie: {
    email: E.NAV_TRADIE_EMAIL || (e2eTarget ? E.E2E_TRADIE_EMAIL : undefined),
    password: E.NAV_TRADIE_PASSWORD || (e2eTarget ? E.E2E_CLIENT_PASSWORD : undefined),
  },
};
const authed = (p: keyof typeof PERSONAS) => Boolean(PERSONAS[p].email && PERSONAS[p].password);

const desktop = devices['Desktop Chrome'];
const mobile = devices['iPhone 13'];

// Sandboxes and CI images often ship a pinned Chromium that does not match the
// build @playwright/test wants, and block the download that would fix it. Opt in
// with PW_CHROMIUM_PATH; hardcoding a path would be wrong everywhere else.
//
// browserName comes along for the ride on purpose. devices['iPhone 13'] carries
// defaultBrowserType: 'webkit', so the mobile personas would otherwise try to
// launch WebKit from a Chromium binary and die at startup. Emulating iPhone
// metrics under Chromium is the normal fallback when WebKit isn't available;
// without PW_CHROMIUM_PATH the projects keep their real engines.
const engine = E.PW_CHROMIUM_PATH
  ? { browserName: 'chromium' as const, launchOptions: { executablePath: E.PW_CHROMIUM_PATH } }
  : {};

/** anon needs no sign-in; the rest depend on the setup project. */
function persona(name: string, device: typeof desktop, storageState?: string) {
  return {
    name,
    // testMatch matters: testDir is ./e2e, so without it every persona also ran
    // auth.spec/public-pages.spec/search-flow.spec. auth.spec submits login forms
    // with deliberately wrong credentials, which is neither a navigability
    // finding nor the "strictly read-only" crawl this config promises.
    testMatch: /navigability\.spec\.ts/,
    use: { ...device, ...engine, ...(storageState ? { storageState } : {}) },
    ...(storageState ? { dependencies: ['setup'] } : {}),
  };
}

export default defineConfig({
  testDir: './e2e',
  // Deliberately serial-ish: the crawl visits ~50 URLs per persona against one
  // dev server. Hammering it produces timeouts that read as navigation bugs.
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'audit-findings/nav/raw-results.json' }],
  ],
  outputDir: 'audit-findings/nav/artifacts',
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    ...(authed('client') || authed('tradie') ? [{ name: 'setup', testMatch: /nav-auth\.setup\.ts/ }] : []),
    persona('anon-desktop', desktop),
    persona('anon-mobile', mobile),
    ...(authed('client') ? [persona('client-desktop', desktop, '.auth/client.json'), persona('client-mobile', mobile, '.auth/client.json')] : []),
    ...(authed('tradie') ? [persona('tradie-desktop', desktop, '.auth/tradie.json'), persona('tradie-mobile', mobile, '.auth/tradie.json')] : []),
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000,
    // Point the app at the TEST project. Vite picks VITE_-prefixed vars up from
    // the environment, and these win over the .env file on disk.
    env: {
      VITE_SUPABASE_URL: target.url,
      VITE_SUPABASE_ANON_KEY: target.key,
    },
  },
});
