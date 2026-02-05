import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('Form: form-0 (empty)', () => {
  test('Submit form empty and verify required field validation', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to http://localhost:8080/auth
    await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle');


    // Step 0: Submit form
    await locator.click({"primary":"text=\"Sign Up\"","fallbacks":[".inline-flex"],"type":"text","confidence":0.7,"description":"button element"});


    // Step 3: Verify error message appears
    await expect(await locator.find({"primary":"[class*=\"error\"], [role=\"alert\"], .text-red, .text-destructive","fallbacks":[],"type":"css","confidence":0.7,"description":"Error message"})).toBeVisible();

  });
});
