import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Button Interactions: /faq', () => {
  test('Test all interactive buttons on /faq', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/faq
    await page.goto('http://localhost:8080/faq', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 2: Click Back to Home
    await locator.click({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"text=\"Back to Home\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 3: Click What is EatPal and how does it work?
    await locator.click({"primary":"#radix-«r0»","fallbacks":["text=\"What is EatPal and how does it work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«r0»","fallbacks":["text=\"What is EatPal and how does it work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 4: Click Is EatPal available now?
    await locator.click({"primary":"#radix-«r2»","fallbacks":["text=\"Is EatPal available now?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«r2»","fallbacks":["text=\"Is EatPal available now?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 5: Click Is EatPal suitable for children with ARFID or autism?
    await locator.click({"primary":"#radix-«r4»","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«r4»","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 6: Click What are "try bites" and how do they work?
    await locator.click({"primary":"#radix-«r6»","fallbacks":["text=\"What are \"try bites\" and how do they work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«r6»","fallbacks":["text=\"What are \"try bites\" and how do they work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 7: Click Can I manage meal plans for multiple children?
    await locator.click({"primary":"#radix-«r8»","fallbacks":["text=\"Can I manage meal plans for multiple children?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«r8»","fallbacks":["text=\"Can I manage meal plans for multiple children?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 8: Click How does the AI meal planning work?
    await locator.click({"primary":"#radix-«ra»","fallbacks":["text=\"How does the AI meal planning work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«ra»","fallbacks":["text=\"How does the AI meal planning work?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 9: Click What's included in the Free plan?
    await locator.click({"primary":"#radix-«rc»","fallbacks":["text=\"What's included in the Free plan?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«rc»","fallbacks":["text=\"What's included in the Free plan?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 10: Click Can I cancel my subscription anytime?
    await locator.click({"primary":"#radix-«re»","fallbacks":["text=\"Can I cancel my subscription anytime?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«re»","fallbacks":["text=\"Can I cancel my subscription anytime?\"",".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });


    // Step 11: Click How do I track allergens and dietary restrictions?
    await locator.click({"primary":"#radix-«rg»","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"button element"});
    await page.waitForTimeout(500);
    await expect(await locator.find({"primary":"#radix-«rg»","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"button element"})).toBeVisible(, { timeout: 5000 });

  });
});
