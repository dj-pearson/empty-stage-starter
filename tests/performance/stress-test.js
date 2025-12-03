import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * k6 Stress Test Configuration
 *
 * This test pushes the application beyond normal load to find
 * breaking points and verify graceful degradation.
 *
 * Run with: k6 run tests/performance/stress-test.js
 */

// Custom metrics
const errorRate = new Rate('errors');
const timeouts = new Counter('timeouts');
const serverErrors = new Counter('server_errors');
const responseTime = new Trend('response_time');

// Test configuration - aggressive stress testing
export const options = {
  // Stress test stages - push to breaking point
  stages: [
    { duration: '30s', target: 25 },   // Warm up
    { duration: '1m', target: 50 },    // Ramp to moderate load
    { duration: '1m', target: 100 },   // Push to high load
    { duration: '2m', target: 200 },   // Stress point
    { duration: '1m', target: 300 },   // Breaking point test
    { duration: '1m', target: 100 },   // Recovery
    { duration: '30s', target: 0 },    // Cool down
  ],

  // Stress test thresholds (more lenient than load test)
  thresholds: {
    // 90% of requests should complete within 5 seconds
    http_req_duration: ['p(90)<5000'],
    // Less than 10% error rate under stress
    errors: ['rate<0.1'],
    // Track but don't fail on response times
    response_time: ['p(90)<5000'],
  },

  // Batch requests to reduce overhead
  batch: 10,
  batchPerHost: 5,
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// User behavior simulation
export default function () {
  const scenarios = [
    landingPageScenario,
    authPageScenario,
    pricingScenario,
    staticAssetsScenario,
    rapidNavigationScenario,
  ];

  // Randomly pick a scenario to simulate varied user behavior
  const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
  scenario();

  // Minimal sleep to maximize stress
  sleep(Math.random() * 0.5);
}

function landingPageScenario() {
  group('Landing Page - Stress', () => {
    const response = http.get(`${BASE_URL}/`, {
      timeout: '10s',
    });

    responseTime.add(response.timings.duration);

    const success = check(response, {
      'Landing page status is 2xx': (r) => r.status >= 200 && r.status < 300,
      'Landing page not 5xx': (r) => r.status < 500,
    });

    if (response.status >= 500) {
      serverErrors.add(1);
    }

    if (response.status === 0) {
      timeouts.add(1);
    }

    errorRate.add(!success);
  });
}

function authPageScenario() {
  group('Auth Page - Stress', () => {
    const response = http.get(`${BASE_URL}/auth`, {
      timeout: '10s',
    });

    responseTime.add(response.timings.duration);

    const success = check(response, {
      'Auth page status is 2xx': (r) => r.status >= 200 && r.status < 300,
      'Auth page not 5xx': (r) => r.status < 500,
    });

    if (response.status >= 500) {
      serverErrors.add(1);
    }

    errorRate.add(!success);
  });
}

function pricingScenario() {
  group('Pricing Page - Stress', () => {
    const response = http.get(`${BASE_URL}/pricing`, {
      timeout: '10s',
    });

    responseTime.add(response.timings.duration);

    const success = check(response, {
      'Pricing page status is 2xx': (r) => r.status >= 200 && r.status < 300,
      'Pricing page not 5xx': (r) => r.status < 500,
    });

    if (response.status >= 500) {
      serverErrors.add(1);
    }

    errorRate.add(!success);
  });
}

function staticAssetsScenario() {
  group('Static Assets - Stress', () => {
    // Batch request for static assets
    const responses = http.batch([
      ['GET', `${BASE_URL}/favicon.ico`],
      ['GET', `${BASE_URL}/manifest.json`],
    ]);

    responses.forEach((response) => {
      responseTime.add(response.timings.duration);

      const success = check(response, {
        'Asset loads': (r) => r.status === 200 || r.status === 304 || r.status === 404,
      });

      if (response.status >= 500) {
        serverErrors.add(1);
      }

      errorRate.add(!success);
    });
  });
}

function rapidNavigationScenario() {
  group('Rapid Navigation - Stress', () => {
    // Simulate user rapidly navigating between pages
    const pages = ['/', '/auth', '/pricing', '/about', '/'];

    for (const page of pages) {
      const response = http.get(`${BASE_URL}${page}`, {
        timeout: '5s',
      });

      responseTime.add(response.timings.duration);

      const success = check(response, {
        [`${page} loads under stress`]: (r) => r.status >= 200 && r.status < 400,
      });

      if (response.status >= 500) {
        serverErrors.add(1);
      }

      errorRate.add(!success);
    }
  });
}

// Concurrent API simulation
export function concurrentRequests() {
  const pages = [
    `${BASE_URL}/`,
    `${BASE_URL}/auth`,
    `${BASE_URL}/pricing`,
  ];

  const responses = http.batch(
    pages.map((url) => ['GET', url, null, { timeout: '10s' }])
  );

  responses.forEach((response, index) => {
    responseTime.add(response.timings.duration);

    check(response, {
      [`Concurrent request ${index} succeeded`]: (r) => r.status < 500,
    });
  });
}

export function setup() {
  console.log('Starting stress test...');
  console.log(`Target URL: ${BASE_URL}`);
  console.log('This test will push the system beyond normal limits.');
  console.log('Expect some errors - we are testing breaking points.');

  // Verify the server is up
  const response = http.get(`${BASE_URL}/`);
  if (response.status !== 200) {
    throw new Error(`Server not responding. Status: ${response.status}`);
  }

  return {
    startTime: Date.now(),
    initialStatus: response.status,
  };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\nStress test completed in ${duration.toFixed(2)} seconds`);

  // Final health check
  const response = http.get(`${BASE_URL}/`);
  console.log(`Final server status: ${response.status}`);

  if (response.status !== 200) {
    console.log('WARNING: Server may need recovery time after stress test');
  }
}

export function handleSummary(data) {
  return {
    'k6-stress-summary.json': JSON.stringify(data, null, 2),
    stdout: generateStressSummary(data),
  };
}

function generateStressSummary(data) {
  const { metrics } = data;

  const errorCount = metrics.http_req_failed?.values?.passes || 0;
  const totalRequests = metrics.http_reqs?.values?.count || 0;
  const serverErrorCount = metrics.server_errors?.values?.count || 0;
  const timeoutCount = metrics.timeouts?.values?.count || 0;

  let summary = `
================================================================================
                          STRESS TEST SUMMARY
================================================================================

TEST OVERVIEW
-------------
Total Requests:        ${totalRequests}
Max Virtual Users:     ${metrics.vus_max?.values?.max || 0}
Test Duration:         ${(metrics.iteration_duration?.values?.avg / 1000)?.toFixed(2) || 'N/A'}s avg iteration

ERRORS & FAILURES
-----------------
Failed Requests:       ${errorCount} (${((errorCount / totalRequests) * 100).toFixed(2)}%)
Server Errors (5xx):   ${serverErrorCount}
Timeouts:              ${timeoutCount}

RESPONSE TIMES (ms)
-------------------
Average:               ${metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}
Median (p50):          ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2) || 'N/A'}
90th Percentile:       ${metrics.http_req_duration?.values?.['p(90)']?.toFixed(2) || 'N/A'}
95th Percentile:       ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2) || 'N/A'}
99th Percentile:       ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2) || 'N/A'}
Max:                   ${metrics.http_req_duration?.values?.max?.toFixed(2) || 'N/A'}

