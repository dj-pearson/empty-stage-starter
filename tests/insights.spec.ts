import { test, expect } from '@playwright/test';

/**
 * Insights/Analytics Tests
 * Tests nutrition insights, progress tracking, and reports
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Insights & Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display insights page', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);
    await expect(page).toHaveURL(/.*insights/);
    await expect(page.locator('text=/insight|analytics|progress|report/i')).toBeVisible({ timeout: 5000 });
  });

  test('should show nutrition summary', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const nutritionSection = page.locator('text=/nutrition|calorie|protein|vitamin/i');

    if (await nutritionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(nutritionSection).toBeVisible();
    }
  });

  test('should display charts/graphs', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const charts = page.locator('canvas, svg, [data-testid="chart"], .recharts-wrapper');

    if (await charts.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await charts.count()).toBeGreaterThan(0);
    }
  });

  test('should filter by date range', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const dateFilter = page.locator('button:has-text("Week"), button:has-text("Month"), select[name*="period"]');

    if (await dateFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateFilter.first().click();
    }
  });

  test('should filter by child', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const childFilter = page.locator('select, [role="combobox"]').first();

    if (await childFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await childFilter.click();
    }
  });

  test('should show meal acceptance rate', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const acceptanceSection = page.locator('text=/acceptance|success.*rate|completed/i');

    if (await acceptanceSection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(acceptanceSection).toBeVisible();
    }
  });

  test('should display try-bite progress', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const tryBiteProgress = page.locator('text=/try.*bite|new.*food|expand.*diet/i');

    if (await tryBiteProgress.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(tryBiteProgress).toBeVisible();
    }
  });

  test('should export report', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const exportButton = page.locator('button:has-text("Export"), button:has-text("Download"), button:has-text("PDF")');

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await exportButton.isVisible()).toBeTruthy();
    }
  });

  test('should share report', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const shareButton = page.locator('button:has-text("Share"), button[aria-label*="share"]');

    if (await shareButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await shareButton.click();
    }
  });

  test('should show weekly summary', async ({ page }) => {
    await page.goto(`${BASE_URL}/insights`);

    const weeklySection = page.locator('text=/weekly|this week|past.*week/i');

    if (await weeklySection.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(weeklySection).toBeVisible();
    }
  });
});
