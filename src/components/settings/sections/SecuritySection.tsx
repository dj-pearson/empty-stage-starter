import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, EyeOff, Key, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { BindEmailFlow, type BindEmailFlowMode } from "@/components/auth/BindEmailFlow";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { SessionsCard } from "@/components/settings/SessionsCard";
import { useBindStatus } from "@/hooks/useBindStatus";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { PasswordSchema } from "@/lib/validations";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULES_PROPS } from "@/lib/passwordRules";
import { userFacingError } from "@/lib/networkFailure";
import "@/i18n/appLocale";

/** GoTrue's error code and HTTP status, when the error carries them. */
function authErrorFacts(error: unknown): { code?: string; status?: number } {
  if (typeof error !== "object" || error === null) return {};
  const { code, status } = error as { code?: unknown; status?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    status: typeof status === "number" ? status : undefined,
  };
}

type FieldErrors = Partial<Record<"current" | "next" | "confirm", string>>;

/**
 * Settings > Sign-in and security (settings pass B).
 *
 * One bind-email panel for Apple-relay and password-less Apple accounts (the
 * old page rendered it twice, once per tab), a Change Password form that
 * enforces the same PasswordSchema signup and reset do, and the recent
 * sign-ins card. Content only; the hub supplies the section and its h2.
 *
 * Deferred to the server pass: the current-password check below signs in
 * again to prove the password, which is a client-side stand-in for a recent-
 * auth requirement enforced by GoTrue.
 */
