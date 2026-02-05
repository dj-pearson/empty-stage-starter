import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Submit form-0 Form', () => {
  test('Complete and submit the form on /contact', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to /contact
    await page.goto('http://localhost:8080/contact', { waitUntil: 'networkidle' });


    // Step 2: Fill name
    await locator.fill({"primary":"#name","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"input element"}, formFiller.generateValue('full-name'));


    // Step 3: Fill email
    await locator.fill({"primary":"#email","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"input element"}, formFiller.generateValue('email'));


    // Step 4: Fill subject
    await locator.fill({"primary":"#subject","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"input element"}, formFiller.generateValue('text'));


    // Step 5: Fill message
    await locator.fill({"primary":"#message","fallbacks":[".flex"],"type":"css","confidence":0.9,"description":"input element"}, formFiller.generateValue('phone'));


    // Step 6: Submit form
    await locator.click({"primary":"text=\"Send Message\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});
    await expect(await locator.find({"primary":"text=\"Send Message\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"})).toBeVisible();

  });
});
