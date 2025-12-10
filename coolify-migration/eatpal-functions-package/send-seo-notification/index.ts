// =====================================================
// SEND SEO NOTIFICATION - EDGE FUNCTION
// =====================================================
// Sends SEO alerts and digests via email and Slack
// =====================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Email sending via Resend (or any email provider)
async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, skipping email");
    return { success: false, error: "Email not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") || "noreply@eatpal.com",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Email send error:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error("Email error:", error);
    return { success: false, error: error.message };
  }
}

// Slack notification
async function sendSlackNotification(
  webhookUrl: string,
  message: string,
  details?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
    ];

    if (details) {
      blocks.push({
        type: "section",
        fields: Object.entries(details).map(([key, value]) => ({
          type: "mrkdwn",
          text: `*${key}:*\n${value}`,
        })),
      });
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Slack send error:", error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error("Slack error:", error);
    return { success: false, error: error.message };
  }
}

// Generate email HTML for alert
function generateAlertEmail(alert: any): string {
  const severityColors = {
    low: "#3b82f6",
    medium: "#f59e0b",
    high: "#ef4444",
    critical: "#991b1b",
  };

  const severityColor = severityColors[alert.severity] || "#6b7280";

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .alert-title { font-size: 24px; font-weight: bold; margin: 0; }
    .alert-type { font-size: 14px; opacity: 0.9; margin-top: 5px; }
    .message { background: white; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid ${severityColor}; }
    .details { background: white; padding: 15px; border-radius: 6px; margin-top: 15px; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .detail-label { font-weight: 600; color: #6b7280; }
    .detail-value { color: #111827; }
    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
    .button { display: inline-block; background: ${severityColor}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="alert-title">${alert.title}</div>
      <div class="alert-type">${alert.alert_type.replace("_", " ").toUpperCase()} - ${alert.severity.toUpperCase()}</div>
    </div>
    <div class="content">
      <div class="message">
        ${alert.message}
      </div>
      ${
    alert.details
      ? `
      <div class="details">
        <strong>Details:</strong>
        ${
        Object.entries(alert.details)
          .map(
            ([key, value]) =>
              `<div class="detail-row"><span class="detail-label">${key}:</span><span class="detail-value">${value}</span></div>`
          )
          .join("")
      }
      </div>
      `
      : ""
  }
      <a href="${Deno.env.get("APP_URL") || "http://localhost:5173"}/seo-dashboard" class="button">View SEO Dashboard</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you have SEO monitoring enabled.</p>
      <p><a href="${Deno.env.get("APP_URL") || "http://localhost:5173"}/seo-dashboard">Manage notification preferences</a></p>
    </div>
  </div>
</body>
</html>
  `;
}

// Generate daily digest email
function generateDailyDigestEmail(alerts: any[], stats: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .title { font-size: 28px; font-weight: bold; margin: 0; }
    .subtitle { font-size: 16px; opacity: 0.9; margin-top: 10px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; padding: 20px; background: #f9fafb; }
    .stat-card { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
    .stat-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
    .alerts-section { padding: 20px; background: white; }
    .alert-item { border-left: 4px solid #ef4444; padding: 15px; margin: 15px 0; background: #fef2f2; border-radius: 0 6px 6px 0; }
    .alert-title { font-weight: bold; color: #991b1b; }
    .alert-message { color: #6b7280; margin-top: 5px; }
    .footer { text-align: center; margin-top: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">📊 Daily SEO Report</div>
      <div class="subtitle">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${stats.score || 0}</div>
        <div class="stat-label">SEO Score</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${alerts.length}</div>
        <div class="stat-label">Active Alerts</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.keywords || 0}</div>
        <div class="stat-label">Keywords Tracked</div>
      </div>
    </div>

    ${
    alerts.length > 0
      ? `
    <div class="alerts-section">
      <h2>🚨 Active Alerts</h2>
      ${
        alerts.map((alert) =>
          `
      <div class="alert-item">
        <div class="alert-title">${alert.title}</div>
        <div class="alert-message">${alert.message}</div>
      </div>
      `
        ).join("")
      }
    </div>
    `
      : '<div class="alerts-section"><p style="text-align:center; color:#6b7280;">✅ No active alerts - your SEO is looking good!</p></div>'
  }

    <div class="footer">
      <p><a href="${Deno.env.get("APP_URL") || "http://localhost:5173"}/seo-dashboard" style="background:#667eea; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; display:inline-block;">View Full Dashboard</a></p>
      <p style="margin-top:20px; color:#6b7280; font-size:14px;"><a href="${Deno.env.get("APP_URL") || "http://localhost:5173"}/seo-dashboard">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { notificationType, alertId, userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's notification preferences
    const { data: prefs, error: prefsError } = await supabaseClient
      .from("seo_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (prefsError || !prefs) {
      return new Response(
        JSON.stringify({ error: "No notification preferences found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Handle immediate alert
    if (notificationType === "immediate" && alertId) {
      const { data: alert } = await supabaseClient
        .from("seo_alerts")
        .select("*")
        .eq("id", alertId)
        .single();

      if (!alert) {
        return new Response(
          JSON.stringify({ error: "Alert not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send email if enabled
      if (prefs.email_enabled && prefs.immediate_alerts && prefs.email_address) {
        const emailHtml = generateAlertEmail(alert);
        const emailResult = await sendEmail(
          prefs.email_address,
          `🚨 SEO Alert: ${alert.title}`,
          emailHtml
        );

        await supabaseClient.from("seo_notification_log").insert({
          user_id: userId,
          alert_id: alertId,
          notification_type: "immediate",
          channel: "email",
          recipient: prefs.email_address,
          subject: `🚨 SEO Alert: ${alert.title}`,
          body: emailHtml,
          status: emailResult.success ? "delivered" : "failed",
          sent_at: new Date().toISOString(),
          error_message: emailResult.error,
        });

        results.push({ channel: "email", ...emailResult });
      }

      // Send Slack if enabled
      if (prefs.slack_enabled && prefs.slack_webhook_url) {
        const slackMessage = `🚨 *${alert.severity.toUpperCase()} SEO Alert*\n\n*${alert.title}*\n${alert.message}`;
        const slackResult = await sendSlackNotification(
          prefs.slack_webhook_url,
          slackMessage,
          alert.details
        );

        await supabaseClient.from("seo_notification_log").insert({
          user_id: userId,
          alert_id: alertId,
          notification_type: "immediate",
          channel: "slack",
          recipient: prefs.slack_channel || "general",
          body: slackMessage,
          status: slackResult.success ? "delivered" : "failed",
          sent_at: new Date().toISOString(),
          error_message: slackResult.error,
        });

        results.push({ channel: "slack", ...slackResult });
      }
    }

    // Handle daily digest
    if (notificationType === "daily_digest") {
      // Get all active alerts
      const { data: alerts } = await supabaseClient
        .from("seo_alerts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      // Get latest audit stats
      const { data: latestAudit } = await supabaseClient
        .from("seo_audit_history")
        .select("overall_score")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get keyword count
      const { count: keywordCount } = await supabaseClient
        .from("seo_keywords")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);

      const stats = {
        score: latestAudit?.overall_score || 0,
        keywords: keywordCount || 0,
      };

      if (prefs.email_enabled && prefs.daily_digest && prefs.email_address) {
        const emailHtml = generateDailyDigestEmail(alerts || [], stats);
        const emailResult = await sendEmail(
          prefs.email_address,
          `📊 Daily SEO Report - ${new Date().toLocaleDateString()}`,
          emailHtml
        );

        await supabaseClient.from("seo_notification_log").insert({
          user_id: userId,
          notification_type: "daily_digest",
          channel: "email",
          recipient: prefs.email_address,
          subject: `📊 Daily SEO Report - ${new Date().toLocaleDateString()}`,
          body: emailHtml,
          status: emailResult.success ? "delivered" : "failed",
          sent_at: new Date().toISOString(),
          error_message: emailResult.error,
        });

        results.push({ channel: "email", ...emailResult });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent: results.filter((r) => r.success).length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-seo-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
