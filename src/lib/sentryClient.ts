/**
 * US-844: the Sentry SDK is 126 kB gzipped and it was downloaded before the
 * landing page could render.
 *
 * main.tsx already deferred the CALL:
 *
 *     requestIdleCallback(initSentryDeferred, { timeout: 4000 })
 *
 * with the comment "Defer Sentry initialization to after first render to
 * reduce TBT". But `import { initializeSentry } from './lib/sentry'` is a
 * STATIC import, and sentry.tsx opens with `import * as Sentry from
 * '@sentry/react'`, so the whole SDK sat in the entry chunk's static closure.
 * Deferring the call postpones nothing the browser has to do: the bytes are
 * fetched, parsed and evaluated before the app runs either way.
 *
 * Measured on the current build: the eager closure is 386.3 kB gz across nine
 * chunks, and vendor-sentry is 126.1 kB of it -- a third, and the largest
 * single member, larger than the app's own entry chunk at 114.3 kB. Every
 * visitor to the landing page, a blog post or a programmatic guide paid it,
 * and those pages are the whole SEO strategy.
 *
 * FOUR MODULES pinned it into the closure -- sentry.tsx, api-errors.ts,
 * storageCleanup.ts (via KidsContext) and consentEnforcement.ts -- so removing
 * one would have moved nothing. This module is the only place that names
 * '@sentry/react', and it names it inside a dynamic import().
 *
 * REPORTING IS NOT WEAKENED. Errors raised before the SDK finishes loading are
 * queued and flushed, so the window between first paint and idle-callback
 * initialisation reports exactly as it did before -- which is to say, it now
 * reports MORE, because previously that window had no initialised client
 * either and captureException went nowhere.
 */

type SentryModule = typeof import('@sentry/react');

let modulePromise: Promise<SentryModule> | null = null;
let loaded: SentryModule | null = null;

/** Errors raised before the SDK arrived, flushed in order once it does. */
const pending: Array<(sentry: SentryModule) => void> = [];
const MAX_PENDING = 50;

/**
 * Start (or join) the download. Only call when Sentry is actually going to be
 * used -- initializeSentry decides that, not the error paths.
 */
export function loadSentry(): Promise<SentryModule> {
  if (!modulePromise) {
    modulePromise = import('@sentry/react').then((mod) => {
      loaded = mod;
      const queued = pending.splice(0, pending.length);
      for (const fn of queued) {
        try {
          fn(mod);
        } catch {
          // One bad report must not swallow the rest of the queue.
        }
      }
      return mod;
    });
  }
  return modulePromise;
}

/** The SDK if it is already in memory. Never starts a download. */
export function loadedSentry(): SentryModule | null {
  return loaded;
}

/** True once something has asked for the SDK, whether or not it has arrived. */
export function sentryRequested(): boolean {
  return modulePromise !== null;
}

/**
 * Run `fn` against the SDK: now if it is here, on arrival if it is coming, and
 * never if nothing has asked for it.
 *
 * The last case is the one that keeps this cheap. A dev session, or a visitor
 * who loads a page in an environment where Sentry is switched off, must not
 * pull 126 kB because something called logError.
 */
export function withSentry(fn: (sentry: SentryModule) => void): void {
  if (loaded) {
    fn(loaded);
    return;
  }
  if (!modulePromise) return;
  if (pending.length >= MAX_PENDING) return;
  pending.push(fn);
}

/** Test seam: forget the module and the queue. */
export function resetSentryClientForTests(): void {
  modulePromise = null;
  loaded = null;
  pending.length = 0;
}
