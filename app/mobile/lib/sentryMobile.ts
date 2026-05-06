/**
 * US-134: Mobile crash reporting shim.
 *
 * Why a shim instead of `@sentry/react-native`?
 *
 *   `@sentry/react-native` is a native dep — adding it to package.json forces
 *   an Expo prebuild + EAS rebuild for the next release, which is a bigger
 *   change than this story is allowed to introduce. Until that prebuild lands,
 *   this shim:
 *
 *     - On web: forwards to the already-initialised `@sentry/react` so JS
 *       errors thrown inside the Expo-web preview still flow into the same
 *       project as the production web bundle.
 *     - On native: writes a structured console.error so Metro/Logcat capture
 *       it, and stashes the latest crash in expo-secure-store so the next
 *       launch can replay it once @sentry/react-native is wired up.
 *
 * When the team adds @sentry/react-native:
 *   1. Replace the native branch of `captureMobileError` with `Sentry.captureException(...)`.
 *   2. Replace the native branch of `addBreadcrumb` with `Sentry.addBreadcrumb(...)`.
 *   3. Replace the native branch of `sendUserFeedback` with `Sentry.captureFeedback({ ... })`.
 *   4. Drain any queued crashes from `secureStore` on app start.
 *
 * The interface here is the API the rest of the mobile code should target,
 * so swapping the implementation is a one-file change.
 */

import { Platform } from 'react-native';

interface CaptureOptions {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

interface BreadcrumbInput {
  category: string;
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
}

interface UserFeedbackInput {
  message: string;
  error: Error | null;
  platform: string;
}

const QUEUE_KEY = 'eatpal.mobile.sentryQueue';
const MAX_QUEUE_SIZE = 25;

/** Strip PII so we don't send email/name into Sentry. Mirrors src/lib/sentry.tsx. */
function scrubPII(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) return input;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('email') ||
      lowerKey.includes('name') ||
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('authorization')
    ) {
      out[key] = '[scrubbed]';
      continue;
    }
    out[key] = value;
  }
  return out;
}

async function persistToSecureStore(payload: unknown): Promise<void> {
  try {
    const SecureStore = await import('expo-secure-store').catch(() => null);
    if (!SecureStore) return;
    const existing = (await SecureStore.getItemAsync(QUEUE_KEY)) ?? '[]';
    const queue: unknown[] = JSON.parse(existing);
    queue.push(payload);
    while (queue.length > MAX_QUEUE_SIZE) queue.shift();
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // SecureStore unavailable on this platform — ignore.
  }
}

export function captureMobileError(error: Error, options: CaptureOptions = {}): void {
  const sanitisedExtra = scrubPII(options.extra);

  if (Platform.OS === 'web') {
    // Forward to the web Sentry that's already initialised in src/lib/sentry.tsx.
    void import('@sentry/react')
      .then(({ captureException, withScope }) => {
        withScope((scope) => {
          if (options.tags) {
            for (const [k, v] of Object.entries(options.tags)) scope.setTag(k, v);
          }
          if (sanitisedExtra) {
            for (const [k, v] of Object.entries(sanitisedExtra)) scope.setExtra(k, v);
          }
          captureException(error);
        });
      })
      .catch(() => {
        console.error('[mobile-crash][web-fallback]', error.message, error.stack);
      });
    return;
  }

  // Native: log + queue. Replace with @sentry/react-native captureException.
  const payload = {
    kind: 'error',
    message: error.message,
    stack: error.stack?.slice(0, 4000),
    tags: options.tags,
    extra: sanitisedExtra,
    timestamp: Date.now(),
  };
  console.error('[mobile-crash]', JSON.stringify(payload));
  void persistToSecureStore(payload);
}

const inMemoryBreadcrumbs: BreadcrumbInput[] = [];
const MAX_IN_MEMORY_BREADCRUMBS = 50;

export function addBreadcrumb(crumb: BreadcrumbInput): void {
  // Keep a small ring buffer so the next captureMobileError can attach recent
  // navigation/API breadcrumbs even before native Sentry is wired up.
  inMemoryBreadcrumbs.push({ ...crumb, data: scrubPII(crumb.data) });
  while (inMemoryBreadcrumbs.length > MAX_IN_MEMORY_BREADCRUMBS) {
    inMemoryBreadcrumbs.shift();
  }

  if (Platform.OS === 'web') {
    void import('@sentry/react')
      .then(({ addBreadcrumb: sentryBreadcrumb }) => {
        sentryBreadcrumb({
          category: crumb.category,
          level: crumb.level ?? 'info',
          message: crumb.message,
          data: scrubPII(crumb.data),
        });
      })
      .catch(() => {});
  }
}

/** Read the in-memory breadcrumb buffer (test + native-replay use). */
export function recentBreadcrumbs(): BreadcrumbInput[] {
  return [...inMemoryBreadcrumbs];
}

export function sendUserFeedback(input: UserFeedbackInput): void {
  const payload = {
    kind: 'feedback',
    message: input.message,
    errorMessage: input.error?.message,
    platform: input.platform,
    timestamp: Date.now(),
  };

  if (Platform.OS === 'web') {
    void import('@sentry/react')
      .then(({ captureFeedback }) => {
        captureFeedback({ message: input.message });
      })
      .catch(() => {
        console.warn('[mobile-feedback][web-fallback]', payload);
      });
    return;
  }

  console.warn('[mobile-feedback]', JSON.stringify(payload));
  void persistToSecureStore(payload);
}
