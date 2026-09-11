import { logger } from '@/lib/logger';

/**
 * US-866: account-level questions asked once per page, not once per consumer.
 *
 * Several hooks ask the same thing about the signed-in user, from different
 * components, at the same moment. Measured on the built app, per dashboard page
 * load, after the duplicate shell was removed:
 *
 *   GET  /rest/v1/user_subscriptions        x3
 *   GET  /rest/v1/user_roles                x2
 *   POST /rest/v1/rpc/current_user_has_password  x2
 *
 * useNavEntitlements is mounted by both AppSidebar and Dashboard and fetches a
 * role and a subscription in each; useWhiteLabelTheme then issues the SAME
 * subscription query a third time, byte for byte. None of them is wrong on its
 * own, and there is no query cache in this app for them to share.
 *
 * This is that cache, in the smallest form that solves it: a key, a fetcher,
 * one in-flight request per key, and a short memory. It is deliberately not a
 * general-purpose query library -- no refetch-on-focus, no pagination, no
 * subscriptions. Account state is the case where one page asks one question
 * several times, and that is the case this covers.
 *
 * INVALIDATION IS THE PART THAT MATTERS. Everything is dropped on any auth
 * event, so a sign-in as somebody else can never be answered from the previous
 * user's roles or plan. Anything cached across that boundary would be a data
 * leak between accounts, not a stale render.
 */

/** How long an answer stays good. Long enough for a page load, short enough
 *  that a plan change is noticed on the next navigation. */
export const SHARED_TTL_MS = 30_000;

interface Entry<T> {
  at: number;
  value: T;
}

const cached = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function invalidateSharedQueries(): void {
  cached.clear();
  inFlight.clear();
}

/** Test seam: the clock. */
let now = () => Date.now();
export function __setSharedQueryClock(fn: () => number): void {
  now = fn;
}

/**
 * Run `fetcher` for `key`, or hand back what a concurrent or recent caller got.
 *
 * A rejection is never cached: one failed request must not become SHARED_TTL_MS
 * of a page that thinks the user has no subscription.
 */
export async function sharedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = cached.get(key);
  if (hit && now() - hit.at < SHARED_TTL_MS) return hit.value as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fetcher();
      cached.set(key, { at: now(), value });
      return value;
    } finally {
      // Cleared on both paths, or a failure leaves every later caller awaiting
      // a promise that already rejected.
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** For a console, and for the tests. */
export function sharedQueryStats() {
  return { cached: cached.size, inFlight: inFlight.size };
}

/**
 * Wire invalidation to auth events. Called once from the client module, which
 * is where the auth subscription already lives.
 */
export function installSharedQueryInvalidation(
  onAuthStateChange: (cb: () => void) => void
): void {
  try {
    onAuthStateChange(invalidateSharedQueries);
  } catch (error) {
    // A client without auth (the mock) is not a reason to fail a page.
    logger.debug('sharedQuery invalidation not installed:', error);
  }
}
