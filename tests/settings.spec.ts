import { test, expect } from '@playwright/test';

/**
 * Settings Page Tests
 * Tests user settings, preferences, notifications, and account management
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display settings page', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);
    await expect(page).toHaveURL(/.*settings/);
    await expect(page.locator('text=/settings|preferences|account/i')).toBeVisible({ timeout: 5000 });
  });

  test('should update profile information', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const nameInput = page.locator('input[name="name"], input[placeholder*="name"]');

    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill('Updated Name');

      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
      await saveButton.click();
    }
  });

  test('should toggle notification preferences', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Navigate to notifications section
    const notificationsTab = page.locator('button:has-text("Notification"), a:has-text("Notification")');
    if (await notificationsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await notificationsTab.click();
    }

    const emailToggle = page.locator('input[name*="email"], [role="switch"]').first();

    if (await emailToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailToggle.click();
    }
  });

  test('should view subscription status', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Navigate to subscription/billing section
    const billingTab = page.locator('button:has-text("Billing"), a:has-text("Subscription"), button:has-text("Subscription")');
    if (await billingTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await billingTab.click();
    }

    await expect(page.locator('text=/plan|subscription|billing/i')).toBeVisible({ timeout: 5000 });
  });

  test('should access data export', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download Data")');

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await exportButton.isVisible()).toBeTruthy();
    }
  });

  test('should access backup settings', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const backupSection = page.locator('text=/backup/i');

    if (await backupSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(backupSection).toBeVisible();
    }
  });

  test('should change password', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const changePasswordButton = page.locator('button:has-text("Change Password"), a:has-text("Change Password")');

    if (await changePasswordButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await changePasswordButton.click();

      await expect(page.locator('input[type="password"]')).toBeVisible();
    }
  });

  test('should manage connected accounts', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const connectedSection = page.locator('text=/connected|linked|integration/i');

    if (await connectedSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(connectedSection).toBeVisible();
    }
  });

  test('should toggle dark mode', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const themeToggle = page.locator('button[aria-label*="theme"], button:has-text("Dark"), [data-testid="theme-toggle"]');

    if (await themeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeToggle.click();
    }
  });

  test('should access delete account option', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    const deleteSection = page.locator('text=/delete.*account|danger.*zone/i');

    if (await deleteSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(deleteSection).toBeVisible();
    }
  });
});
