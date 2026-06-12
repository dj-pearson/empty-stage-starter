/**
 * Admin-role authorization helpers (US-327).
 *
 * Content-generation edge functions (generate-social-content,
 * generate-blog-content) drive paid LLM calls and publish brand/marketing copy.
 * Any authenticated user could previously invoke them. These helpers add a
 * server-side admin-role gate so only users with an `admin` row in `user_roles`
 * can trigger them. The check runs through the forwarded-JWT (RLS-scoped) client,
 * mirroring the web `useAdminCheck` hook.
 *
 * Unlike rate-limiting (which fails OPEN — see rate-limit.ts), a privilege check
 * MUST fail CLOSED: on any query error we deny access (403) rather than risk
 * letting a non-admin through.
 *
 * This module is intentionally free of Deno URL imports so its logic can be
 * unit-tested under vitest with a mocked client (see
 * src/test/security/admin-authorization.test.ts).
 */

// Minimal structural type covering only the query-builder methods used here. The
// real supabase-js client satisfies this shape at runtime (its builder is
// chainable and thenable, resolving to `{ data, error }`).
interface RoleResult {
  data: { role: string } | null;
  error: unknown;
}

interface RoleBuilder {
  select: (columns: string) => RoleBuilder;
  eq: (column: string, value: string) => RoleBuilder;
  maybeSingle: () => Promise<RoleResult>;
}

export interface RoleQueryClient {
  from: (table: string) => RoleBuilder;
}

export interface AuthUser {
  id: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Returns true when `userId` has the `admin` role in `user_roles`.
 * Any query error is treated as "not an admin" (fail closed).
 */
export async function isAdmin(
  supabase: RoleQueryClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (error) return false;
    return data != null;
  } catch {
    return false;
  }
}

/**
 * Asserts the authenticated user is an admin.
 *
 * @returns a 403 `Response` when the user is NOT an admin (or the role lookup
 * fails), or `null` when the check passes.
 */
export async function assertAdmin(
  supabase: RoleQueryClient,
  user: AuthUser,
  headers: Record<string, string> = {},
): Promise<Response | null> {
  const ok = await isAdmin(supabase, user.id);
  if (ok) return null;
  return new Response(
    JSON.stringify({ error: 'Forbidden: admin role required' }),
    { status: 403, headers: { ...JSON_HEADERS, ...headers } },
  );
}
