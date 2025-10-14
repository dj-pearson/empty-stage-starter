import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Email Sequence Processor Edge Function
 *
 * Runs hourly to process email sequences:
 * 1. Find enrollments that need their next email
 * 2. Schedule the next email in the sequence
 * 3. Mark completed sequences
 *
 * Should be called by a cron job every hour.
 */

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify this is a scheduled job (check for cron secret or service role)
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");

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

    console.log("Starting email sequence processing...");

    // Get active enrollments that need processing
    const { data: enrollments, error: fetchError } = await supabaseClient
      .from("user_email_sequences")
      .select(`
        id,
        user_id,
        lead_id,
        sequence_id,
        current_step,
        enrolled_at,
        metadata
      `)
      .is("completed_at", null)
      .is("canceled_at", null)
      .order("enrolled_at", { ascending: true })
      .limit(100);

    if (fetchError) {
      throw new Error(`Failed to fetch enrollments: ${fetchError.message}`);
    }

    if (!enrollments || enrollments.length === 0) {
      console.log("No active enrollments to process");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No enrollments to process",
          processed: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`Found ${enrollments.length} active enrollments`);

    const results = {
      total: enrollments.length,
      scheduled: 0,
      completed: 0,
      errors: [] as string[],
    };

    // Process each enrollment
    for (const enrollment of enrollments) {
      try {
        // Call the schedule_next_sequence_email function
        const { data: scheduleResult, error: scheduleError } = await supabaseClient
          .rpc("schedule_next_sequence_email", {
            p_enrollment_id: enrollment.id,
          });

        if (scheduleError) {
          console.error(`Error scheduling for enrollment ${enrollment.id}:`, scheduleError);
          results.errors.push(`Enrollment ${enrollment.id}: ${scheduleError.message}`);
          continue;
        }

        if (scheduleResult === true) {
          // Check if sequence is now completed
          const { data: updated } = await supabaseClient
            .from("user_email_sequences")
            .select("completed_at")
            .eq("id", enrollment.id)
            .single();

          if (updated?.completed_at) {
            results.completed++;
            console.log(`Sequence completed for enrollment ${enrollment.id}`);
          } else {
            results.scheduled++;
            console.log(`Email scheduled for enrollment ${enrollment.id}`);
          }
        }
      } catch (error) {
        console.error(`Failed to process enrollment ${enrollment.id}:`, error);
        results.errors.push(
          `Enrollment ${enrollment.id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    console.log("Email sequence processing complete:", results);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.total,
        scheduled: results.scheduled,
        completed: results.completed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Email sequence processor error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Processing failed",
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
