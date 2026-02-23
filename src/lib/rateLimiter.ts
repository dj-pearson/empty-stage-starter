/**
 * Client-side rate limiter using a sliding window algorithm.
 *
 * Limits login attempts per email to prevent brute force attacks.
 * Stores attempt counts in localStorage with timestamps.
 */

const STORAGE_KEY = 'eatpal_rate_limits';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitEntry {
  attempts: number[];
}

type RateLimitStore = Record<string, RateLimitEntry>;

function getStore(): RateLimitStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as RateLimitStore;
  } catch {
    return {};
  }
}

function saveStore(store: RateLimitStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or disabled — degrade gracefully
  }
}

function getKey(email: string, action: string): string {
  return `${action}:${email.toLowerCase().trim()}`;
}

/** Remove expired attempts from an entry */
function pruneAttempts(entry: RateLimitEntry): number[] {
  const cutoff = Date.now() - WINDOW_MS;
  return entry.attempts.filter((ts) => ts > cutoff);
}

/**
 * Check if a rate limit has been hit for the given email and action.
 *
 * @returns object with `allowed`, `remaining` attempts, and `retryAfterMs`
 */
export function checkRateLimit(
  email: string,
  action = 'login',
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const store = getStore();
  const key = getKey(email, action);
  const entry = store[key] ?? { attempts: [] };
  const validAttempts = pruneAttempts(entry);

  if (validAttempts.length >= MAX_ATTEMPTS) {
    const oldestAttempt = validAttempts[0];
    const retryAfterMs = oldestAttempt + WINDOW_MS - Date.now();
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - validAttempts.length,
    retryAfterMs: 0,
  };
}

/**
 * Record a login attempt for rate limiting.
 */
export function recordAttempt(email: string, action = 'login'): void {
  const store = getStore();
  const key = getKey(email, action);
  const entry = store[key] ?? { attempts: [] };

  entry.attempts = [...pruneAttempts(entry), Date.now()];
  store[key] = entry;
  saveStore(store);
}

/**
 * Clear rate limit for an email (e.g., on successful login).
 */
export function clearRateLimit(email: string, action = 'login'): void {
  const store = getStore();
  const key = getKey(email, action);
  delete store[key];
  saveStore(store);
}

/**
 * Format milliseconds into a human-readable "X min Y sec" string.
 */
export function formatRetryAfter(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes} min ${seconds} sec`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return `${seconds} sec`;
}
