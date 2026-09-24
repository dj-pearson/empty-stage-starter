import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import i18n from "@/i18n";
import "@/i18n/appLocale";

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
 * The column defaults of automation_email_subscriptions
 * (20251010233000_email_automation.sql). A user with no row gets exactly these
 * from the email jobs, so the screen shows them rather than an error.
 */
export const DEFAULT_EMAIL_SUBSCRIPTIONS: Readonly<EmailSubscriptions> = Object.freeze({
  welcome_emails: true,
  milestone_emails: true,
  weekly_summary: true,
  tips_and_advice: true,
  marketing_emails: false,
});

const SUBSCRIPTION_KEYS: ReadonlyArray<keyof EmailSubscriptions> = [
  "welcome_emails",
  "milestone_emails",
  "weekly_summary",
  "tips_and_advice",
  "marketing_emails",
];

export type EmailSubscriptionsResult =
  | { status: "ok"; prefs: EmailSubscriptions; unsubscribedAt: string | null }
  | { status: "missing"; prefs: EmailSubscriptions; unsubscribedAt: null }
  | { status: "error" };

/**
 * The current user's email preferences.
 *
 * "missing" is not a failure: the row is created on first save, and until
 * then the column defaults are what the email jobs apply. A null column is
 * read as its default for the same reason.
 */
export async function getEmailSubscriptions(): Promise<EmailSubscriptionsResult> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { status: "error" };

    const { data, error } = await supabase
      .from("automation_email_subscriptions")
      .select(
        "welcome_emails, milestone_emails, weekly_summary, tips_and_advice, marketing_emails, unsubscribed_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logger.error("Failed to fetch email subscriptions:", error);
      return { status: "error" };
    }

    if (!data) {
      return { status: "missing", prefs: { ...DEFAULT_EMAIL_SUBSCRIPTIONS }, unsubscribedAt: null };
    }

    const prefs = { ...DEFAULT_EMAIL_SUBSCRIPTIONS };
    for (const key of SUBSCRIPTION_KEYS) {
      const value = data[key];
      if (typeof value === "boolean") prefs[key] = value;
    }
    return { status: "ok", prefs, unsubscribedAt: data.unsubscribed_at ?? null };
  } catch (error) {
    logger.error("Failed to fetch email subscriptions:", error);
    return { status: "error" };
  }
}

/**
 * Save email preferences. Upserts on user_id (unique), so the first save
 * creates the row. Switching any category on also clears unsubscribed_at: a
 * footer "unsubscribe from all" is undone by choosing to receive something.
 *
 * Silent on success (the switch already shows the new state); a failure
 * raises an error toast and returns false so the caller can revert.
 */
export async function updateEmailSubscriptions(
  subscriptions: Partial<EmailSubscriptions>
): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error(
        i18n.t("settings.prefs.email.signInToUpdate", {
          defaultValue: "Please sign in to update email preferences",
        })
      );
      return false;
    }

    const turningOn = SUBSCRIPTION_KEYS.some((key) => subscriptions[key] === true);
    const { error } = await supabase.from("automation_email_subscriptions").upsert(
      {
        user_id: user.id,
        ...subscriptions,
        ...(turningOn ? { unsubscribed_at: null } : {}),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      logger.error("Failed to update email subscriptions:", error);
      toast.error(
        i18n.t("settings.prefs.email.saveFailed", {
          defaultValue: "Couldn't save your email choice. Please try again.",
        })
      );
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Failed to update email subscriptions:", error);
    toast.error(
      i18n.t("settings.prefs.email.saveFailed", {
        defaultValue: "Couldn't save your email choice. Please try again.",
      })
    );
    return false;
  }
}

/**
 * Unsubscribe from all emails using token (for email unsubscribe links)
 */
export async function unsubscribeAll(token: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
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
      logger.error("Failed to unsubscribe:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    logger.error("Failed to unsubscribe:", error);
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

    const { data, error } = await supabase
      .from("automation_email_queue")
      .select("id, template_key, to_email, subject, status, created_at, sent_at, error_message")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("Failed to fetch email history:", error);
      return [];
    }

    return data as EmailLog[];
  } catch (error) {
    logger.error("Failed to fetch email history:", error);
    return [];
  }
}

export type EmailStatusIcon = "CheckCircle2" | "Clock" | "AlertCircle" | "MinusCircle" | "HelpCircle";

export interface EmailStatusDisplay {
  /** i18n key under settings.prefs.email.status. */
  labelKey: string;
  defaultLabel: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  /** A lucide-react icon name; the component maps it to the icon. */
  icon: EmailStatusIcon;
}

/**
 * How an email's delivery status is shown: a Badge variant and a lucide icon,
 * never a raw color class or a text glyph.
 */
export function formatEmailStatus(status: string): EmailStatusDisplay {
  switch (status) {
    case "sent":
      return { labelKey: "settings.prefs.email.status.sent", defaultLabel: "Sent", variant: "secondary", icon: "CheckCircle2" };
    case "pending":
      return { labelKey: "settings.prefs.email.status.pending", defaultLabel: "Queued", variant: "outline", icon: "Clock" };
    case "failed":
      return { labelKey: "settings.prefs.email.status.failed", defaultLabel: "Not delivered", variant: "destructive", icon: "AlertCircle" };
    case "cancelled":
      return { labelKey: "settings.prefs.email.status.cancelled", defaultLabel: "Cancelled", variant: "outline", icon: "MinusCircle" };
    default:
      return { labelKey: "settings.prefs.email.status.unknown", defaultLabel: "Unknown", variant: "outline", icon: "HelpCircle" };
  }
}

/** Human-readable name for an email template key, in the current language. */
export function formatTemplateName(templateKey: string): string {
  switch (templateKey) {
    case "welcome":
      return i18n.t("settings.prefs.email.templates.welcome", { defaultValue: "Welcome email" });
    case "milestone_achieved":
      return i18n.t("settings.prefs.email.templates.milestone", { defaultValue: "Milestone" });
    case "weekly_summary":
      return i18n.t("settings.prefs.email.templates.weeklySummary", { defaultValue: "Weekly summary" });
    case "tips_and_advice":
      return i18n.t("settings.prefs.email.templates.tips", { defaultValue: "Tips and advice" });
    default:
      return i18n.t("settings.prefs.email.templates.other", { defaultValue: "EatPal email" });
  }
}