export function SecuritySection() {
  const { t } = useTranslation();
  const bindStatus = useBindStatus();
  const reducedMotion = useReducedMotion();

  // The panel stays up until the user presses Done: binding the email or
  // setting the password flips bindStatus, and hiding the panel on that flip
  // would skip the "All set" step.
  const [flowMode, setFlowMode] = useState<BindEmailFlowMode | null>(null);
  const needsFlow = bindStatus.isRelayEmail || bindStatus.needsPassword;
  const liveMode: BindEmailFlowMode = bindStatus.isRelayEmail
    ? bindStatus.hasPassword
      ? "email-only"
      : "full"
    : "password-only";
  useEffect(() => {
    if (!bindStatus.loading && needsFlow && flowMode === null) setFlowMode(liveMode);
  }, [bindStatus.loading, needsFlow, liveMode, flowMode]);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<string | null>(null);

  const email = bindStatus.user?.email ?? "";
  const showChangePassword = !bindStatus.loading && bindStatus.hasPassword;

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    const nextErrors: FieldErrors = {};
    if (!current) {
      nextErrors.current = t("settings.account.security.currentRequired", {
        defaultValue: "Enter your current password.",
      });
    }
    if (!PasswordSchema.safeParse(next).success) {
      nextErrors.next = t("settings.account.security.newWeak", {
        defaultValue: "Your new password doesn't meet every rule in the list yet.",
      });
    } else if (next === current) {
      nextErrors.next = t("settings.account.security.newSame", {
        defaultValue: "Choose a password different from your current one.",
      });
    }
    if (next !== confirm) {
      nextErrors.confirm = t("settings.account.security.mismatch", {
        defaultValue: "The two new passwords don't match.",
      });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (!email) {
      setResult(
        t("settings.account.security.noEmail", {
          defaultValue: "Your account has no email to check the password against. Contact support.",
        })
      );
      return;
    }

    setSaving(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (reauthError) {
        const { code, status } = authErrorFacts(reauthError);
        if (code === "invalid_credentials" || (code === undefined && status === 400)) {
          setErrors({
            current: t("settings.account.security.currentWrong", {
              defaultValue: "That isn't your current password.",
            }),
          });
          return;
        }
        throw reauthError;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        const { code } = authErrorFacts(error);
        if (code === "weak_password") {
          setErrors({
            next: t("settings.account.security.newRejected", {
              defaultValue: "That password was rejected as too easy to guess. Try a longer one.",
            }),
          });
          return;
        }
        if (code === "same_password") {
          setErrors({
            next: t("settings.account.security.newSame", {
              defaultValue: "Choose a password different from your current one.",
            }),
          });
          return;
        }
        throw error;
      }

      let message = t("settings.account.security.updated", { defaultValue: "Password updated." });
      if (signOutOthers) {
        const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
        message = othersError
          ? t("settings.account.security.updatedOthersFailed", {
              defaultValue:
                "Password updated, but we couldn't sign out your other devices. Use the button under Where you're signed in.",
            })
          : t("settings.account.security.updatedOthersOut", {
              defaultValue: "Password updated. Your other devices are signed out.",
            });
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setResult(message);
      toast.success(message);
    } catch (err) {
      setResult(
        userFacingError(
          err,
          t("settings.account.security.updateFailed", {
            defaultValue: "Couldn't change your password. Try again.",
          })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleLabel = show
    ? t("settings.account.security.hidePasswords", { defaultValue: "Hide passwords" })
    : t("settings.account.security.showPasswords", { defaultValue: "Show passwords" });

  return (
    <div className="space-y-6">
      {flowMode !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
              {flowMode === "password-only"
                ? t("settings.account.security.bindPasswordTitle", { defaultValue: "Set a password" })
                : t("settings.account.security.bindEmailTitle", { defaultValue: "Add your real email" })}
            </CardTitle>
            <CardDescription>
              {flowMode === "full"
                ? t("settings.account.security.bindFullBody", {
                    defaultValue:
                      "You're signed in with Apple's private relay address. Confirm a real email and set a password so you can sign in with either.",
                  })
                : flowMode === "email-only"
                  ? t("settings.account.security.bindEmailOnlyBody", {
                      defaultValue:
                        "You're signed in with Apple's private relay address. Confirm a real email so receipts and co-parent invites reach you.",
                    })
                  : t("settings.account.security.bindPasswordBody", {
                      defaultValue:
                        "You signed up with Apple. Add a password so you can also sign in with your email.",
                    })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BindEmailFlow
              mode={flowMode}
              onEmailBound={() => void bindStatus.refresh()}
              onComplete={async () => {
                await bindStatus.refresh();
                setFlowMode(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {showChangePassword && (
        <Card>
          <form onSubmit={onChangePassword} noValidate>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="h-5 w-5" aria-hidden="true" />
                {t("settings.account.security.changeTitle", { defaultValue: "Change password" })}
              </CardTitle>
              <CardDescription>
                {t("settings.account.security.changeDescription", {
                  defaultValue: "You'll stay signed in on this device.",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Lets password managers file the new password under the right account. */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={email}
                readOnly
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
              <div className="space-y-2">
                <Label htmlFor="currentPassword">
                  {t("settings.account.security.currentLabel", { defaultValue: "Current password" })}
                </Label>
                <Input
                  id="currentPassword"
                  name="current-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  aria-describedby="currentPassword-hint"
                  aria-invalid={errors.current ? true : undefined}
                  disabled={saving}
                  required
                />
                <p id="currentPassword-hint" className="text-xs text-muted-foreground">
                  {errors.current ? (
                    <span className="text-destructive">{errors.current}</span>
                  ) : (
                    t("settings.account.security.currentHint", {
                      defaultValue: "We check it before changing anything.",
                    })
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="newPassword">
                    {t("settings.account.security.newLabel", { defaultValue: "New password" })}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    aria-pressed={show}
                    aria-label={toggleLabel}
                    onClick={() => setShow((s) => !s)}
                  >
                    {show ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="ml-1 text-xs" aria-hidden="true">
                      {show
                        ? t("settings.account.security.hide", { defaultValue: "Hide" })
                        : t("settings.account.security.show", { defaultValue: "Show" })}
                    </span>
                  </Button>
                </div>
                <Input
                  id="newPassword"
                  name="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  {...PASSWORD_RULES_PROPS}
                  aria-describedby={errors.next ? "newPassword-error newPassword-rules" : "newPassword-rules"}
                  aria-invalid={errors.next ? true : undefined}
                  disabled={saving}
                  required
                />
                {errors.next && (
                  <p id="newPassword-error" className="text-xs text-destructive">
                    {errors.next}
                  </p>
                )}
                <PasswordRequirements id="newPassword-rules" value={next} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t("settings.account.security.confirmLabel", { defaultValue: "Confirm new password" })}
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirm-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={PASSWORD_MIN_LENGTH}
                  aria-describedby={errors.confirm ? "confirmPassword-error" : undefined}
                  aria-invalid={errors.confirm ? true : undefined}
                  disabled={saving}
                  required
                />
                {errors.confirm && (
                  <p id="confirmPassword-error" className="text-xs text-destructive">
                    {errors.confirm}
                  </p>
                )}
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="password-sign-out-others"
                  checked={signOutOthers}
                  onCheckedChange={(v) => setSignOutOthers(v === true)}
                  disabled={saving}
                />
                <Label htmlFor="password-sign-out-others" className="text-sm font-normal leading-snug">
                  {t("settings.account.security.signOutOthers", {
                    defaultValue: "Sign out my other devices",
                  })}
                </Label>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap items-center gap-3 border-t pt-6">
              <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
                {saving && (
                  <Loader2
                    className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
                    aria-hidden="true"
                  />
                )}
                {t("settings.account.security.submit", { defaultValue: "Update password" })}
              </Button>
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {result ?? ""}
              </p>
            </CardFooter>
          </form>
        </Card>
      )}

      {!bindStatus.loading && !bindStatus.hasPassword && flowMode === null && (
        <p className="text-sm text-muted-foreground">
          {t("settings.account.security.noPassword", {
            defaultValue: "You sign in without a password, so there is no password to change here.",
          })}
        </p>
      )}

      <SessionsCard />
    </div>
  );
}
