/**
 * Health Check Edge Function Tests
 *
 * Tests the _health endpoint which verifies Edge Functions runtime status.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const HEALTH_ENDPOINT = `${BASE_URL}/functions/v1/_health`;

test.describe('Health Check Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should return healthy status', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(body.runtime).toBe('deno');
  });

  test('should include environment configuration status', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);
    const body = await response.json();

    expect(body.environment).toBeDefined();
    expect(typeof body.environment.supabaseUrlConfigured).toBe('boolean');
    expect(typeof body.environment.anonKeyConfigured).toBe('boolean');
    expect(typeof body.environment.serviceRoleKeyConfigured).toBe('boolean');
  });

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(HEALTH_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
  });

  test('should respond within acceptable time', async ({ request }) => {
    const startTime = Date.now();
    const response = await request.get(HEALTH_ENDPOINT);
    const duration = Date.now() - startTime;

    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(2000); // 2 second threshold
  });

  test('should have proper content-type header', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);

    expect(response.headers()['content-type']).toContain('application/json');
  });

  test('should include version information', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);
    const body = await response.json();

    expect(body.version).toBeDefined();
  });
});
