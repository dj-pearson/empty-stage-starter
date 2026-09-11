import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-863: the planner asks for the week's votes once.
 *
 * VoteResultsDisplay renders once per meal cell and used to do its own fetch and
 * open its own realtime channel. Measured on the built planner with a week of
 * meals on screen: 8 identical GET /rest/v1/meal_votes per load. A full week at
 * three slots a day is 21 cells, so 21 queries and 21 channels, every one of
 * them watching the same table.
 *
 * src/lib/mealVotesStore.ts collects the keys the mounted cells ask for and
 * issues one query for the union. After: 1.
 *
 * THE BUDGET IS 2, not 1: the store issues a second query when cells are keyed
 * by recipe+date+slot rather than by plan entry, which is a different shape the
 * planner can produce. Anything above that is per-cell fetching returning.
 */
const MAX_VOTE_QUERIES = 2;

test.describe('planner vote queries', () => {
  test('the week costs one meal_votes query, and the votes still render', async ({
    page,
    context,
  }) => {
    await signIn(context);

    const queries: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/rest/v1/meal_votes' && request.method() === 'GET') {
        queries.push(url.search);
      }
    });

    await page.goto('/dashboard/planner');
    await page.waitForLoadState('networkidle');
    await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
    // Past the store's collect window and the tween on the week grid.
    await page.waitForTimeout(4000);

    expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

    const body = await page.locator('main, [role="main"]').first().innerText();
    const badges = body.match(/\d+% (Approved|Mixed|Low)/g) ?? [];

    // The floor, and the whole reason this is not just a request count: a
    // planner that renders no votes makes no queries and would otherwise pass.
    expect(badges.length, 'no vote badges rendered, so the query count means nothing').toBeGreaterThanOrEqual(1);

    expect(
      queries.length,
      `${queries.length} meal_votes queries for one week; per-cell fetching is back:\n${queries.join('\n')}`
    ).toBeLessThanOrEqual(MAX_VOTE_QUERIES);
    expect(queries.length, 'no meal_votes query at all').toBeGreaterThanOrEqual(1);
  });
});
