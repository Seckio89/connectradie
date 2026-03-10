import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('landing page loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=ConnecTradie')).toBeVisible();
    await expect(page.locator('text=Sign In').first()).toBeVisible();
    await expect(page.locator('text=Sign Up').first()).toBeVisible();
  });

  test('login page renders with form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login shows validation error for empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    // Should stay on login page (not navigate)
    await expect(page).toHaveURL(/\/login/);
  });

  test('login shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');
    // Should show error message
    await expect(page.locator('text=/invalid|error|incorrect/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('register page renders with role selection', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Should have role-related content
    await expect(page.locator('text=/client|tradie|homeowner/i').first()).toBeVisible();
  });

  test('register shows validation for short password', async ({ page }) => {
    await page.goto('/register');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', '123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/register/);
  });

  test('navigation to login from register', async ({ page }) => {
    await page.goto('/register');
    const signInLink = page.locator('a[href="/login"], text=/sign in|log in/i').first();
    await signInLink.click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('navigation to register from login', async ({ page }) => {
    await page.goto('/login');
    const signUpLink = page.locator('a[href="/register"], text=/sign up|register/i').first();
    await signUpLink.click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('password reset link exists on login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=/forgot.*password|reset.*password/i').first()).toBeVisible();
  });
});
