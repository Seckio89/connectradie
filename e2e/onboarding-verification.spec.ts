import { test, expect, type Page } from '@playwright/test';

/**
 * Tradie onboarding with and without the licence step.
 *
 * Needs a live project and a fresh, confirmed account per run, so it is gated
 * on E2E_ONBOARD_EMAIL / E2E_ONBOARD_PASSWORD (a confirmed user who has NOT
 * completed onboarding) and skips otherwise — the same posture as the money
 * e2e scripts. Run twice with two fresh accounts for the two paths, or reset
 * the account's onboarding_completed flag between runs.
 *
 *   E2E_ONBOARD_EMAIL=… E2E_ONBOARD_PASSWORD=… E2E_ONBOARD_TRADE=Plumber npx playwright test e2e/onboarding-verification.spec.ts
 *   E2E_ONBOARD_EMAIL=… E2E_ONBOARD_PASSWORD=… E2E_ONBOARD_TRADE=Cleaner npx playwright test e2e/onboarding-verification.spec.ts
 */

const EMAIL = process.env.E2E_ONBOARD_EMAIL;
const PASSWORD = process.env.E2E_ONBOARD_PASSWORD;
const TRADE = process.env.E2E_ONBOARD_TRADE || 'Plumber';
const LICENSED = !['Cleaner', 'Handyman', 'Painter', 'Landscaper', 'Lawn Mowing', 'Removalist'].includes(TRADE);

test.describe('tradie onboarding → verification steps', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_ONBOARD_EMAIL and E2E_ONBOARD_PASSWORD (a confirmed, un-onboarded account) to run');

  async function reachBusinessDetails(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL!);
    await page.fill('input[type="password"]', PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/onboarding/, { timeout: 20_000 });

    await page.getByRole('button', { name: /tradie|i'm a tradie|offer services/i }).first().click();
    await page.getByRole('button', { name: /construction|trades/i }).first().click();
    await page.getByRole('button', { name: /own business|run my own/i }).first().click();

    await expect(page.getByRole('heading', { name: /set up your business/i })).toBeVisible();
  }

  test(`${TRADE}: business details show the ABN field${LICENSED ? ' and the licence step follows' : ' and the licence step is skipped'}`, async ({ page }) => {
    await reachBusinessDetails(page);

    await page.getByPlaceholder(/smith's plumbing/i).fill(`E2E ${TRADE} Services`);
    await page.getByPlaceholder(/search for your trade/i).fill(TRADE);
    await page.getByRole('option', { name: TRADE }).first().click().catch(async () => {
      await page.getByText(TRADE, { exact: true }).first().click();
    });

    // ABN field: live checksum feedback, no network needed for the invalid case.
    const abn = page.getByLabel('ABN');
    await expect(abn).toBeVisible();
    await abn.fill('51824753557');
    await expect(page.getByText(/isn't a valid ABN/i)).toBeVisible();
    await abn.fill('51824753556');
    await expect(page.getByText(/isn't a valid ABN/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /verify abn/i })).toBeEnabled();

    await page.getByPlaceholder(/start typing your address/i).fill('1 Martin Place, Sydney');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await page.getByRole('button', { name: /create business profile/i }).click();

    if (LICENSED) {
      await expect(page.getByRole('heading', { name: /your trade licence/i })).toBeVisible({ timeout: 20_000 });
      // Consent gate first: explicit Agree, and a type-it-myself alternative.
      await expect(page.getByRole('button', { name: /agree and continue/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /type the details myself/i })).toBeVisible();
      // Skipping is always possible — onboarding never blocks on a licence.
      await page.getByRole('button', { name: /type the details myself/i }).click();
      await expect(page.getByLabel(/licence number/i)).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: /do this later/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    } else {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: /your trade licence/i })).toHaveCount(0);
    }
  });
});
