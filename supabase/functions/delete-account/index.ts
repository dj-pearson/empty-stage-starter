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
  "backup_logs",
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

// Marketing tables keyed by email rather than user_id, with no FK cascade to
// auth.users. Without an explicit scrub the user's email survives account
// deletion, leaving erasure incomplete (GDPR Art. 17 — compliance audit 2026-07).
const EMAIL_SCOPED_TABLES = ["email_subscribers"] as const;

// US-628: uploaded photos live in Storage, which has no FK to auth.users and
// so is untouched by both the table scrub and the auth-user cascade. Without
// this the Privacy Policy's promise that account deletion removes "your
// account and app data (including child profiles)" is false for every photo
// the user ever uploaded, and the object stays fetchable by URL.
//
// Two buckets are in play: profile-pictures, written by the web app at
// {userId}/{id}.ext, and images, written by iOS at kids/{kidId}-{unix}.jpg
// with no user prefix (US-635). The iOS layout cannot be enumerated per-user,
// so photos are found by reading kids.profile_picture_url BEFORE the rows are
// deleted; the folder sweep below then catches orphans the web app left behind.
const USER_FOLDER_BUCKET = "profile-pictures";

const PUBLIC_MARKER = "/storage/v1/object/public/";
const SIGNED_MARKER = "/storage/v1/object/sign/";

/** Mirrors src/lib/storagePaths.ts; the Deno and web trees cannot share code. */
function parseStorageObjectUrl(url: unknown): { bucket: string; path: string } | null {
  if (!url || typeof url !== "string") return null;
  const marker = url.includes(PUBLIC_MARKER)
    ? PUBLIC_MARKER
    : url.includes(SIGNED_MARKER)
      ? SIGNED_MARKER
      : null;
  if (!marker) return null;

  const withoutQuery = url.slice(url.indexOf(marker) + marker.length).split("?")[0];
  const separator = withoutQuery.indexOf("/");
  if (separator <= 0) return null;

  const bucket = withoutQuery.slice(0, separator);
  const path = withoutQuery.slice(separator + 1);
  if (!bucket || !path || path.includes("..")) return null;
  return { bucket, path: decodeURIComponent(path) };
}

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
  const userEmail = userData.user.email ?? null;

  // 2. Service-role client for privileged deletes.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const failures: Record<string, string> = {};

  // Read photo URLs while the rows still exist. Any failure here is recorded
  // but never blocks the account delete - a user asking to be deleted must not
  // be held up by Storage.
  const photoRefs: { bucket: string; path: string }[] = [];
  {
    const { data, error } = await admin
      .from("kids")
      .select("profile_picture_url")
      .eq("user_id", userId);
    if (error) {
      failures["storage:kids_photo_lookup"] = error.message;
    } else {
      for (const row of data ?? []) {
        const ref = parseStorageObjectUrl((row as { profile_picture_url?: unknown }).profile_picture_url);
        if (ref) photoRefs.push(ref);
      }
    }
  }

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      // Non-fatal: table might not exist in this env, or user had no rows.
      // We collect for diagnostics but keep deleting.
      failures[table] = error.message;
    }
  }

  // 2b. Scrub email-keyed marketing rows so the user's email doesn't survive
  //     deletion (these tables have no user_id and no cascade to auth.users).
  if (userEmail) {
    for (const table of EMAIL_SCOPED_TABLES) {
      const { error } = await admin.from(table).delete().eq("email", userEmail);
      if (error) {
        failures[table] = error.message;
      }
    }
  }

  // 2c. Remove the uploaded photos: the ones referenced by the kid rows we just
  //     read, plus everything under {userId}/ in the web bucket so orphans left
  //     by an interrupted replace go too.
  {
    const byBucket = new Map<string, string[]>();
    for (const ref of photoRefs) {
      const paths = byBucket.get(ref.bucket) ?? [];
      paths.push(ref.path);
      byBucket.set(ref.bucket, paths);
    }

    const { data: listed, error: listError } = await admin.storage
      .from(USER_FOLDER_BUCKET)
      .list(userId);
    if (listError) {
      failures[`storage:${USER_FOLDER_BUCKET}:list`] = listError.message;
    } else {
      const paths = byBucket.get(USER_FOLDER_BUCKET) ?? [];
      for (const object of listed ?? []) {
        const full = `${userId}/${object.name}`;
        if (!paths.includes(full)) paths.push(full);
      }
      byBucket.set(USER_FOLDER_BUCKET, paths);
    }

    for (const [bucket, paths] of byBucket) {
      if (paths.length === 0) continue;
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) failures[`storage:${bucket}`] = error.message;
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
