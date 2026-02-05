import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Public Pages Smoke Test', () => {
  test('Verify all public pages load successfully', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Load /
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 2: Load /
    await page.goto('http://localhost:8080/#main-content', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 3: Load /
    await page.goto('http://localhost:8080/#main', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 4: Load /
    await page.goto('http://localhost:8080/#features', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 5: Load /
    await page.goto('http://localhost:8080/#how-it-works', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 6: Load /pricing
    await page.goto('http://localhost:8080/pricing', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/Pricing Plans for Picky Eater Meal Planning | EatPal/, { timeout: 10000 });


    // Step 7: Load /auth
    await page.goto('http://localhost:8080/auth?tab=signin', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal - The Operating System for Feeding Therapy | AI, Professionals & Research/, { timeout: 10000 });


    // Step 8: Load /auth
    await page.goto('http://localhost:8080/auth?tab=signup', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal - The Operating System for Feeding Therapy | AI, Professionals & Research/, { timeout: 10000 });


    // Step 9: Load /
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal: Food Chaining Meal Planner for Picky Eaters | Evidence-Based/, { timeout: 10000 });


    // Step 10: Load /auth
    await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveTitle(/EatPal - The Operating System for Feeding Therapy | AI, Professionals & Research/, { timeout: 10000 });

  });
});
