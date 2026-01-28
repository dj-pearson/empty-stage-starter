import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Button Interactions: /', () => {
  test('Test all interactive buttons on /', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Click Toggle theme
    await locator.click({"primary":"text=\"Toggle theme\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Toggle theme\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 3: Click Get Started Free
    await locator.click({"primary":"[aria-label=\"Get started with EatPal for free\"]","fallbacks":["text=\"Get Started Free\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get started with EatPal for free\"]","fallbacks":["text=\"Get Started Free\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 4: Click Try It Free
    await locator.click({"primary":"text=\"Try It Free\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Try It Free\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 5: Click See How It Works
    await locator.click({"primary":"text=\"See How It Works\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"See How It Works\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 6: Click Get Started
    await locator.click({"primary":"[aria-label=\"Get started with the free plan\"]","fallbacks":["text=\"Get Started\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Get started with the free plan\"]","fallbacks":["text=\"Get Started\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 7: Click Start Free Trial
    await locator.click({"primary":"[aria-label=\"Start free trial of the Pro plan\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Start free trial of the Pro plan\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 8: Click Start Free Trial
    await locator.click({"primary":"[aria-label=\"Start free trial of the Family plan\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Start free trial of the Family plan\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 9: Click Start Free Trial
    await locator.click({"primary":"[aria-label=\"Start your free trial of EatPal meal planning\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"Start your free trial of EatPal meal planning\"]","fallbacks":["text=\"Start Free Trial\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 10: Click View Pricing
    await locator.click({"primary":"[aria-label=\"View EatPal pricing plans\"]","fallbacks":["text=\"View Pricing\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"[aria-label=\"View EatPal pricing plans\"]","fallbacks":["text=\"View Pricing\"",".inline-flex"],"type":"label","confidence":0.85,"description":"button element"})).toBeVisible(, { timeout: 5000 });

  });
});
