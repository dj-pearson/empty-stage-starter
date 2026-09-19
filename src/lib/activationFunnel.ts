import {
  ACTIVATION_EVENT_TYPES,
  trackFunnelEvent,
  type ActivationEventType,
} from '@/lib/conversion-tracking';
import { logger } from '@/lib/logger';

/**
 * Activation events fire once per user, not once per action (US-707).
 *
 * The acquisition half of the funnel counts visits: a landing view is one row
 * per visitor, and adding them up is the number you want. Activation is a
 * different question -- "did this account ever get used" -- and the same
 * arithmetic gives the wrong answer for it. `food_added` on every add would put
 * hundreds of rows per household into a table whose other rows are one per
 * visitor, and the dashboard, which reads raw counts, would show more foods
 * added than accounts created. A funnel step that exceeds the step above it is
 * not a funnel; it is a chart nobody trusts twice.
 *
 * So the first one wins and the rest are dropped, remembered per user id under
 * one localStorage key.
 *
 * WHAT THIS IS NOT. It is not a guarantee of exactly one row per user. A
 * parent who adds their first food on a phone and again on a laptop produces
 * two, because the marker is per device, and clearing site data forgets it.
 * That is accepted rather than worked around: the alternative is a read of the
 * events table before every write, which costs a round trip on a write path to
 * make an analytics number tidier. The view this feeds counts DISTINCT user_id
 * for the activation steps, so a duplicate cannot inflate the figure anyway --
 * the marker is about keeping the table's volume sane, not about correctness.
 */

const STORAGE_KEY = 'eatpal.activation.fired';

/** Everything already fired, as `{ [userId]: eventType[] }`. */
type FiredByUser = Record<string, string[]>;

/**
 * Pure: has this user already fired this event?
 *
 * Exported so the decision can be tested without a browser, which is the half
 * that has the bug in it.
 */
export function hasFired(
  fired: FiredByUser,
  userId: string,
  event: ActivationEventType,
): boolean {
  return (fired[userId] ?? []).includes(event);
}

/** Pure: the record with this event marked, leaving other users untouched. */
export function withFired(
  fired: FiredByUser,
  userId: string,
  event: ActivationEventType,
): FiredByUser {
  if (hasFired(fired, userId, event)) return fired;
  return { ...fired, [userId]: [...(fired[userId] ?? []), event] };
}

/**
 * Read the record. Anything unreadable reads as empty, which fires the event
 * again rather than losing it -- the failure that costs nothing.
 */
export function readFired(): FiredByUser {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // One bad entry must not discard every other user's markers.
    const out: FiredByUser = {};
    for (const [user, events] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(events)) out[user] = events.filter((e): e is string => typeof e === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

function writeFired(fired: FiredByUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fired));
  } catch {
    /* private window, blocked storage, quota. The event still fired. */
  }
}

/**
 * Emit an activation event the first time this user reaches it.
 *
 * Returns whether it fired, so a caller can assert on it. A missing userId is
 * a no-op: an activation event with nobody attached cannot be joined to the
 * domain tables, which is the whole reason this funnel exists rather than the
 * GA4 one it replaces.
 */
export function trackActivationOnce(
  event: ActivationEventType,
  userId: string | null | undefined,
  eventData?: Record<string, unknown>,
): boolean {
  if (!userId) return false;
  if (typeof window === 'undefined') return false;

  const fired = readFired();
  if (hasFired(fired, userId, event)) return false;

  writeFired(withFired(fired, userId, event));
  void trackFunnelEvent(event, eventData).catch((err) => {
    logger.warn('[activation] failed to record an activation event', err);
  });
  return true;
}

/** Drop one user's markers. Used by the sign-out scrub and by tests. */
export function forgetActivation(userId: string): void {
  const fired = readFired();
  if (!(userId in fired)) return;
  const { [userId]: _dropped, ...rest } = fired;
  writeFired(rest);
}

export { ACTIVATION_EVENT_TYPES };
export const ACTIVATION_STORAGE_KEY = STORAGE_KEY;
