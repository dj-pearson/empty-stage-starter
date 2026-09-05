import { defineConfig, devices } from '@playwright/test';
import { findExistingChromium } from './scripts/resolve-chromium.mjs';
import { BASE_URL, DIST_DIR, PORT, TARGET_DIST } from './tests/helpers/base-url';

/**
 * Playwright Configuration for EatPal E2E Tests
 *
 * See https://playwright.dev/docs/test-configuration
 *
 * Two targets. The default is the Vite dev server, which is what most specs
 * want: they drive the app. `E2E_TARGET=dist` instead builds nothing and serves
 * the existing dist/ through scripts/dev/serve-dist.mjs, which resolves URLs
 * the way Cloudflare Pages does.
 *
 * That distinction is the whole point for the SEO spec (US-570). Against the
 * dev server it reported 4 failures, and 3 were artefacts of testing a
 * client-rendered page: zero h1 because React had not mounted, /pricing showing
 * the homepage title because Helmet had not applied, and /sitemap.xml
 * SPA-falling-back to HTML. What crawlers read is dist/, so that is what the
 * SEO assertions have to run against or they cry wolf three times for every
 * real finding.
 *
 * Run it with:  npm run build && E2E_TARGET=dist npx playwright test tests/seo.spec.ts
 */
/**
 * US-637 again, this time for the test runner rather than the build.
 *
 * Playwright launches the exact browser build its installed version pins, so an
 * image that pre-bakes a different build has a perfectly good Chromium the
 * runner refuses to see: here /opt/pw-browsers holds chromium-1194 while the
 * installed playwright wants chrome-headless-shell-1200, and every spec fails
 * at launch with "Executable doesn't exist" before a single assertion runs.
 * ensure-chromium.mjs and prerender.mjs already resolve around this through
 * findExistingChromium; the config had no equivalent, so `npm run test:e2e`
 * could not run in the very image the build runs in.
 *
 * Only the Chromium projects get it -- the resolver finds a Chromium, which is
 * no use to firefox or webkit. Null (the browser is where playwright expects)
 * leaves the default alone.
 */
const chromiumPath = findExistingChromium();
const chromiumLaunch = chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {};

/*
 * Resolved in tests/helpers/base-url.ts so the port cannot drift between the
 * server started below and the URL the specs navigate to. Twenty specs used to
 * hardcode 8080 and ignore baseURL entirely, which is why the suite could not
 * be pointed at CI's server (US-764).
 */

export default defineConfig({
  testDir: './tests',

  /* Maximum time one test can run for */
  timeout: 30 * 1000,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [['html'], ['list'], process.env.CI ? ['github'] : ['list']],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: BASE_URL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...chromiumLaunch },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'], ...chromiumLaunch },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /*
   * Run the target server before starting the tests. `dist` serves the existing
   * build and deliberately does not run one -- a spec run should not silently
   * depend on a 4-minute build, and a stale dist/ is better caught by the
   * assertions than hidden by an implicit rebuild.
   */
  webServer: {
    command: TARGET_DIST
      ? `node scripts/dev/serve-dist.mjs --port ${PORT} --dist ${DIST_DIR}`
      : 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
