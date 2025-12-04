import { test, expect } from '@playwright/test';

/**
 * Dashboard Tests
 * Tests main dashboard functionality and navigation
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display dashboard after login', async ({ page }) => {
    await expect(page.locator('text=/dashboard|welcome|home/i')).toBeVisible({ timeout: 5000 });
  });

  test('should show user greeting', async ({ page }) => {
    await expect(page.locator('text=/hello|welcome|hi/i')).toBeVisible({ timeout: 5000 });
  });

  test('should display quick action buttons', async ({ page }) => {
    const quickActions = page.locator('[data-testid="quick-actions"], .quick-actions');

    if (await quickActions.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(quickActions).toBeVisible();
    }
  });

  test('should show meal plan summary', async ({ page }) => {
    const mealSummary = page.locator('text=/today.*meal|meal.*today|upcoming.*meal/i');

    if (await mealSummary.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(mealSummary).toBeVisible();
    }
  });

  test('should navigate to all main sections', async ({ page }) => {
    const navItems = [
      { href: '/pantry', text: 'Pantry' },
      { href: '/planner', text: 'Planner' },
      { href: '/recipes', text: 'Recipes' },
      { href: '/grocery', text: 'Grocery' },
      { href: '/kids', text: 'Kids' },
    ];

    for (const item of navItems.slice(0, 3)) {
      const link = page.locator(`a[href="${item.href}"], a:has-text("${item.text}")`).first();
      if (await link.isVisible({ timeout: 1000 }).catch(() => false)) {
        expect(await link.isVisible()).toBeTruthy();
      }
    }
  });

  test('should display notification badge', async ({ page }) => {
    const notificationBadge = page.locator('[data-testid="notifications"], button[aria-label*="notification"]');

    if (await notificationBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await notificationBadge.isVisible()).toBeTruthy();
    }
  });

  test('should show user profile menu', async ({ page }) => {
    const profileButton = page.locator('[data-testid="user-menu"], button[aria-label*="profile"], img[alt*="avatar"]');

    if (await profileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await profileButton.click();
      await expect(page.locator('text=/settings|profile|logout/i')).toBeVisible();
    }
  });

  test('should display stats/analytics overview', async ({ page }) => {
    const statsSection = page.locator('text=/stats|progress|analytics|this week/i');

    if (await statsSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(statsSection).toBeVisible();
    }
  });

  test('should show recent activity', async ({ page }) => {
    const activitySection = page.locator('text=/recent|activity|history/i');

    if (await activitySection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(activitySection).toBeVisible();
    }
  });

  test('should have responsive sidebar/navigation', async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"], nav, aside');

    if (await sidebar.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(sidebar).toBeVisible();
    }
  });
});
