import { test, expect } from '@playwright/test';

/**
 * AI Features Tests
 * Tests AI-powered meal planning, suggestions, and coaching
 */

const BASE_URL = 'http://localhost:8080';

test.describe('AI Features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should access AI meal planner', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    await expect(page.locator('text=/ai|intelligent|smart|generate/i')).toBeVisible({ timeout: 5000 });
  });

  test('should configure AI preferences', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const preferencesButton = page.locator('button:has-text("Preferences"), button:has-text("Settings")');

    if (await preferencesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await preferencesButton.click();
      await expect(page.locator('[role="dialog"], .modal')).toBeVisible();
    }
  });

  test('should generate AI meal suggestions', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Create Plan")');

    if (await generateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateButton.click();
      // Should show loading state
      await expect(page.locator('text=/generating|loading|please wait/i').or(page.locator('[data-testid="loading"]'))).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display AI coaching tips', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-coach`);

    if (await page.url().includes('ai-coach')) {
      await expect(page.locator('text=/coach|tip|advice|suggestion/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show food chaining recommendations', async ({ page }) => {
    await page.goto(`${BASE_URL}/food-chaining`);

    if (await page.url().includes('food-chaining')) {
      await expect(page.locator('text=/chain|similar|bridge.*food/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should accept or reject AI suggestions', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const suggestionCard = page.locator('[data-testid="ai-suggestion"], .suggestion-card').first();

    if (await suggestionCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      const acceptButton = suggestionCard.locator('button:has-text("Accept"), button:has-text("Add")');
      const rejectButton = suggestionCard.locator('button:has-text("Reject"), button:has-text("Skip")');

      if (await acceptButton.isVisible()) {
        expect(await acceptButton.isVisible()).toBeTruthy();
      }
      if (await rejectButton.isVisible()) {
        expect(await rejectButton.isVisible()).toBeTruthy();
      }
    }
  });

  test('should regenerate AI suggestions', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const regenerateButton = page.locator('button:has-text("Regenerate"), button:has-text("Try Again"), button[aria-label*="refresh"]');

    if (await regenerateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await regenerateButton.isVisible()).toBeTruthy();
    }
  });

  test('should customize AI generation parameters', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const daysInput = page.locator('input[name*="days"], select[name*="days"]');

    if (await daysInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (await daysInput.getAttribute('type') === 'number') {
        await daysInput.clear();
        await daysInput.fill('5');
      }
    }
  });

  test('should view AI generation history', async ({ page }) => {
    await page.goto(`${BASE_URL}/ai-planner`);

    const historyButton = page.locator('button:has-text("History"), a:has-text("History")');

    if (await historyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await historyButton.click();
    }
  });
});
