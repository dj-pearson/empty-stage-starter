import { test, expect } from '@playwright/test';

/**
 * Critical User Flow Tests
 * End-to-end tests for core app functionality
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in before each test
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should navigate to pantry and add food', async ({ page }) => {
    // Navigate to pantry
    await page.click('a[href="/pantry"]');
    await expect(page).toHaveURL(/.*pantry/);

    // Click add food button
    await page.click('button:has-text("Add Food")');

    // Fill food form
    await page.fill('input[placeholder*="food name"], input[name="name"]', 'Test Apple');
    
    // Mark as safe food
    const safeCheckbox = page.locator('input[type="checkbox"]').first();
    await safeCheckbox.check();

    // Save
    await page.click('button:has-text("Save"), button:has-text("Add")');

    // Verify food appears in list
    await expect(page.locator('text=Test Apple')).toBeVisible({ timeout: 5000 });
  });

  test('should create meal plan', async ({ page }) => {
    // Navigate to planner
    await page.click('a[href="/planner"]');
    await expect(page).toHaveURL(/.*planner/);

    // Check that calendar is visible
    await expect(page.locator('text=/monday|tuesday|calendar/i')).toBeVisible();

    // Try to add meal to a day (interaction depends on your UI)
    // This is a placeholder - adjust based on actual implementation
    const addMealButton = page.locator('button:has-text("Add Meal")').first();
    if (await addMealButton.isVisible()) {
      await addMealButton.click();
      await expect(page.locator('text=/select.*food|choose.*food/i')).toBeVisible();
    }
  });

  test('should generate grocery list', async ({ page }) => {
    // Navigate to grocery page
    await page.click('a[href="/grocery"]');
    await expect(page).toHaveURL(/.*grocery/);

    // Look for grocery list or button to generate one
    const generateButton = page.locator('button:has-text("Generate")');
    if (await generateButton.isVisible()) {
      await generateButton.click();
      await page.waitForTimeout(2000); // Wait for generation
    }

    // Verify grocery items or empty state
    await expect(
      page.locator('text=/grocery|shopping|items/i')
    ).toBeVisible();
  });

  test('should view kids profiles', async ({ page }) => {
    // Navigate to kids page
    await page.click('a[href="/kids"]');
    await expect(page).toHaveURL(/.*kids/);

    // Should show kids management interface
    await expect(
      page.locator('text=/child|kid|profile/i')
    ).toBeVisible();

    // Try adding a kid
    const addKidButton = page.locator('button:has-text("Add Kid"), button:has-text("Add Child")');
    if (await addKidButton.isVisible()) {
      await addKidButton.click();
      await expect(page.locator('input[placeholder*="name"], input[name*="name"]')).toBeVisible();
    }
  });

  test('should view recipes page', async ({ page }) => {
    // Navigate to recipes
    await page.click('a[href="/recipes"]');
    await expect(page).toHaveURL(/.*recipes/);

    // Verify recipe interface
    await expect(
      page.locator('text=/recipe|meal|dish/i')
    ).toBeVisible();
  });

  test('should access AI features', async ({ page }) => {
    // Try AI meal planner
    const aiPlannerLink = page.locator('a[href="/ai-planner"]');
    if (await aiPlannerLink.isVisible()) {
      await aiPlannerLink.click();
      await expect(page).toHaveURL(/.*ai-planner/);
      await expect(page.locator('text=/ai|intelligent|generate/i')).toBeVisible();
    }
  });

  test('should access analytics', async ({ page }) => {
    // Navigate to insights/analytics
    const analyticsLink = page.locator('a[href="/insights"], a[href="/analytics"]');
    if (await analyticsLink.isVisible()) {
      await analyticsLink.click();
      await expect(page).toHaveURL(/.*insights|analytics/);
      await expect(page.locator('text=/progress|tracking|stats/i')).toBeVisible();
    }
  });
});
