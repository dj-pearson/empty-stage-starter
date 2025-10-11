import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EmailSubscriptions {
  welcome_emails: boolean;
  milestone_emails: boolean;
  weekly_summary: boolean;
  tips_and_advice: boolean;
  marketing_emails: boolean;
}

export interface EmailLog {
  id: string;
  template_key: string;
  to_email: string;
  subject: string;
  status: string;
  created_at: string;
  sent_at?: string;
  error_message?: string;
}

/**
 * Get email subscription preferences for current user
 */
export async function getEmailSubscriptions(): Promise<EmailSubscriptions | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await (supabase as any)
      .from("automation_email_subscriptions")
      .select("welcome_emails, milestone_emails, weekly_summary, tips_and_advice, marketing_emails")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to fetch email subscriptions:", error);
      return null;
    }

    return data as EmailSubscriptions;
  } catch (error) {
    console.error("Failed to fetch email subscriptions:", error);
    return null;
  }
}

/**
 * Update email subscription preferences
 */
export async function updateEmailSubscriptions(
  subscriptions: Partial<EmailSubscriptions>
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to update email preferences");
      return false;
    }

    const { error } = await (supabase as any)
      .from("automation_email_subscriptions")
      .upsert({
        user_id: user.id,
        ...subscriptions,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to update email subscriptions:", error);
      toast.error("Failed to update email preferences", {
        description: error.message,
      });
      return false;
    }

    toast.success("Email preferences updated");
    return true;
  } catch (error) {
    console.error("Failed to update email subscriptions:", error);
    toast.error("Failed to update email preferences");
    return false;
  }
}

/**
 * Unsubscribe from all emails using token (for email unsubscribe links)
 */
export async function unsubscribeAll(token: string): Promise<boolean> {
  try {
    const { data, error } = await (supabase as any)
      .from("automation_email_subscriptions")
      .update({
        welcome_emails: false,
        milestone_emails: false,
        weekly_summary: false,
        tips_and_advice: false,
        marketing_emails: false,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("unsubscribe_token", token)
      .select("user_id")
      .maybeSingle();

    if (error) {
      console.error("Failed to unsubscribe:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Failed to unsubscribe:", error);
    return false;
  }
}

/**
 * Get email history for current user
 */
export async function getEmailHistory(limit: number = 20): Promise<EmailLog[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const { data, error } = await (supabase as any)
      .from("automation_email_queue")
      .select("id, template_key, to_email, subject, status, created_at, sent_at, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch email history:", error);
      return [];
    }

    return data as EmailLog[];
  } catch (error) {
    console.error("Failed to fetch email history:", error);
    return [];
  }
}

/**
 * Manually queue a test email (for development/testing)
 */
export async function sendTestEmail(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to send test email");
      return false;
    }

    toast.info("Sending test email...");

    const { error } = await (supabase as any).rpc("queue_email", {
      p_user_id: user.id,
      p_template_key: "welcome",
      p_to_email: user.email,
      p_template_variables: {
        user_name: "Test User",
        app_url: window.location.origin,
      },
      p_priority: 10,
    });

    if (error) {
      console.error("Failed to send test email:", error);
      toast.error("Failed to send test email", {
        description: error.message,
      });
      return false;
    }

    toast.success("Test email queued", {
      description: "Check your inbox in a few minutes",
    });
    return true;
  } catch (error) {
    console.error("Failed to send test email:", error);
    toast.error("Failed to send test email");
    return false;
  }
}

/**
 * Format email status with icon
 */
export function formatEmailStatus(status: string): {
  label: string;
  icon: string;
  color: string;
} {
  switch (status) {
    case "sent":
      return { label: "Sent", icon: "✓", color: "text-green-600" };
    case "pending":
      return { label: "Pending", icon: "○", color: "text-yellow-600" };
    case "failed":
      return { label: "Failed", icon: "✗", color: "text-red-600" };
    case "cancelled":
      return { label: "Cancelled", icon: "−", color: "text-gray-600" };
    default:
      return { label: status, icon: "?", color: "text-gray-600" };
  }
}

/**
 * Get human-readable template name
 */
export function formatTemplateName(templateKey: string): string {
  const names: Record<string, string> = {
    welcome: "Welcome Email",
    milestone_achieved: "Milestone Achievement",
    weekly_summary: "Weekly Summary",
    tips_and_advice: "Tips & Advice",
  };
  return names[templateKey] || templateKey;
}
