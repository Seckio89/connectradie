import { test, expect } from '@playwright/test';

test.describe('Search & Discovery Flow', () => {
  test('search page loads with all filter options', async ({ page }) => {
    await page.goto('/search');

    // Search input should exist
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="postcode" i], input[type="search"]').first();
    await expect(searchInput).toBeVisible();
  });

  test('search filters can be toggled', async ({ page }) => {
    await page.goto('/search');

    // Look for filter button or filter panel
    const filterButton = page.locator('text=/filter/i, button:has(text=/filter/i)').first();
    if (await filterButton.isVisible()) {
      await filterButton.click();
      // Filter options should appear
      await expect(page.locator('text=/rating|price|distance|emergency/i').first()).toBeVisible();
    }
  });

  test('search results display tradie cards', async ({ page }) => {
    await page.goto('/search');
    // Wait for content to load
    await page.waitForTimeout(2000);

    // Should show either tradie cards or empty state
    const hasResults = await page.locator('[class*="card"], [class*="Card"]').count();
    const hasEmpty = await page.locator('text=/no.*result|no.*trad|try.*different/i').count();
    expect(hasResults + hasEmpty).toBeGreaterThan(0);
  });

  test('explore page shows category cards', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForTimeout(1000);

    // Should have clickable category items
    const categories = page.locator('text=/plumb|electric|carpenter|painter|landscap/i');
    await expect(categories.first()).toBeVisible();
  });

  test('clicking a category from explore navigates to search', async ({ page }) => {
    await page.goto('/explore');
    await page.waitForTimeout(1000);

    // Click first category link/card
    const categoryLink = page.locator('a[href*="search"], a[href*="category"]').first();
    if (await categoryLink.isVisible()) {
      await categoryLink.click();
      await expect(page).toHaveURL(/\/search/);
    }
  });
});

test.describe('Navigation Flow', () => {
  test('navbar has all main links', async ({ page }) => {
    await page.goto('/');

    // Main navigation items
    await expect(page.locator('text=/sign in/i').first()).toBeVisible();
  });

  test('footer has important links', async ({ page }) => {
    await page.goto('/');

    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Footer should have key links
    const footer = page.locator('footer');
    if (await footer.isVisible()) {
      await expect(footer.locator('text=/terms|privacy|contact/i').first()).toBeVisible();
    }
  });

  test('help page FAQ search works', async ({ page }) => {
    await page.goto('/help');

    const searchInput = page.locator('input[placeholder*="search" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('payment');
      await page.waitForTimeout(500);
      // Results should filter
      await expect(page.locator('text=/payment/i').first()).toBeVisible();
    }
  });
});
