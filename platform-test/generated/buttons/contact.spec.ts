import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Button Interactions: /contact', () => {
  test('Test all interactive buttons on /contact', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/contact
    await page.goto('http://localhost:8080/contact', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Click Back to Home
    await locator.click({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 3: Click Send Message
    await locator.click({"primary":"text=\"Send Message\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Send Message\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 4: Click View FAQ
    await locator.click({"primary":"text=\"View FAQ\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"View FAQ\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });

  });
});
