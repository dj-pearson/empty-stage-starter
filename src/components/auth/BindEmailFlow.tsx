// Three-step flow for Apple-relay users:
//   1. enter real email      -> bind-email-request edge fn (sends 6-digit code)
//   2. enter the code        -> bind-email-verify edge fn (rewrites auth.users.email)
//   3. set a password        -> supabase.auth.updateUser({ password })
//
// Modes:
//   full           all three steps (relay address, no password)
//   password-only  step 3 alone (real email already, never set a password)
//   email-only     steps 1-2 alone (relay address, password already set)
//
// Settings pass B: the password rule is PasswordSchema (12+ with complexity),
// the same one signup and reset enforce; the step survives a re-render in
// sessionStorage; and onComplete fires when the user presses Done, so the
// "All set" screen is actually seen.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Mail, Lock, ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { userFacingError } from "@/lib/networkFailure";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULES_PROPS,
  isPasswordValid,
} from "@/lib/passwordRules";
import "@/i18n/appLocale";

type Step = "email" | "code" | "password" | "done";
export type BindEmailFlowMode = "full" | "password-only" | "email-only";

interface BindEmailFlowProps {
  initialEmail?: string;
  mode?: BindEmailFlowMode;
  /** Called when the user presses Done on the final step. */
  onComplete?: () => void;
  /** Called once a code is verified and the session carries the new email. */
  onEmailBound?: (email: string) => void;
  onCancel?: () => void;
}

const RESEND_SECONDS = 60;
/** Scrubbed on sign-out by signOutScrub.ts (SCRUBBED_SESSION_KEYS). */
const STEP_STORAGE_KEY = "bind-email-flow-step";

interface SavedStep {
  mode: BindEmailFlowMode;
  step: Step;
  email: string;
}

const STEPS: readonly Step[] = ["email", "code", "password", "done"];

function firstStep(mode: BindEmailFlowMode): Step {
  return mode === "password-only" ? "password" : "email";
}

