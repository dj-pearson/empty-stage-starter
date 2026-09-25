import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  HelpCircle,
  History,
  Mail,
  MailX,
  MinusCircle,
  RotateCw,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  DEFAULT_EMAIL_SUBSCRIPTIONS,
  formatEmailStatus,
  formatTemplateName,
  getEmailHistory,
  getEmailSubscriptions,
  updateEmailSubscriptions,
  type EmailLog,
  type EmailStatusIcon,
  type EmailSubscriptions,
} from "@/lib/email";
import "@/i18n/appLocale";

const STATUS_ICONS: Record<EmailStatusIcon, LucideIcon> = {
  CheckCircle2,
  Clock,
  AlertCircle,
  MinusCircle,
  HelpCircle,
};

interface CategoryRow {
  key: keyof EmailSubscriptions;
  labelKey: string;
  label: string;
  helpKey: string;
  help: string;
}

const CATEGORIES: ReadonlyArray<CategoryRow> = [
  {
    key: "weekly_summary",
    labelKey: "settings.prefs.email.categories.weekly.label",
    label: "Weekly summary",
    helpKey: "settings.prefs.email.categories.weekly.help",
    help: "A short recap of what your kids tried and ate this week.",
  },
  {
    key: "milestone_emails",
    labelKey: "settings.prefs.email.categories.milestone.label",
    label: "Milestones",
    helpKey: "settings.prefs.email.categories.milestone.help",
    help: "When a child reaches a new food or a tasting streak.",
  },
  {
    key: "tips_and_advice",
    labelKey: "settings.prefs.email.categories.tips.label",
    label: "Tips for picky eating",
    helpKey: "settings.prefs.email.categories.tips.help",
    help: "Practical ideas from feeding specialists, about once a week.",
  },
  {
    key: "welcome_emails",
    labelKey: "settings.prefs.email.categories.welcome.label",
    label: "Getting started",
    helpKey: "settings.prefs.email.categories.welcome.help",
    help: "A few setup emails in your first weeks.",
  },
  {
    key: "marketing_emails",
    labelKey: "settings.prefs.email.categories.marketing.label",
    label: "Product news",
    helpKey: "settings.prefs.email.categories.marketing.help",
    help: "New features and offers. Off unless you turn it on.",
  },
];

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; prefs: EmailSubscriptions; unsubscribedAt: string | null };

/**
 * Settings > Notifications: which emails this account receives, and the
 * last few that were sent. Saved per account (automation_email_subscriptions).
 */
