/**
 * Playwright Configuration for Edge Functions Tests
 *
 * This configuration is optimized for testing HTTP endpoints (Edge Functions)
 * rather than browser-based E2E tests.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './',

  // Include only function test files
  testMatch: [
    '**/critical/*.spec.ts',
    '**/generated/*.spec.ts',
  ],

  // Longer timeout for API calls (especially AI functions)
  timeout: 60 * 1000,

  // Expect timeout for assertions
  expect: {
    timeout: 10 * 1000,
  },

  // Run tests in parallel
  fullyParallel: true,

  // Fail if test.only is left in code
  forbidOnly: !!process.env.CI,

  // Retry failed tests
  retries: process.env.CI ? 2 : 1,

  // Workers
  workers: process.env.CI ? 1 : 4,

  // Reporters
  reporter: [
    ['html', { outputFolder: './results/html-report' }],
    ['json', { outputFile: './results/test-results.json' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],

  // Global setup (load environment variables)
  globalSetup: require.resolve('./setup/global-setup.ts'),

  // Use settings for API testing (no browser needed for most)
  use: {
    // Base URL for functions
    baseURL: process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com',

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },

    // Trace on first retry
    trace: 'on-first-retry',

    // Ignore HTTPS errors (for local testing)
    ignoreHTTPSErrors: true,
  },

  // Project configurations
  projects: [
    {
      name: 'api-tests',
      testMatch: '**/*.spec.ts',
    },
  ],

  // Output directory for test artifacts
  outputDir: './results/test-artifacts',
});
