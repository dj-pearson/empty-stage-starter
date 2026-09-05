/**
 * Legacy top-level URLs that redirect to their canonical /dashboard route
 * (US-766).
 *
 * Each of these used to MOUNT A SECOND COPY of the whole Dashboard shell plus
 * its page, so /pantry and /dashboard/pantry were two different React trees
 * with their own state: a filter set on one did not exist on the other, and a
 * dialog left open on one stayed open when you navigated back to it. US-719
 * found and fixed exactly this for /planner and left the other eight standing.
 *
 * They stay as redirects rather than being deleted because they are real URLs
 * people have bookmarked and other pages linked to for a long time. The
 * redirect is the cheap half; public/_redirects carries a 301 for each so a
 * crawler and a cold load resolve without a client-side hop.
 *
 * One list, consumed by src/App.tsx, the test that pins the behaviour, and the
 * check that keeps them out of the prerender and sitemap. Adding an alias in
 * one place and forgetting the other three is how the first eight survived.
 */

export const ROUTE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  '/kids': '/dashboard/kids',
  '/pantry': '/dashboard/pantry',
  '/recipes': '/dashboard/recipes',
  '/planner': '/dashboard/planner',
  '/grocery': '/dashboard/grocery',
  '/food-tracker': '/dashboard/food-tracker',
  '/meal-builder': '/dashboard/meal-builder',
  '/insights': '/dashboard/insights',
  '/sibling-meal-finder': '/dashboard/sibling-meal-finder',
});

/** `[['/kids', '/dashboard/kids'], ...]` for rendering and for tests. */
export const ROUTE_ALIAS_ENTRIES: ReadonlyArray<readonly [string, string]> = Object.freeze(
  Object.entries(ROUTE_ALIASES).map(([from, to]) => Object.freeze([from, to]) as [string, string])
);
