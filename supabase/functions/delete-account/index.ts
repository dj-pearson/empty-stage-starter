// Deletes the caller's account — auth user + cascaded user data.
// Apple Guideline 5.1.1(v) requires in-app account deletion for any app
// that supports account creation.
//
// Flow:
// 1. Authenticate the caller via their Bearer token (anon-client).
// 2. Using the service-role client, explicitly delete rows from known
//    user-keyed tables (belt + suspenders against missing FK cascades).
// 3. Delete the auth.users row via admin API — that cascades to any
//    table with ON DELETE CASCADE pointing at auth.users.
//
// The caller is signed out client-side after a 200 response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables keyed by user_id that we scrub explicitly. Keep in alphabetical
// order. Add entries as new user-scoped tables ship.
const USER_SCOPED_TABLES = [
  "budget_calculations",
  "foods",
  "grocery_delivery",
  "grocery_items",
  "grocery_lists",
  "kids",
  "meal_plan_templates",
  "meal_voting",
  "plan_entries",
  "push_notifications",
  "quiz_responses",
  "recipes",
  "user_accessibility_preferences",
  "user_activity_timeline",
  "user_attributes",
  "user_roles",
  "user_segment_members",
  "user_subscriptions",
  "voting_sessions",
] as const;

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // 1. Identify the caller with their own token.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const userId = userData.user.id;

  // 2. Service-role client for privileged deletes.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const failures: Record<string, string> = {};

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      // Non-fatal: table might not exist in this env, or user had no rows.
      // We collect for diagnostics but keep deleting.
      failures[table] = error.message;
    }
  }

  // 3. Finally, remove the auth user. This cascades to any table with
  //    a FK to auth.users(id) ON DELETE CASCADE (profiles, households, etc).
  const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteErr) {
    return json({
      error: "Failed to delete auth user",
      detail: authDeleteErr.message,
      partialFailures: failures,
    }, 500);
  }

  return json({ success: true, partialFailures: failures });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
