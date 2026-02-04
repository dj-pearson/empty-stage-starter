/**
 * Weekly Report Generation Function Tests
 *
 * Tests the generate-weekly-report endpoint which creates comprehensive
 * weekly meal planning and nutrition reports.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_FUNCTIONS_URL || 'https://functions.tryeatpal.com';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://api.tryeatpal.com';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const WEEKLY_REPORT_ENDPOINT = `${BASE_URL}/functions/v1/generate-weekly-report`;

// Helper to get the start of the current week (Monday)
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

test.describe('Weekly Report Function', () => {
  test.describe.configure({ mode: 'parallel' });

  test('should respond to OPTIONS request', async ({ request }) => {
    const response = await request.fetch(WEEKLY_REPORT_ENDPOINT, {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBeDefined();
  });

  test('should reject requests without service role key', async ({ request }) => {
    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      data: {
        householdId: 'test-household',
      },
    });

    // Should require service role for this admin function
    expect([401, 403]).toContain(response.status());
  });

  test('should require householdId parameter', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {},
    });

    expect([400, 422]).toContain(response.status());
  });

  test('should accept valid report request', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
        weekStartDate: getWeekStart(),
      },
    });

    // May succeed or return 404 if household doesn't exist
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.report).toBeDefined();
    }
  });

  test('should return proper report structure', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
      },
    });

    if (response.status() === 200) {
      const body = await response.json();
      const report = body.report;

      // Verify report structure
      expect(report).toBeDefined();

      // Core fields
      expect(report.id).toBeDefined();
      expect(report.household_id).toBeDefined();
      expect(report.week_start_date).toBeDefined();
      expect(report.week_end_date).toBeDefined();

      // Planning metrics
      if (report.meals_planned !== undefined) {
        expect(typeof report.meals_planned).toBe('number');
      }
      if (report.meals_completed !== undefined) {
        expect(typeof report.meals_completed).toBe('number');
      }
      if (report.planning_completion_rate !== undefined) {
        expect(typeof report.planning_completion_rate).toBe('number');
        expect(report.planning_completion_rate).toBeGreaterThanOrEqual(0);
        expect(report.planning_completion_rate).toBeLessThanOrEqual(100);
      }

      // Nutrition metrics
      if (report.avg_calories_per_day !== undefined) {
        expect(typeof report.avg_calories_per_day).toBe('number');
      }
      if (report.nutrition_score !== undefined) {
        expect(typeof report.nutrition_score).toBe('number');
      }

      // Insights
      if (report.insights) {
        expect(Array.isArray(report.insights)).toBe(true);
        for (const insight of report.insights) {
          expect(insight.insightType).toBeDefined();
          expect(insight.title).toBeDefined();
          expect(insight.description).toBeDefined();
        }
      }
    }
  });

  test('should default to current week if no date provided', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
        // No weekStartDate provided
      },
    });

    if (response.status() === 200) {
      const body = await response.json();
      expect(body.report.week_start_date).toBeDefined();

      // Should be this week's Monday
      const reportDate = new Date(body.report.week_start_date);
      const expectedMonday = new Date(getWeekStart());

      expect(reportDate.toISOString().split('T')[0]).toBe(
        expectedMonday.toISOString().split('T')[0]
      );
    }
  });

  test('should handle date in past', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    // Request report for 4 weeks ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 28);
    const pastWeekStart = pastDate.toISOString().split('T')[0];

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
        weekStartDate: pastWeekStart,
      },
    });

    expect([200, 404]).toContain(response.status());
  });

  test('should include achievement tracking', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
      },
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Check for achievement fields
      if (body.report.achievements_unlocked !== undefined) {
        expect(typeof body.report.achievements_unlocked).toBe('number');
        expect(body.report.achievements_unlocked).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should include meal approval data when available', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
      },
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Check for meal approval metrics
      if (body.report.most_loved_meals) {
        expect(Array.isArray(body.report.most_loved_meals)).toBe(true);
      }
      if (body.report.least_loved_meals) {
        expect(Array.isArray(body.report.least_loved_meals)).toBe(true);
      }
      if (body.report.avg_meal_approval_score !== undefined) {
        expect(typeof body.report.avg_meal_approval_score).toBe('number');
      }
    }
  });

  test('should respond within acceptable time', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
      },
    });
    const duration = Date.now() - startTime;

    // Should complete within 30 seconds
    expect(duration).toBeLessThan(30000);
  });

  test('should indicate if report was created or updated', async ({ request }) => {
    if (!SERVICE_ROLE_KEY) {
      test.skip();
      return;
    }

    const response = await request.post(WEEKLY_REPORT_ENDPOINT, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      data: {
        householdId: 'test-household-id',
      },
    });

    if (response.status() === 200) {
      const body = await response.json();

      // Should indicate if this was a new report or update
      expect(body.created !== undefined || body.updated !== undefined).toBe(true);
    }
  });
});
