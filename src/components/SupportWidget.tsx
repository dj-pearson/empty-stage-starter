import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { HelpCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { userFacingError } from "@/lib/networkFailure";

const SUPPORT_CATEGORIES = ["question", "bug", "feature_request", "billing", "other"] as const;
const SUPPORT_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const SUBJECT_MAX = 120;
const DESCRIPTION_MAX = 5000;

/** What a ticket must look like before it is sent. */
const supportTicketSchema = z.object({
  subject: z.string().trim().min(3).max(SUBJECT_MAX),
  description: z.string().trim().min(10).max(DESCRIPTION_MAX),
  category: z.enum(SUPPORT_CATEGORIES),
  priority: z.enum(SUPPORT_PRIORITIES),
});

type SupportTicketForm = z.input<typeof supportTicketSchema>;
type FieldErrors = Partial<Record<keyof SupportTicketForm, string>>;

const EMPTY_FORM: SupportTicketForm = {
  subject: "",
  description: "",
  category: "question",
  priority: "medium",
};

interface SupportWidgetProps {
  /** Controlled open state. Omit both to let the widget own it, as before. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Skip the floating button. The dashboard shell opens this from its header
   * and its More sheet instead, because a second fixed button in the corner
   * sat on top of the quick-actions FAB.
   */
  hideTrigger?: boolean;
}

export function SupportWidget({ open: openProp, onOpenChange, hideTrigger = false }: SupportWidgetProps = {}) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const location = useLocation();
  const [openState, setOpenState] = useState(false);
  const isOpen = openProp ?? openState;
  const setIsOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<SupportTicketForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = supportTicketSchema.safeParse(formData);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof SupportTicketForm;
        if (next[field]) continue;
        if (field === "subject") {
          next.subject = t("support.errors.subject", {
            defaultValue: "Give your request a subject of 3 to {{max}} characters.",
            max: SUBJECT_MAX,
          });
        } else if (field === "description") {
          next.description = t("support.errors.description", {
            defaultValue: "Tell us a little more: 10 to {{max}} characters.",
            max: DESCRIPTION_MAX,
          });
        } else {
          next[field] = t("support.errors.choice", { defaultValue: "Pick one of the options." });
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});

    if (!userId) {
      toast.error(t("support.toast.signInTitle", { defaultValue: "Sign in to contact support" }), {
        description: t("support.toast.signInBody", {
          defaultValue: "We need to know which account this is about.",
        }),
      });
      return;
    }

    setLoading(true);
    try {
      // The path, not the full URL: a query string can carry an invite token
      // or a search, and neither belongs in a support ticket.
      const context = {
        // Same key older tickets used, so the admin view reads one shape.
        url: location.pathname,
        userAgent: navigator.userAgent,
        screenSize: `${window.screen.width}x${window.screen.height}`,
        timestamp: new Date().toISOString(),
      };

      const { error: ticketError } = await supabase.from("support_tickets").insert({
        user_id: userId,
        subject: parsed.data.subject,
        description: parsed.data.description,
        category: parsed.data.category,
        priority: parsed.data.priority,
        context,
      });

      if (ticketError) throw ticketError;

      toast(t("support.toast.sentTitle", { defaultValue: "Request sent" }), {
        description: t("support.promise", { defaultValue: "We usually reply within a day." }),
      });

      setFormData(EMPTY_FORM);
      setIsOpen(false);
    } catch (error: unknown) {
      toast.error(t("support.toast.failedTitle", { defaultValue: "Couldn't send your request" }), {
        description: userFacingError(
          error,
          t("support.toast.failedBody", { defaultValue: "Please try again in a moment." })
        ),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 motion-safe:hover:scale-110 motion-safe:transition-transform"
            aria-label={t("support.open", { defaultValue: "Help & support" })}
          >
            <HelpCircle className="h-6 w-6" aria-hidden="true" />
          </Button>
        </SheetTrigger>
      )}
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("support.title", { defaultValue: "Help & support" })}</SheetTitle>
          <SheetDescription>
            {t("support.description", {
              defaultValue: "Tell us what's going on. We usually reply within a day.",
            })}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6" noValidate>
          <div>
            <Label htmlFor="support-subject">{t("support.fields.subject", { defaultValue: "Subject" })}</Label>
            <Input
              id="support-subject"
              placeholder={t("support.fields.subjectPlaceholder", {
                defaultValue: "A short summary",
              })}
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              maxLength={SUBJECT_MAX}
              required
              aria-invalid={!!errors.subject}
              aria-describedby={errors.subject ? "support-subject-error" : undefined}
            />
            {errors.subject && (
              <p id="support-subject-error" className="text-xs text-destructive mt-1">
                {errors.subject}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="support-category">{t("support.fields.category", { defaultValue: "Category" })}</Label>
            <Select
              value={formData.category}
              onValueChange={(value: SupportTicketForm["category"]) =>
                setFormData({ ...formData, category: value })
              }
            >
              <SelectTrigger id="support-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="question">{t("support.category.question", { defaultValue: "Question" })}</SelectItem>
                <SelectItem value="bug">{t("support.category.bug", { defaultValue: "Something's broken" })}</SelectItem>
                <SelectItem value="feature_request">
                  {t("support.category.feature_request", { defaultValue: "Idea or request" })}
                </SelectItem>
                <SelectItem value="billing">{t("support.category.billing", { defaultValue: "Billing" })}</SelectItem>
                <SelectItem value="other">{t("support.category.other", { defaultValue: "Other" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="support-priority">{t("support.fields.priority", { defaultValue: "How urgent is it?" })}</Label>
            <Select
              value={formData.priority}
              onValueChange={(value: SupportTicketForm["priority"]) =>
                setFormData({ ...formData, priority: value })
              }
            >
              <SelectTrigger id="support-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("support.priority.low", { defaultValue: "It can wait" })}</SelectItem>
                <SelectItem value="medium">{t("support.priority.medium", { defaultValue: "Normal" })}</SelectItem>
                <SelectItem value="high">{t("support.priority.high", { defaultValue: "Important" })}</SelectItem>
                <SelectItem value="urgent">{t("support.priority.urgent", { defaultValue: "It's blocking me" })}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="support-description">
              {t("support.fields.description", { defaultValue: "What happened?" })}
            </Label>
            <Textarea
              id="support-description"
              placeholder={t("support.fields.descriptionPlaceholder", {
                defaultValue: "What you were doing, and what you expected to see",
              })}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={6}
              maxLength={DESCRIPTION_MAX}
              required
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? "support-description-error support-description-hint" : "support-description-hint"
              }
            />
            {errors.description && (
              <p id="support-description-error" className="text-xs text-destructive mt-1">
                {errors.description}
              </p>
            )}
            <p id="support-description-hint" className="text-xs text-muted-foreground mt-1">
              {t("support.fields.descriptionHint", {
                defaultValue: "For a bug, the steps that lead to it help most.",
              })}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              t("support.sending", { defaultValue: "Sending..." })
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("support.submit", { defaultValue: "Send request" })}
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2 border-t">
            {t("support.helpCenterLead", { defaultValue: "Looking for a quick answer?" })}{" "}
            <Link to="/faq" className="text-primary hover:underline" onClick={() => setIsOpen(false)}>
              {t("support.helpCenter", { defaultValue: "Browse the Help Center" })}
            </Link>
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
