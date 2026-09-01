import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { PasswordSchema } from "@/lib/validations";
import { getErrorMessage } from "@/lib/api-errors";

const CODE_LENGTH = 6;

export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Two stages: verify the emailed code, then set the new password. The second
  // stage is only reachable once verifyOtp has returned a recovery session --
  // updateUser() silently targets whoever is signed in, so gating on our own
  // flag rather than on an ambient session is what keeps this honest.
  const [stage, setStage] = useState<"verify" | "password">("verify");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Reuse the shared PasswordSchema so reset enforces the same policy as signup
  // (previously reset allowed a weaker 8-char password with no special char).
  const passwordRequirements = [
    { label: "At least 12 characters", valid: password.length >= 12 },
    { label: "Contains uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "Contains lowercase letter", valid: /[a-z]/.test(password) },
    { label: "Contains number", valid: /[0-9]/.test(password) },
    { label: "Contains special character", valid: /[^A-Za-z0-9]/.test(password) },
  ];

  const isPasswordValid = PasswordSchema.safeParse(password).success;
  const doPasswordsMatch = password === confirmPassword && password.length > 0;
  const canVerify = email.trim().length > 0 && code.length === CODE_LENGTH;

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canVerify) return;

    setVerifying(true);

    try {
      // A recovery OTP exchange returns a real session, which is what the
      // subsequent updateUser() call authenticates against.
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: "recovery",
      });

      if (error) throw error;

      setStage("password");
    } catch (error: unknown) {
      setCode("");
      toast.error(t("resetPassword.codeInvalid"), {
        description: getErrorMessage(error),
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (!email.trim()) {
      toast.error(t("resetPassword.emailRequired"));
      return;
    }

    setResending(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
      );
      if (error) throw error;
      // Deliberately not confirming whether the address has an account.
      toast.success(t("resetPassword.codeResent"));
    } catch (error: unknown) {
      toast.error(t("resetPassword.resendFailed"), {
        description: getErrorMessage(error),
      });
    } finally {
      setResending(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isPasswordValid) {
      toast.error("Password doesn't meet requirements");
      return;
    }

    if (!doPasswordsMatch) {
      toast.error("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setSuccess(true);
      toast.success("Password reset successfully!");

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error: unknown) {
      toast.error("Failed to reset password", {
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Password Reset Successfully!</h3>
                <p className="text-muted-foreground">
                  Redirecting you to the dashboard...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
    <Helmet>
      <title>Reset Password - EatPal</title>
      <meta name="description" content="Reset your EatPal account password." />
      <meta name="robots" content="noindex" />
    </Helmet>
    <div id="main-content" className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <img
              src="/Logo-Green.webp"
              alt="EatPal"
              className="h-10 block dark:hidden"
            />
            <img
              src="/Logo-White.webp"
              alt="EatPal"
              className="h-10 hidden dark:block"
            />
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {stage === "verify" ? t("resetPassword.verifyTitle") : t("resetPassword.title")}
            </CardTitle>
            <CardDescription>
              {stage === "verify"
                ? t("resetPassword.verifyDescription")
                : t("resetPassword.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stage === "verify" ? (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">{t("resetPassword.emailLabel")}</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-code">{t("resetPassword.codeLabel")}</Label>
                  <InputOTP
                    id="reset-code"
                    maxLength={CODE_LENGTH}
                    value={code}
                    onChange={setCode}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: CODE_LENGTH }, (_, i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-sm text-muted-foreground">
                    {t("resetPassword.codeHint")}
                  </p>
                </div>

                <LoadingButton
                  type="submit"
                  className="w-full"
                  isLoading={verifying}
                  disabled={!canVerify}
                >
                  {t("resetPassword.verifyAction")}
                </LoadingButton>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={handleResendCode}
                  disabled={resending}
                >
                  {resending
                    ? t("resetPassword.resending")
                    : t("resetPassword.resendAction")}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* Password Requirements */}
                <div className="bg-muted p-3 rounded-lg space-y-2">
                  <p className="text-sm font-medium mb-2">Password must have:</p>
                  {passwordRequirements.map((req, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      {req.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                      )}
                      <span className={req.valid ? "text-green-600" : "text-muted-foreground"}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  {confirmPassword && !doPasswordsMatch && (
                    <p className="text-sm text-destructive">Passwords don't match</p>
                  )}
                </div>

                <LoadingButton
                  type="submit"
                  className="w-full"
                  isLoading={loading}
                  disabled={!isPasswordValid || !doPasswordsMatch}
                >
                  Reset Password
                </LoadingButton>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <Link to="/auth?tab=signin" className="text-sm text-muted-foreground hover:text-primary">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
