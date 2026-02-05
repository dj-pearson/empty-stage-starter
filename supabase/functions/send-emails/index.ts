import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Email Sender Edge Function
 *
 * Processes pending emails from the automation_email_queue table and sends them.
 * Intended to be called by a cron job (e.g., every 5 minutes).
 *
 * Supported email providers (set EMAIL_PROVIDER env var):
 * - "resend" - Resend API (requires RESEND_API_KEY, EMAIL_FROM)
 * - "smtp" - Custom SMTP (for self-hosted Supabase)
 * - "console" - Development mode (logs to console)
 *
 * SMTP Environment Variables (for self-hosted Supabase):
 * - SMTP_HOST - SMTP server hostname
 * - SMTP_PORT - SMTP server port (default: 587)
 * - SMTP_ADMIN_EMAIL - SMTP username and from email
 * - SMTP_PASS - SMTP password
 * - SMTP_SENDER_NAME - Display name for sender (default: EatPal)
 * - SMTP_RELAY_URL - Optional HTTP relay endpoint for email sending
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
// SMTP PROVIDER (for self-hosted Supabase)
// ============================================================================

class SmtpProvider implements EmailProvider {
  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    this.host = Deno.env.get("SMTP_HOST") ?? "localhost";
    this.port = parseInt(Deno.env.get("SMTP_PORT") ?? "587");
    this.user = Deno.env.get("SMTP_ADMIN_EMAIL") ?? "";
    this.pass = Deno.env.get("SMTP_PASS") ?? "";
    this.fromEmail = Deno.env.get("SMTP_ADMIN_EMAIL") ?? "noreply@example.com";
    this.fromName = Deno.env.get("SMTP_SENDER_NAME") ?? "EatPal";
  }

  async send(email: EmailData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Use Deno's native SMTP client via fetch to a local mail server
      // or use the smtp module from deno.land
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      // Build multipart MIME message
      const mimeMessage = this.buildMimeMessage(email, boundary);

      // For self-hosted Supabase, we'll use the built-in SMTP relay
      // This sends via HTTP to a local SMTP relay service
      const smtpEndpoint = Deno.env.get("SMTP_RELAY_URL");

      if (smtpEndpoint) {
        // Use HTTP relay endpoint if available
        const response = await fetch(smtpEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SMTP_API_KEY") || this.pass}`,
          },
          body: JSON.stringify({
            from: `${this.fromName} <${this.fromEmail}>`,
            to: email.to,
            subject: email.subject,
            html: email.html,
            text: email.text,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          return { success: false, error: `SMTP relay error: ${errorData}` };
        }

        const data = await response.json();
        return { success: true, messageId: data.messageId || `smtp-${Date.now()}` };
      } else {
        // Direct SMTP connection using Deno SMTPClient
        // Import dynamically to avoid issues if module not available
        try {
          const { SmtpClient } = await import("https://deno.land/x/smtp@v0.7.0/mod.ts");

          const client = new SmtpClient();

          await client.connectTLS({
            hostname: this.host,
            port: this.port,
            username: this.user,
            password: this.pass,
          });

          await client.send({
            from: this.fromEmail,
            to: email.to,
            subject: email.subject,
            content: email.text || "",
            html: email.html,
          });

          await client.close();

          return { success: true, messageId: `smtp-${Date.now()}` };
        } catch (smtpError) {
          console.error("Direct SMTP connection failed:", smtpError);

          // Fallback: Try using fetch to local sendmail endpoint
          // This works with many self-hosted setups
          const mailhogEndpoint = `http://${this.host}:8025/api/v1/messages`;

          try {
            // Attempt via MailHog API (common in dev/self-hosted setups)
            const response = await fetch(mailhogEndpoint.replace('/api/v1/messages', '/api/v2/outgoing'), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                From: { Email: this.fromEmail, Name: this.fromName },
                To: [{ Email: email.to }],
                Subject: email.subject,
                HTMLBody: email.html,
                TextBody: email.text,
              }),
            });

            if (response.ok) {
              return { success: true, messageId: `mailhog-${Date.now()}` };
            }
          } catch {
            // Ignore MailHog fallback errors
          }

          return {
            success: false,
            error: smtpError instanceof Error ? smtpError.message : "SMTP connection failed"
          };
        }
      }
    } catch (error) {
      console.error("SMTP error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown SMTP error",
      };
    }
  }

  private buildMimeMessage(email: EmailData, boundary: string): string {
    let message = "";
    message += `From: ${this.fromName} <${this.fromEmail}>\r\n`;
    message += `To: ${email.to}\r\n`;
    message += `Subject: ${email.subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;
    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    message += `\r\n`;

    if (email.text) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=utf-8\r\n`;
      message += `\r\n`;
      message += `${email.text}\r\n`;
    }

    message += `--${boundary}\r\n`;
    message += `Content-Type: text/html; charset=utf-8\r\n`;
    message += `\r\n`;
    message += `${email.html}\r\n`;
    message += `--${boundary}--\r\n`;

    return message;
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
          Deno.env.get("RESEND_API_KEY") ?? Deno.env.get("RESEND_API") ?? "",
          Deno.env.get("EMAIL_FROM") ?? "noreply@eatpal.com"
        );
        break;
      case "smtp":
        provider = new SmtpProvider();
        break;
      case "console":
      default:
        provider = new ConsoleProvider();
        break;
    }

    // Get pending emails (limit to 50 per run to avoid timeouts)
    const { data: pendingEmails, error: fetchError } = await supabaseClient
      .from("automation_email_queue")
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
            .from("automation_email_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          // Log event
          await supabaseClient.from("automation_email_events").insert({
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
            .from("automation_email_queue")
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
            .from("automation_email_queue")
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
