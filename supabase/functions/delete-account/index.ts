// Deletes the caller's account: auth user + the user data nobody else keeps.
// Apple Guideline 5.1.1(v) requires in-app account deletion for any app
// that supports account creation.
//
// Flow (owner decision 1a, 2026-09-25):
// 1. Authenticate the caller via their Bearer token (anon-client).
// 2. POST { mode: 'preflight' } stops here: transfer_user_household_data runs
//    as a dry run and the answer says what would move to whom and what would
//    be deleted. Nothing is written.
// 3. A real delete from the web client needs a sign-in within the last ten
//    minutes (_shared/requireRecentAuth.ts). Shipped iOS builds send no
//    X-Client-Info and keep today's rule: a valid JWT.
// 4. transfer_user_household_data hands the caller's rows in every household
//    that still has other members to the longest-standing remaining member,
//    removes the caller's membership and releases NO ACTION references. If it
//    fails, nothing is deleted.
// 5. A live Stripe subscription is cancelled here, server-side. If that fails
//    the account is not deleted, so nobody is billed for an account that no
//    longer exists.
// 6. Using the service-role client, delete rows still keyed to the caller
//    (belt + suspenders against missing FK cascades), then photos.
// 7. Delete the auth.users row via admin API, which cascades to any table
//    with ON DELETE CASCADE pointing at auth.users.
//
// Response: iOS (AuthService.deleteAccount) decodes { success, error } and
// ignores the rest, so fields are only ever added.
//
// The caller is signed out client-side after a 200 response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.5.0?target=deno";
import { decideRecentAuthForRequest } from "../_shared/requireRecentAuth.ts";
import {
  parseDeleteMode,
  STRIPE_CANCEL_FAILED_MESSAGE,
  stripeSubscriptionToCancel,
  toPreflight,
  TRANSFER_FAILED_MESSAGE,
  type SubscriptionRowFacts,
} from "../_shared/accountDeletion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables keyed by user_id that we scrub explicitly. Keep in alphabetical
// order. Add entries as new user-scoped tables ship.
//
// Household tables (kids, foods, recipes, plan_entries, grocery_*, ...) are
// here too, but by the time this runs transfer_user_household_data has already
// moved every row in a shared household to its successor, so what matches
// user_id = caller is only what nobody else keeps. The same list is replayed by
// supabase/tests/household_aware_account_deletion.test.sql; keep them in step.
const USER_SCOPED_TABLES = [
  "agent_events",
  "backup_logs",
  "budget_calculations",
  "delivery_preferences",
  "foods",
  "grocery_delivery",
  "grocery_delivery_orders",
  "grocery_items",
  "grocery_lists",
  "kids",
  "meal_plan_templates",
  "meal_voting",
  "nurture_enrollments",
  "plan_entries",
  "plan_entry_made_log",
  "push_notifications",
  "quiz_responses",
  "recipes",
  "report_preferences",
  "stock_comparison_samples",
  "store_layouts",
  "suggestion_feedback",
  "suggestion_preferences",
  "user_accessibility_preferences",
  "user_activity_timeline",
  "user_attributes",
  "user_delivery_accounts",
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

  // iOS sends `{}`; an empty or unparseable body is a delete, as it always was.
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mode = parseDeleteMode(body);

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

  // Service-role client for the transfer and the privileged deletes.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The token was accepted by getUser above, so reading its claims is safe.
  const recentAuth = decideRecentAuthForRequest(req, Math.floor(Date.now() / 1000));

  // 2. Preflight: what would happen, with nothing written.
  if (mode === "preflight") {
    const { data, error } = await admin.rpc("transfer_user_household_data", {
      p_user_id: userId,
      p_dry_run: true,
    });
    if (error) {
      return json({ error: "Could not check what deleting would affect", detail: error.message }, 500);
    }
    return json({
      success: true,
      mode: "preflight",
      preflight: toPreflight(data),
      recentAuth: recentAuth.ok,
    });
  }

  // 3. Recent authentication (web only; legacy iOS keeps the valid-JWT rule).
  if (!recentAuth.ok) {
    return json(recentAuth.body, recentAuth.status);
  }

  const failures: Record<string, string> = {};

  // 4. Hand shared household data to the remaining members. A failure here
  //    stops everything: deleting now would take the family's data with it.
  const { data: transferData, error: transferErr } = await admin.rpc("transfer_user_household_data", {
    p_user_id: userId,
    p_dry_run: false,
  });
  if (transferErr) {
    return json({
      error: TRANSFER_FAILED_MESSAGE,
      code: "transfer_failed",
      detail: transferErr.message,
    }, 500);
  }
  const transfer = toPreflight(transferData);
  const unresolved = (transferData as { unresolved_blockers?: Record<string, number> } | null)
    ?.unresolved_blockers;
  if (unresolved && Object.keys(unresolved).length > 0) {
    failures["transfer:unresolved_blockers"] = Object.keys(unresolved).join(", ");
  }

  // 5. Cancel every live Stripe subscription, server-side. If the rows cannot
  //    be read, or Stripe refuses, the account is not deleted: a deleted
  //    account that keeps being billed is worse than a retry.
  {
    const { data: subRows, error: subErr } = await admin
      .from("user_subscriptions")
      .select("status, cancel_at_period_end, is_complementary, stripe_subscription_id")
      .eq("user_id", userId);
    const toCancel = subErr
      ? []
      : ((subRows ?? []) as SubscriptionRowFacts[])
          .map((row) => stripeSubscriptionToCancel(row))
          .filter((id): id is string => id !== null);

    let cancelError: string | null = subErr ? subErr.message : null;
    if (!cancelError && toCancel.length > 0) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
      if (!stripeKey) {
        cancelError = "STRIPE_SECRET_KEY is not set";
      } else {
        // Constructed the way manage-subscription does it.
        const stripe = new Stripe(stripeKey, {
          apiVersion: "2023-10-16",
          httpClient: Stripe.createFetchHttpClient(),
        });
        for (const subscriptionId of toCancel) {
          try {
            await stripe.subscriptions.cancel(subscriptionId);
          } catch (err) {
            // Our row can lag Stripe. A subscription Stripe no longer has, or
            // has already cancelled, bills nobody and must not block deletion.
            const code = (err as { code?: unknown } | null)?.code;
            let alreadyGone = code === "resource_missing";
            if (!alreadyGone) {
              try {
                const current = await stripe.subscriptions.retrieve(subscriptionId);
                alreadyGone = current.status === "canceled";
              } catch {
                alreadyGone = false;
              }
            }
            if (!alreadyGone) {
              // The Stripe error (and its stack) stays in the function log. The
              // caller gets the subscription and Stripe's error code, which is
              // enough to retry or look it up, and nothing from inside the SDK.
              console.error("delete-account: Stripe cancel failed", subscriptionId, err);
              cancelError = `Stripe did not cancel ${subscriptionId}` +
                (typeof code === "string" && /^[a-z_]{1,64}$/.test(code) ? ` (${code})` : "");
              break;
            }
          }
        }
      }
    }
    if (cancelError) {
      // The household hand-over above has committed; the account itself is
      // untouched, and a retry finishes the job.
      return json({
        error: STRIPE_CANCEL_FAILED_MESSAGE,
        code: "stripe_cancel_failed",
        detail: cancelError,
        household: transfer,
      }, 502);
    }
  }

  // Read photo URLs while the rows still exist. Any failure here is recorded
  // but never blocks the account delete - a user asking to be deleted must not
  // be held up by Storage. Kids handed to a successor no longer match.
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

  // Photos under {userId}/ that a transferred kid still shows. The folder
  // sweep below must leave these alone or the family loses the picture.
  const keptPaths = new Set<string>();
  {
    const { data, error } = await admin
      .from("kids")
      .select("profile_picture_url")
      .neq("user_id", userId)
      .like("profile_picture_url", `%/${USER_FOLDER_BUCKET}/${userId}/%`);
    if (error) {
      failures["storage:kept_photo_lookup"] = error.message;
    } else {
      for (const row of data ?? []) {
        const ref = parseStorageObjectUrl((row as { profile_picture_url?: unknown }).profile_picture_url);
        if (ref) keptPaths.add(`${ref.bucket}/${ref.path}`);
      }
    }
  }
  const keptLookupFailed = "storage:kept_photo_lookup" in failures;

  for (const table of USER_SCOPED_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
      // Non-fatal: table might not exist in this env, or user had no rows.
      // We collect for diagnostics but keep deleting.
      failures[table] = error.message;
    }
  }

  // 6b. Scrub email-keyed marketing rows so the user's email doesn't survive
  //     deletion (these tables have no user_id and no cascade to auth.users).
  if (userEmail) {
    for (const table of EMAIL_SCOPED_TABLES) {
      const { error } = await admin.from(table).delete().eq("email", userEmail);
      if (error) {
        failures[table] = error.message;
      }
    }
  }

  // 6c. Remove the uploaded photos: the ones referenced by the kid rows we just
  //     read, plus everything under {userId}/ in the web bucket so orphans left
  //     by an interrupted replace go too, except photos a transferred kid uses.
  {
    const byBucket = new Map<string, string[]>();
    for (const ref of photoRefs) {
      const paths = byBucket.get(ref.bucket) ?? [];
      paths.push(ref.path);
      byBucket.set(ref.bucket, paths);
    }

    // Without the kept list the sweep could remove a photo the family still
    // shows, so it is skipped rather than guessed; the referenced photos above
    // still go.
    if (!keptLookupFailed) {
      const { data: listed, error: listError } = await admin.storage
        .from(USER_FOLDER_BUCKET)
        .list(userId);
      if (listError) {
        failures[`storage:${USER_FOLDER_BUCKET}:list`] = listError.message;
      } else {
        const paths = byBucket.get(USER_FOLDER_BUCKET) ?? [];
        for (const object of listed ?? []) {
          const full = `${userId}/${object.name}`;
          if (keptPaths.has(`${USER_FOLDER_BUCKET}/${full}`)) continue;
          if (!paths.includes(full)) paths.push(full);
        }
        byBucket.set(USER_FOLDER_BUCKET, paths);
      }
    }

    for (const [bucket, paths] of byBucket) {
      const remove = paths.filter((path) => !keptPaths.has(`${bucket}/${path}`));
      if (remove.length === 0) continue;
      const { error } = await admin.storage.from(bucket).remove(remove);
      if (error) failures[`storage:${bucket}`] = error.message;
    }
  }

  // 7. Finally, remove the auth user. This cascades to any table with
  //    a FK to auth.users(id) ON DELETE CASCADE (profiles, memberships, etc).
  const { error: authDeleteErr } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteErr) {
    return json({
      error: "Failed to delete auth user",
      detail: authDeleteErr.message,
      partialFailures: failures,
      household: transfer,
    }, 500);
  }

  return json({ success: true, partialFailures: failures, household: transfer });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
