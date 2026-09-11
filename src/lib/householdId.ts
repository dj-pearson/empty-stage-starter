import { isUUID } from '@/lib/query-sanitize';
import { logger } from '@/lib/logger';

/**
 * US-857: what `get_user_household_id` hands back, and what the app may do with it.
 *
 * Three places called the RPC and all three trusted the result to be a uuid
 * string or null:
 *
 *   setHouseholdId((hh as string) ?? null)   // AuthContext, Grocery
 *   if (!householdId) throw ...              // BarcodeScannerDialog
 *
 * `as string` is an assertion, not a check, and `??` only catches null and
 * undefined. So any other JSON shape passed straight through into a string
 * state -- and an empty array is the shape that matters, because it is what
 * PostgREST answers when a function returns a set rather than a scalar, and it
 * is TRUTHY. Measured on the grocery page: householdId was [], `householdId ||
 * undefined` kept it, and assertUUID threw "Invalid UUID for householdId: "
 * (String([]) is the empty string) three times a load. The selector's catch
 * logged it and the user got a list picker with no lists in it.
 *
 * Degrading to null is the right failure: every household-scoped query already
 * has a user-scoped branch for the no-household case, so a parent sees their own
 * data instead of an error. Throwing, or passing the bad value on, does not.
 */
export function normalizeHouseholdId(value: unknown): string | null {
  if (isUUID(value)) return value;
  // null and undefined are the ordinary "no household yet" answers and are not
  // worth a log line. Anything else means the RPC's shape and this code
  // disagree, which is worth knowing about before it reaches a query.
  if (value !== null && value !== undefined) {
    logger.warn('get_user_household_id returned something that is not a household id', {
      type: Array.isArray(value) ? 'array' : typeof value,
    });
  }
  return null;
}
