import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Button Interactions: /pricing', () => {
  test('Test all interactive buttons on /pricing', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/pricing
    await page.goto('http://localhost:8080/pricing', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Click Get Started Free
    await locator.click({"primary":"text=\"Get Started Free\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Get Started Free\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 3: Click Monthly
    await locator.click({"primary":"[aria-label=\"Monthly billing\"]","fallbacks":["text=\"Monthly\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Monthly billing\"]","fallbacks":["text=\"Monthly\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 4: Click YearlySave 20%
    await locator.click({"primary":"[aria-label=\"Yearly billing, save 20%\"]","fallbacks":["text=\"YearlySave 20%\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Yearly billing, save 20%\"]","fallbacks":["text=\"YearlySave 20%\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 5: Click Get Started Now
    await locator.click({"primary":"[aria-label=\"Get Started Now - Free plan at Free\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get Started Now - Free plan at Free\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 6: Click Get Started Now
    await locator.click({"primary":"[aria-label=\"Get Started Now - Pro plan at $14.99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get Started Now - Pro plan at $14.99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 7: Click Get Started Now
    await locator.click({"primary":"[aria-label=\"Get Started Now - Family Plus plan at $24.99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get Started Now - Family Plus plan at $24.99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 8: Click Get Started Now
    await locator.click({"primary":"[aria-label=\"Get Started Now - Professional plan at $99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get Started Now - Professional plan at $99 per month\"]","fallbacks":["text=\"Get Started Now\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });

  });
});
