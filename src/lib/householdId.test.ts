import { describe, it, expect, vi, beforeEach } from 'vitest';

import { normalizeHouseholdId } from './householdId';
import { logger } from './logger';

vi.mock('./logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

/**
 * US-857: get_user_household_id's result reaches a query builder, so its shape
 * is not a matter of taste.
 *
 * Three call sites trusted `(hh as string) ?? null` or `if (!hh)`. Neither
 * rejects an empty array, which is what PostgREST answers for a set-returning
 * function and which is truthy. Measured on /dashboard/grocery against the fake
 * backend: householdId was [], and assertUUID threw "Invalid UUID for
 * householdId: " three times per load -- String([]) being the empty string is
 * why the message looked like it had lost its value.
 */
const UUID = '00000000-0000-4000-8000-00000000aaa1';

describe('normalizeHouseholdId', () => {
  beforeEach(() => vi.mocked(logger.warn).mockClear());

  it('passes a uuid through unchanged', () => {
    expect(normalizeHouseholdId(UUID)).toBe(UUID);
  });

  it('accepts an uppercase uuid, which Postgres may return', () => {
    expect(normalizeHouseholdId(UUID.toUpperCase())).toBe(UUID.toUpperCase());
  });

  it('treats null and undefined as no household, quietly', () => {
    expect(normalizeHouseholdId(null)).toBeNull();
    expect(normalizeHouseholdId(undefined)).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('rejects the empty array PostgREST returns for a set, and says so', () => {
    // The case that shipped. Truthy, and String([]) === '', so it survived both
    // `if (!hh)` and `hh || undefined` and then stringified to nothing.
    expect(normalizeHouseholdId([])).toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('rejects an array that contains the right value, rather than unwrapping it', () => {
    // Unwrapping would be guessing at a shape the RPC does not have. A single
    // definition of "this is a household id" is worth more than a rescue.
    expect(normalizeHouseholdId([UUID])).toBeNull();
  });

  it('rejects the other shapes an RPC can answer with', () => {
    for (const value of ['', 'not-a-uuid', 0, 1, {}, { id: UUID }, true, NaN]) {
      expect(normalizeHouseholdId(value), `accepted ${JSON.stringify(value)}`).toBeNull();
    }
  });
});
