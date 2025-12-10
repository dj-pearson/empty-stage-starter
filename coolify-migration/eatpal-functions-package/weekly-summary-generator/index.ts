import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Weekly Summary Generator
 *
 * Generates personalized weekly summary emails with:
 * - Progress metrics (meals eaten, new foods tried)
 * - Milestone highlights
 * - Success stories
 * - Tips based on data
 *
 * Intended to be called weekly (e.g., Sunday evenings)
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify this is a scheduled job
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");

    const isServiceRole = authHeader?.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
    const isCronJob = cronSecret && req.headers.get("X-Cron-Secret") === cronSecret;

    if (!isServiceRole && !isCronJob) {
      throw new Error("Unauthorized: Scheduled jobs only");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Schedule weekly summary emails
    const { data: scheduledCount, error: scheduleError } = await supabaseClient.rpc(
      "schedule_weekly_summaries"
    );

    if (scheduleError) {
      throw new Error(`Failed to schedule summaries: ${scheduleError.message}`);
    }

    console.log(`Scheduled ${scheduledCount} weekly summary emails`);

    // Get users who need summaries generated
    const { data: users, error: usersError } = await supabaseClient
      .from("email_subscriptions")
      .select("user_id")
      .eq("weekly_summary", true)
      .is("unsubscribed_at", null);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No users subscribed to weekly summaries",
          scheduled: 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const results = {
      total: users.length,
      successful: 0,
      failed: 0,
    };

    // Generate summary data for each user
    for (const { user_id } of users) {
      try {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);

        // Get kids for user
        const { data: kids } = await supabaseClient
          .from("kids")
          .select("id, name")
          .eq("user_id", user_id);

        if (!kids || kids.length === 0) continue;

        // Get weekly metrics
        const metrics = await Promise.all(
          kids.map(async (kid) => {
            // Count meals logged
            const { count: mealsLogged } = await supabaseClient
              .from("plan_entries")
              .select("*", { count: "exact", head: true })
              .eq("kid_id", kid.id)
              .gte("date", weekStart.toISOString().split("T")[0])
              .not("result", "is", null);

            // Count successful attempts
            const { count: successfulAttempts } = await supabaseClient
              .from("food_attempts")
              .select("*", { count: "exact", head: true })
              .eq("kid_id", kid.id)
              .gte("attempted_at", weekStart.toISOString())
              .in("outcome", ["success", "partial"]);

            // Get new foods tried
            const { data: newFoods } = await supabaseClient
              .from("food_attempts")
              .select(
                `
                food_id,
                foods (name)
              `
              )
              .eq("kid_id", kid.id)
              .gte("attempted_at", weekStart.toISOString())
              .eq("outcome", "success")
              .order("attempted_at", { ascending: false })
              .limit(5);

            // Get achievements
            const { data: achievements } = await supabaseClient
              .from("kid_achievements")
              .select("title, description")
              .eq("kid_id", kid.id)
              .gte("earned_at", weekStart.toISOString())
              .order("earned_at", { ascending: false });

            return {
              kid_name: kid.name,
              meals_logged: mealsLogged || 0,
              successful_attempts: successfulAttempts || 0,
              new_foods: newFoods?.map((f: any) => f.foods?.name).filter(Boolean) || [],
              achievements: achievements || [],
            };
          })
        );

        // Get user email
        const { data: userData } = await supabaseClient.auth.admin.getUserById(user_id);
        if (!userData.user?.email) continue;

        // Generate summary HTML
        const summaryHtml = generateSummaryHtml(metrics);

        // Update email template variables
        await supabaseClient
          .from("email_queue")
          .update({
            html_body: summaryHtml,
            template_variables: { metrics: JSON.stringify(metrics) },
          })
          .eq("user_id", user_id)
          .eq("template_key", "weekly_summary")
          .gte("created_at", weekStart.toISOString())
          .eq("status", "pending");

        results.successful++;
      } catch (error) {
        console.error(`Failed to generate summary for user ${user_id}:`, error);
        results.failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled: scheduledCount,
        processed: results.total,
        successful: results.successful,
        failed: results.failed,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Weekly summary generator error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Summary generation failed",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateSummaryHtml(
  metrics: Array<{
    kid_name: string;
    meals_logged: number;
    successful_attempts: number;
    new_foods: string[];
    achievements: Array<{ title: string; description: string }>;
  }>
): string {
  const kidsHtml = metrics
    .map(
      (kid) => `
    <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h3 style="color: #667eea; margin-top: 0;">${kid.kid_name}'s Week</h3>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="text-align: center; padding: 15px; background: #f3f4f6; border-radius: 5px;">
          <div style="font-size: 32px; font-weight: bold; color: #667eea;">${kid.meals_logged}</div>
          <div style="font-size: 14px; color: #6b7280;">Meals Logged</div>
        </div>
        <div style="text-align: center; padding: 15px; background: #f3f4f6; border-radius: 5px;">
          <div style="font-size: 32px; font-weight: bold; color: #10b981;">${kid.successful_attempts}</div>
          <div style="font-size: 14px; color: #6b7280;">Success Stories</div>
        </div>
      </div>

      ${
        kid.new_foods.length > 0
          ? `
      <div style="margin-bottom: 15px;">
        <h4 style="color: #374151; margin-bottom: 10px;">🎉 New Foods Tried:</h4>
        <ul style="color: #6b7280; margin: 0; padding-left: 20px;">
          ${kid.new_foods.map((food) => `<li>${food}</li>`).join("")}
        </ul>
      </div>
      `
          : ""
      }

      ${
        kid.achievements.length > 0
          ? `
      <div>
        <h4 style="color: #374151; margin-bottom: 10px;">🏆 Achievements Earned:</h4>
        ${kid.achievements
          .map(
            (achievement) => `
          <div style="padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; margin-bottom: 10px;">
            <strong>${achievement.title}</strong><br>
            <span style="font-size: 14px; color: #6b7280;">${achievement.description}</span>
          </div>
        `
          )
          .join("")}
      </div>
      `
          : ""
      }
    </div>
  `
    )
    .join("");

  return `
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">Your Week at a Glance</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Here's what happened this week</p>
  </div>

  <div style="padding: 40px 20px;">
    ${kidsHtml}

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{app_url}}/analytics" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Detailed Analytics</a>
    </div>

    <div style="background: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #3b82f6;">
      <h4 style="color: #1e40af; margin-top: 0;">💡 Tip of the Week</h4>
      <p style="color: #374151; margin-bottom: 0;">Keep celebrating small wins! Every bite, taste, or even just touching a new food is progress worth celebrating.</p>
    </div>

    <p style="text-align: center; color: #6b7280; margin-top: 40px; font-size: 14px;">
      Keep up the great work!<br>
      The EatPal Team
    </p>
  </div>
</body>
</html>
`;
}
