import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useHousehold } from "@/hooks/useHousehold";
import { useSubscription } from "@/hooks/useSubscription";
import { useAccountExport } from "@/hooks/useAccountExport";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { memberDisplayName } from "@/components/household/householdMemberLabel";
import { exportSummaryText, joinList } from "@/components/settings/exportSummaryText";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import {
  confirmWordMatches,
  meaningfulDeleteFailures,
  needsStripeCancel,
  type DeleteAccountResponse,
} from "@/lib/accountDeletion";
import { scrubDeletedAccount } from "@/lib/signOutScrub";
import { logger } from "@/lib/logger";
import "@/i18n/appLocale";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = "idle" | "cancelling" | "deleting" | "incomplete" | "finishing";

const SUPPORT_EMAIL = "support@tryeatpal.com";

/**
 * Delete account, with the consequences said out loud (settings pass B).
 *
 * What changed from the AlertDialog on the old Security tab:
 *  - Controlled, and it cannot be closed while a delete is in flight; closing
 *    resets it, so reopening never shows a half-typed confirmation.
 *  - Confirmation is a typed word, not the account email. An Apple-relay user
 *    does not know their relay address and could not delete their account.
 *  - A co-parent is named. The server deletes every row this user created
 *    (child profiles, foods, recipes, plan entries) by user_id, and there is
 *    no transfer yet, so the other parent loses those too. The old dialog
 *    listed "Children's profiles" as if they were only yours.
 *  - Progress and errors stay in the dialog (aria-live) instead of a toast
 *    fired after AlertDialogAction had already closed it.
 *  - partialFailures from the edge function is read. A deletion that left
 *    data behind says so and gives the support address.
 *
 * Server-side household-aware deletion (transfer instead of cascade) and a
 * recent-auth requirement are deferred; this dialog is the honest client for
 * what the server does today.
 */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const reducedMotion = useReducedMotion();
  const { userId: authUserId } = useAuth();
  const household = useHousehold();
  const { subscription } = useSubscription();
  const exporter = useAccountExport();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showExportResult, setShowExportResult] = useState(false);
  const [deletedUid, setDeletedUid] = useState<string | null>(null);
  const confirmId = useId();
  const statusId = useId();

  const confirmWord = t("settings.account.delete.confirmWord", { defaultValue: "DELETE" });
  const busy = phase === "cancelling" || phase === "deleting" || phase === "finishing";
  const matches = confirmWordMatches(typed, confirmWord, locale);
  // The consequence panel depends on the roster; don't allow a delete before
  // the parent has had the chance to read it.
  const rosterPending = household.loading;

  const others = household.loading ? [] : household.members.filter((m) => !m.isSelf);
  const otherNames = joinList(
    others.map((m) => memberDisplayName(m, t)),
    locale
  );

  const billable = needsStripeCancel(
    subscription
      ? {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          isComplementary: subscription.is_complementary,
          stripeSubscriptionId: subscription.stripe_subscription_id,
        }
      : null
  );

  const reset = () => {
    setTyped("");
    setPhase("idle");
    setError(null);
    setShowExportResult(false);
  };

  /** The account is gone server-side: clear this device and leave. */
  const finish = async (uid: string | null) => {
    setPhase("finishing");
    if (uid) scrubDeletedAccount(uid);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      // The auth user no longer exists; a failed local sign-out still leaves
      // the redirect below to clear the in-memory session.
      logger.warn("Local sign-out after account deletion failed:", err);
    }
    window.location.replace("/?deleted=1");
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (busy) return;
    if (phase === "incomplete") {
      void finish(deletedUid);
      return;
    }
    reset();
    onOpenChange(false);
  };

  const onDelete = async () => {
    if (!matches || busy || rosterPending) return;
    setError(null);
    let uid = authUserId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
    }

    if (billable) {
      setPhase("cancelling");
      const { error: cancelError } = await invokeEdgeFunction("manage-subscription", {
        body: { action: "cancel" },
      });
      if (cancelError) {
        setPhase("idle");
        setError(
          t("settings.account.delete.cancelFailed", {
            defaultValue:
              "We couldn't cancel your subscription, so nothing was deleted. Cancel it under Plan and billing, or email {{email}}, then try again.",
            email: SUPPORT_EMAIL,
          })
        );
        return;
      }
    }

    setPhase("deleting");
    const { data, error: deleteError } = await invokeEdgeFunction<DeleteAccountResponse>(
      "delete-account",
      { body: {} }
    );
    if (deleteError) {
      setPhase("idle");
      setError(
        t("settings.account.delete.failed", {
          defaultValue:
            "Your account wasn't deleted. Try again, or email {{email}} and we'll do it for you.",
          email: SUPPORT_EMAIL,
        })
      );
      return;
    }

    const failures = meaningfulDeleteFailures(data);
    if (failures.length > 0) {
      logger.warn("Account deleted with partial failures:", failures);
      setDeletedUid(uid);
      setPhase("incomplete");
      return;
    }
    await finish(uid);
  };

  const statusText =
    phase === "cancelling"
      ? t("settings.account.delete.cancelling", { defaultValue: "Cancelling your subscription..." })
      : phase === "deleting"
        ? t("settings.account.delete.deleting", { defaultValue: "Deleting your account..." })
        : phase === "finishing"
          ? t("settings.account.delete.finishing", { defaultValue: "Signing you out..." })
          : "";

  const spinner = (
    <Loader2
      className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
      aria-hidden="true"
    />
  );

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        aria-busy={busy || undefined}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        className="max-h-[90vh] overflow-y-auto"
      >
        {phase === "incomplete" ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings.account.delete.incompleteTitle", {
                  defaultValue: "Account deleted, with something left over",
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.account.delete.incompleteBody", {
                  defaultValue:
                    "Your account is deleted and you can't sign in to it again, but some of its data may not have been removed. Email {{email}} and we'll finish the job.",
                  email: SUPPORT_EMAIL,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button type="button" onClick={() => void finish(deletedUid)}>
                {t("settings.account.delete.incompleteDone", { defaultValue: "OK, sign me out" })}
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("settings.account.delete.title", { defaultValue: "Delete your account?" })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("settings.account.delete.lead", {
                  defaultValue:
                    "This permanently removes your sign-in and everything you added. It can't be undone.",
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 text-sm">
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <p className="font-medium">
                  {t("settings.account.delete.removedTitle", { defaultValue: "What gets deleted" })}
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {t("settings.account.delete.removedCreated", {
                      defaultValue: "Child profiles, foods, recipes and meal plans you created",
                    })}
                  </li>
                  <li>
                    {t("settings.account.delete.removedHistory", {
                      defaultValue: "Grocery lists, food history and photos you uploaded",
                    })}
                  </li>
                  <li>
                    {t("settings.account.delete.removedAccount", {
                      defaultValue: "Your sign-in, settings and email preferences",
                    })}
                  </li>
                </ul>
              </div>

              {others.length > 0 && (
                <div className="space-y-1 rounded-lg border border-destructive/40 p-3" role="note">
                  <p className="font-medium text-destructive">
                    {t("settings.account.delete.householdTitle", {
                      defaultValue: "{{names}} will lose these too",
                      names: otherNames,
                    })}
                  </p>
                  <p>
                    {t("settings.account.delete.householdBody", {
                      defaultValue:
                        "You share {{household}} with {{names}}. Child profiles, foods, recipes and plan entries you created are removed for them as well, and they can't be transferred to another member yet. Anything they created stays.",
                      names: otherNames,
                      household:
                        household.householdName ||
                        t("settings.account.delete.yourHousehold", { defaultValue: "your household" }),
                    })}
                  </p>
                </div>
              )}

              {subscription && subscription.status !== "canceled" && (
                <p>
                  {billable
                    ? t("settings.account.delete.billingCancel", {
                        defaultValue:
                          "Your {{plan}} subscription is cancelled first, so you aren't charged again.",
                        plan: subscription.plan_name,
                      })
                    : subscription.is_complementary
                      ? t("settings.account.delete.billingComplimentary", {
                          defaultValue: "Your complimentary plan ends with the account. Nothing is billed.",
                        })
                      : t("settings.account.delete.billingNone", {
                          defaultValue: "Nothing more will be billed; your subscription is already set to end.",
                        })}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exporter.running || busy}
                  aria-busy={exporter.running || undefined}
                  onClick={async () => {
                    setShowExportResult(false);
                    await exporter.run();
                    setShowExportResult(true);
                  }}
                >
                  {exporter.running ? spinner : <Download className="h-4 w-4 mr-2" aria-hidden="true" />}
                  {exporter.running
                    ? t("settings.account.data.preparing", { defaultValue: "Preparing..." })
                    : t("settings.account.delete.downloadFirst", { defaultValue: "Download your data first" })}
                </Button>
                <p aria-live="polite" className="text-xs text-muted-foreground">
                  {showExportResult && !exporter.running
                    ? exportSummaryText(exporter.result, exporter.failed, t, locale)
                    : ""}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={confirmId}>
                  {t("settings.account.delete.typeToConfirm", {
                    defaultValue: "Type {{word}} to confirm",
                    word: confirmWord,
                  })}
                </Label>
                <Input
                  id={confirmId}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={busy}
                  aria-describedby={statusId}
                />
              </div>

              <p id={statusId} aria-live="polite" className="min-h-5 text-sm">
                {error ? <span className="text-destructive">{error}</span> : statusText}
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t("settings.account.delete.keep", { defaultValue: "Keep my account" })}
              </AlertDialogCancel>
              <Button
                id="delete-account-confirm"
                type="button"
                variant="destructive"
                onClick={() => void onDelete()}
                disabled={!matches || busy || rosterPending}
                aria-busy={busy || undefined}
              >
                {busy && spinner}
                {busy
                  ? t("settings.account.delete.deletingShort", { defaultValue: "Deleting..." })
                  : t("settings.account.delete.confirm", { defaultValue: "Delete my account" })}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
