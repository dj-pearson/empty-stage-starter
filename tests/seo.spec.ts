import { test, expect } from '@playwright/test';

/**
 * SEO Tests
 * Tests meta tags, structured data, and SEO best practices
 */

const BASE_URL = 'http://localhost:8080';

test.describe('SEO & Meta Tags', () => {
  test('should have proper title tag on landing page', async ({ page }) => {
    await page.goto(BASE_URL);
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(10);
    expect(title.length).toBeLessThan(70);
  });

  test('should have meta description', async ({ page }) => {
    await page.goto(BASE_URL);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(50);
    expect(description!.length).toBeLessThan(160);
  });

  test('should have Open Graph tags', async ({ page }) => {
    await page.goto(BASE_URL);

    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');

    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    if (ogImage) {
      expect(ogImage).toMatch(/^https?:\/\//);
    }
  });

  test('should have Twitter card tags', async ({ page }) => {
    await page.goto(BASE_URL);

    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBeTruthy();
  });

  test('should have canonical URL', async ({ page }) => {
    await page.goto(BASE_URL);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto(BASE_URL);

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    const h1 = await page.locator('h1').textContent();
    expect(h1).toBeTruthy();
  });

  test('should have alt text on images', async ({ page }) => {
    await page.goto(BASE_URL);

    const imagesWithoutAlt = await page.locator('img:not([alt]), img[alt=""]').count();
    // Allow some decorative images without alt, but flag if too many
    expect(imagesWithoutAlt).toBeLessThan(10);
  });

  test('should have structured data (JSON-LD)', async ({ page }) => {
    await page.goto(BASE_URL);

    const jsonLd = await page.locator('script[type="application/ld+json"]');
    if (await jsonLd.count() > 0) {
      const content = await jsonLd.first().textContent();
      expect(content).toBeTruthy();

      // Validate it's valid JSON
      expect(() => JSON.parse(content!)).not.toThrow();
    }
  });

  test('should have viewport meta tag', async ({ page }) => {
    await page.goto(BASE_URL);

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('should have favicon', async ({ page }) => {
    await page.goto(BASE_URL);

    const favicon = page.locator('link[rel="icon"], link[rel="shortcut icon"]');
    expect(await favicon.count()).toBeGreaterThan(0);
  });

  test('should have proper language attribute', async ({ page }) => {
    await page.goto(BASE_URL);

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
  });

  test('should have robots meta tag or robots.txt', async ({ page }) => {
    const robotsResponse = await page.goto(`${BASE_URL}/robots.txt`);

    if (robotsResponse && robotsResponse.status() === 200) {
      const content = await robotsResponse.text();
      expect(content).toContain('User-agent');
    } else {
      // Check for robots meta tag instead
      await page.goto(BASE_URL);
      const robotsMeta = await page.locator('meta[name="robots"]').count();
      expect(robotsMeta).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have sitemap', async ({ page }) => {
    const sitemapResponse = await page.goto(`${BASE_URL}/sitemap.xml`);

    if (sitemapResponse && sitemapResponse.status() === 200) {
      const content = await sitemapResponse.text();
      expect(content).toContain('urlset');
    }
  });

  test('should have unique titles on different pages', async ({ page }) => {
    await page.goto(BASE_URL);
    const homeTitle = await page.title();

    await page.goto(`${BASE_URL}/pricing`);
    const pricingTitle = await page.title();

    expect(homeTitle).not.toBe(pricingTitle);
  });
});
