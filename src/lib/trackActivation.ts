import type { ActivationEventType } from '@/lib/conversion-tracking';

/**
 * Fire an activation event without putting the funnel on the first paint
 * (US-772).
 *
 * Every call site is a user action -- a food added, a kid created, a meal
 * planned -- so none of them happens before the page is interactive. But the
 * three contexts that call it are eager, so a static import pulled
 * activationFunnel, conversion-tracking and fetchAllRows into the entry chunk:
 * 0.9 kB gz of analytics that a visitor downloads before they can read
 * anything, to describe something they have not done yet.
 *
 * Deliberately fire-and-forget, and deliberately silent on failure. The
 * synchronous version returned a boolean saying whether it had fired; no call
 * site read it, and none could here without making an optimistic write wait on
 * an analytics import. A dropped activation event is a missing row on a
 * dashboard; a rejected promise in a context is a caller's write failing.
 */
export function trackActivationOnce(
  event: ActivationEventType,
  userId: string | null | undefined,
  eventData?: Record<string, unknown>,
): void {
  if (!userId) return;
  if (typeof window === 'undefined') return;

  void import('./activationFunnel')
    .then((module) => {
      module.trackActivationOnce(event, userId, eventData);
    })
    .catch(() => {
      // Analytics is not worth a console error on a page that works.
    });
}
