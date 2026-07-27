// Shared admin authorization gate for privileged edge functions.
//
// Verifies the caller via their own Bearer token (anon client), then checks
// the user_roles table with the service-role client for an admin/root_admin
// role. Returns a ready-to-use service-role client on success so callers do
// not create a second privileged client.
//
// Usage:
//   const gate = await requireAdmin(req);
//   if (!gate.ok) return json({ error: gate.error }, gate.status);
//   const admin = gate.admin; // service-role client
//
// Pattern mirrors delete-account (caller auth) + test-ai-configuration (role
// check) so behavior is consistent across the functions directory.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

export interface AdminGateResult {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  role?: string;
  /** Service-role client, present only when ok === true. */
  admin?: SupabaseClient;
}

export async function requireAdmin(
  req: Request,
  allowedRoles: string[] = ["admin", "root_admin"],
): Promise<AdminGateResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  // 1. Identify the caller with their own token (cannot be forged with anon key).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // 2. Service-role client for the role lookup + subsequent privileged work.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleRow, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", allowedRoles)
    .maybeSingle();

  if (roleErr || !roleRow) {
    return { ok: false, status: 403, error: "Forbidden: admin role required" };
  }

  return {
    ok: true,
    status: 200,
    userId: userData.user.id,
    role: (roleRow as { role: string }).role,
    admin,
  };
}
