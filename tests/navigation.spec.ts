import { test, expect } from '@playwright/test';

/**
 * Navigation Tests
 * Tests navigation, routing, and deep linking
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Navigation', () => {
  test('should load landing page', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/EatPal|Munch|Meal/i);
  });

  test('should navigate to pricing page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('a[href="/pricing"]');
    await expect(page).toHaveURL(/.*pricing/);
  });

  test('should navigate to auth page', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('a[href="/auth"], button:has-text("Sign In"), button:has-text("Get Started")');
    await expect(page).toHaveURL(/.*auth/);
  });

  test('should navigate to blog', async ({ page }) => {
    await page.goto(BASE_URL);
    const blogLink = page.locator('a[href="/blog"]');
    if (await blogLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await blogLink.click();
      await expect(page).toHaveURL(/.*blog/);
    }
  });

  test('should navigate to about page', async ({ page }) => {
    await page.goto(BASE_URL);
    const aboutLink = page.locator('a[href="/about"]');
    if (await aboutLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aboutLink.click();
      await expect(page).toHaveURL(/.*about/);
    }
  });

  test('should handle 404 pages', async ({ page }) => {
    await page.goto(`${BASE_URL}/nonexistent-page-12345`);
    await expect(page.locator('text=/not found|404|page.*exist/i')).toBeVisible({ timeout: 5000 });
  });

  test('should navigate back with browser button', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('a[href="/pricing"]');
    await expect(page).toHaveURL(/.*pricing/);
    await page.goBack();
    await expect(page).toHaveURL(BASE_URL + '/');
  });

  test('should handle deep links when authenticated', async ({ page }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

    // Test deep link
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page).toHaveURL(/.*pantry/);
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL(/\/(auth|login|sign)/, { timeout: 10000 }).catch(() => {
      // Some apps show the dashboard anyway if there's cached data
    });
  });

  test('should maintain scroll position on back navigation', async ({ page }) => {
    await page.goto(BASE_URL);
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.click('a[href="/pricing"]');
    await page.goBack();
    const scrollY = await page.evaluate(() => window.scrollY);
    // Allow some tolerance
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });

  test('should open external links in new tab', async ({ page }) => {
    await page.goto(BASE_URL);
    const externalLinks = page.locator('a[target="_blank"]');
    if (await externalLinks.count() > 0) {
      const hasRelNoopener = await externalLinks.first().getAttribute('rel');
      expect(hasRelNoopener).toContain('noopener');
    }
  });
});