function readSavedStep(mode: BindEmailFlowMode): SavedStep | null {
  try {
    const raw = sessionStorage.getItem(STEP_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { mode: m, step, email } = parsed as Record<string, unknown>;
    if (m !== mode || typeof step !== "string" || typeof email !== "string") return null;
    if (!(STEPS as readonly string[]).includes(step)) return null;
    // A saved password step in email-only mode would be a step this mode skips.
    if (mode === "email-only" && step === "password") return null;
    return { mode, step: step as Step, email };
  } catch {
    return null;
  }
}

function writeSavedStep(saved: SavedStep | null): void {
  try {
    if (saved === null) sessionStorage.removeItem(STEP_STORAGE_KEY);
    else sessionStorage.setItem(STEP_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    /* private mode: the flow still works, it just does not survive a reload */
  }
}

/** GoTrue's error code, when the error carries one. */
function authErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function BindEmailFlow({
  initialEmail = "",
  mode = "full",
  onComplete,
  onEmailBound,
  onCancel,
}: BindEmailFlowProps) {
  const { t } = useTranslation();
  const [saved] = useState(() => readSavedStep(mode));
  const [step, setStep] = useState<Step>(saved?.step ?? firstStep(mode));
  const [email, setEmail] = useState(saved?.email || initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [boundEmail, setBoundEmail] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  // LoadingButton's spinner ignores reduced motion and its prop is isLoading,
  // not the loading this file passed (so it never disabled): a plain Button.
  const spinner = loading ? (
    <Loader2
      className={reducedMotion ? "mr-2 h-4 w-4" : "mr-2 h-4 w-4 animate-spin"}
      aria-hidden="true"
    />
  ) : null;

  useEffect(() => {
    writeSavedStep({ mode, step, email });
  }, [mode, step, email]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const requestCode = async (targetEmail: string, isResend = false) => {
    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; expiresInSeconds: number }>(
      "bind-email-request",
      { body: { email: targetEmail } }
    );
    setLoading(false);

    if (error || !data?.ok) {
      toast.error(
        userFacingError(error, t("auth.bind.sendFailed", { defaultValue: "Could not send code" }))
      );
      return false;
    }
    setResendCooldown(RESEND_SECONDS);
    if (!isResend) setStep("code");
    toast.success(
      t("auth.bind.codeSent", { defaultValue: "Code sent to {{email}}", email: targetEmail })
    );
    return true;
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error(t("auth.bind.invalidEmail", { defaultValue: "Enter a valid email" }));
      return;
    }
    setEmail(trimmed);
    await requestCode(trimmed);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    await requestCode(email, true);
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      toast.error(t("auth.bind.codeIncomplete", { defaultValue: "Enter the 6-digit code" }));
      return;
    }
    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; email: string }>(
      "bind-email-verify",
      { body: { code } }
    );

    if (error || !data?.ok) {
      setLoading(false);
      toast.error(
        userFacingError(error, t("auth.bind.invalidCode", { defaultValue: "Invalid code" }))
      );
      setCode("");
      return;
    }
    // The server rewrote auth.users.email; the session in hand still carries
    // the relay address until it is refreshed, and so would every screen
    // reading it. A failed refresh is not fatal: the next token refresh
    // picks it up.
    try {
      await supabase.auth.refreshSession();
    } catch {
      /* see above */
    }
    setLoading(false);
    setBoundEmail(data.email);
    onEmailBound?.(data.email);
    toast.success(t("auth.bind.emailVerified", { defaultValue: "Email verified" }), {
      description: t("auth.bind.emailVerifiedDescription", {
        defaultValue: "{{email}} is now your account email.",
        email: data.email,
      }),
    });
    setStep(mode === "email-only" ? "done" : "password");
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      setPasswordError(
        t("auth.bind.passwordWeak", {
          defaultValue: "Your password doesn't meet every rule in the list yet.",
        })
      );
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError(t("auth.bind.passwordMismatch", { defaultValue: "Passwords do not match" }));
      return;
    }
    setPasswordError(null);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      const code = authErrorCode(error);
      const message =
        code === "weak_password"
          ? t("auth.bind.passwordRejectedWeak", {
              defaultValue: "That password was rejected as too easy to guess. Try a longer one.",
            })
          : code === "same_password"
            ? t("auth.bind.passwordSame", {
                defaultValue: "That is already your password. Choose a different one.",
              })
            : userFacingError(
                error,
                t("auth.bind.passwordFailed", {
                  defaultValue: "Could not set your password. Please try again.",
                })
              );
      setPasswordError(message);
      return;
    }
    toast.success(t("auth.bind.passwordSet", { defaultValue: "Password set" }), {
      description: t("auth.bind.passwordSetDescription", {
        defaultValue: "You can now sign in with email and password.",
      }),
    });
    setStep("done");
  };

  const handleDone = () => {
    writeSavedStep(null);
    onComplete?.();
  };

  if (step === "email") {
    return (
      <form onSubmit={handleSubmitEmail} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bind-email">
            {t("auth.bind.emailLabel", { defaultValue: "Real email address" })}
          </Label>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bind-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.bind.emailPlaceholder", { defaultValue: "you@example.com" })}
              className="pl-9"
              aria-describedby="bind-email-hint"
              required
            />
          </div>
          <p id="bind-email-hint" className="text-xs text-muted-foreground">
            {mode === "email-only"
              ? t("auth.bind.emailHintEmailOnly", {
                  defaultValue:
                    "We'll send a 6-digit code to confirm this address. Your password stays the same.",
                })
              : t("auth.bind.emailHint", {
                  defaultValue:
                    "We'll send a 6-digit code to confirm this address. After that you can set a password and sign in either with Apple or your email.",
                })}
          </p>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("auth.bind.cancel", { defaultValue: "Cancel" })}
            </Button>
          )}
          <Button type="submit" disabled={loading} className="flex-1" aria-busy={loading || undefined}>
            {spinner}
            {t("auth.bind.sendCode", { defaultValue: "Send verification code" })}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="bind-code">
            {t("auth.bind.codeLabel", { defaultValue: "Enter the 6-digit code we sent to" })}
          </Label>
          <p className="text-sm font-medium break-all">{email}</p>
        </div>
        <div className="flex justify-center py-2">
          <InputOTP
            id="bind-code"
            maxLength={6}
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            aria-label={t("auth.bind.codeAriaLabel", { defaultValue: "6-digit verification code" })}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <div className="flex items-center justify-between text-sm">
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => {
              setStep("email");
              setCode("");
            }}
          >
            <ArrowLeft className="h-3 w-3 mr-1" aria-hidden="true" />
            {t("auth.bind.useDifferentEmail", { defaultValue: "Use different email" })}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={resendCooldown > 0 || loading}
            onClick={handleResend}
          >
            {resendCooldown > 0
              ? t("auth.bind.resendIn", {
                  defaultValue: "Resend in {{seconds}}s",
                  seconds: resendCooldown,
                })
              : t("auth.bind.resend", { defaultValue: "Resend code" })}
          </Button>
        </div>
        <Button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full"
          aria-busy={loading || undefined}
        >
          {spinner}
          {t("auth.bind.verifyCode", { defaultValue: "Verify code" })}
        </Button>
      </form>
    );
  }

  if (step === "password") {
    return (
      <form onSubmit={handleSetPassword} className="space-y-4" noValidate>
        {boundEmail && (
          <Alert>
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            <AlertTitle>
              {t("auth.bind.emailConfirmed", { defaultValue: "Email confirmed" })}
            </AlertTitle>
            <AlertDescription className="break-all">{boundEmail}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="bind-password">
            {t("auth.bind.passwordLabel", { defaultValue: "Set a password" })}
          </Label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="bind-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(null);
              }}
              className="pl-9"
              minLength={PASSWORD_MIN_LENGTH}
              {...PASSWORD_RULES_PROPS}
              aria-describedby="bind-password-rules"
              aria-invalid={passwordError !== null || undefined}
              required
            />
          </div>
          <PasswordRequirements id="bind-password-rules" value={password} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bind-password-confirm">
            {t("auth.bind.confirmLabel", { defaultValue: "Confirm password" })}
          </Label>
          <Input
            id="bind-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordError(null);
            }}
            minLength={PASSWORD_MIN_LENGTH}
            required
          />
        </div>
        <p role="alert" className="text-sm text-destructive empty:hidden">
          {passwordError ?? ""}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("auth.bind.bothWork", {
            defaultValue:
              "Once set, you can sign in with email and password or keep using Apple. Both will work.",
          })}
        </p>
        <Button type="submit" disabled={loading} className="w-full" aria-busy={loading || undefined}>
          {spinner}
          {t("auth.bind.setPassword", { defaultValue: "Set password" })}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-3 text-center py-4">
      <ShieldCheck className="h-10 w-10 text-success mx-auto" aria-hidden="true" />
      <h3 className="font-semibold">{t("auth.bind.allSet", { defaultValue: "All set" })}</h3>
      <p className="text-sm text-muted-foreground">
        {mode === "email-only"
          ? t("auth.bind.allSetEmailOnly", {
              defaultValue:
                "Your account email is updated. Sign in with Apple or with this email and your password.",
            })
          : t("auth.bind.allSetBody", {
              defaultValue:
                "Your account email and password are set. Sign in with Apple or with email and password.",
            })}
      </p>
      <Button type="button" onClick={handleDone}>
        {t("auth.bind.done", { defaultValue: "Done" })}
      </Button>
    </div>
  );
}
