import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * US-861: supabase.auth.getUser() goes to the network. Every time.
 *
 * Measured against a built app and the fake backend, on one page load with
 * nothing clicked:
 *
 *   /dashboard          18 x GET /auth/v1/user
 *   /dashboard/grocery  12 x
 *   /dashboard/planner  10 x
 *   /dashboard/pantry   10 x
 *
 * 101 call sites ask for it, nearly all of them only to read `user.id`, and
 * they mount within a few hundred milliseconds of each other. getSession()
 * would have answered every one of them from localStorage; getUser() is the one
 * that revalidates the token against GoTrue, which is why it is the slow one.
 *
 * Changing 101 call sites is a different piece of work. This is the one place
 * that fixes all of them: a wrapper on the client's own method that
 *
 *   - shares a single in-flight request between concurrent callers, which is
 *     what the mount storm actually is;
 *   - serves a recent result from memory for CACHE_MS afterwards;
 *   - throws the cache away on any auth state change, so a sign-in, a sign-out
 *     or a token refresh is never answered from the previous session.
 *
 * WHAT IT DOES NOT CACHE. A call with an explicit JWT -- getUser(someToken) --
 * is asking a different question about a different token and always goes to the
 * network. A failed call is not cached either: an error is usually transient
 * and caching one would turn a blip into CACHE_MS of a signed-out-looking app.
 *
 * CACHE_MS is a backstop, not the mechanism. The dedupe removes the storm; the
 * window keeps a component that mounts a moment later from starting a second
 * one. Thirty seconds is short enough that a token revoked elsewhere is noticed
 * about as quickly as it was before, given supabase-js refreshes on its own
 * schedule regardless.
 */
export const CACHE_MS = 30_000;

type AuthClient = SupabaseClient['auth'];
type GetUser = AuthClient['getUser'];
type GetUserResult = Awaited<ReturnType<GetUser>>;

export interface GetUserCache {
  /** The wrapped function to install in place of the original. */
  getUser: GetUser;
  /** Drop anything remembered. Called on every auth state change. */
  invalidate: () => void;
  /** Calls that actually reached the network. For the test, and for a console. */
  networkCalls: () => number;
}

export function createGetUserCache(
  original: GetUser,
  now: () => number = () => Date.now()
): GetUserCache {
  let cached: { at: number; result: GetUserResult } | null = null;
  let inFlight: Promise<GetUserResult> | null = null;
  let networkCalls = 0;

  const invalidate = () => {
    cached = null;
    inFlight = null;
  };

  const getUser = (async (jwt?: string) => {
    // A specific token is a specific question. Never answered from here.
    if (jwt !== undefined) {
      networkCalls += 1;
      return original(jwt);
    }

    if (cached && now() - cached.at < CACHE_MS) return cached.result;
    if (inFlight) return inFlight;

    networkCalls += 1;
    inFlight = (async () => {
      const result = await original();
      // Only a good answer is worth remembering; see the note above.
      if (!result.error) cached = { at: now(), result };
      inFlight = null;
      return result;
    })();

    return inFlight;
  }) as GetUser;

  return { getUser, invalidate, networkCalls: () => networkCalls };
}

/**
 * Install the cache on a live client and wire its invalidation to auth events.
 * Returns the cache so a caller (a test, or a debug console) can inspect it.
 */
export function installGetUserCache(client: SupabaseClient): GetUserCache {
  const cache = createGetUserCache(client.auth.getUser.bind(client.auth));
  client.auth.getUser = cache.getUser;
  client.auth.onAuthStateChange(() => cache.invalidate());
  return cache;
}
