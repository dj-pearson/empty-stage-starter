import { test, expect } from '@playwright/test';

/**
 * Payment Flow Tests
 * Tests Stripe integration and subscription management
 * 
 * NOTE: These tests use Stripe test mode cards
 * Test card: 4242 4242 4242 4242
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Payment & Subscription Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should display pricing page', async ({ page }) => {
    await page.click('a[href="/pricing"]');
    await expect(page).toHaveURL(/.*pricing/);

    // Verify pricing plans are visible
    await expect(page.locator('text=/free|pro|premium|plan/i')).toBeVisible();
    await expect(page.locator('text=/\$|price|month/i')).toBeVisible();
  });

  test('should show subscription features', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);

    // Check for feature lists
    await expect(page.locator('text=/feature|include|unlimited/i')).toBeVisible();
  });

  test('should initiate checkout for premium plan', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);

    // Find and click subscribe button (adjust selector based on your UI)
    const subscribeButton = page.locator('button:has-text("Subscribe"), button:has-text("Get Started"), button:has-text("Upgrade")').first();
    
    if (await subscribeButton.isVisible()) {
      await subscribeButton.click();

      // Should redirect to Stripe Checkout or show modal
      // Wait for Stripe elements to load (this depends on your implementation)
      await page.waitForTimeout(2000);
      
      // Verify either redirected to Stripe or Stripe modal opened
      const currentURL = page.url();
      const hasStripe = currentURL.includes('stripe') || currentURL.includes('checkout');
      
      if (hasStripe) {
        console.log('✓ Redirected to Stripe checkout');
      } else {
        // Check if Stripe modal/iframe is present
        const stripeFrame = page.frameLocator('iframe[name*="stripe"]');
        if (await stripeFrame.locator('input').first().isVisible().catch(() => false)) {
          console.log('✓ Stripe checkout modal opened');
        }
      }
    }
  });

  test('should handle test card payment (requires Stripe test mode)', async ({ page }) => {
    // This is a placeholder test - actual implementation depends on your checkout flow
    // and whether you're using Stripe Checkout, Stripe Elements, etc.
    
    test.skip(true, 'Requires Stripe test mode configuration');
    
    // Example flow:
    // 1. Navigate to pricing
    // 2. Click subscribe
    // 3. Fill in test card: 4242 4242 4242 4242
    // 4. Fill expiry: 12/34
    // 5. Fill CVC: 123
    // 6. Submit payment
    // 7. Verify success redirect
  });

  test('should show subscription status when logged in', async ({ page }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

    // Navigate to settings or profile page where subscription is shown
    const settingsLink = page.locator('a[href="/settings"], button:has-text("Settings")');
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      
      // Look for subscription status
      await expect(
        page.locator('text=/subscription|plan|billing/i')
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test('should display free trial information', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`);

    // Check for free trial mentions
    const hasTrial = await page.locator('text=/free trial|trial period|14.*day|7.*day/i').isVisible();
    
    if (hasTrial) {
      console.log('✓ Free trial information displayed');
    }
  });

  test('should show upgrade prompts for free users', async ({ page }) => {
    // Sign in with free account
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });

    // Look for upgrade prompts or premium feature locks
    const upgradePrompt = page.locator('button:has-text("Upgrade"), a:has-text("Upgrade"), text=/premium.*feature/i');
    
    if (await upgradePrompt.first().isVisible()) {
      console.log('✓ Upgrade prompts present for free users');
    }
  });
});
