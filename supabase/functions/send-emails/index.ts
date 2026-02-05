import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Email Sender Edge Function
 *
 * Processes pending emails from the queue and sends them via email provider.
 * Intended to be called by a cron job (e.g., every 5 minutes).
 *
 * Supported email providers:
 * - Resend (recommended)
 * - SendGrid
 * - AWS SES
 * - Custom SMTP
 *
 * Set EMAIL_PROVIDER environment variable to choose provider.
 */

interface EmailProvider {
  send(email: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// ============================================================================
// RESEND PROVIDER
// ============================================================================

class ResendProvider implements EmailProvider {
  private apiKey: string;
  private fromEmail: string;

  constructor(apiKey: string, fromEmail: string) {
    this.apiKey = apiKey;
    this.fromEmail = fromEmail;
  }

  async send(email: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.message || "Email send failed" };
      }

      return { success: true, messageId: data.id };
    } catch (error) {
      console.error("Resend error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

// ============================================================================
// CONSOLE PROVIDER (for development)
// ============================================================================

class ConsoleProvider implements EmailProvider {
  async send(email: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log("=== EMAIL (DEV MODE) ===");
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log(`Text: ${email.text}`);
    console.log("=======================");
    return { success: true, messageId: `dev-${Date.now()}` };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default async (req: Request) => {
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

    // Initialize email provider
    const emailProvider = Deno.env.get("EMAIL_PROVIDER") || "console";
    let provider: EmailProvider;

    switch (emailProvider) {
      case "resend":
        provider = new ResendProvider(
          Deno.env.get("RESEND_API") ?? "",
          Deno.env.get("EMAIL_FROM") ?? "noreply@eatpal.com"
        );
        break;
      case "console":
      default:
        provider = new ConsoleProvider();
        break;
    }

    // Get pending emails (limit to 50 per run to avoid timeouts)
    const { data: pendingEmails, error: fetchError } = await supabaseClient
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("priority", { ascending: false })
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch pending emails: ${fetchError.message}`);
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending emails to send",
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

    // Process emails
    const results = {
      total: pendingEmails.length,
      successful: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const email of pendingEmails) {
      try {
        // Send email
        const result = await provider.send({
          to: email.to_email,
          subject: email.subject,
          html: email.html_body,
          text: email.text_body || undefined,
        });

        if (result.success) {
          // Update email status to sent
          await supabaseClient
            .from("email_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          // Log event
          await supabaseClient.from("email_events").insert({
            email_id: email.id,
            event_type: "sent",
            event_data: { message_id: result.messageId },
          });

          results.successful++;
        } else {
          throw new Error(result.error || "Email send failed");
        }
      } catch (error) {
        console.error(`Failed to send email ${email.id}:`, error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        const newRetryCount = email.retry_count + 1;
        const maxRetries = email.max_retries || 3;

        // Update email status
        if (newRetryCount >= maxRetries) {
          // Max retries reached, mark as failed
          await supabaseClient
            .from("email_queue")
            .update({
              status: "failed",
              error_message: errorMessage,
              retry_count: newRetryCount,
            })
            .eq("id", email.id);

          results.failed++;
        } else {
          // Retry later with exponential backoff
          const retryDelayMinutes = Math.pow(2, newRetryCount) * 5; // 5, 10, 20, 40 minutes

          await supabaseClient
            .from("email_queue")
            .update({
              error_message: errorMessage,
              retry_count: newRetryCount,
              scheduled_for: new Date(Date.now() + retryDelayMinutes * 60 * 1000).toISOString(),
            })
            .eq("id", email.id);
        }

        results.errors.push(`Email ${email.id}: ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.total,
        successful: results.successful,
        failed: results.failed,
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
    console.error("Email sender error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Email sending failed",
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
}
