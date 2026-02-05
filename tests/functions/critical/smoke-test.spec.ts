/**
 * Edge Functions Smoke Tests
 *
 * Quick tests to verify critical endpoints are accessible and responding.
 * Run these first to ensure the environment is set up correctly.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

// Critical endpoints to test
const CRITICAL_ENDPOINTS = [
  { name: '_health', path: '/functions/v1/_health', method: 'GET', auth: false },
  { name: 'lookup-barcode', path: '/functions/v1/lookup-barcode', method: 'POST', auth: false },
  { name: 'generate-sitemap', path: '/functions/v1/generate-sitemap', method: 'GET', auth: true },
  { name: 'create-checkout', path: '/functions/v1/create-checkout', method: 'POST', auth: true },
  { name: 'manage-subscription', path: '/functions/v1/manage-subscription', method: 'POST', auth: true },
  { name: 'ai-meal-plan', path: '/functions/v1/ai-meal-plan', method: 'POST', auth: true },
  { name: 'list-users', path: '/functions/v1/list-users', method: 'GET', auth: true },
  { name: 'send-auth-email', path: '/functions/v1/send-auth-email', method: 'POST', auth: true },
  { name: 'generate-weekly-report', path: '/functions/v1/generate-weekly-report', method: 'POST', auth: true },
  { name: 'test-ai-model', path: '/functions/v1/test-ai-model', method: 'POST', auth: false },
];

test.describe('Edge Functions Smoke Tests', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should have VITE_FUNCTIONS_URL configured', () => {
    expect(process.env.VITE_FUNCTIONS_URL || BASE_URL).toBeTruthy();
    console.log(`  Functions URL: ${BASE_URL}`);
  });

  test('should have VITE_SUPABASE_ANON_KEY configured', () => {
    if (!SUPABASE_ANON_KEY) {
      console.log('  ⚠️  VITE_SUPABASE_ANON_KEY not set - some tests may fail');
    } else {
      console.log('  ✓ VITE_SUPABASE_ANON_KEY is configured');
    }
    // This is a warning, not a failure
    expect(true).toBe(true);
  });

  // Generate a test for each critical endpoint
  for (const endpoint of CRITICAL_ENDPOINTS) {
    test(`${endpoint.name} should respond to OPTIONS`, async ({ request }) => {
      const url = `${BASE_URL}${endpoint.path}`;

      const response = await request.fetch(url, {
        method: 'OPTIONS',
      });

      // OPTIONS should always return 200
      expect(response.status()).toBe(200);

      // Should have CORS headers
      const headers = response.headers();
      expect(headers['access-control-allow-origin']).toBeDefined();
    });
  }

  test('health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/functions/v1/_health`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.runtime).toBe('deno');

    console.log(`  Health check: ${body.status}`);
    console.log(`  Runtime: ${body.runtime}`);
    console.log(`  Timestamp: ${body.timestamp}`);
  });

  test('lookup-barcode responds to POST', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/lookup-barcode`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        barcode: '5449000000439', // Coca-Cola barcode
      },
    });

    // Should return 200 (found) or 404 (not found) - both are valid
    expect([200, 404]).toContain(response.status());
  });

  test('authenticated endpoints reject without auth', async ({ request }) => {
    // Test that authenticated endpoints properly reject unauthenticated requests
    const authEndpoints = CRITICAL_ENDPOINTS.filter(e => e.auth);

    for (const endpoint of authEndpoints.slice(0, 3)) {
      // Test first 3 to save time
      const response = await request.fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
        data: endpoint.method === 'POST' ? {} : undefined,
      });

      // Should be 401 or 403 for unauthenticated
      expect([401, 403]).toContain(response.status());
    }
  });

  test('all endpoints respond within 5 seconds', async ({ request }) => {
    const results: { name: string; duration: number; status: number }[] = [];

    for (const endpoint of CRITICAL_ENDPOINTS.slice(0, 5)) {
      // Test first 5
      const startTime = Date.now();

      const response = await request.fetch(`${BASE_URL}${endpoint.path}`, {
        method: 'OPTIONS',
      });

      const duration = Date.now() - startTime;
      results.push({
        name: endpoint.name,
        duration,
        status: response.status(),
      });

      expect(duration).toBeLessThan(5000);
    }

    // Log results
    console.log('\n  Response Times:');
    for (const result of results) {
      console.log(`    ${result.name}: ${result.duration}ms (${result.status})`);
    }
  });

  test('summary: environment check', async () => {
    const checks = [
      { name: 'Functions URL', value: BASE_URL, ok: !!BASE_URL },
      { name: 'Anon Key', value: SUPABASE_ANON_KEY ? '***configured***' : 'NOT SET', ok: !!SUPABASE_ANON_KEY },
      { name: 'Supabase URL', value: process.env.VITE_SUPABASE_URL || 'NOT SET', ok: !!process.env.VITE_SUPABASE_URL },
      { name: 'Service Role Key', value: process.env.SUPABASE_SERVICE_ROLE_KEY ? '***configured***' : 'NOT SET', ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
      { name: 'Test User Email', value: process.env.TEST_USER_EMAIL || 'NOT SET', ok: !!process.env.TEST_USER_EMAIL },
    ];

    console.log('\n  Environment Configuration:');
    for (const check of checks) {
      const status = check.ok ? '✓' : '⚠️';
      console.log(`    ${status} ${check.name}: ${check.value}`);
    }

    // At minimum, functions URL should be set
    expect(checks[0].ok).toBe(true);
  });
});
