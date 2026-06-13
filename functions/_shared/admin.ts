/**
 * Admin role gating for privileged edge functions (US-327).
 *
 * Content-generation tools (blog/social marketing copy) must be restricted to
 * admins. We verify the role SERVER-SIDE against `user_roles` rather than
 * trusting any client claim.
 *
 * Returns a 403 `Response` when the user is not an admin, or `null` when the
 * caller may proceed.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  if (error) {
    console.error('admin role check failed:', error);
    return false; // fail closed
  }
  return !!data;
}

export async function assertAdmin(
  supabase: SupabaseClient,
  userId: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const ok = await isAdmin(supabase, userId);
  if (!ok) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin role required' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
  return null;
}
