import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * k6 Load Test Configuration
 *
 * This test simulates normal user load to verify the application
 * can handle expected traffic levels.
 *
 * Run with: k6 run tests/performance/load-test.js
 */

// Custom metrics
const errorRate = new Rate('errors');
const pageLoadTime = new Trend('page_load_time');
const ttfb = new Trend('time_to_first_byte');

// Test configuration
export const options = {
  // Simulate ramping up to 50 users
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 25 },   // Ramp up to 25 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],

  // Performance thresholds
  thresholds: {
    // 95% of requests should complete within 2 seconds
    http_req_duration: ['p(95)<2000'],
    // Less than 1% error rate
    errors: ['rate<0.01'],
    // 95% of requests should have TTFB under 500ms
    time_to_first_byte: ['p(95)<500'],
    // Page load should be under 3 seconds
    page_load_time: ['p(95)<3000'],
  },

  // Don't fail on thresholds in CI (just report)
  thresholdCriteria: {
    http_req_duration: 'p(95)',
    errors: 'rate',
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Simulated user scenarios
export default function () {
  // Landing Page Test
  group('Landing Page', () => {
    const startTime = Date.now();

    const response = http.get(`${BASE_URL}/`);

    const loadTime = Date.now() - startTime;
    pageLoadTime.add(loadTime);
    ttfb.add(response.timings.waiting);

    const success = check(response, {
      'Landing page status is 200': (r) => r.status === 200,
      'Landing page loads within 2s': (r) => r.timings.duration < 2000,
      'Landing page contains expected content': (r) =>
        r.body && r.body.includes('EatPal') || r.body.includes('Munch'),
    });

    errorRate.add(!success);
    sleep(1);
  });

  // Auth Page Test
  group('Auth Page', () => {
    const startTime = Date.now();

    const response = http.get(`${BASE_URL}/auth`);

    const loadTime = Date.now() - startTime;
    pageLoadTime.add(loadTime);
    ttfb.add(response.timings.waiting);

    const success = check(response, {
      'Auth page status is 200': (r) => r.status === 200,
      'Auth page loads within 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
    sleep(1);
  });

  // Pricing Page Test
  group('Pricing Page', () => {
    const startTime = Date.now();

    const response = http.get(`${BASE_URL}/pricing`);

    const loadTime = Date.now() - startTime;
    pageLoadTime.add(loadTime);
    ttfb.add(response.timings.waiting);

    const success = check(response, {
      'Pricing page status is 200': (r) => r.status === 200,
      'Pricing page loads within 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);
    sleep(1);
  });

  // Static Assets Test
  group('Static Assets', () => {
    // Test common static assets load properly
    const assets = [
      '/favicon.ico',
      '/manifest.json',
    ];

    for (const asset of assets) {
      const response = http.get(`${BASE_URL}${asset}`);

      check(response, {
        [`${asset} loads successfully`]: (r) => r.status === 200 || r.status === 304,
      });
    }

    sleep(0.5);
  });

  // Simulate user think time
  sleep(Math.random() * 3 + 1);
}

// Setup function - runs once before the test
export function setup() {
  console.log('Starting load test...');
  console.log(`Target URL: ${BASE_URL}`);

  // Verify the server is up
  const response = http.get(`${BASE_URL}/`);
  if (response.status !== 200) {
    throw new Error(`Server not responding. Status: ${response.status}`);
  }

  return { startTime: Date.now() };
}

// Teardown function - runs once after the test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)} seconds`);
}

// Handle test summary
export function handleSummary(data) {
  return {
    'k6-load-summary.json': JSON.stringify(data, null, 2),
    stdout: generateTextSummary(data),
  };
}

function generateTextSummary(data) {
  const { metrics } = data;

  let summary = `
================================================================================
                           LOAD TEST SUMMARY
================================================================================

REQUESTS
--------
Total Requests:    ${metrics.http_reqs?.values?.count || 0}
Failed Requests:   ${metrics.http_req_failed?.values?.passes || 0}

RESPONSE TIMES (ms)
-------------------
Average:           ${metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}
Median (p50):      ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2) || 'N/A'}
95th Percentile:   ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}
99th Percentile:   ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'}
Max:               ${metrics.http_req_duration?.values?.max?.toFixed(2) || 'N/A'}

TIME TO FIRST BYTE (ms)
-----------------------
Average:           ${metrics.time_to_first_byte?.values?.avg?.toFixed(2) || 'N/A'}
95th Percentile:   ${metrics.time_to_first_byte?.values?.['p(95)']?.toFixed(2) || 'N/A'}

ERROR RATE
----------
Rate:              ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%

VIRTUAL USERS
-------------
Max VUs:           ${metrics.vus_max?.values?.max || 0}

================================================================================
`;

  return summary;
}
