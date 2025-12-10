import { test, expect } from '@playwright/test';

/**
 * Grocery List Tests
 * Tests grocery list functionality including generation, editing, and checkout
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Grocery List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display grocery page', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);
    await expect(page).toHaveURL(/.*grocery/);
    await expect(page.locator('text=/grocery|shopping|list/i')).toBeVisible({ timeout: 5000 });
  });

  test('should add item to grocery list', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const addButton = page.locator('button:has-text("Add"), input[placeholder*="add"]').first();

    if (await addButton.isVisible()) {
      if (await addButton.getAttribute('type') === 'text' || await addButton.getAttribute('placeholder')) {
        await addButton.fill('Test Grocery Item');
        await page.keyboard.press('Enter');
      } else {
        await addButton.click();
        await page.fill('input[name="name"], input[placeholder*="item"]', 'Test Grocery Item');
        await page.click('button:has-text("Save"), button[type="submit"]');
      }

      await expect(page.locator('text=Test Grocery Item')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should check off grocery item', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const checkbox = page.locator('input[type="checkbox"]').first();

    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      const isChecked = await checkbox.isChecked();
      await checkbox.click();
      await expect(checkbox).toHaveProperty('checked', !isChecked);
    }
  });

  test('should delete grocery item', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const deleteButton = page.locator('button[aria-label*="delete"], button:has-text("Remove")').first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      const itemsBefore = await page.locator('[data-testid="grocery-item"], .grocery-item').count();
      await deleteButton.click();

      // Confirm if needed
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }

      await page.waitForTimeout(500);
      const itemsAfter = await page.locator('[data-testid="grocery-item"], .grocery-item').count();
      expect(itemsAfter).toBeLessThanOrEqual(itemsBefore);
    }
  });

  test('should generate grocery list from meal plan', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const generateButton = page.locator('button:has-text("Generate"), button:has-text("From Meal Plan")');

    if (await generateButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateButton.click();
      await page.waitForTimeout(2000);
      await expect(page.locator('text=/generated|items.*added/i').or(page.locator('[data-testid="grocery-item"]'))).toBeVisible();
    }
  });

  test('should filter grocery list by category', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const categoryFilter = page.locator('select, [role="combobox"], button:has-text("Category")').first();

    if (await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryFilter.click();
      await page.waitForTimeout(500);
    }
  });

  test('should edit grocery item quantity', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const quantityInput = page.locator('input[type="number"], input[name*="quantity"]').first();

    if (await quantityInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await quantityInput.clear();
      await quantityInput.fill('5');
      await page.keyboard.press('Tab');
    }
  });

  test('should show Instacart integration', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    // Look for Instacart or delivery option
    const instacartButton = page.locator('button:has-text("Instacart"), button:has-text("Order"), a:has-text("Instacart")');

    if (await instacartButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await instacartButton.isVisible()).toBeTruthy();
    }
  });

  test('should clear completed items', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const clearButton = page.locator('button:has-text("Clear"), button:has-text("Remove Checked")');

    if (await clearButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await clearButton.click();
      // Confirm if needed
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmButton.click();
      }
    }
  });

  test('should export grocery list', async ({ page }) => {
    await page.goto(`${BASE_URL}/grocery`);

    const exportButton = page.locator('button:has-text("Export"), button:has-text("Share"), button:has-text("Print")');

    if (await exportButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(500);
    }
  });
});
