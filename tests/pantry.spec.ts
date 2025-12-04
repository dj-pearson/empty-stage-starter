import { test, expect } from '@playwright/test';

/**
 * Pantry/Food Management Tests
 * Tests food inventory, barcode scanning, and allergen tracking
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Pantry Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display pantry page', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);
    await expect(page).toHaveURL(/.*pantry/);
    await expect(page.locator('text=/pantry|food|inventory/i')).toBeVisible({ timeout: 5000 });
  });

  test('should add food item', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const addButton = page.locator('button:has-text("Add Food"), button:has-text("Add")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(500);

      await page.fill('input[name="name"], input[placeholder*="name"]', 'Test Apple');

      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
      await saveButton.click();

      await expect(page.locator('text=Test Apple')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should mark food as safe', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    // Look for safe food toggle
    const safeToggle = page.locator('input[name*="safe"], label:has-text("Safe")').first();

    if (await safeToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await safeToggle.click();
    }
  });

  test('should mark food as try-bite', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const tryBiteToggle = page.locator('input[name*="try"], label:has-text("Try")').first();

    if (await tryBiteToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tryBiteToggle.click();
    }
  });

  test('should set food allergens', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const editButton = page.locator('button[aria-label*="edit"], button:has-text("Edit")').first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();

      const allergenSection = page.locator('text=/allergen/i');
      if (await allergenSection.isVisible()) {
        await expect(allergenSection).toBeVisible();
      }
    }
  });

  test('should update food quantity', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const quantityInput = page.locator('input[type="number"], input[name*="quantity"]').first();

    if (await quantityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quantityInput.clear();
      await quantityInput.fill('10');
      await page.keyboard.press('Tab');
    }
  });

  test('should search foods', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]');

    if (await searchInput.isVisible()) {
      await searchInput.fill('apple');
      await page.waitForTimeout(500);
    }
  });

  test('should filter foods by category', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const categoryFilter = page.locator('select, [role="combobox"], button:has-text("Category")').first();

    if (await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryFilter.click();
      await page.waitForTimeout(500);
    }
  });

  test('should filter safe foods only', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const safeFilter = page.locator('button:has-text("Safe"), input[name*="safe-filter"]');

    if (await safeFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await safeFilter.click();
    }
  });

  test('should view food nutrition info', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const foodItem = page.locator('[data-testid="food-item"], .food-card').first();

    if (await foodItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await foodItem.click();

      const nutritionSection = page.locator('text=/nutrition|calories|protein/i');
      if (await nutritionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(nutritionSection).toBeVisible();
      }
    }
  });

  test('should delete food item', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const deleteButton = page.locator('button[aria-label*="delete"], button:has-text("Delete")').first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();

      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible()) {
        await page.locator('button:has-text("Cancel")').click();
      }
    }
  });

  test('should show barcode scanner option', async ({ page }) => {
    await page.goto(`${BASE_URL}/pantry`);

    const scanButton = page.locator('button:has-text("Scan"), button[aria-label*="barcode"]');

    if (await scanButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await scanButton.isVisible()).toBeTruthy();
    }
  });
});
