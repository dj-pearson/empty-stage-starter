import { test } from '@playwright/test';

/**
 * Mark a spec file as needing a live Supabase (US-764).
 *
 * Fifteen of the spec files sign in, read a household's rows, or drive a
 * checkout. Run against a `dist/` built without credentials they do not fail
 * for an interesting reason -- every test dies at the same login step -- so
 * including them in CI would produce a permanently red job that tells you
 * nothing about the change under review.
 *
 * They are skipped rather than deleted because they are the specs worth having
 * once there is an environment to run them against: point E2E_BACKEND=1 at a
 * seeded staging project and they run as written.
 *
 * The skip reason is deliberately specific. A test that reports "skipped" with
 * no explanation is indistinguishable from one somebody disabled to get a build
 * green, which is how suites rot.
 */
export function requiresLiveBackend(
  reason = 'needs an authenticated session against a live Supabase; set E2E_BACKEND=1 to run'
) {
  test.skip(!process.env.E2E_BACKEND, reason);
}
