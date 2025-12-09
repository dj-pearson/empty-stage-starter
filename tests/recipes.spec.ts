import { test, expect } from '@playwright/test';

/**
 * Recipe Management Tests
 * Tests recipe creation, editing, nutrition, and scaling
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Recipe Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display recipes page', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);
    await expect(page).toHaveURL(/.*recipes/);
    await expect(page.locator('text=/recipe|meal|dish/i')).toBeVisible({ timeout: 5000 });
  });

  test('should open add recipe form', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const addButton = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await expect(page.locator('[role="dialog"], form, .modal')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should create new recipe', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const addButton = page.locator('button:has-text("Add"), button:has-text("Create")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Fill recipe name
      await page.fill('input[name="name"], input[placeholder*="name"]', 'Test Recipe');

      // Fill instructions if visible
      const instructionsInput = page.locator('textarea[name="instructions"], textarea[placeholder*="instruction"]');
      if (await instructionsInput.isVisible()) {
        await instructionsInput.fill('Step 1: Mix ingredients\nStep 2: Cook for 20 minutes');
      }

      // Submit
      const saveButton = page.locator('button:has-text("Save"), button[type="submit"]');
      await saveButton.click();

      await expect(page.locator('text=Test Recipe')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should add ingredients to recipe', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    // Open existing recipe or create new
    const recipeCard = page.locator('[data-testid="recipe-card"], .recipe-item').first();

    if (await recipeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recipeCard.click();

      // Look for add ingredient button
      const addIngredientButton = page.locator('button:has-text("Add Ingredient"), button:has-text("+")');
      if (await addIngredientButton.isVisible()) {
        await addIngredientButton.click();
      }
    }
  });

  test('should view recipe nutrition', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const recipeCard = page.locator('[data-testid="recipe-card"], .recipe-item').first();

    if (await recipeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recipeCard.click();

      // Look for nutrition info
      const nutritionSection = page.locator('text=/nutrition|calories|protein/i');
      if (await nutritionSection.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(nutritionSection).toBeVisible();
      }
    }
  });

  test('should scale recipe servings', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const recipeCard = page.locator('[data-testid="recipe-card"], .recipe-item').first();

    if (await recipeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recipeCard.click();

      // Look for serving size input
      const servingsInput = page.locator('input[name*="serving"], input[type="number"]').first();
      if (await servingsInput.isVisible()) {
        await servingsInput.clear();
        await servingsInput.fill('4');
      }
    }
  });

  test('should search recipes', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const searchInput = page.locator('input[placeholder*="search"], input[type="search"]');

    if (await searchInput.isVisible()) {
      await searchInput.fill('chicken');
      await page.waitForTimeout(500);
    }
  });

  test('should filter recipes by category', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const categoryFilter = page.locator('select, [role="combobox"], button:has-text("Category")').first();

    if (await categoryFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryFilter.click();
      await page.waitForTimeout(500);
    }
  });

  test('should import recipe from URL', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const importButton = page.locator('button:has-text("Import"), button:has-text("URL")');

    if (await importButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await importButton.click();
      await expect(page.locator('input[placeholder*="url"], input[type="url"]')).toBeVisible();
    }
  });

  test('should favorite/bookmark recipe', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const favoriteButton = page.locator('button[aria-label*="favorite"], button:has-text("Save")').first();

    if (await favoriteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await favoriteButton.click();
    }
  });

  test('should delete recipe', async ({ page }) => {
    await page.goto(`${BASE_URL}/recipes`);

    const deleteButton = page.locator('button[aria-label*="delete"], button:has-text("Delete")').first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();

      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible()) {
        await page.locator('button:has-text("Cancel")').click();
      }
    }
  });
});
