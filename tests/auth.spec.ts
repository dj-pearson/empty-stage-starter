import { test, expect } from '@playwright/test';

/**
 * Authentication Flow Tests
 * Tests critical user authentication paths for production readiness
 */

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const BASE_URL = 'http://localhost:8080';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should display sign up and sign in forms', async ({ page }) => {
    // Navigate to auth page
    await page.click('a[href="/auth"]');
    await expect(page).toHaveURL(/.*auth/);

    // Check for sign up tab
    const signUpTab = page.locator('button:has-text("Sign Up")');
    await expect(signUpTab).toBeVisible();

    // Check for sign in tab
    const signInTab = page.locator('button:has-text("Sign In")');
    await expect(signInTab).toBeVisible();
  });

  test('should show validation errors for invalid inputs', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);

    // Click sign up tab
    await page.click('button:has-text("Sign Up")');

    // Try to submit without filling form
    await page.click('button:has-text("Create Account")');

    // Should show validation errors (adjust selectors based on your implementation)
    await expect(page.locator('text=/required|invalid|fill/i')).toBeVisible({ timeout: 5000 });
  });

  test('should not allow sign up with invalid email', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign Up")');

    // Fill invalid email
    await page.fill('input[type="email"]', 'invalid-email');
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button:has-text("Create Account")');

    // Should show validation error
    await expect(page.locator('text=/invalid.*email/i')).toBeVisible({ timeout: 5000 });
  });

  test('should successfully sign up new user', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign Up")');

    // Fill form
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);

    // Submit
    await page.click('button:has-text("Create Account")');

    // Should redirect to onboarding or dashboard
    await page.waitForURL(/\/(dashboard|onboarding|home)/, { timeout: 10000 });
    
    // Verify logged in state
    await expect(page.locator('text=/welcome|dashboard/i')).toBeVisible({ timeout: 5000 });
  });

  test('should successfully sign in existing user', async ({ page }) => {
    // Note: This test assumes a user already exists
    // In real tests, you'd set up test data beforehand
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');

    // Fill form with existing credentials
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');

    // Submit
    await page.click('button:has-text("Sign In")');

    // Should redirect to dashboard
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
  });

  test('should show error for wrong password', async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');

    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click('button:has-text("Sign In")');

    // Should show error message
    await expect(page.locator('text=/invalid|incorrect|wrong/i')).toBeVisible({ timeout: 5000 });
  });

  test('should maintain session after page refresh', async ({ page }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

    // Refresh page
    await page.reload();

    // Should still be logged in
    await expect(page).toHaveURL(/\/(dashboard|home)/);
    await expect(page.locator('text=/welcome|dashboard/i')).toBeVisible({ timeout: 5000 });
  });

  test('should successfully sign out', async ({ page }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');

    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

    // Click sign out (adjust selector based on your implementation)
    await page.click('button:has-text("Sign Out"), a:has-text("Sign Out"), button:has-text("Logout")');

    // Should redirect to landing or auth page
    await page.waitForURL(/\/(|auth|landing)$/, { timeout: 10000 });
    
    // Verify logged out state
    await expect(page.locator('button:has-text("Sign In"), a:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
  });
});
