import { test, expect } from '@playwright/test';
import { FormFiller } from '../../utils/form-filler';
import { SmartLocator } from '../../utils/smart-locator';
import { config } from '../../config';


test.describe('User Sign In Flow', () => {
  test('Complete user authentication', async ({ page }) => {
    const formFiller = new FormFiller(page, config);
    const locator = new SmartLocator(page);

    // Step 1: Navigate to auth page
    await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle' });


    // Step 2: Enter email
    await locator.fill({"primary":"input[type=\"email\"]","fallbacks":["input[name=\"email\"]"],"type":"css","confidence":0.9,"description":"Email input"}, formFiller.generateValue('email'));


    // Step 3: Enter password
    await locator.fill({"primary":"input[type=\"password\"]","fallbacks":["input[name=\"password\"]"],"type":"css","confidence":0.9,"description":"Password input"}, formFiller.generateValue('password'));


    // Step 4: Click sign in
    await locator.click({"primary":"button[type=\"submit\"]","fallbacks":["button:has-text(\"Sign In\")"],"type":"css","confidence":0.8,"description":"Submit button"});
    await expect(page).toHaveURL(//dashboard/, { timeout: 10000 });

  });
});
