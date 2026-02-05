/**
 * Edge Functions Test Configuration
 *
 * Configuration for testing Supabase Edge Functions
 */

export interface FunctionTestConfig {
  // Base URLs for function endpoints
  supabaseFunctionsUrl: string;
  cloudflareUrl: string;

  // Authentication
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  testUserEmail: string;
  testUserPassword: string;

  // Test settings
  timeout: number;
  retries: number;
  parallel: boolean;

  // Categories to test
  categories: FunctionCategory[];

  // Skip patterns
  skipFunctions: string[];

  // Priority order for testing
  priorityFunctions: string[];
}

export type FunctionCategory =
  | 'core'
  | 'user-management'
  | 'barcode'
  | 'meal-planning'
  | 'weekly-reports'
  | 'blog'
  | 'email'
  | 'payment'
  | 'seo'
  | 'analytics'
  | 'ai'
  | 'delivery'
  | 'notifications'
  | 'misc';

export type AuthType = 'none' | 'anon' | 'bearer' | 'service_role' | 'cron_secret' | 'oauth';

export interface FunctionDefinition {
  name: string;
  path: string;
  category: FunctionCategory;
  httpMethods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS')[];
  authType: AuthType;
  description: string;

  // Request/Response schemas
  requestSchema?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;

  // Test data
  testCases?: TestCase[];

  // Dependencies
  dependencies?: string[];

  // Metadata
  isCronJob?: boolean;
  requiresExternalApi?: boolean;
  externalApis?: string[];
}

export interface TestCase {
  name: string;
  description: string;
  input: Record<string, unknown>;
  expectedStatus: number;
  expectedResponse?: Record<string, unknown>;
  validateResponse?: (response: unknown) => boolean;
  timeout?: number;
  skip?: boolean;
  only?: boolean;
}

export interface TestResult {
  functionName: string;
  testCase: string;
  passed: boolean;
  status: number;
  responseTime: number;
  error?: string;
  response?: unknown;
  timestamp: string;
}

// Default configuration
export const defaultConfig: FunctionTestConfig = {
  supabaseFunctionsUrl: process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com',
  cloudflareUrl: process.env.CLOUDFLARE_URL || 'http://localhost:8080',

  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  testUserEmail: process.env.TEST_USER_EMAIL || 'test@example.com',
  testUserPassword: process.env.TEST_USER_PASSWORD || 'TestPassword123!',

  timeout: 30000,
  retries: 2,
  parallel: true,

  categories: [
    'core',
    'user-management',
    'barcode',
    'meal-planning',
    'weekly-reports',
    'blog',
    'email',
    'payment',
    'seo',
    'analytics',
    'ai',
    'delivery',
    'notifications',
    'misc'
  ],

  // Functions to skip (e.g., destructive or require manual setup)
  skipFunctions: [
    'stripe-webhook', // Requires Stripe signature
    'backup-user-data', // Long running
  ],

  // High-priority functions to test first
  priorityFunctions: [
    '_health',
    'lookup-barcode',
    'ai-meal-plan',
    'generate-weekly-report',
    'create-checkout',
    'list-users',
    'generate-sitemap',
  ],
};

export function loadConfig(): FunctionTestConfig {
  return {
    ...defaultConfig,
    // Override with environment variables if present
    supabaseFunctionsUrl: process.env.VITE_FUNCTIONS_URL || defaultConfig.supabaseFunctionsUrl,
    supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || defaultConfig.supabaseAnonKey,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || defaultConfig.supabaseServiceRoleKey,
    testUserEmail: process.env.TEST_USER_EMAIL || defaultConfig.testUserEmail,
    testUserPassword: process.env.TEST_USER_PASSWORD || defaultConfig.testUserPassword,
  };
}
