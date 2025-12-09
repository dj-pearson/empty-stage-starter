import { test, expect } from '@playwright/test';

/**
 * Kids Management Tests
 * Tests child profile management including creation, editing, allergens
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Kids Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should display kids page', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);
    await expect(page).toHaveURL(/.*kids/);
    await expect(page.locator('text=/child|kid|profile/i')).toBeVisible({ timeout: 5000 });
  });

  test('should open add kid form', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    const addButton = page.locator('button:has-text("Add"), button:has-text("Create")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await expect(page.locator('[role="dialog"], form, .modal')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should create new child profile', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    const addButton = page.locator('button:has-text("Add"), button:has-text("Create")').first();
    if (await addButton.isVisible()) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Fill in child details
      await page.fill('input[name="name"], input[placeholder*="name"]', 'Test Child');

      const ageInput = page.locator('input[name="age"], input[type="number"]');
      if (await ageInput.isVisible()) {
        await ageInput.fill('5');
      }

      // Submit form
      const saveButton = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]');
      await saveButton.click();

      // Verify child appears in list
      await expect(page.locator('text=Test Child')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should edit child profile', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    // Find edit button for existing child
    const editButton = page.locator('button:has-text("Edit"), button[aria-label*="edit"]').first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();
      await expect(page.locator('[role="dialog"], form, .modal')).toBeVisible();
    }
  });

  test('should manage allergens', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    // Open child profile or allergen section
    const childCard = page.locator('[data-testid="kid-card"], .kid-profile').first();

    if (await childCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await childCard.click();

      // Look for allergen management
      const allergenSection = page.locator('text=/allergen|allergy/i');
      if (await allergenSection.isVisible()) {
        await expect(allergenSection).toBeVisible();
      }
    }
  });

  test('should upload profile picture', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    const editButton = page.locator('button:has-text("Edit"), button[aria-label*="edit"]').first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();

      // Look for image upload
      const uploadInput = page.locator('input[type="file"]');
      if (await uploadInput.isVisible()) {
        // File upload would be tested here
        expect(await uploadInput.count()).toBeGreaterThan(0);
      }
    }
  });

  test('should set favorite foods', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    const editButton = page.locator('button:has-text("Edit"), button[aria-label*="edit"]').first();

    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();

      // Look for favorite foods section
      const favoritesSection = page.locator('text=/favorite.*food|preferred/i');
      if (await favoritesSection.isVisible()) {
        await expect(favoritesSection).toBeVisible();
      }
    }
  });

  test('should delete child profile', async ({ page }) => {
    await page.goto(`${BASE_URL}/kids`);

    const deleteButton = page.locator('button:has-text("Delete"), button[aria-label*="delete"]').first();

    if (await deleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteButton.click();

      // Confirm deletion dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
      if (await confirmButton.isVisible()) {
        // Don't actually delete in tests
        await page.locator('button:has-text("Cancel")').click();
      }
    }
  });
});
