import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Signs each persona in once and saves the session for the crawl to reuse.
//
// Filling the login form and clicking submit does NOT work here — React's
// synthetic handler does not fire from Playwright's synthesised events on this
// form. Calling supabase.auth directly through a dynamic import of the app's own
// client module does, and it is what the rest of the harness already relies on.
//
// Supabase keeps the session in localStorage, which Playwright's storageState
// captures under `origins` — so the saved file is a real signed-in session.
// ─────────────────────────────────────────────────────────────────────────────

import { PERSONAS } from '../playwright.nav.config';

async function signIn(page: import('@playwright/test').Page, email: string, password: string, file: string) {
  await page.goto('/login');
  // The dynamic import needs the module graph loaded, which /login guarantees.
  await page.waitForLoadState('networkidle');

  const error = await page.evaluate(
    async ([email, password]) => {
      const mod = await import('/src/lib/supabase.ts');
      const { data, error } = await mod.supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      return data.session ? null : 'no session returned';
    },
    [email, password] as const,
  );

  expect(error, `sign-in failed for ${email}`).toBeNull();

  // Wait for AuthContext to pick the session up and leave /login.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });

  mkdirSync('.auth', { recursive: true });
  await page.context().storageState({ path: file });
}

setup('authenticate as client', async ({ page }) => {
  const { email, password } = PERSONAS.client;
  setup.skip(!email || !password, 'no client credentials — set NAV_CLIENT_EMAIL / NAV_CLIENT_PASSWORD');
  await signIn(page, email!, password!, '.auth/client.json');
});

setup('authenticate as tradie', async ({ page }) => {
  const { email, password } = PERSONAS.tradie;
  setup.skip(!email || !password, 'no tradie credentials — set NAV_TRADIE_EMAIL / NAV_TRADIE_PASSWORD');
  await signIn(page, email!, password!, '.auth/tradie.json');
});
