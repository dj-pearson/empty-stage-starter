/**
 * API Error Handling Utilities
 *
 * Standardized error handling for API requests, Supabase operations,
 * and third-party integrations.
 */

import { PostgrestError } from '@supabase/supabase-js';

/**
 * API Error class for standardized error handling
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
    };
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Server errors
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  NO_CONNECTION: 'NO_CONNECTION',

  // Database errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',

  // Business logic errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  INVALID_STATE: 'INVALID_STATE',
} as const;

/**
 * User-friendly error messages for common error codes
 */
export const ErrorMessages: Record<string, string> = {
  [ErrorCodes.UNAUTHORIZED]: 'You need to be logged in to perform this action.',
  [ErrorCodes.FORBIDDEN]: "You don't have permission to perform this action.",
  [ErrorCodes.SESSION_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCodes.INVALID_CREDENTIALS]: 'Invalid email or password.',

  [ErrorCodes.VALIDATION_ERROR]: 'Please check your input and try again.',
  [ErrorCodes.INVALID_INPUT]: 'The information provided is invalid.',
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields.',

  [ErrorCodes.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCodes.ALREADY_EXISTS]: 'This resource already exists.',
  [ErrorCodes.CONFLICT]: 'There was a conflict with your request.',

  [ErrorCodes.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
  [ErrorCodes.QUOTA_EXCEEDED]: 'You have exceeded your quota. Please upgrade your plan.',

  [ErrorCodes.INTERNAL_SERVER_ERROR]:
    'Something went wrong on our end. Please try again later.',
  [ErrorCodes.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
  [ErrorCodes.TIMEOUT]: 'Request timed out. Please try again.',

  [ErrorCodes.NETWORK_ERROR]: 'Network error. Please check your connection.',
  [ErrorCodes.NO_CONNECTION]: 'No internet connection. Please check your network.',

  [ErrorCodes.DATABASE_ERROR]: 'Database error. Please try again.',
  [ErrorCodes.CONSTRAINT_VIOLATION]: 'This operation violates a database constraint.',

  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 'You do not have sufficient permissions.',
  [ErrorCodes.OPERATION_NOT_ALLOWED]: 'This operation is not allowed.',
  [ErrorCodes.INVALID_STATE]: 'Invalid operation for current state.',
};

/**
 * Handle Supabase/Postgrest errors
 */
export function handleSupabaseError(error: PostgrestError | Error): APIError {
  // Check if it's a Postgrest error
  if ('code' in error && 'message' in error && 'details' in error) {
    const pgError = error as PostgrestError;

    // Map Postgrest error codes to our error codes
    let code = ErrorCodes.DATABASE_ERROR;
    let statusCode = 500;
    let message = pgError.message;

    // Unique constraint violation
    if (pgError.code === '23505') {
      code = ErrorCodes.ALREADY_EXISTS as any;
      statusCode = 409;
      message = 'This resource already exists.';
    }

    // Foreign key violation
    if (pgError.code === '23503') {
      code = ErrorCodes.CONSTRAINT_VIOLATION as any;
      statusCode = 400;
      message = 'Referenced resource does not exist.';
    }

    // Not null violation
    if (pgError.code === '23502') {
      code = ErrorCodes.MISSING_REQUIRED_FIELD as any;
      statusCode = 400;
      message = 'Required field is missing.';
    }

    // Row level security violation
    if (pgError.code === '42501') {
      code = ErrorCodes.FORBIDDEN as any;
      statusCode = 403;
      message = 'You do not have permission to access this resource.';
    }

    return new APIError(message, statusCode, code, {
      pgCode: pgError.code,
      hint: pgError.hint,
      details: pgError.details,
    });
  }

  // Generic error
  return new APIError(error.message, 500, ErrorCodes.DATABASE_ERROR);
}

/**
 * Handle fetch/network errors
 */
export function handleFetchError(error: any): APIError {
  if (error.name === 'AbortError') {
    return new APIError('Request was cancelled', 499, ErrorCodes.TIMEOUT);
  }

  if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
    return new APIError(
      'Network error. Please check your connection.',
      0,
      ErrorCodes.NETWORK_ERROR
    );
  }

  if (error.message.includes('timeout')) {
    return new APIError('Request timed out. Please try again.', 408, ErrorCodes.TIMEOUT);
  }

  return new APIError(
    error.message || 'An unexpected error occurred',
    500,
    ErrorCodes.INTERNAL_SERVER_ERROR
  );
}

/**
 * Handle HTTP response errors
 */
export async function handleHTTPError(response: Response): Promise<APIError> {
  let message = response.statusText;
  let code = ErrorCodes.INTERNAL_SERVER_ERROR;
  let details: any = null;

  // Try to parse error body
  try {
    const body = await response.json();
    if (body.message) message = body.message;
    if (body.error) message = body.error;
    if (body.code) code = body.code;
    details = body;
  } catch {
    // Couldn't parse JSON, use default message
  }

  // Map HTTP status codes to error codes
  switch (response.status) {
    case 400:
      code = ErrorCodes.INVALID_INPUT as any;
      break;
    case 401:
      code = ErrorCodes.UNAUTHORIZED as any;
      break;
    case 403:
      code = ErrorCodes.FORBIDDEN as any;
      break;
    case 404:
      code = ErrorCodes.NOT_FOUND as any;
      break;
    case 409:
      code = ErrorCodes.CONFLICT as any;
      break;
    case 422:
      code = ErrorCodes.VALIDATION_ERROR as any;
      break;
    case 429:
      code = ErrorCodes.RATE_LIMIT_EXCEEDED as any;
      break;
    case 500:
      code = ErrorCodes.INTERNAL_SERVER_ERROR as any;
      break;
    case 503:
      code = ErrorCodes.SERVICE_UNAVAILABLE as any;
      break;
  }

  return new APIError(message, response.status, code, details);
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  // APIError
  if (error instanceof APIError) {
    return error.code && ErrorMessages[error.code]
      ? ErrorMessages[error.code]
      : error.message;
  }

  // Standard Error
  if (error instanceof Error) {
    return error.message;
  }

  // String error
  if (typeof error === 'string') {
    return error;
  }

  // Unknown error
  return 'An unexpected error occurred. Please try again.';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: APIError): boolean {
  const retryableCodes = [
    ErrorCodes.TIMEOUT,
    ErrorCodes.SERVICE_UNAVAILABLE,
    ErrorCodes.NETWORK_ERROR,
    ErrorCodes.INTERNAL_SERVER_ERROR,
  ];

  return error.code ? retryableCodes.includes(error.code as any) : false;
}

/**
 * Retry wrapper for API calls
 *
 * Usage:
 * ```tsx
 * const data = await retryRequest(
 *   () => fetchData(),
 *   { maxRetries: 3, delayMs: 1000 }
 * );
 * ```
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: 'linear' | 'exponential';
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000, backoff = 'exponential', shouldRetry } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) break;

      // Check if we should retry
      if (shouldRetry && !shouldRetry(error)) {
        throw error;
      }

      // Check if error is retryable
      if (error instanceof APIError && !isRetryableError(error)) {
        throw error;
      }

      // Calculate delay
      const delay =
        backoff === 'exponential' ? delayMs * Math.pow(2, attempt) : delayMs * (attempt + 1);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Batch error handler for multiple operations
 *
 * Usage:
 * ```tsx
 * const results = await batchWithErrorHandling([
 *   () => operation1(),
 *   () => operation2(),
 *   () => operation3(),
 * ]);
 * ```
 */
export async function batchWithErrorHandling<T>(
  operations: Array<() => Promise<T>>,
  options: {
    continueOnError?: boolean;
    onError?: (error: any, index: number) => void;
  } = {}
): Promise<Array<{ success: boolean; data?: T; error?: any }>> {
  const { continueOnError = false, onError } = options;

  const results: Array<{ success: boolean; data?: T; error?: any }> = [];

  for (let i = 0; i < operations.length; i++) {
    try {
      const data = await operations[i]();
      results.push({ success: true, data });
    } catch (error) {
      results.push({ success: false, error });

      if (onError) {
        onError(error, i);
      }

      if (!continueOnError) {
        throw error;
      }
    }
  }

  return results;
}

/**
 * Log error (integrate with error tracking service)
 */
export function logError(error: unknown, context?: Record<string, any>) {
  // In production, send to error tracking service (Sentry, LogRocket, etc.)
  if (process.env.NODE_ENV === 'production') {
    // TODO: Integrate with error tracking service
    console.error('Error:', error, 'Context:', context);
  } else {
    // Development: log to console
    console.error('Error:', error, 'Context:', context);
  }
}

/**
 * Safe async function wrapper that handles errors
 *
 * Usage:
 * ```tsx
 * const [data, error] = await safeAsync(() => fetchData());
 * if (error) {
 *   // Handle error
 * }
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>
): Promise<[T | null, APIError | null]> {
  try {
    const data = await fn();
    return [data, null];
  } catch (error) {
    if (error instanceof APIError) {
      return [null, error];
    }
    return [null, new APIError(getErrorMessage(error), 500, ErrorCodes.INTERNAL_SERVER_ERROR)];
  }
}
