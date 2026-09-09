import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreFlight } from "../_shared/cors.ts";
import { isSuppressed } from "../_shared/email-suppression.ts";
import { listUnsubscribeHeaders } from "../_shared/email-headers.ts";
import { signEmailToken } from "../_shared/nurture-logic.ts";
import { resolveCsatTokenSecret } from "../_shared/csat-logic.ts";
import { functionsBase } from "../_shared/functions-url.ts";

/**
 * Weekly Nutrition Email
 *
 * Generates and sends weekly nutrition summary emails.
 * Aggregates plan entries per child, calculates nutrition coverage,
 * and sends HTML email via Resend API.
 *
 * Trigger: pg_cron or external scheduler (Sunday evenings)
 */
export default async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return handleCorsPreFlight(req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    // Exact Bearer-token match, not a substring `includes` (US-532): a substring
    // check would accept any header that merely CONTAINS the key.
    const bearer = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";
    const isServiceRole = !!serviceRoleKey && bearer === serviceRoleKey;
    const isCronJob =
      !!cronSecret && req.headers.get("X-Cron-Secret") === cronSecret;

    if (!isServiceRole && !isCronJob) {
      throw new Error("Unauthorized: Scheduled jobs only");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get users opted in to weekly summary
    const { data: subscribers, error: subError } = await supabase
      .from("automation_email_subscriptions")
      .select("user_id")
      .eq("weekly_summary", true)
      .is("unsubscribed_at", null);

    if (subError) throw new Error(`Fetch subscribers: ${subError.message}`);

    if (!subscribers || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No subscribers", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    const weekStartDate = weekStart.toISOString().split("T")[0];

    const resendKey = Deno.env.get("RESEND_API_KEY");
    // Fail closed the same way nurture-unsubscribe does (US-521): without the
    // secret we cannot mint a verifiable unsubscribe link, so the email goes
    // out with the preferences link alone rather than with a link that 404s.
    const unsubscribeSecret = resolveCsatTokenSecret(Deno.env.get("CSAT_TOKEN_SECRET"));

    const results = { total: subscribers.length, sent: 0, failed: 0, skipped: 0 };

    for (const { user_id } of subscribers) {
      try {
        // Get user email
        const { data: userData } = await supabase.auth.admin.getUserById(
          user_id
        );
        if (!userData.user?.email) continue;

        // Get kids
        const { data: kids } = await supabase
          .from("kids")
          .select("id, name")
          .eq("user_id", user_id);

        if (!kids || kids.length === 0) continue;

        // Aggregate plan entries per child
        const childSummaries = await Promise.all(
          kids.map(async (kid) => {
            const { data: entries } = await supabase
              .from("plan_entries")
              .select("meal_slot, result, food_id")
              .eq("kid_id", kid.id)
              .gte("date", weekStartDate);

            const total = entries?.length || 0;
            const ate = entries?.filter((e) => e.result === "ate").length || 0;
            const tasted =
              entries?.filter((e) => e.result === "tasted").length || 0;
            const refused =
              entries?.filter((e) => e.result === "refused").length || 0;

            // Recommended: 21 meals/week (3 per day)
            const coveragePct = Math.min(
              100,
              Math.round((total / 21) * 100)
            );

            return {
              name: kid.name,
              totalMeals: total,
              ate,
              tasted,
              refused,
              coveragePct,
            };
          })
        );

        // US-843: honour the one suppression list.
        //
        // This sender checked only its own automation_email_subscriptions row,
        // while nurture-unsubscribe writes to email_suppressions and the other
        // two senders read it. So somebody who clicked unsubscribe in a nurture
        // email kept receiving this one, forever. An unsubscribe that stops two
        // of three mailings is not an unsubscribe.
        if (await isSuppressed(supabase, userData.user.email)) {
          results.skipped++;
          continue;
        }

        // US-843: a one-click unsubscribe of its own, signed the same way the
        // nurture links are. "Manage preferences" pointed at a page behind a
        // sign-in, which is neither one click nor reachable from a mail client.
        const unsubscribeUrl = unsubscribeSecret
          ? `${functionsBase()}/nurture-unsubscribe?t=${encodeURIComponent(
              await signEmailToken(userData.user.email, unsubscribeSecret),
            )}`
          : null;

        // Generate and send email
        const html = generateEmailHtml(childSummaries, unsubscribeUrl);

        if (resendKey) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: Deno.env.get("EMAIL_FROM") || "noreply@tryeatpal.com",
              to: userData.user.email,
              subject: "Your Weekly Nutrition Summary - EatPal",
              html,
              // Both headers or neither: the Post header is what promises a
              // bare POST will act without a confirmation step, and a client
              // that sees only the first falls back to the old behaviour.
              ...(unsubscribeUrl ? { headers: listUnsubscribeHeaders(unsubscribeUrl) } : {}),
            }),
          });
        }

        // Queue in email system
        await supabase.from("automation_email_queue").insert({
          user_id,
          template_key: "weekly_nutrition",
          subject: "Your Weekly Nutrition Summary",
          html_body: html,
          status: resendKey ? "sent" : "pending",
        });

        results.sent++;
      } catch (err) {
        console.error(`Failed for user ${user_id}:`, err);
        results.failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Weekly nutrition email error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

interface ChildSummary {
  name: string;
  totalMeals: number;
  ate: number;
  tasted: number;
  refused: number;
  coveragePct: number;
}

function generateEmailHtml(children: ChildSummary[], unsubscribeUrl: string | null): string {
  const childrenHtml = children
    .map(
      (child) => `
    <div style="margin-bottom:24px;padding:20px;border:1px solid #e5e7eb;border-radius:8px;">
      <h3 style="color:#667eea;margin:0 0 16px 0;">${child.name}'s Week</h3>
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;text-align:center;padding:12px;background:#f0fdf4;border-radius:6px;">
          <div style="font-size:28px;font-weight:bold;color:#16a34a;">${child.ate}</div>
          <div style="font-size:12px;color:#6b7280;">Ate</div>
        </div>
        <div style="flex:1;text-align:center;padding:12px;background:#fef9c3;border-radius:6px;">
          <div style="font-size:28px;font-weight:bold;color:#ca8a04;">${child.tasted}</div>
          <div style="font-size:12px;color:#6b7280;">Tasted</div>
        </div>
        <div style="flex:1;text-align:center;padding:12px;background:#fef2f2;border-radius:6px;">
          <div style="font-size:28px;font-weight:bold;color:#dc2626;">${child.refused}</div>
          <div style="font-size:12px;color:#6b7280;">Refused</div>
        </div>
      </div>
      <div style="background:#f3f4f6;border-radius:999px;height:8px;overflow:hidden;">
        <div style="background:#667eea;height:100%;width:${child.coveragePct}%;border-radius:999px;"></div>
      </div>
      <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">Meal coverage: ${child.coveragePct}% of recommended</p>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;">
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 20px;text-align:center;">
    <h1 style="color:white;margin:0;">Weekly Nutrition Summary</h1>
    <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;">Here's how your family did this week</p>
  </div>
  <div style="padding:30px 20px;">
    ${childrenHtml}
    <div style="text-align:center;margin:24px 0;">
      <a href="https://tryeatpal.com/dashboard/analytics" style="background:#667eea;color:white;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;">View Full Analytics</a>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:32px;">
      You're receiving this because you subscribed to weekly summaries.<br>
      <a href="https://tryeatpal.com/dashboard/settings" style="color:#667eea;">Manage preferences</a>${
        unsubscribeUrl
          ? ` &middot; <a href="${unsubscribeUrl}" style="color:#667eea;">Unsubscribe</a>`
          : ""
      }
    </p>
  </div>
</body></html>`;
}
