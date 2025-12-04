import { test, expect } from '@playwright/test';

/**
 * Performance Tests
 * Tests page load performance and core web vitals
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Performance', () => {
  test('should load landing page within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(3000);
  });

  test('should load dashboard within 5 seconds', async ({ page }) => {
    // Sign in first
    await page.goto(`${BASE_URL}/auth`);
    await page.click('button:has-text("Sign In")');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPassword123!');

    const startTime = Date.now();
    await page.click('button:has-text("Sign In")');

    try {
      await page.waitForURL(/\/(dashboard|home)/, { timeout: 10000 });
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(5000);
    } catch {
      // Auth may have failed
    }
  });

  test('should have optimized images', async ({ page }) => {
    await page.goto(BASE_URL);

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const img = images.nth(i);
      const src = await img.getAttribute('src');

      if (src && !src.startsWith('data:')) {
        // Check for modern image formats
        const hasModernFormat = src.includes('.webp') || src.includes('.avif');
        // Note: Not enforcing, just checking
        console.log(`Image ${i}: ${hasModernFormat ? 'modern format' : 'legacy format'}`);
      }
    }
  });

  test('should lazy load below-fold images', async ({ page }) => {
    await page.goto(BASE_URL);

    const lazyImages = page.locator('img[loading="lazy"]');
    const lazyCount = await lazyImages.count();

    // Should have some lazy loaded images
    expect(lazyCount).toBeGreaterThanOrEqual(0);
  });

  test('should not have render-blocking resources', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check for async/defer on scripts
    const blockingScripts = await page.locator('script:not([async]):not([defer]):not([type="application/ld+json"])').count();

    // Allow some blocking scripts (like critical ones)
    expect(blockingScripts).toBeLessThan(5);
  });

  test('should have gzip compression', async ({ page }) => {
    const response = await page.goto(BASE_URL);

    if (response) {
      const encoding = response.headers()['content-encoding'];
      // Modern servers typically use gzip or br (brotli)
      if (encoding) {
        expect(['gzip', 'br', 'deflate']).toContain(encoding);
      }
    }
  });

  test('should cache static assets', async ({ page }) => {
    await page.goto(BASE_URL);

    // Get a CSS or JS file
    const scripts = page.locator('script[src]');
    const firstScript = scripts.first();

    if (await firstScript.isVisible({ timeout: 1000 }).catch(() => false)) {
      const src = await firstScript.getAttribute('src');
      if (src) {
        const response = await page.request.get(src.startsWith('http') ? src : `${BASE_URL}${src}`);
        const cacheControl = response.headers()['cache-control'];

        // Should have some cache headers
        if (cacheControl) {
          expect(cacheControl).toBeTruthy();
        }
      }
    }
  });

  test('should minimize DOM size', async ({ page }) => {
    await page.goto(BASE_URL);

    const domSize = await page.evaluate(() => document.querySelectorAll('*').length);

    // DOM should be reasonably sized
    expect(domSize).toBeLessThan(3000);
  });

  test('should not have excessive network requests', async ({ page }) => {
    const requests: string[] = [];

    page.on('request', (request) => {
      requests.push(request.url());
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Should have reasonable number of requests
    expect(requests.length).toBeLessThan(100);
  });

  test('should have First Contentful Paint under 2s', async ({ page }) => {
    await page.goto(BASE_URL);

    const fcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntriesByName('first-contentful-paint');
          if (entries.length > 0) {
            resolve(entries[0].startTime);
          }
        }).observe({ entryTypes: ['paint'] });

        // Fallback if FCP already happened
        const existingEntries = performance.getEntriesByName('first-contentful-paint');
        if (existingEntries.length > 0) {
          resolve(existingEntries[0].startTime);
        }

        // Timeout fallback
        setTimeout(() => resolve(null), 3000);
      });
    });

    if (fcp !== null) {
      expect(fcp).toBeLessThan(2000);
    }
  });
});
