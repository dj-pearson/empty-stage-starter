import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const passwordRequirements = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "Contains uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "Contains lowercase letter", valid: /[a-z]/.test(password) },
    { label: "Contains number", valid: /[0-9]/.test(password) },
  ];

  const isPasswordValid = passwordRequirements.every((req) => req.valid);
  const doPasswordsMatch = password === confirmPassword && password.length > 0;

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
    } catch (error: any) {
      toast.error("Failed to reset password", {
        description: error.message,
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
              src="/Logo-Green.png"
              alt="EatPal"
              className="h-10 block dark:hidden"
            />
            <img
              src="/Logo-White.png"
              alt="EatPal"
              className="h-10 hidden dark:block"
            />
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create New Password</CardTitle>
            <CardDescription>
              Enter a strong password for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
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
