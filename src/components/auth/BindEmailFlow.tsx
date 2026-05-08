// Three-step flow for Apple-relay users:
//   1. enter real email      -> bind-email-request edge fn (sends 6-digit code)
//   2. enter the code        -> bind-email-verify edge fn (rewrites auth.users.email)
//   3. set a password        -> supabase.auth.updateUser({ password })
//
// In `password-only` mode we skip directly to step 3 (Apple users whose
// email was already real but who never set a password).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { Mail, Lock, ArrowLeft, ShieldCheck } from "lucide-react";

type Step = "email" | "code" | "password" | "done";

interface BindEmailFlowProps {
  initialEmail?: string;
  mode?: "full" | "password-only";
  onComplete?: () => void;
  onCancel?: () => void;
}

const RESEND_SECONDS = 60;

export function BindEmailFlow({ initialEmail = "", mode = "full", onComplete, onCancel }: BindEmailFlowProps) {
  const [step, setStep] = useState<Step>(mode === "password-only" ? "password" : "email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [boundEmail, setBoundEmail] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const requestCode = async (targetEmail: string, isResend = false) => {
    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; expiresInSeconds: number }>(
      "bind-email-request",
      { body: { email: targetEmail } }
    );
    setLoading(false);

    if (error || !data?.ok) {
      toast.error(error?.message ?? "Could not send code");
      return false;
    }
    setResendCooldown(RESEND_SECONDS);
    if (!isResend) setStep("code");
    toast.success(`Code sent to ${targetEmail}`);
    return true;
  };

  const handleSubmitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Enter a valid email");
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
      toast.error("Enter the 6-digit code");
      return;
    }
    setLoading(true);
    const { data, error } = await invokeEdgeFunction<{ ok: boolean; email: string }>(
      "bind-email-verify",
      { body: { code } }
    );
    setLoading(false);

    if (error || !data?.ok) {
      toast.error(error?.message ?? "Invalid code");
      setCode("");
      return;
    }
    setBoundEmail(data.email);
    toast.success("Email verified", { description: `${data.email} is now your account email.` });
    setStep("password");
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password set", { description: "You can now sign in with email and password." });
    setStep("done");
    onComplete?.();
  };

  if (step === "email") {
    return (
      <form onSubmit={handleSubmitEmail} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="bind-email">Real email address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="bind-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="pl-9"
              required
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            We'll send a 6-digit code to confirm this address. After that you can set a password and sign in either with Apple or your email.
          </p>
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <LoadingButton type="submit" loading={loading} className="flex-1">
            Send verification code
          </LoadingButton>
        </div>
      </form>
    );
  }

  if (step === "code") {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div className="space-y-2">
          <Label>Enter the 6-digit code we sent to</Label>
          <p className="text-sm font-medium">{email}</p>
        </div>
        <div className="flex justify-center py-2">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
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
            onClick={() => { setStep("email"); setCode(""); }}
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> Use different email
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            disabled={resendCooldown > 0 || loading}
            onClick={handleResend}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
          </Button>
        </div>
        <LoadingButton type="submit" loading={loading} disabled={code.length !== 6} className="w-full">
          Verify code
        </LoadingButton>
      </form>
    );
  }

  if (step === "password") {
    return (
      <form onSubmit={handleSetPassword} className="space-y-4">
        {boundEmail && (
          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md text-sm">
            <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">Email confirmed</p>
              <p className="text-green-700 dark:text-green-300">{boundEmail}</p>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="bind-password">Set a password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="bind-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="pl-9"
              minLength={8}
              required
              autoFocus
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bind-password-confirm">Confirm password</Label>
          <Input
            id="bind-password-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat password"
            minLength={8}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Once set, you can sign in with email + password or continue using Apple — both will work.
        </p>
        <LoadingButton type="submit" loading={loading} className="w-full">
          Set password
        </LoadingButton>
      </form>
    );
  }

  return (
    <div className="space-y-3 text-center py-4">
      <ShieldCheck className="h-10 w-10 text-green-600 mx-auto" />
      <h3 className="font-semibold">All set</h3>
      <p className="text-sm text-muted-foreground">
        Your account email and password are now bound. Sign in with Apple or email/password.
      </p>
    </div>
  );
}
