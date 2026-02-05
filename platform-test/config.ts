/**
 * Platform Test Configuration
 *
 * Centralized configuration loaded from environment variables.
 * This configuration is designed to be universal across different platforms.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables from .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Fallback to example for development
  dotenv.config({ path: path.join(__dirname, '.env.example') });
}

/**
 * Parse boolean from environment variable
 */
function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse comma-separated list
 */
function parseList(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Parse JSON from environment variable
 */
function parseJSON<T>(value: string | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

/**
 * Platform Test Configuration Interface
 */
export interface PlatformTestConfig {
  // Base Configuration
  baseUrl: string;
  appName: string;

  // Credentials
  credentials: {
    primary: { email: string; password: string };
    secondary: { email: string; password: string };
    admin: { email: string; password: string };
  };

  // Browser Settings
  browser: {
    name: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;
    slowMo: number;
    screenshotOnFail: boolean;
    video: 'off' | 'on' | 'retain-on-failure';
  };

  // Timeouts
  timeouts: {
    default: number;
    navigation: number;
    action: number;
  };

  // Discovery Settings
  discovery: {
    maxDepth: number;
    maxPages: number;
    excludeRoutes: string[];
    authRoutes: string[];
  };

  // Form Filling
  formData: {
    defaults: Record<string, string>;
    stripe: {
      card: string;
      exp: string;
      cvc: string;
      zip: string;
    };
  };

  // Execution
  execution: {
    workers: number;
    retries: number;
  };

  // Reporting
  reporting: {
    format: 'html' | 'json' | 'junit' | 'all';
    outputDir: string;
    slackWebhook?: string;
  };

  // AI Features
  ai: {
    selfHealing: boolean;
    openaiApiKey?: string;
  };

  // CI/CD
  ci: {
    isCI: boolean;
    githubToken?: string;
  };
}

/**
 * Load configuration from environment
 */
export function loadConfig(): PlatformTestConfig {
  return {
    baseUrl: process.env.PLATFORM_TEST_BASE_URL || 'http://localhost:8080',
    appName: process.env.PLATFORM_TEST_APP_NAME || 'Platform',

    credentials: {
      primary: {
        email: process.env.PLATFORM_TEST_EMAIL || 'test@example.com',
        password: process.env.PLATFORM_TEST_PASSWORD || 'TestPassword123!',
      },
      secondary: {
        email: process.env.PLATFORM_TEST_EMAIL_2 || 'test2@example.com',
        password: process.env.PLATFORM_TEST_PASSWORD_2 || 'TestPassword123!',
      },
      admin: {
        email: process.env.PLATFORM_TEST_ADMIN_EMAIL || 'admin@example.com',
        password: process.env.PLATFORM_TEST_ADMIN_PASSWORD || 'AdminPassword123!',
      },
    },

    browser: {
      name: (process.env.PLATFORM_TEST_BROWSER as 'chromium' | 'firefox' | 'webkit') || 'chromium',
      headless: parseBool(process.env.PLATFORM_TEST_HEADLESS, true),
      slowMo: parseNumber(process.env.PLATFORM_TEST_SLOW_MO, 0),
      screenshotOnFail: parseBool(process.env.PLATFORM_TEST_SCREENSHOT_ON_FAIL, true),
      video: (process.env.PLATFORM_TEST_VIDEO as 'off' | 'on' | 'retain-on-failure') || 'retain-on-failure',
    },

    timeouts: {
      default: parseNumber(process.env.PLATFORM_TEST_TIMEOUT, 30000),
      navigation: parseNumber(process.env.PLATFORM_TEST_NAVIGATION_TIMEOUT, 60000),
      action: parseNumber(process.env.PLATFORM_TEST_TIMEOUT, 30000) / 2,
    },

    discovery: {
      maxDepth: parseNumber(process.env.PLATFORM_TEST_MAX_DEPTH, 5),
      maxPages: parseNumber(process.env.PLATFORM_TEST_MAX_PAGES, 100),
      excludeRoutes: parseList(process.env.PLATFORM_TEST_EXCLUDE_ROUTES, ['/admin/*', '/debug/*', '/api/*']),
      authRoutes: parseList(process.env.PLATFORM_TEST_AUTH_ROUTES, ['/dashboard/*', '/settings/*', '/profile/*']),
    },

    formData: {
      defaults: parseJSON(process.env.PLATFORM_TEST_DEFAULT_FORM_DATA, {
        firstName: 'Test',
        lastName: 'User',
        phone: '555-123-4567',
        company: 'Test Company',
        address: '123 Test Street',
        city: 'Test City',
        state: 'CA',
        zip: '12345',
        country: 'United States',
      }),
      stripe: {
        card: process.env.PLATFORM_TEST_STRIPE_CARD || '4242424242424242',
        exp: process.env.PLATFORM_TEST_STRIPE_EXP || '12/28',
        cvc: process.env.PLATFORM_TEST_STRIPE_CVC || '123',
        zip: process.env.PLATFORM_TEST_STRIPE_ZIP || '12345',
      },
    },

    execution: {
      workers: parseNumber(process.env.PLATFORM_TEST_WORKERS, 4),
      retries: parseNumber(process.env.PLATFORM_TEST_RETRIES, 2),
    },

    reporting: {
      format: (process.env.PLATFORM_TEST_REPORT_FORMAT as 'html' | 'json' | 'junit' | 'all') || 'all',
      outputDir: process.env.PLATFORM_TEST_REPORT_DIR || './platform-test/reports',
      slackWebhook: process.env.PLATFORM_TEST_SLACK_WEBHOOK || undefined,
    },

    ai: {
      selfHealing: parseBool(process.env.PLATFORM_TEST_SELF_HEALING, true),
      openaiApiKey: process.env.PLATFORM_TEST_OPENAI_API_KEY || undefined,
    },

    ci: {
      isCI: parseBool(process.env.CI, false),
      githubToken: process.env.GITHUB_TOKEN || undefined,
    },
  };
}

// Export singleton config instance
export const config = loadConfig();

// Export for use in tests
export default config;