THROUGHPUT
----------
Requests/second:       ${metrics.http_reqs?.values?.rate?.toFixed(2) || 'N/A'}

BREAKING POINT ANALYSIS
-----------------------
${errorCount / totalRequests > 0.05 ? '! High error rate detected - system may be at capacity' : 'System handled stress within acceptable limits'}
${serverErrorCount > 0 ? `! ${serverErrorCount} server errors occurred - check server logs` : 'No server-side errors detected'}
${timeoutCount > 0 ? `! ${timeoutCount} requests timed out - consider scaling` : 'No timeouts detected'}
${(metrics.http_req_duration?.values?.['p(95)'] || 0) > 5000 ? '! 95th percentile response time > 5s - performance degradation detected' : 'Response times within acceptable range'}

RECOMMENDATIONS
---------------
${generateRecommendations(metrics, errorCount, totalRequests, serverErrorCount)}

================================================================================
`;

  return summary;
}

function generateRecommendations(metrics, errorCount, totalRequests, serverErrorCount) {
  const recommendations = [];
  const errorRate = errorCount / totalRequests;
  const p95 = metrics.http_req_duration?.values?.['p(95)'] || 0;

  if (errorRate > 0.1) {
    recommendations.push('- Consider adding rate limiting to prevent overload');
    recommendations.push('- Implement circuit breakers for downstream services');
  }

  if (serverErrorCount > 10) {
    recommendations.push('- Review server error logs for root cause');
    recommendations.push('- Consider horizontal scaling');
  }

  if (p95 > 3000) {
    recommendations.push('- Optimize database queries and add caching');
    recommendations.push('- Consider CDN for static assets');
    recommendations.push('- Review and optimize slow endpoints');
  }

  if (metrics.http_req_blocked?.values?.avg > 100) {
    recommendations.push('- Connection pooling may help reduce blocking time');
  }

  if (recommendations.length === 0) {
    recommendations.push('- System performed well under stress');
    recommendations.push('- Continue monitoring in production');
  }

  return recommendations.join('\n');
}
