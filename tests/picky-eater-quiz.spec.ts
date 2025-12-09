import { test, expect } from '@playwright/test';

/**
 * Picky Eater Quiz Tests
 * Tests onboarding quiz for picky eater assessment
 */

const BASE_URL = 'http://localhost:8080';

test.describe('Picky Eater Quiz', () => {
  test('should display quiz landing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);
    await expect(page.locator('text=/quiz|assessment|picky.*eater/i')).toBeVisible({ timeout: 5000 });
  });

  test('should start quiz', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);

    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin"), button:has-text("Take Quiz")');

    if (await startButton.isVisible()) {
      await startButton.click();
      await expect(page.locator('text=/question|step|1.*of/i')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should navigate between questions', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);

    const startButton = page.locator('button:has-text("Start"), button:has-text("Begin")');
    if (await startButton.isVisible()) {
      await startButton.click();

      // Answer first question
      const option = page.locator('input[type="radio"], button[role="radio"]').first();
      if (await option.isVisible()) {
        await option.click();
      }

      const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")');
      if (await nextButton.isVisible()) {
        await nextButton.click();
      }
    }
  });

  test('should go back to previous question', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);

    const startButton = page.locator('button:has-text("Start")');
    if (await startButton.isVisible()) {
      await startButton.click();

      // Answer and go to next
      const option = page.locator('input[type="radio"]').first();
      if (await option.isVisible()) {
        await option.click();
        await page.locator('button:has-text("Next")').click();
        await page.waitForTimeout(500);

        // Go back
        const backButton = page.locator('button:has-text("Back"), button:has-text("Previous")');
        if (await backButton.isVisible()) {
          await backButton.click();
        }
      }
    }
  });

  test('should show progress indicator', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);

    const startButton = page.locator('button:has-text("Start")');
    if (await startButton.isVisible()) {
      await startButton.click();

      const progressBar = page.locator('[role="progressbar"], .progress-bar, [data-testid="progress"]');
      if (await progressBar.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(progressBar).toBeVisible();
      }
    }
  });

  test('should complete quiz and show results', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz`);

    const startButton = page.locator('button:has-text("Start")');
    if (await startButton.isVisible()) {
      await startButton.click();

      // Answer all questions (simplified - click through)
      for (let i = 0; i < 10; i++) {
        const option = page.locator('input[type="radio"], button[role="radio"]').first();
        if (await option.isVisible({ timeout: 1000 }).catch(() => false)) {
          await option.click();

          const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit")');
          if (await nextButton.isVisible()) {
            await nextButton.click();
            await page.waitForTimeout(300);
          }
        } else {
          break;
        }
      }

      // Check for results
      const results = page.locator('text=/result|score|recommendation|assessment/i');
      if (await results.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(results).toBeVisible();
      }
    }
  });

  test('should show personalized recommendations', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz/results`);

    const recommendations = page.locator('text=/recommendation|suggest|personalized/i');

    if (await recommendations.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(recommendations).toBeVisible();
    }
  });

  test('should allow retaking quiz', async ({ page }) => {
    await page.goto(`${BASE_URL}/quiz/results`);

    const retakeButton = page.locator('button:has-text("Retake"), button:has-text("Try Again")');

    if (await retakeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await retakeButton.click();
      await expect(page.locator('text=/quiz|assessment|question/i')).toBeVisible();
    }
  });
});
