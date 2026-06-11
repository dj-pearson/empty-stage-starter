/**
 * Household membership authorization helpers (US-324).
 *
 * Edge functions that accept a client-supplied `householdId` (or `kidIds`) must
 * verify the authenticated user actually belongs to that household before
 * trusting it. Relying on forwarded-JWT RLS alone is brittle: a missing or
 * misconfigured policy turns into a broken-object-level-authorization (IDOR)
 * leak where one household can read another's kids/foods/recipes/plan data by
 * guessing a `householdId`. These helpers add an explicit, defense-in-depth
 * membership gate.
 *
 * This module is intentionally free of Deno URL imports so its logic can be
 * unit-tested under vitest with a mocked client (see
 * src/test/household-membership.test.ts).
 */

// Minimal structural type covering only the query-builder methods these helpers
// use. The real supabase-js client satisfies this shape at runtime (its builder
// is chainable and thenable, resolving to `{ data, error }`).
interface SingleResult {
  data: { user_id: string } | { id: string } | null;
  error: unknown;
}

interface ListResult {
  data: Array<{ id: string }> | null;
  error: unknown;
}

interface MembershipBuilder extends PromiseLike<ListResult> {
  select: (columns: string) => MembershipBuilder;
  eq: (column: string, value: string) => MembershipBuilder;
  in: (column: string, values: readonly string[]) => MembershipBuilder;
  limit: (count: number) => MembershipBuilder;
  maybeSingle: () => Promise<SingleResult>;
}

export interface MembershipQueryClient {
  from: (table: string) => MembershipBuilder;
}

export interface AuthUser {
  id: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Returns true when `userId` is a member of `householdId`.
 * Any query error is treated as "not a member" (fail closed).
 */
export async function isHouseholdMember(
  supabase: MembershipQueryClient,
  userId: string,
  householdId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return data != null;
}

/**
 * Asserts the user belongs to `householdId`.
 *
 * @returns a 403 `Response` when the user is NOT a member, or `null` when the
 * check passes. When `householdId` is null/undefined there is nothing to check
 * and `null` is returned (the caller should fall back to user-scoped queries).
 */
export async function assertHouseholdMember(
  supabase: MembershipQueryClient,
  user: AuthUser,
  householdId: string | null | undefined,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  if (!householdId) return null;
  const ok = await isHouseholdMember(supabase, user.id, householdId);
  if (ok) return null;
  return new Response(
    JSON.stringify({ error: 'Forbidden: you are not a member of this household' }),
    { status: 403, headers: { ...JSON_HEADERS, ...headers } },
  );
}

/**
 * Asserts that every requested kid id is accessible to the user.
 *
 * The kids query runs through the forwarded-JWT (RLS-scoped) client, so it only
 * returns kids the user may read. If fewer distinct kids come back than were
 * requested, at least one `kidId` belongs to another household — reject with
 * 403 rather than silently proceeding on a partial set.
 *
 * @returns a 403 `Response` when any requested kid is not accessible, otherwise
 * `null`.
 */
export async function assertKidsAccessible(
  supabase: MembershipQueryClient,
  kidIds: readonly string[],
  headers: Record<string, string> = {},
): Promise<Response | null> {
  const requested = [...new Set(kidIds.filter((id) => typeof id === 'string'))];
  if (requested.length === 0) return null;

  const { data, error } = await supabase
    .from('kids')
    .select('id')
    .in('id', requested)
    .limit(requested.length);

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to verify kid ownership' }),
      { status: 500, headers: { ...JSON_HEADERS, ...headers } },
    );
  }

  const accessible = new Set((data ?? []).map((row) => (row as { id: string }).id));
  const allOwned = requested.every((id) => accessible.has(id));
  if (allOwned) return null;

  return new Response(
    JSON.stringify({ error: 'Forbidden: one or more kids do not belong to you' }),
    { status: 403, headers: { ...JSON_HEADERS, ...headers } },
  );
}
