/**
 * Edge Functions Test Generator
 *
 * Generates Playwright tests for discovered Edge Functions
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  FunctionDefinition,
  FunctionCategory,
  AuthType,
  TestCase,
  loadConfig,
} from '../config/functions-test.config';

export interface GeneratedTest {
  functionName: string;
  filePath: string;
  testCount: number;
  content: string;
}

export interface GenerationResult {
  tests: GeneratedTest[];
  totalTests: number;
  generationTimestamp: string;
  errors: string[];
}

export class TestGenerator {
  private outputDir: string;
  private config = loadConfig();
  private errors: string[] = [];

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.join(process.cwd(), 'tests', 'functions', 'generated');
  }

  /**
   * Generate tests for all discovered functions
   */
  async generateTests(functions: FunctionDefinition[]): Promise<GenerationResult> {
    const tests: GeneratedTest[] = [];

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Group functions by category
    const byCategory = this.groupByCategory(functions);

    // Generate test file for each category
    for (const [category, categoryFunctions] of Object.entries(byCategory)) {
      if (categoryFunctions.length > 0) {
        try {
          const generatedTest = this.generateCategoryTests(
            category as FunctionCategory,
            categoryFunctions
          );
          tests.push(generatedTest);
        } catch (error) {
          this.errors.push(`Error generating tests for ${category}: ${error}`);
        }
      }
    }

    // Generate index file
    this.generateIndexFile(tests);

    // Generate helper utilities
    this.generateHelpers();

    return {
      tests,
      totalTests: tests.reduce((sum, t) => sum + t.testCount, 0),
      generationTimestamp: new Date().toISOString(),
      errors: this.errors,
    };
  }

  /**
   * Group functions by category
   */
  private groupByCategory(
    functions: FunctionDefinition[]
  ): Record<FunctionCategory, FunctionDefinition[]> {
    const grouped: Record<FunctionCategory, FunctionDefinition[]> = {
      'core': [],
      'user-management': [],
      'barcode': [],
      'meal-planning': [],
      'weekly-reports': [],
      'blog': [],
      'email': [],
      'payment': [],
      'seo': [],
      'analytics': [],
      'ai': [],
      'delivery': [],
      'notifications': [],
      'misc': [],
    };

    for (const func of functions) {
      grouped[func.category].push(func);
    }

    return grouped;
  }

  /**
   * Generate test file for a category of functions
   */
  private generateCategoryTests(
    category: FunctionCategory,
    functions: FunctionDefinition[]
  ): GeneratedTest {
    const fileName = `${category}.functions.spec.ts`;
    const filePath = path.join(this.outputDir, fileName);

    let testCount = 0;
    const testBlocks: string[] = [];

    for (const func of functions) {
      const funcTests = this.generateFunctionTests(func);
      testBlocks.push(funcTests.content);
      testCount += funcTests.testCount;
    }

    const content = this.wrapInTestFile(category, testBlocks.join('\n\n'));
    fs.writeFileSync(filePath, content);

    return {
      functionName: category,
      filePath,
      testCount,
      content,
    };
  }

  /**
   * Generate tests for a single function
   */
  private generateFunctionTests(func: FunctionDefinition): { content: string; testCount: number } {
    const lines: string[] = [];
    let testCount = 0;

    lines.push(`  test.describe('${func.name}', () => {`);
    lines.push(`    const FUNCTION_PATH = '${func.path}';`);
    lines.push(`    const AUTH_TYPE: AuthType = '${func.authType}';`);
    lines.push('');

    // Add description as comment
    lines.push(`    /**`);
    lines.push(`     * ${func.description}`);
    if (func.externalApis && func.externalApis.length > 0) {
      lines.push(`     * External APIs: ${func.externalApis.join(', ')}`);
    }
    if (func.isCronJob) {
      lines.push(`     * Type: Cron Job`);
    }
    lines.push(`     */`);
    lines.push('');

    // Generate test cases
    if (func.testCases && func.testCases.length > 0) {
      for (const testCase of func.testCases) {
        const testCode = this.generateTestCase(func, testCase);
        lines.push(testCode);
        testCount++;
      }
    } else {
      // Generate default tests
      const defaultTests = this.generateDefaultTests(func);
      lines.push(defaultTests.content);
      testCount += defaultTests.count;
    }

    lines.push('  });');

    return {
      content: lines.join('\n'),
      testCount,
    };
  }

  /**
   * Generate a single test case
   */
  private generateTestCase(func: FunctionDefinition, testCase: TestCase): string {
    const lines: string[] = [];
    const skipPrefix = testCase.skip ? '.skip' : testCase.only ? '.only' : '';

    lines.push(`    test${skipPrefix}('${testCase.name}', async ({ request }) => {`);
    lines.push(`      // ${testCase.description}`);

    // Build request options
    lines.push(`      const headers = await getAuthHeaders(AUTH_TYPE);`);

    // Determine HTTP method
    const method = testCase.name.toLowerCase().includes('get') ? 'GET' : 'POST';

    if (method === 'GET') {
      lines.push(`      const response = await request.get(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
      lines.push(`        headers,`);
      lines.push(`      });`);
    } else {
      lines.push(`      const response = await request.post(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
      lines.push(`        headers,`);
      lines.push(`        data: ${JSON.stringify(testCase.input, null, 8).replace(/\n/g, '\n        ')},`);
      lines.push(`      });`);
    }

    lines.push('');
    lines.push(`      // Verify status code`);
    lines.push(`      expect(response.status()).toBe(${testCase.expectedStatus});`);

    // Add response validation if expected response is provided
    if (testCase.expectedResponse) {
      lines.push('');
      lines.push(`      // Verify response body`);
      lines.push(`      const body = await response.json();`);
      for (const [key, value] of Object.entries(testCase.expectedResponse)) {
        if (typeof value === 'string') {
          lines.push(`      expect(body.${key}).toBe('${value}');`);
        } else if (typeof value === 'boolean' || typeof value === 'number') {
          lines.push(`      expect(body.${key}).toBe(${value});`);
        } else {
          lines.push(`      expect(body.${key}).toBeDefined();`);
        }
      }
    }

    lines.push('    });');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate default tests for a function
   */
  private generateDefaultTests(func: FunctionDefinition): { content: string; count: number } {
    const lines: string[] = [];
    let count = 0;

    // CORS preflight test
    lines.push(`    test('should respond to OPTIONS request', async ({ request }) => {`);
    lines.push(`      const response = await request.fetch(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
    lines.push(`        method: 'OPTIONS',`);
    lines.push(`      });`);
    lines.push(`      expect(response.status()).toBe(200);`);
    lines.push(`      expect(response.headers()['access-control-allow-origin']).toBeDefined();`);
    lines.push(`    });`);
    lines.push('');
    count++;

    // Unauthorized test (if auth required)
    if (func.authType !== 'none') {
      lines.push(`    test('should reject unauthorized requests', async ({ request }) => {`);
      lines.push(`      const response = await request.post(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
      lines.push(`        data: {},`);
      lines.push(`      });`);
      lines.push(`      expect([401, 403]).toContain(response.status());`);
      lines.push(`    });`);
      lines.push('');
      count++;
    }

    // Valid request test
    if (func.authType === 'none') {
      lines.push(`    test('should handle valid request', async ({ request }) => {`);
      lines.push(`      const response = await request.post(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
      lines.push(`        data: {},`);
      lines.push(`      });`);
      lines.push(`      expect([200, 400]).toContain(response.status());`);
      lines.push(`    });`);
      lines.push('');
      count++;
    } else {
      lines.push(`    test('should handle authorized request', async ({ request }) => {`);
      lines.push(`      const headers = await getAuthHeaders(AUTH_TYPE);`);
      lines.push(`      const response = await request.post(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
      lines.push(`        headers,`);
      lines.push(`        data: {},`);
      lines.push(`      });`);
      lines.push(`      // May return 200 or 400 depending on required payload`);
      lines.push(`      expect([200, 400]).toContain(response.status());`);
      lines.push(`    });`);
      lines.push('');
      count++;
    }

    // Response time test
    lines.push(`    test('should respond within timeout', async ({ request }) => {`);
    lines.push(`      const startTime = Date.now();`);
    lines.push(`      const headers = await getAuthHeaders(AUTH_TYPE);`);
    lines.push(`      await request.fetch(\`\${BASE_URL}\${FUNCTION_PATH}\`, {`);
    lines.push(`        method: 'OPTIONS',`);
    lines.push(`        headers,`);
    lines.push(`      });`);
    lines.push(`      const duration = Date.now() - startTime;`);
    lines.push(`      expect(duration).toBeLessThan(5000); // 5 second timeout`);
    lines.push(`    });`);
    lines.push('');
    count++;

    return { content: lines.join('\n'), count };
  }

  /**
   * Wrap test blocks in a complete test file
   */
  private wrapInTestFile(category: FunctionCategory, testBlocks: string): string {
    const categoryTitle = category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return `/**
 * ${categoryTitle} Edge Functions Tests
 *
 * Auto-generated by test-generator.ts
 * Generated: ${new Date().toISOString()}
 *
 * These tests verify the behavior of ${category} Edge Functions.
 */

import { test, expect } from '@playwright/test';
import { getAuthHeaders, AuthType, BASE_URL } from './helpers/test-helpers';

test.describe('${categoryTitle} Functions', () => {
  test.describe.configure({ mode: 'parallel' });

${testBlocks}
});
`;
  }

  /**
   * Generate test helpers file
   */
  private generateHelpers(): void {
    const helpersDir = path.join(this.outputDir, 'helpers');
    if (!fs.existsSync(helpersDir)) {
      fs.mkdirSync(helpersDir, { recursive: true });
    }

    const helpersContent = `/**
 * Test Helpers for Edge Functions Tests
 *
 * Provides authentication and utility functions for testing.
 */

export type AuthType = 'none' | 'anon' | 'bearer' | 'service_role' | 'cron_secret' | 'oauth';

// Base URL for Edge Functions
export const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';

// Supabase credentials
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

// Test user credentials
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@example.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

// Cached auth token
let cachedBearerToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get appropriate headers based on auth type
 */
export async function getAuthHeaders(authType: AuthType): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  switch (authType) {
    case 'none':
      // No auth required
      break;

    case 'anon':
      headers['Authorization'] = \`Bearer \${SUPABASE_ANON_KEY}\`;
      headers['apikey'] = SUPABASE_ANON_KEY;
      break;

    case 'bearer':
      const token = await getBearerToken();
      headers['Authorization'] = \`Bearer \${token}\`;
      headers['apikey'] = SUPABASE_ANON_KEY;
      break;

    case 'service_role':
      headers['Authorization'] = \`Bearer \${SUPABASE_SERVICE_ROLE_KEY}\`;
      headers['apikey'] = SUPABASE_SERVICE_ROLE_KEY;
      break;

    case 'cron_secret':
      headers['x-cron-secret'] = CRON_SECRET;
      headers['Authorization'] = \`Bearer \${SUPABASE_SERVICE_ROLE_KEY}\`;
      break;

    case 'oauth':
      // OAuth requires special handling per provider
      console.warn('OAuth auth type requires manual token setup');
      break;
  }

  return headers;
}

/**
 * Get a bearer token for authenticated requests
 */
async function getBearerToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedBearerToken && Date.now() < tokenExpiry) {
    return cachedBearerToken;
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';

    const response = await fetch(\`\${supabaseUrl}/auth/v1/token?grant_type=password\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      }),
    });

    if (!response.ok) {
      throw new Error(\`Auth failed: \${response.status}\`);
    }

    const data = await response.json();
    cachedBearerToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min early

    return cachedBearerToken;
  } catch (error) {
    console.error('Failed to get bearer token:', error);
    // Return anon key as fallback
    return SUPABASE_ANON_KEY;
  }
}

/**
 * Generate test data based on function type
 */
export function generateTestData(functionName: string): Record<string, unknown> {
  const testData: Record<string, Record<string, unknown>> = {
    'lookup-barcode': {
      barcode: '5901234123457',
    },
    'ai-meal-plan': {
      kid: {
        id: 'test-kid-id',
        name: 'Test Child',
        age: 5,
        allergens: [],
      },
      foods: [],
      recipes: [],
      days: 1,
    },
    'generate-weekly-report': {
      householdId: 'test-household-id',
    },
    'create-checkout': {
      planId: 'test-plan-id',
      billingCycle: 'monthly',
    },
    'send-auth-email': {
      email: 'test@example.com',
      emailType: 'welcome',
    },
    'generate-blog-content': {
      topic: 'Test Topic',
      style: 'educational',
      wordCount: 500,
    },
    'seo-audit': {
      url: 'https://tryeatpal.com',
    },
  };

  return testData[functionName] || {};
}

/**
 * Validate response against schema
 */
export function validateResponse(
  response: unknown,
  expectedFields: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (typeof response !== 'object' || response === null) {
    return { valid: false, missing: expectedFields };
  }

  for (const field of expectedFields) {
    if (!(field in response)) {
      missing.push(field);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Measure response time
 */
export async function measureResponseTime(
  fn: () => Promise<unknown>
): Promise<{ result: unknown; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Retry a test with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Skip test if required environment variable is missing
 */
export function skipIfMissingEnv(envVar: string): boolean {
  if (!process.env[envVar]) {
    console.warn(\`Skipping test: \${envVar} not configured\`);
    return true;
  }
  return false;
}
`;

    fs.writeFileSync(path.join(helpersDir, 'test-helpers.ts'), helpersContent);
  }

  /**
   * Generate index file that exports all tests
   */
  private generateIndexFile(tests: GeneratedTest[]): void {
    const indexContent = `/**
 * Edge Functions Tests Index
 *
 * Auto-generated by test-generator.ts
 * Generated: ${new Date().toISOString()}
 *
 * Run all function tests: npm run test:functions
 * Run specific category: npm run test:functions -- --grep "Category Name"
 */

// Export all test files for reference
export const generatedTests = ${JSON.stringify(
      tests.map(t => ({
        category: t.functionName,
        file: path.basename(t.filePath),
        testCount: t.testCount,
      })),
      null,
      2
    )};

// Test summary
export const testSummary = {
  totalTests: ${tests.reduce((sum, t) => sum + t.testCount, 0)},
  categories: ${tests.length},
  generatedAt: '${new Date().toISOString()}',
};

console.log('Edge Functions Test Suite');
console.log('========================');
console.log(\`Total Tests: \${testSummary.totalTests}\`);
console.log(\`Categories: \${testSummary.categories}\`);
console.log(\`Generated: \${testSummary.generatedAt}\`);
`;

    fs.writeFileSync(path.join(this.outputDir, 'index.ts'), indexContent);
  }

  /**
   * Print generation summary
   */
  printSummary(result: GenerationResult): void {
    console.log('\n=== Test Generation Summary ===\n');
    console.log(`Total Tests Generated: ${result.totalTests}`);
    console.log(`Test Files Created: ${result.tests.length}`);
    console.log(`Generation Time: ${result.generationTimestamp}\n`);

    console.log('Tests by Category:');
    for (const test of result.tests) {
      console.log(`  ${test.functionName}: ${test.testCount} tests -> ${path.basename(test.filePath)}`);
    }

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }

    console.log('\n');
  }
}

export default TestGenerator;
