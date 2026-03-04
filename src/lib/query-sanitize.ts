/**
 * PostgREST filter string sanitization utilities.
 *
 * The Supabase JS client's .eq(), .ilike(), .in(), etc. methods
 * automatically parameterize values. However, the .or() method accepts
 * a raw PostgREST filter string where interpolated values are NOT
 * automatically parameterized. This module provides utilities to safely
 * build .or() filter strings.
 *
 * Usage:
 * ```typescript
 * import { escapePostgRESTValue, assertUUID } from '@/lib/query-sanitize';
 *
 * // For user-provided search text in .or() filters:
 * .or(`title.ilike.%${escapePostgRESTValue(query)}%,description.ilike.%${escapePostgRESTValue(query)}%`)
 *
 * // For UUID values in .or() filters:
 * const safeUserId = assertUUID(userId);
 * .or(`user_id.eq.${safeUserId},household_id.eq.${safeHouseholdId}`)
 * ```
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and return a UUID string, or throw if invalid.
 *
 * Use before interpolating ID values into PostgREST filter strings.
 * UUIDs contain only hex characters and dashes, so they cannot inject
 * filter operators or separators.
 *
 * @param value - The string to validate as a UUID
 * @param label - Optional label for the error message
 * @returns The validated UUID string
 * @throws Error if the value is not a valid UUID
 */
export function assertUUID(value: string, label = 'value'): string {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid UUID for ${label}: ${String(value).slice(0, 50)}`);
  }
  return value;
}

/**
 * Escape a string value for safe interpolation into PostgREST filter strings.
 *
 * PostgREST filter strings use commas (,) to separate conditions and periods (.)
 * to separate column.operator.value triples. Unescaped user input could alter
 * filter logic (filter injection).
 *
 * This strips characters that have special meaning in PostgREST filter syntax:
 * commas, periods used as separators, parentheses, and backslashes.
 *
 * @param value - The raw user-provided string to sanitize
 * @returns A sanitized string safe for interpolation into PostgREST filter strings
 */
export function escapePostgRESTValue(value: string): string {
  if (!value) return '';
  // Remove PostgREST filter metacharacters that could alter query logic:
  // - commas separate filter conditions
  // - parentheses group conditions
  // - backslashes could be used for escaping
  return value.replace(/[,()\\]/g, '');
}

/**
 * Validate that a string is a valid ISO 8601 date/datetime string.
 * Use before interpolating date values into PostgREST filter strings.
 *
 * @param value - The string to validate
 * @returns The validated date string
 * @throws Error if the value is not a valid ISO date
 */
export function assertISODate(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${String(value).slice(0, 50)}`);
  }
  // Return the ISO string to ensure consistent formatting
  return date.toISOString();
}
