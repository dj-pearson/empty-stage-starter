import type { BrowserContext, Page } from '@playwright/test';

/**
 * Put a signed-in session in the browser before the app boots (US-778).
 *
 * Fifteen spec files need a session and were skipped for want of one, so every
 * authenticated screen -- the planner, the grocery list, settings -- was
 * unreachable to any browser test. That is also why the accessibility scan only
 * ever covered marketing pages, which is the half of the app nobody is logged
 * into: the ~109 nameless icon buttons it never saw are all behind the login.
 *
 * This does not drive a login form. supabase-js keeps its session in
 * localStorage under `storageKey`, restores it synchronously on construction,
 * and only talks to GoTrue afterwards -- so writing the session before any app
 * code runs is both simpler and far more stable than typing into a form and
 * waiting on a redirect. scripts/dev/fake-postgrest.mjs answers the handful of
 * /auth/v1 calls that follow.
 *
 * Requires a build pointed at the fake backend: the app instantiates a MOCK
 * Supabase client when VITE_SUPABASE_URL is unset, and a mock client has no
 * session to restore no matter what is in storage.
 */

/** Must match `storageKey` in src/integrations/supabase/client.ts. */
export const SUPABASE_STORAGE_KEY = 'sb-auth-token';

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_USER_EMAIL = 'e2e@example.test';

const TEST_JWT_PAYLOAD = Buffer.from(
  JSON.stringify({
    sub: TEST_USER_ID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: 4102444800,
    iat: 1767225600,
    email: TEST_USER_EMAIL,
  })
).toString('base64url');

/** JWT-shaped so client code can decode `sub` and `role`; verified by nothing. */
export const TEST_ACCESS_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${TEST_JWT_PAYLOAD}.e2e-not-a-real-signature`;

export const TEST_SESSION = {
  access_token: TEST_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  // Far out, so supabase-js never refreshes mid-test and no assertion ends up
  // racing a token rotation.
  expires_at: 4102444800,
  refresh_token: 'e2e-refresh-token',
  user: {
    id: TEST_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_USER_EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    last_sign_in_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
  },
};

/**
 * Sign the context in for every page it opens.
 *
 * addInitScript rather than an evaluate after goto: the session has to exist
 * before the app's first render, or ProtectedRoute redirects to /auth and the
 * test asserts against the login screen while looking like it loaded the page.
 */
export async function signIn(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ([key, session]) => {
      try {
        window.localStorage.setItem(key as string, JSON.stringify(session));
      } catch {
        // A context that blocks storage cannot be signed in; the test that
        // needs it will fail on its own assertion, which is clearer than
        // throwing from a fixture.
      }
    },
    [SUPABASE_STORAGE_KEY, TEST_SESSION] as const
  );
}

/** True once the app has settled on an authenticated route rather than /auth. */
export async function isSignedIn(page: Page): Promise<boolean> {
  return !new URL(page.url()).pathname.startsWith('/auth');
}
