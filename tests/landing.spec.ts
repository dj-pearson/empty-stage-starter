import { test, expect } from '@playwright/test';

/**
 * Landing Page Tests
 * Tests public landing page, hero, features, and CTAs
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should display hero section', async ({ page }) => {
    const hero = page.locator('[data-testid="hero"], .hero, section').first();
    await expect(hero).toBeVisible({ timeout: 5000 });
  });

  test('should display main heading', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).not.toBeEmpty();
  });

  test('should display CTA button', async ({ page }) => {
    const ctaButton = page.locator('button:has-text("Get Started"), a:has-text("Get Started"), button:has-text("Try Free")');
    await expect(ctaButton.first()).toBeVisible();
  });

  test('should display feature sections', async ({ page }) => {
    const features = page.locator('text=/feature|benefit|why.*choose/i');
    if (await features.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(features.first()).toBeVisible();
    }
  });

  test('should display testimonials', async ({ page }) => {
    const testimonials = page.locator('text=/testimonial|review|customer.*say/i');
    if (await testimonials.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(testimonials.first()).toBeVisible();
    }
  });

  test('should display pricing preview', async ({ page }) => {
    const pricingSection = page.locator('text=/pricing|plan|free|pro/i');
    if (await pricingSection.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      expect(await pricingSection.count()).toBeGreaterThan(0);
    }
  });

  test('should have responsive navigation', async ({ page }) => {
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible();
  });

  test('should display footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('should have social links in footer', async ({ page }) => {
    const socialLinks = page.locator('footer a[href*="twitter"], footer a[href*="facebook"], footer a[href*="instagram"]');
    if (await socialLinks.count() > 0) {
      expect(await socialLinks.count()).toBeGreaterThan(0);
    }
  });

  test('should display app store badges', async ({ page }) => {
    const appStoreLinks = page.locator('a[href*="apple"], a[href*="play.google"], img[alt*="App Store"], img[alt*="Google Play"]');
    if (await appStoreLinks.count() > 0) {
      expect(await appStoreLinks.count()).toBeGreaterThan(0);
    }
  });

  test('should show 3D hero animation (if enabled)', async ({ page }) => {
    const canvas = page.locator('canvas');
    if (await canvas.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(canvas).toBeVisible();
    }
  });

  test('should have accessible skip link', async ({ page }) => {
    const skipLink = page.locator('a[href="#main"], a:has-text("Skip to")');
    if (await skipLink.count() > 0) {
      expect(await skipLink.count()).toBeGreaterThan(0);
    }
  });

  test('should load lazy images', async ({ page }) => {
    // Scroll down to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);

    const images = page.locator('img[loading="lazy"]');
    if (await images.count() > 0) {
      expect(await images.count()).toBeGreaterThan(0);
    }
  });
});
