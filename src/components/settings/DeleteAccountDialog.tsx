import { useEffect, useId, useState } from "react";
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
import { useBindStatus } from "@/hooks/useBindStatus";
import { useSubscription } from "@/hooks/useSubscription";
import { useAccountExport } from "@/hooks/useAccountExport";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { memberDisplayName, roleKey } from "@/components/household/householdMemberLabel";
import { exportSummaryText, joinList } from "@/components/settings/exportSummaryText";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import {
  confirmWordMatches,
  DELETE_ACCOUNT_CLIENT_HEADERS,
  deleteRefusalKind,
  meaningfulDeleteFailures,
  needsStripeCancel,
  successorLabel,
  type DeleteAccountPreflight,
  type DeleteAccountPreflightResponse,
  type DeleteAccountResponse,
  type PreflightHousehold,
} from "@/lib/accountDeletion";
import { scrubDeletedAccount } from "@/lib/signOutScrub";
import { logger } from "@/lib/logger";
import "@/i18n/appLocale";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = "idle" | "reauth" | "verifying" | "deleting" | "incomplete" | "finishing";

type PreflightState =
  | { status: "loading" }
  | { status: "ready"; data: DeleteAccountPreflight }
  | { status: "error" };

const SUPPORT_EMAIL = "support@tryeatpal.com";

/** GoTrue's error code and HTTP status, when the error carries them. */
function authErrorFacts(error: unknown): { code?: string; status?: number } {
  if (typeof error !== "object" || error === null) return {};
  const { code, status } = error as { code?: unknown; status?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    status: typeof status === "number" ? status : undefined,
  };
}

