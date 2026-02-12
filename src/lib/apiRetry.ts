/**
 * API request retry logic with exponential backoff.
 *
 * Retries failed requests on network errors and 5xx status codes.
 * Does NOT retry on 4xx client errors (invalid input, auth failures, etc.).
 */

/** Configuration for retry behavior */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in milliseconds before first retry (default: 1000) */
  initialDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay in milliseconds between retries (default: 10000) */
  maxDelayMs: number;
  /** Optional AbortSignal for cancellation */
  signal?: AbortSignal;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
};

/** Error thrown when a retryable operation is aborted */
export class RetryAbortedError extends Error {
  constructor() {
    super('Retry operation was aborted');
    this.name = 'RetryAbortedError';
  }
}

/**
 * Determines if an error is a network error (no response received).
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false; // User-initiated abort, don't retry
  }
  // Supabase client wraps network errors
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const msg = (error as { message: string }).message.toLowerCase();
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('econnrefused')) {
      return true;
    }
  }
  return false;
}

/**
 * Determines if a Supabase/HTTP error indicates a server error (5xx).
 */
function isServerError(error: unknown): boolean {
  if (error !== null && typeof error === 'object') {
    // Supabase errors may have a `code` or `status` property
    const errObj = error as Record<string, unknown>;
    const status = errObj.status ?? errObj.code;
    if (typeof status === 'number' && status >= 500 && status < 600) {
      return true;
    }
    if (typeof status === 'string') {
      const num = parseInt(status, 10);
      if (!isNaN(num) && num >= 500 && num < 600) {
        return true;
      }
    }
    // Check message for 5xx indicators
    if (typeof errObj.message === 'string') {
      const msg = errObj.message.toLowerCase();
      if (
        msg.includes('internal server error') ||
        msg.includes('bad gateway') ||
        msg.includes('service unavailable') ||
        msg.includes('gateway timeout')
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determines if an error should be retried.
 * Only retries on network errors and 5xx server errors, NOT 4xx client errors.
 */
export function isRetryableError(error: unknown): boolean {
  return isNetworkError(error) || isServerError(error);
}

/**
 * Waits for the specified delay, respecting an optional AbortSignal.
 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetryAbortedError());
      return;
    }

    const timer = setTimeout(resolve, ms);

    if (signal) {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new RetryAbortedError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Calculates the delay for a given attempt using exponential backoff.
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(exponentialDelay, config.maxDelayMs);
}

/**
 * Executes an async operation with retry logic and exponential backoff.
 *
 * @param operation - The async function to execute
 * @param config - Optional retry configuration (partial, merged with defaults)
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted, or RetryAbortedError if cancelled
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 * const result = await withRetry(
 *   () => supabase.from('foods').select('*'),
 *   { maxRetries: 3, signal: controller.signal }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const mergedConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };

  let lastError: unknown;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    // Check if aborted before attempting
    if (mergedConfig.signal?.aborted) {
      throw new RetryAbortedError();
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry abort errors
      if (error instanceof RetryAbortedError || error instanceof DOMException) {
        throw error;
      }

      // Don't retry non-retryable errors (4xx, validation, etc.)
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === mergedConfig.maxRetries) {
        break;
      }

      // Wait with exponential backoff before next attempt
      const delayMs = calculateDelay(attempt, mergedConfig);

      if (import.meta.env.DEV) {
        console.warn(
          `[apiRetry] Attempt ${attempt + 1}/${mergedConfig.maxRetries + 1} failed, ` +
          `retrying in ${delayMs}ms...`,
          error
        );
      }

      await delay(delayMs, mergedConfig.signal);
    }
  }

  throw lastError;
}

/**
 * Wraps a Supabase query result, checking for errors in the response
 * and retrying if the error is retryable (network/5xx).
 *
 * Supabase client methods return `{ data, error }` rather than throwing,
 * so this wrapper converts retryable errors into thrown exceptions for
 * the retry logic to catch.
 *
 * @example
 * ```ts
 * const { data, error } = await withSupabaseRetry(
 *   () => supabase.from('foods').select('*')
 * );
 * ```
 */
export async function withSupabaseRetry<T>(
  operation: () => PromiseLike<{ data: T; error: { message: string; code?: string; status?: number } | null }>,
  config?: Partial<RetryConfig>,
): Promise<{ data: T; error: { message: string; code?: string; status?: number } | null }> {
  return withRetry(async () => {
    const result = await operation();

    // If there's an error and it's retryable, throw it so withRetry can catch it
    if (result.error && isRetryableError(result.error)) {
      throw result.error;
    }

    // Return the result as-is (including non-retryable errors for the caller to handle)
    return result;
  }, config);
}
