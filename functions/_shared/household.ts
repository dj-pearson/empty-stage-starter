/**
 * Server-side household membership enforcement (US-324).
 *
 * Edge functions accept a client-supplied `householdId` (and sometimes
 * `kidIds`). RLS alone is not enough defense-in-depth: a bug in a policy, or
 * a function that runs with elevated privileges, could leak another
 * household's data. Before trusting a body-supplied householdId, verify the
 * authenticated user is actually a member of it.
 *
 * Returns a 403 `Response` when the user is NOT a member, or `null` when the
 * membership check passes and the caller may proceed.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function isHouseholdMember(
  supabase: SupabaseClient,
  userId: string,
  householdId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('household membership check failed:', error);
    return false; // fail closed
  }
  return !!data;
}

export async function assertHouseholdMember(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // No householdId supplied → caller will scope strictly by user.id; nothing
  // to assert here.
  if (!householdId) return null;

  const ok = await isHouseholdMember(supabase, userId, householdId);
  if (!ok) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: not a member of this household' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  return null;
}