/**
 * Delete account, with the consequences said out loud.
 *
 *  - Controlled, and it cannot be closed while a delete is in flight; closing
 *    resets it, so reopening never shows a half-typed confirmation.
 *  - Confirmation is a typed word, not the account email. An Apple-relay user
 *    does not know their relay address and could not delete their account.
 *  - What happens to the family is asked of the server, not guessed. On open
 *    the dialog calls delete-account with { mode: 'preflight' }, which dry-runs
 *    the household hand-over (owner decision 1a): in a shared household what
 *    this parent added moves to the longest-standing remaining member, so the
 *    panel says "Mia and Leo stay with Sam"; a sole member is told everything
 *    goes.
 *  - A web delete needs a sign-in from the last ten minutes, so the last step
 *    signs in again: the password for a password account, an emailed code
 *    otherwise (Apple and Google accounts).
 *  - The server cancels a live Stripe subscription itself, before it deletes.
 *    The dialog no longer calls manage-subscription.
 *  - partialFailures from the edge function is read. A deletion that left
 *    data behind says so and gives the support address.
 */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const reducedMotion = useReducedMotion();
  const { userId: authUserId } = useAuth();
  const household = useHousehold();
  const bindStatus = useBindStatus();
  const { subscription } = useSubscription();
  const exporter = useAccountExport();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showExportResult, setShowExportResult] = useState(false);
  const [deletedUid, setDeletedUid] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const confirmId = useId();
  const statusId = useId();
  const passwordId = useId();
  const codeId = useId();

  const confirmWord = t("settings.account.delete.confirmWord", { defaultValue: "DELETE" });
  const busy = phase === "verifying" || phase === "deleting" || phase === "finishing";
  const matches = confirmWordMatches(typed, confirmWord, locale);
  // The consequence panel depends on the preflight and the roster; don't
  // allow a delete before the parent has had the chance to read it.
  const consequencesPending = preflight.status === "loading" || household.loading;
  const email = bindStatus.user?.email ?? "";
  const usesPassword = bindStatus.hasPassword;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreflight({ status: "loading" });
    void (async () => {
      const { data, error: preflightError } = await invokeEdgeFunction<DeleteAccountPreflightResponse>(
        "delete-account",
        { body: { mode: "preflight" }, headers: { ...DELETE_ACCOUNT_CLIENT_HEADERS } }
      );
      if (cancelled) return;
      if (preflightError || !data?.preflight) {
        logger.warn("Delete-account preflight failed:", preflightError);
        setPreflight({ status: "error" });
        return;
      }
      setPreflight({ status: "ready", data: data.preflight });
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  /** Who a household is left with, named the way the roster names them. */
  const successorName = (h: PreflightHousehold): string => {
    const named = successorLabel(h, (userId) => {
      const member = household.members.find((m) => m.user_id === userId);
      return member ? memberDisplayName(member, t) : null;
    });
    if (named) return named;
    switch (roleKey(h.successorRole ?? "")) {
      case "parent":
        return t("settings.account.deleteFlow.fallbackName.parent");
      case "guardian":
        return t("settings.account.deleteFlow.fallbackName.guardian");
      default:
        return t("settings.account.deleteFlow.fallbackName.other");
    }
  };

  const shared = preflight.status === "ready" ? preflight.data.households : [];
  const soleMember = preflight.status === "ready" && preflight.data.soleMember;

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
    setPassword("");
    setCode("");
    setCodeSent(false);
    setSendingCode(false);
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

  /** Step one is the typed word; step two, signing in again, follows. */
  const onDelete = () => {
    if (!matches || busy || consequencesPending) return;
    setError(null);
    setPhase("reauth");
  };

  const sendCode = async () => {
    if (!email || sendingCode) return;
    setSendingCode(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setSendingCode(false);
    if (otpError) {
      setError(t("settings.account.deleteFlow.codeSendFailed"));
      return;
    }
    setCodeSent(true);
  };

  const runDelete = async () => {
    let uid = authUserId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
    }

    setPhase("deleting");
    const { data, error: deleteError } = await invokeEdgeFunction<DeleteAccountResponse>(
      "delete-account",
      { body: {}, headers: { ...DELETE_ACCOUNT_CLIENT_HEADERS } }
    );
    if (deleteError) {
      const kind = deleteRefusalKind(deleteError);
      if (kind === "reauth") {
        setPhase("reauth");
        setPassword("");
        setCode("");
        setCodeSent(false);
        setError(t("settings.account.deleteFlow.reauthExpired"));
        return;
      }
      setPhase("idle");
      setError(
        kind === "stripe"
          ? t("settings.account.deleteFlow.stripeFailed", { email: SUPPORT_EMAIL })
          : kind === "transfer"
            ? t("settings.account.deleteFlow.transferFailed", { email: SUPPORT_EMAIL })
            : t("settings.account.delete.failed", {
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

  /** Sign in again, then delete. */
  const onReauthAndDelete = async () => {
    if (busy || !email) return;
    setError(null);
    setPhase("verifying");
    if (usesPassword) {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password });
      if (reauthError) {
        const { code: errCode, status } = authErrorFacts(reauthError);
        setPhase("reauth");
        setError(
          errCode === "invalid_credentials" || (errCode === undefined && status === 400)
            ? t("settings.account.deleteFlow.passwordWrong")
            : t("settings.account.delete.failed", {
                defaultValue:
                  "Your account wasn't deleted. Try again, or email {{email}} and we'll do it for you.",
                email: SUPPORT_EMAIL,
              })
        );
        return;
      }
    } else {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "email",
      });
      if (verifyError) {
        setPhase("reauth");
        setError(t("settings.account.deleteFlow.codeWrong"));
        return;
      }
    }
    await runDelete();
  };

  const statusText =
    phase === "verifying"
      ? t("settings.account.deleteFlow.verifying")
      : phase === "deleting"
        ? t("settings.account.delete.deleting", { defaultValue: "Deleting your account..." })
        : phase === "finishing"
          ? t("settings.account.delete.finishing", { defaultValue: "Signing you out..." })
          : preflight.status === "loading"
            ? t("settings.account.deleteFlow.checking")
            : "";

  const spinner = (
    <Loader2
      className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
      aria-hidden="true"
    />
  );

  const inReauth = phase === "reauth" || phase === "verifying" || phase === "deleting" || phase === "finishing";
  const reauthReady =
    email.length > 0 && (usesPassword ? password.length > 0 : codeSent && code.trim().length >= 6);

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
        ) : inReauth ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("settings.account.deleteFlow.reauthTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("settings.account.deleteFlow.reauthBody")}</AlertDialogDescription>
            </AlertDialogHeader>

            <form
              className="space-y-4 text-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (reauthReady) void onReauthAndDelete();
              }}
            >
              {!email ? (
                <p>{t("settings.account.deleteFlow.noEmail", { email: SUPPORT_EMAIL })}</p>
              ) : usesPassword ? (
                <div className="space-y-2">
                  <Label htmlFor={passwordId}>
                    {t("settings.account.deleteFlow.passwordLabel", { email })}
                  </Label>
                  <Input
                    id={passwordId}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={busy}
                    aria-describedby={statusId}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={sendingCode || busy}
                      aria-busy={sendingCode || undefined}
                      onClick={() => void sendCode()}
                    >
                      {sendingCode && spinner}
                      {sendingCode
                        ? t("settings.account.deleteFlow.sendingCode")
                        : codeSent
                          ? t("settings.account.deleteFlow.resendCode")
                          : t("settings.account.deleteFlow.sendCode")}
                    </Button>
                    {codeSent && (
                      <p className="text-muted-foreground">
                        {t("settings.account.deleteFlow.codeSent", { email })}
                      </p>
                    )}
                  </div>
                  {codeSent && (
                    <>
                      <Label htmlFor={codeId}>{t("settings.account.deleteFlow.codeLabel")}</Label>
                      <Input
                        id={codeId}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        disabled={busy}
                        aria-describedby={statusId}
                      />
                    </>
                  )}
                </div>
              )}

              <p id={statusId} aria-live="polite" className="min-h-5 text-sm">
                {error ? <span className="text-destructive">{error}</span> : statusText}
              </p>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>
                  {t("settings.account.delete.keep", { defaultValue: "Keep my account" })}
                </AlertDialogCancel>
                <Button
                  id="delete-account-confirm"
                  type="submit"
                  variant="destructive"
                  disabled={!reauthReady || busy}
                  aria-busy={busy || undefined}
                >
                  {busy && spinner}
                  {busy
                    ? t("settings.account.delete.deletingShort", { defaultValue: "Deleting..." })
                    : t("settings.account.deleteFlow.confirmDelete")}
                </Button>
              </AlertDialogFooter>
            </form>
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
              {shared.map((h) => {
                const name = successorName(h);
                return (
                  <div key={h.householdId} className="space-y-1 rounded-lg bg-muted p-3" role="note">
                    <p className="font-medium">
                      {h.kidNames.length > 0
                        ? t("settings.account.deleteFlow.staysTitle", {
                            kids: joinList(h.kidNames, locale),
                            name,
                          })
                        : t("settings.account.deleteFlow.staysTitleNoKids", { name })}
                    </p>
                    <p>
                      {t("settings.account.deleteFlow.staysBody", {
                        name,
                        household:
                          h.householdName ||
                          t("settings.account.delete.yourHousehold", { defaultValue: "your household" }),
                      })}
                    </p>
                  </div>
                );
              })}

              {soleMember && (
                <div className="space-y-1 rounded-lg border border-destructive/40 p-3" role="note">
                  <p className="font-medium text-destructive">{t("settings.account.deleteFlow.soleTitle")}</p>
                  <p>{t("settings.account.deleteFlow.soleBody")}</p>
                </div>
              )}

              {preflight.status === "error" && <p role="note">{t("settings.account.deleteFlow.checkFailed")}</p>}

              <div className="space-y-2 rounded-lg bg-muted p-3">
                <p className="font-medium">
                  {t("settings.account.delete.removedTitle", { defaultValue: "What gets deleted" })}
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {shared.length > 0 ? (
                    <li>{t("settings.account.deleteFlow.removedPersonal")}</li>
                  ) : (
                    <li>
                      {t("settings.account.delete.removedCreated", {
                        defaultValue: "Child profiles, foods, recipes and meal plans you created",
                      })}
                    </li>
                  )}
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

              {subscription && subscription.status !== "canceled" && (
                <p>
                  {billable
                    ? t("settings.account.deleteFlow.billingCancel", { plan: subscription.plan_name })
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
                onClick={onDelete}
                disabled={!matches || busy || consequencesPending}
              >
                {t("settings.account.delete.confirm", { defaultValue: "Delete my account" })}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
