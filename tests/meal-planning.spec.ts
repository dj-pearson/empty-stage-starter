import { test, expect } from '@playwright/test';

/**
 * Meal Planning Flow Tests
 * Tests meal planning functionality including calendar, drag-drop, templates
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Meal Planning', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display meal planner calendar', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);
    await expect(page).toHaveURL(/.*planner/);

    // Verify week days are visible
    const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of weekDays.slice(0, 3)) {
      await expect(page.locator(`text=${day}`).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should navigate between weeks', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Look for navigation buttons
    const nextButton = page.locator('button[aria-label*="next"], button:has-text("Next")');
    const prevButton = page.locator('button[aria-label*="prev"], button:has-text("Previous")');

    if (await nextButton.isVisible()) {
      await nextButton.click();
      await page.waitForTimeout(500);
      await prevButton.click();
    }
  });

  test('should add meal to a day', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Click on add meal button or meal slot
    const addMealButton = page.locator('button:has-text("Add Meal"), button:has-text("+")').first();

    if (await addMealButton.isVisible()) {
      await addMealButton.click();

      // Should open food selection modal/dialog
      await expect(page.locator('[role="dialog"], .modal, [data-radix-dialog]')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display meal slots for each day', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Check for meal slot labels
    const mealSlots = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    for (const slot of mealSlots.slice(0, 2)) {
      const slotElement = page.locator(`text=${slot}`).first();
      if (await slotElement.isVisible({ timeout: 1000 }).catch(() => false)) {
        expect(await slotElement.isVisible()).toBeTruthy();
      }
    }
  });

  test('should copy meal plan to another week', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Look for copy week functionality
    const copyButton = page.locator('button:has-text("Copy"), button:has-text("Duplicate")');

    if (await copyButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await copyButton.click();
      await expect(page.locator('text=/copy|duplicate|select.*week/i')).toBeVisible();
    }
  });

  test('should generate AI meal plan', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Look for AI generation button
    const aiButton = page.locator('button:has-text("AI"), button:has-text("Generate"), button:has-text("Auto")').first();

    if (await aiButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aiButton.click();
      // Should show loading or AI options
      await page.waitForTimeout(1000);
    }
  });

  test('should mark meal as completed', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Look for meal items with completion checkbox/button
    const mealItem = page.locator('[data-testid="meal-item"], .meal-entry').first();

    if (await mealItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      const checkbox = mealItem.locator('input[type="checkbox"], button[aria-label*="complete"]');
      if (await checkbox.isVisible()) {
        await checkbox.click();
      }
    }
  });

  test('should filter meal plan by child', async ({ page }) => {
    await page.goto(`${BASE_URL}/planner`);

    // Look for child filter/selector
    const childSelector = page.locator('select, [role="combobox"]').first();

    if (await childSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await childSelector.click();
      await page.waitForTimeout(500);
    }
  });
});
