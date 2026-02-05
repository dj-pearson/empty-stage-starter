import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Backup Scheduler Edge Function
 *
 * Intended to be called by a cron job (e.g., Supabase Cron or external service)
 * to trigger scheduled backups for users.
 *
 * Schedule recommendations:
 * - Run this function daily at 2 AM UTC
 * - It will check backup_config and create backup jobs as needed
 * - Individual backups are then processed by backup-user-data function
 */

export default async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify this is a scheduled job (check for cron secret or service role)
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Allow service role or cron secret
    const isServiceRole = authHeader?.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const isCronJob = cronSecret && req.headers.get("X-Cron-Secret") === cronSecret;

    if (!isServiceRole && !isCronJob) {
      throw new Error("Unauthorized: Scheduled jobs only");
    }

    // Create Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Schedule next backups (creates pending backup log entries)
    const { data: scheduleCount, error: scheduleError } = await supabaseClient.rpc(
      "schedule_next_backup"
    );

    if (scheduleError) {
      throw new Error(`Failed to schedule backups: ${scheduleError.message}`);
    }

    console.log(`Scheduled ${scheduleCount} backup jobs`);

    // Get pending backup jobs
    const { data: pendingBackups, error: fetchError } = await supabaseClient
      .from("backup_logs")
      .select("id, user_id, backup_type")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50); // Process max 50 at a time to avoid timeouts

    if (fetchError) {
      throw new Error(`Failed to fetch pending backups: ${fetchError.message}`);
    }

    if (!pendingBackups || pendingBackups.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending backups to process",
          scheduled: scheduleCount,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Process each backup (call backup-user-data function)
    const results = {
      total: pendingBackups.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const backup of pendingBackups) {
      try {
        // Call backup function
        const { error: backupError } = await supabaseClient.functions.invoke(
          "backup-user-data",
          {
            body: {
              userId: backup.user_id,
              backupType: backup.backup_type,
            },
          }
        );

        if (backupError) {
          throw new Error(backupError.message);
        }

        results.successful++;
      } catch (error: any) {
        console.error(`Backup failed for user ${backup.user_id}:`, error);
        results.failed++;
        results.errors.push(
          `User ${backup.user_id}: ${error instanceof Error ? error.message : String(error)}`
        );

        // Mark backup as failed
        await supabaseClient
          .from("backup_logs")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : String(error),
            completed_at: new Date().toISOString(),
          })
          .eq("id", backup.id);
      }
    }

    // Cleanup expired backups
    const { data: cleanupResult, error: cleanupError } = await supabaseClient.rpc(
      "cleanup_expired_backups"
    );

    let cleanupInfo = null;
    if (!cleanupError && cleanupResult && cleanupResult.length > 0) {
      cleanupInfo = {
        deleted_count: cleanupResult[0].deleted_count,
        freed_bytes: cleanupResult[0].freed_bytes,
        freed_mb: Math.round(cleanupResult[0].freed_bytes / 1024 / 1024),
      };
      console.log(
        `Cleaned up ${cleanupInfo.deleted_count} expired backups, freed ${cleanupInfo.freed_mb}MB`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled: scheduleCount,
        processed: results.total,
        successful: results.successful,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
        cleanup: cleanupInfo,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Backup scheduler error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Backup scheduling failed",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
