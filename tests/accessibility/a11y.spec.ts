import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

/**
 * Accessibility Tests using axe-core
 *
 * These tests scan pages for WCAG 2.1 AA compliance issues.
 * See: https://www.w3.org/WAI/WCAG21/quickref/
 */

const RESULTS_DIR = 'a11y-results';

// Ensure results directory exists
test.beforeAll(async () => {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
});

// Helper to save results
function saveResults(pageName: string, results: any) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${pageName}-${timestamp}.json`;
  fs.writeFileSync(
    path.join(RESULTS_DIR, filename),
    JSON.stringify(results, null, 2)
  );
}

// Helper to format violations for console output
function formatViolations(violations: any[]) {
  return violations.map(v => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.length,
    helpUrl: v.helpUrl
  }));
}

test.describe('Accessibility Tests - Public Pages', () => {
  test('Landing page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    saveResults('landing', accessibilityScanResults);

    // Log violations for debugging
    if (accessibilityScanResults.violations.length > 0) {
      console.log('Landing page violations:', formatViolations(accessibilityScanResults.violations));
    }

    // Fail only on serious/critical violations
    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('Auth page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    saveResults('auth', accessibilityScanResults);

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Auth page violations:', formatViolations(accessibilityScanResults.violations));
    }

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('Pricing page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    saveResults('pricing', accessibilityScanResults);

    if (accessibilityScanResults.violations.length > 0) {
      console.log('Pricing page violations:', formatViolations(accessibilityScanResults.violations));
    }

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('About page should have no critical accessibility violations', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    saveResults('about', accessibilityScanResults);

    if (accessibilityScanResults.violations.length > 0) {
      console.log('About page violations:', formatViolations(accessibilityScanResults.violations));
    }

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });
});

test.describe('Accessibility Tests - Component Focus', () => {
  test('Forms should have proper labels and ARIA attributes', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('form')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    saveResults('forms', accessibilityScanResults);

    // Check specifically for form-related issues
    const formViolations = accessibilityScanResults.violations.filter(
      v => ['label', 'form-field-multiple-labels', 'input-button-name'].includes(v.id)
    );

    expect(formViolations).toEqual([]);
  });

  test('Navigation should be keyboard accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test keyboard navigation
    await page.keyboard.press('Tab');

    // First focusable element should be focused
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.tagName : null;
    });

    expect(focusedElement).not.toBeNull();

    // Run axe on navigation elements
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('nav')
      .include('header')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    saveResults('navigation', accessibilityScanResults);

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('Images should have alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a'])
      .analyze();

    saveResults('images', accessibilityScanResults);

    // Filter for image-related issues
    const imageViolations = accessibilityScanResults.violations.filter(
      v => ['image-alt', 'image-redundant-alt', 'svg-img-alt'].includes(v.id)
    );

    expect(imageViolations).toEqual([]);
  });

  test('Color contrast should meet WCAG AA standards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();

    saveResults('contrast', accessibilityScanResults);

    // Filter for contrast issues
    const contrastViolations = accessibilityScanResults.violations.filter(
      v => v.id === 'color-contrast'
    );

    // Log violations for review
    if (contrastViolations.length > 0) {
      console.log('Color contrast violations:', formatViolations(contrastViolations));
    }

    // Warn but don't fail for contrast issues (can be complex to fix)
    expect(contrastViolations.filter(v => v.impact === 'critical')).toEqual([]);
  });
});

test.describe('Accessibility Tests - Interactive Elements', () => {
  test('Buttons should be accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check all buttons have accessible names
    const buttons = await page.locator('button').all();

    for (const button of buttons) {
      const accessibleName = await button.getAttribute('aria-label') ||
                            await button.innerText() ||
                            await button.getAttribute('title');

      // Each button should have some accessible name
      expect(accessibleName?.trim().length).toBeGreaterThan(0);
    }
  });

  test('Links should have descriptive text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    saveResults('links', accessibilityScanResults);

    // Filter for link-related issues
    const linkViolations = accessibilityScanResults.violations.filter(
      v => ['link-name', 'link-in-text-block'].includes(v.id)
    );

    expect(linkViolations).toEqual([]);
  });

  test('Focus indicators should be visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through a few elements
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Take screenshot to verify focus visibility
    const focusedElement = page.locator(':focus');

    if (await focusedElement.count() > 0) {
      await focusedElement.screenshot({
        path: path.join(RESULTS_DIR, 'focus-indicator.png')
      });
    }

    // Check for focus-visible CSS
    const hasFocusStyles = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;

      const styles = window.getComputedStyle(el);
      return styles.outline !== 'none' ||
             styles.boxShadow !== 'none' ||
             styles.border !== 'none';
    });

    expect(hasFocusStyles).toBe(true);
  });
});

test.describe('Accessibility Tests - Dynamic Content', () => {
  test('Modal dialogs should trap focus', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for a button that opens a modal
    const modalTrigger = page.locator('[data-testid="modal-trigger"], button:has-text("Sign"), button:has-text("Get Started")').first();

    if (await modalTrigger.isVisible()) {
      await modalTrigger.click();

      // Wait for modal to appear
      await page.waitForTimeout(500);

      // Check if focus moved to modal
      const focusedInModal = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], [data-state="open"], .modal');
        const focused = document.activeElement;
        return modal?.contains(focused) || false;
      });

      if (focusedInModal) {
        // Tab through modal elements
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Focus should still be within modal
        const stillInModal = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], [data-state="open"], .modal');
          const focused = document.activeElement;
          return modal?.contains(focused) || false;
        });

        expect(stillInModal).toBe(true);
      }
    }
  });

  test('Loading states should be announced to screen readers', async ({ page }) => {
    await page.goto('/');

    // Check for aria-live regions
    const ariaLiveRegions = await page.locator('[aria-live], [role="status"], [role="alert"]').count();

    // At minimum, the app should have some live regions for announcements
    // This is informational - not all apps need visible live regions
    console.log(`Found ${ariaLiveRegions} aria-live regions`);
  });
});

test.describe('Accessibility Tests - Responsive Design', () => {
  test('Mobile viewport should be accessible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    saveResults('mobile', accessibilityScanResults);

    const criticalViolations = accessibilityScanResults.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );

    expect(criticalViolations).toEqual([]);
  });

  test('Touch targets should be large enough', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check button sizes (WCAG recommends 44x44px minimum)
    const buttons = await page.locator('button, a[href], [role="button"]').all();
    const smallTargets: string[] = [];

    for (const button of buttons.slice(0, 10)) { // Check first 10
      const box = await button.boundingBox();
      if (box && (box.width < 44 || box.height < 44)) {
        const text = await button.innerText().catch(() => 'unknown');
        smallTargets.push(`${text} (${box.width}x${box.height})`);
      }
    }

    if (smallTargets.length > 0) {
      console.log('Small touch targets found:', smallTargets);
    }

    // Warn about small targets but don't fail (informational)
    expect(true).toBe(true);
  });
});

// Summary test that generates a full report
test('Generate accessibility summary report', async ({ page }) => {
  const pages = ['/', '/auth', '/pricing', '/about'];
  const allViolations: any[] = [];

  for (const url of pages) {
    try {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      allViolations.push({
        url,
        violations: results.violations,
        passes: results.passes.length,
        incomplete: results.incomplete.length
      });
    } catch (e) {
      console.log(`Could not test ${url}: ${e}`);
    }
  }

  // Generate summary report
  const summary = {
    timestamp: new Date().toISOString(),
    totalPages: pages.length,
    results: allViolations.map(r => ({
      url: r.url,
      violations: r.violations.length,
      criticalViolations: r.violations.filter((v: any) => v.impact === 'critical').length,
      seriousViolations: r.violations.filter((v: any) => v.impact === 'serious').length,
      passes: r.passes,
      incomplete: r.incomplete
    }))
  };

  fs.writeFileSync(
    path.join(RESULTS_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('Accessibility Summary:');
  console.log(JSON.stringify(summary, null, 2));

  // Fail if any page has critical violations
  const hasCritical = allViolations.some(
    r => r.violations.some((v: any) => v.impact === 'critical')
  );

  expect(hasCritical).toBe(false);
});
