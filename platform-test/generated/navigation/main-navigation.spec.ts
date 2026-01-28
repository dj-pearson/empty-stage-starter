import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Main Navigation Test', () => {
  test('Test all main navigation links', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Navigate to Features
    await locator.click({"primary":"text=\"Features\"","fallbacks":[".text-foreground"],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/http://localhost:8080/#features/, { timeout: 10000 });


    // Step 3: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 4: Navigate to How It Works
    await locator.click({"primary":"text=\"How It Works\"","fallbacks":[".text-foreground"],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/http://localhost:8080/#how-it-works/, { timeout: 10000 });


    // Step 5: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 6: Navigate to Pricing
    await locator.click({"primary":"text=\"Pricing\"","fallbacks":[".text-foreground"],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/http://localhost:8080/pricing/, { timeout: 10000 });


    // Step 7: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 8: Navigate to Sign In
    await locator.click({"primary":"text=\"Sign In\"","fallbacks":[],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/http://localhost:8080/auth?tab=signin/, { timeout: 10000 });


    // Step 9: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 10: Navigate to Get Started Free
    await locator.click({"primary":"text=\"Get Started Free\"","fallbacks":[],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/http://localhost:8080/auth?tab=signup/, { timeout: 10000 });


    // Step 11: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 12: Navigate to Home
    await locator.click({"primary":"text=\"Home\"","fallbacks":[".hover:text-primary"],"type":"text","confidence":0.7,"description":"link element"});
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/https://tryeatpal.com//, { timeout: 10000 });


    // Step 13: Navigate back to home
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');

  });
});