export function EmailPreferences() {
  const { t, i18n } = useTranslation();
  const uid = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [history, setHistory] = useState<EmailLog[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState<ReadonlySet<keyof EmailSubscriptions>>(new Set());
  const [restoring, setRestoring] = useState(false);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }),
    [i18n.language]
  );
  const dateTimeFormat = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }),
    [i18n.language]
  );

  const loadData = useCallback(async () => {
    setState({ status: "loading" });
    let next: LoadState = { status: "error" };
    try {
      const [prefsResult, historyData] = await Promise.all([getEmailSubscriptions(), getEmailHistory(10)]);
      if (prefsResult.status !== "error") {
        next = { status: "ready", prefs: prefsResult.prefs, unsubscribedAt: prefsResult.unsubscribedAt };
      }
      setHistory(historyData);
    } finally {
      setState(next);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const markSaving = (key: keyof EmailSubscriptions, on: boolean) =>
    setSaving((prev) => {
      const out = new Set(prev);
      if (on) out.add(key);
      else out.delete(key);
      return out;
    });

  const handleUpdatePreference = async (key: keyof EmailSubscriptions, value: boolean) => {
    // Optimistic, per key: a slow save on one switch cannot undo another.
    setState((prev) =>
      prev.status === "ready"
        ? {
            ...prev,
            prefs: { ...prev.prefs, [key]: value },
            unsubscribedAt: value ? null : prev.unsubscribedAt,
          }
        : prev
    );
    markSaving(key, true);
    const ok = await updateEmailSubscriptions({ [key]: value });
    markSaving(key, false);
    if (!ok) {
      setState((prev) =>
        prev.status === "ready" ? { ...prev, prefs: { ...prev.prefs, [key]: !value } } : prev
      );
    }
  };

  const turnEmailBackOn = async () => {
    if (state.status !== "ready") return;
    const previous = state;
    const restored: Partial<EmailSubscriptions> = {
      welcome_emails: DEFAULT_EMAIL_SUBSCRIPTIONS.welcome_emails,
      milestone_emails: DEFAULT_EMAIL_SUBSCRIPTIONS.milestone_emails,
      weekly_summary: DEFAULT_EMAIL_SUBSCRIPTIONS.weekly_summary,
      tips_and_advice: DEFAULT_EMAIL_SUBSCRIPTIONS.tips_and_advice,
    };
    setRestoring(true);
    setState((prev) =>
      prev.status === "ready" ? { ...prev, prefs: { ...prev.prefs, ...restored }, unsubscribedAt: null } : prev
    );
    const ok = await updateEmailSubscriptions(restored);
    setRestoring(false);
    if (!ok) setState(previous);
  };

  if (state.status === "loading") {
    return (
      <Card className="p-6" id="email-preferences" aria-busy="true">
        <span className="sr-only" role="status">
          {t("settings.prefs.email.loading", { defaultValue: "Loading email preferences" })}
        </span>
        <div className="space-y-4">
          <Skeleton className="h-6 w-48" />
          {CATEGORIES.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card className="p-6" id="email-preferences">
        <div role="alert" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("settings.prefs.email.loadFailed", {
              defaultValue: "Couldn't load your email preferences.",
            })}
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => void loadData()}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("settings.prefs.email.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      </Card>
    );
  }

  const { prefs, unsubscribedAt } = state;
  const unsubscribedDate = unsubscribedAt ? new Date(unsubscribedAt) : null;
  const historyId = `${uid}-history`;

  return (
    <div className="space-y-6">
      <Card className="p-6" id="email-preferences">
        <div className="mb-4 flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold">
              {t("settings.prefs.email.title", { defaultValue: "Email" })}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.prefs.email.description", {
                defaultValue: "Choose which emails EatPal sends you. Password and sign-in emails always arrive.",
              })}
            </p>
          </div>
        </div>

        {unsubscribedDate && !Number.isNaN(unsubscribedDate.getTime()) && (
          <Alert className="mb-4">
            <MailX className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>
              {t("settings.prefs.email.unsubscribed.title", {
                defaultValue: "You unsubscribed from all EatPal email on {{date}}",
                date: dateFormat.format(unsubscribedDate),
              })}
            </AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                {t("settings.prefs.email.unsubscribed.body", {
                  defaultValue: "Turning any email on below also undoes that.",
                })}
              </p>
              <Button className="min-h-11" onClick={() => void turnEmailBackOn()} disabled={restoring}>
                {t("settings.prefs.email.unsubscribed.action", { defaultValue: "Turn email back on" })}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <ul className="divide-y">
          {CATEGORIES.map((c) => {
            const switchId = `${uid}-${c.key}`;
            const helpId = `${switchId}-help`;
            return (
              <li key={c.key} className="flex items-start justify-between gap-4 py-3">
                <div className="flex-1">
                  <Label htmlFor={switchId} className="text-base font-medium">
                    {t(c.labelKey, { defaultValue: c.label })}
                  </Label>
                  <p id={helpId} className="mt-1 text-sm text-muted-foreground">
                    {t(c.helpKey, { defaultValue: c.help })}
                  </p>
                </div>
                <Switch
                  id={switchId}
                  checked={prefs[c.key]}
                  disabled={saving.has(c.key)}
                  aria-describedby={helpId}
                  onCheckedChange={(checked) => void handleUpdatePreference(c.key, checked)}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-6">
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between px-2"
              aria-expanded={historyOpen}
              aria-controls={historyId}
            >
              <span className="flex items-center gap-2 text-lg font-semibold">
                <History className="h-5 w-5" aria-hidden="true" />
                {t("settings.prefs.email.history.title", { defaultValue: "Recent emails" })}
              </span>
              <ChevronDown
                className={cn("h-4 w-4 motion-safe:transition-transform", historyOpen && "rotate-180")}
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent id={historyId}>
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("settings.prefs.email.history.empty", { defaultValue: "No emails sent yet." })}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {history.map((email) => {
                  const status = formatEmailStatus(email.status);
                  const Icon = STATUS_ICONS[status.icon];
                  const when = new Date(email.sent_at ?? email.created_at);
                  const whenText = Number.isNaN(when.getTime()) ? "" : dateTimeFormat.format(when);
                  return (
                    <li key={email.id} className="rounded-lg border p-4">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={status.variant} className="gap-1">
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {t(status.labelKey, { defaultValue: status.defaultLabel })}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {formatTemplateName(email.template_key)}
                        </span>
                      </div>
                      <p className="mb-1 text-sm font-medium">{email.subject}</p>
                      {whenText && (
                        <p className="text-sm text-muted-foreground">
                          {email.sent_at
                            ? t("settings.prefs.email.history.sentAt", { defaultValue: "Sent {{when}}", when: whenText })
                            : t("settings.prefs.email.history.queuedAt", {
                                defaultValue: "Queued {{when}}",
                                when: whenText,
                              })}
                        </p>
                      )}
                      {email.error_message && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t("settings.prefs.email.history.notDelivered", {
                            defaultValue: "Couldn't deliver. We'll retry.",
                          })}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="bg-muted/50 p-6">
        <h4 className="mb-2 font-medium">
          {t("settings.prefs.email.about.title", { defaultValue: "About EatPal email" })}
        </h4>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("settings.prefs.email.about.anyTime", { defaultValue: "Change any of these at any time." })}</li>
          <li>
            {t("settings.prefs.email.about.neverShared", {
              defaultValue: "We never share your email address with anyone else.",
            })}
          </li>
          <li>
            {t("settings.prefs.email.about.transactional", {
              defaultValue: "Password resets and sign-in codes always arrive.",
            })}
          </li>
          <li>
            {t("settings.prefs.email.about.footer", {
              defaultValue: "Unsubscribe in any email footer stops them all. You can turn them back on here.",
            })}
          </li>
        </ul>
      </Card>
    </div>
  );
}
