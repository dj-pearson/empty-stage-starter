/**
 * Who may see what through calculate-food-similarity.
 *
 * Before this, the function built a service-role client and read the source
 * food by id, the kid by id, and every row of `foods` with no filter at all.
 * Every signed-in account could pass another household's kidId and get that
 * child's name, age and allergens back (and into a model prompt), and the
 * "similar foods" list was ranked from every household's pantry.
 *
 * The rules, in the order they run:
 *   1. No verified user -> 401. That includes a service-role call: there is no
 *      user, so there is no household to scope to, and nothing in the repo
 *      calls this function server-to-server.
 *   2. No sourceFoodId -> 400 (the message the function always returned).
 *   3. The household comes from the verified user id, never from the body.
 *      A body field named household_id / householdId is not read at all.
 *      A user with no household -> 403.
 *   4. The source food must belong to that household -> 404 otherwise, so a
 *      foreign id reads the same as one that does not exist.
 *   5. A requested kid must belong to that household -> 403 otherwise.
 *   6. Candidate foods are that household's only, re-checked here even though
 *      the loader already filters, so a loader that forgets the filter still
 *      cannot leak a row.
 *
 * Pure: no Deno globals, no network. The function wires real loaders; the
 * tests wire fakes. Vitest mirror: src/lib/foodSimilarityScopeShared.test.ts.
 */

/** The columns the scope decision reads. Loaders may return wider rows. */
export interface HouseholdScopedRow {
  id: string;
  household_id?: string | null;
}

export interface SimilarityRequest {
  sourceFoodId: string;
  kidId: string | null;
}

export interface ScopeRefusal {
  status: 400 | 401 | 403 | 404;
  /** Safe to return to the caller. */
  error: string;
  /** For the server log only. */
  reason:
    | 'no_user'
    | 'missing_source_food_id'
    | 'no_household'
    | 'source_food_not_in_household'
    | 'kid_not_in_household';
}

export const SOURCE_FOOD_REQUIRED_MESSAGE = 'Source food ID is required';

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * Read the two fields the endpoint takes. Everything else in the body,
 * a household id included, is dropped here.
 */
export function parseSimilarityRequest(
  body: unknown,
): { ok: true; request: SimilarityRequest } | { ok: false; refusal: ScopeRefusal } {
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const sourceFoodId = nonEmptyString(record.sourceFoodId);
  if (!sourceFoodId) {
    return {
      ok: false,
      refusal: { status: 400, error: SOURCE_FOOD_REQUIRED_MESSAGE, reason: 'missing_source_food_id' },
    };
  }
  return { ok: true, request: { sourceFoodId, kidId: nonEmptyString(record.kidId) } };
}

/** Rows that belong to the household, minus the source food itself. */
export function scopeCandidateFoods<F extends HouseholdScopedRow>(
  foods: readonly F[],
  householdId: string,
  sourceFoodId: string,
): F[] {
  return foods.filter((f) => f.household_id === householdId && f.id !== sourceFoodId);
}

export interface SimilarityScopeDeps<F extends HouseholdScopedRow, K extends HouseholdScopedRow> {
  /** The id gateAiRequest verified from the JWT. Undefined for anon or service role. */
  userId: string | null | undefined;
  /** The parsed request body, untrusted. */
  body: unknown;
  /** get_user_household_id(userId). */
  lookupHousehold: (userId: string) => Promise<string | null>;
  loadSourceFood: (foodId: string, householdId: string) => Promise<F | null>;
  loadKid: (kidId: string, householdId: string) => Promise<K | null>;
  loadHouseholdFoods: (householdId: string) => Promise<F[]>;
}

export type SimilarityScopeOutcome<F, K> =
  | { kind: 'refused'; refusal: ScopeRefusal }
  | {
      kind: 'scoped';
      householdId: string;
      request: SimilarityRequest;
      sourceFood: F;
      kid: K | null;
      candidates: F[];
    };

/**
 * Resolve the household and load only what it owns. A loader throw
 * propagates, and the handler answers it with a generic 500.
 */
export async function resolveSimilarityScope<F extends HouseholdScopedRow, K extends HouseholdScopedRow>(
  deps: SimilarityScopeDeps<F, K>,
): Promise<SimilarityScopeOutcome<F, K>> {
  const userId = nonEmptyString(deps.userId);
  if (!userId) {
    return { kind: 'refused', refusal: { status: 401, error: 'Unauthorized', reason: 'no_user' } };
  }

  const parsed = parseSimilarityRequest(deps.body);
  if (!parsed.ok) return { kind: 'refused', refusal: parsed.refusal };
  const { request } = parsed;

  const householdId = nonEmptyString(await deps.lookupHousehold(userId));
  if (!householdId) {
    return { kind: 'refused', refusal: { status: 403, error: 'Forbidden', reason: 'no_household' } };
  }

  const sourceFood = await deps.loadSourceFood(request.sourceFoodId, householdId);
  if (!sourceFood || sourceFood.household_id !== householdId) {
    return {
      kind: 'refused',
      refusal: { status: 404, error: 'Food not found', reason: 'source_food_not_in_household' },
    };
  }

  let kid: K | null = null;
  if (request.kidId) {
    const loaded = await deps.loadKid(request.kidId, householdId);
    if (!loaded || loaded.household_id !== householdId) {
      return { kind: 'refused', refusal: { status: 403, error: 'Forbidden', reason: 'kid_not_in_household' } };
    }
    kid = loaded;
  }

  const candidates = scopeCandidateFoods(
    await deps.loadHouseholdFoods(householdId),
    householdId,
    request.sourceFoodId,
  );

  return { kind: 'scoped', householdId, request, sourceFood, kid, candidates };
}
