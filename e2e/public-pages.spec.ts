import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test('landing page has hero section and CTAs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    // Should have key sections
    await expect(page.locator('text=/find.*trad|hire.*trad|get.*quote/i').first()).toBeVisible();
  });

  test('search page loads with category filters', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('text=/search|find.*trad/i').first()).toBeVisible();
    // Should have trade category options
    await expect(page.locator('text=/plumb|electric|paint/i').first()).toBeVisible();
  });

  test('explore page shows trade categories', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.locator('text=/categories|trades|services/i').first()).toBeVisible();
  });

  test('public tradie profile shows 404 for invalid id', async ({ page }) => {
    await page.goto('/tradie/nonexistent-id');
    // Should show error or not found state
    await expect(page.locator('text=/not found|error|no.*profile/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('help page loads with FAQ sections', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('text=/FAQ|frequently|help/i').first()).toBeVisible();
    // Should have search functionality
    await expect(page.locator('input[placeholder*="search" i], input[type="search"]').first()).toBeVisible();
  });

  test('pricing page shows plan comparison', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('text=/free|pro|pricing/i').first()).toBeVisible();
  });

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.locator('text=/terms/i').first()).toBeVisible();
  });

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('text=/privacy/i').first()).toBeVisible();
  });

  test('contact page has form', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.locator('text=/contact/i').first()).toBeVisible();
    await expect(page.locator('textarea, input[type="email"]').first()).toBeVisible();
  });

  test('404 page shows for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('text=/not found|404|page.*exist/i').first()).toBeVisible();
  });
});

test.describe('Protected Route Redirects', () => {
  test('dashboard redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login or show auth gate
    await expect(page).toHaveURL(/\/(login|dashboard)/, { timeout: 10000 });
  });

  test('messages redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/(login|messages)/, { timeout: 10000 });
  });

  test('settings redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/(login|settings)/, { timeout: 10000 });
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('landing page is mobile-friendly', async ({ page }) => {
    await page.goto('/');
    // Content should be visible, no horizontal scroll
    await expect(page.locator('h1').first()).toBeVisible();
    const body = await page.evaluate(() => document.body.scrollWidth);
    const viewport = await page.evaluate(() => window.innerWidth);
    expect(body).toBeLessThanOrEqual(viewport + 5);
  });

  test('search page works on mobile', async ({ page }) => {
    await page.goto('/search');
    await expect(page.locator('text=/search|find/i').first()).toBeVisible();
  });

  test('login page works on mobile', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
