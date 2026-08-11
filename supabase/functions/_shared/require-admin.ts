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

/**
 * Authenticate the caller (any signed-in user, no role requirement).
 * Use for endpoints that should be gated to logged-in users but not admins
 * (e.g. AI parse/import features, denial-of-wallet protection).
 */
/** Extract the bearer token from an Authorization header. */
function bearer(authHeader: string | null): string {
  return (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
}

/**
 * True when the caller presents the service_role key as its bearer token.
 * Only trusted server-side code (scheduled functions, function-to-function
 * invokes) can hold this key, so it is treated as a fully-authorized system
 * caller. The key is never shipped to clients.
 */
function isServiceRole(authHeader: string | null): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const token = bearer(authHeader);
  return serviceKey.length > 0 && token === serviceKey;
}

export async function requireUser(req: Request): Promise<AdminGateResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, status: 401, error: "Missing Authorization header" };
  }

  // Trusted server-to-server calls (scheduled functions) present the service key.
  if (isServiceRole(authHeader)) {
    return { ok: true, status: 200, role: "service" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, status: 200, userId: userData.user.id };
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

  // Trusted server-to-server calls (scheduled functions, agent dispatch) present
  // the service key — grant a service-role client without a per-user role check.
  if (isServiceRole(authHeader)) {
    const sysAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { ok: true, status: 200, role: "service", admin: sysAdmin };
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

  // Filter in JS rather than with .in("role", allowedRoles). role is the
  // app_role enum, so passing a label the enum does not define ("root_admin"
  // on deployments that never added it) makes Postgres reject the whole
  // comparison with 22P02 -- which surfaced as a 403 for genuine admins.
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);

  // A failed lookup is not the same as "caller is not an admin". Reporting a
  // broken query as 403 sends the operator to fix permissions that are fine.
  if (roleErr) {
    return { ok: false, status: 500, error: "Role lookup failed" };
  }

  const match = (roleRows ?? []).find((r) =>
    allowedRoles.includes((r as { role: string }).role)
  );
  if (!match) {
    return { ok: false, status: 403, error: "Forbidden: admin role required" };
  }

  return {
    ok: true,
    status: 200,
    userId: userData.user.id,
    role: (match as { role: string }).role,
    admin,
  };
}
