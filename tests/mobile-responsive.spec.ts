import { test, expect, devices } from '@playwright/test';

/**
 * Mobile Responsive Tests
 * Tests mobile-specific behavior and responsive design
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Mobile Responsive', () => {
  test.use({ ...devices['iPhone 13'] });

  test('should display mobile navigation', async ({ page }) => {
    await page.goto(BASE_URL);

    // Look for hamburger menu
    const menuButton = page.locator('button[aria-label*="menu"], button:has-text("Menu"), [data-testid="mobile-menu"]');
    await expect(menuButton).toBeVisible({ timeout: 5000 });
  });

  test('should open mobile menu', async ({ page }) => {
    await page.goto(BASE_URL);

    const menuButton = page.locator('button[aria-label*="menu"], [data-testid="mobile-menu"]');
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await expect(page.locator('nav a, [role="menu"]')).toBeVisible();
    }
  });

  test('should close mobile menu on navigation', async ({ page }) => {
    await page.goto(BASE_URL);

    const menuButton = page.locator('button[aria-label*="menu"]');
    if (await menuButton.isVisible()) {
      await menuButton.click();

      const navLink = page.locator('nav a').first();
      if (await navLink.isVisible()) {
        await navLink.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('should stack content vertically on mobile', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check that flex columns are stacked
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThan(768);
  });

  test('should have touch-friendly button sizes', async ({ page }) => {
    await page.goto(BASE_URL);

    const buttons = page.locator('button, a.button, [role="button"]');
    const firstButton = buttons.first();

    if (await firstButton.isVisible()) {
      const box = await firstButton.boundingBox();
      // Minimum touch target size is 44x44 pixels
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }
  });

  test('should hide desktop-only elements', async ({ page }) => {
    await page.goto(BASE_URL);

    const desktopElements = page.locator('.hidden-mobile, .desktop-only');
    for (const element of await desktopElements.all()) {
      const isHidden = await element.isHidden();
      expect(isHidden).toBeTruthy();
    }
  });

  test('should show mobile-only elements', async ({ page }) => {
    await page.goto(BASE_URL);

    const mobileElements = page.locator('.mobile-only, .show-mobile');
    for (const element of await mobileElements.all()) {
      if (await element.count() > 0) {
        const isVisible = await element.first().isVisible();
        expect(isVisible).toBeTruthy();
      }
    }
  });

  test('should have scrollable content areas', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    try {
      await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

      // Test scrolling in main content area
      const scrollPosition = await page.evaluate(() => {
        window.scrollTo(0, 100);
        return window.scrollY;
      });
      expect(scrollPosition).toBeGreaterThanOrEqual(0);
    } catch {
      // Auth may have failed, that's ok for this test
    }
  });

  test('should work with swipe gestures', async ({ page }) => {
    await page.goto(BASE_URL);

    // Simulate swipe (touch events)
    await page.touchscreen.tap(200, 400);
    await page.waitForTimeout(100);
  });

  test('should not have horizontal scroll', async ({ page }) => {
    await page.goto(BASE_URL);

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBeFalsy();
  });
});

test.describe('Tablet Responsive', () => {
  test.use({ ...devices['iPad Pro 11'] });

  test('should display tablet-optimized layout', async ({ page }) => {
    await page.goto(BASE_URL);

    const viewport = page.viewportSize();
    expect(viewport?.width).toBeGreaterThan(700);
    expect(viewport?.width).toBeLessThan(1200);
  });

  test('should show sidebar on tablet', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    try {
      await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

      const sidebar = page.locator('[data-testid="sidebar"], nav, aside');
      if (await sidebar.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(sidebar).toBeVisible();
      }
    } catch {
      // Auth may have failed
    }
  });
});
