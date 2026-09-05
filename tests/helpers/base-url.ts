/**
 * One definition of where the specs point (US-764).
 *
 * Twenty of the twenty-eight spec files declared their own
 * `const BASE_URL = 'http://localhost:8080'` and navigated to it directly,
 * which meant they ignored the `baseURL` playwright.config.ts sets. Running
 * them against anything other than a dev server on 8080 -- a preview build, a
 * staging URL, the E2E_TARGET=dist server on 4173 that the config actually
 * starts -- produced ECONNREFUSED on every test, so the suite could not be
 * pointed at CI's server at all. That is the concrete reason 28 spec files sat
 * outside CI: not neglect, but that switching them on would have failed
 * instantly and told you nothing.
 *
 * Specs should navigate with relative paths (`page.goto('/pricing')`) and let
 * the config resolve them. BASE_URL is exported for the handful of places that
 * genuinely need an absolute URL: a `page.request.get()` of an asset, and the
 * `url:` field of a mocked route fulfilment.
 *
 * playwright.config.ts imports from here so the port cannot drift between the
 * server the config starts and the URL the specs use.
 */

export const TARGET_DIST = process.env.E2E_TARGET === 'dist';

/** 4173 serves a built dist/; 8080 is the vite dev server. */
export const PORT = TARGET_DIST ? 4173 : 8080;

/** Overridable so a run can be aimed at a preview or staging deployment. */
export const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Which built directory the dist server serves (US-778).
 *
 * The default `dist/` is built without Supabase credentials, so the app
 * instantiates a MOCK client -- which has no session to restore no matter what
 * a test writes into localStorage, and every authenticated route redirects to
 * /auth. Authenticated runs build a second tree against the fake backend and
 * point here at it.
 */
export const DIST_DIR = process.env.E2E_DIST ?? 'dist';
