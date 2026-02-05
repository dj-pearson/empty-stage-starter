import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Button Interactions: /terms', () => {
  test('Test all interactive buttons on /terms', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/terms
    await page.goto('http://localhost:8080/terms', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Click Back to Home
    await locator.click({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });

  });
});
