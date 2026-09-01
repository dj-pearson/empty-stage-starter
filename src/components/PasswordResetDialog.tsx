import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { getErrorMessage } from "@/lib/api-errors";

interface PasswordResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PasswordResetDialog({ open, onOpenChange }: PasswordResetDialogProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // No redirectTo: the recovery email carries a 6-digit code, not a link,
      // so there is nothing for the auth server to redirect back to. The user
      // types that code on /auth/reset-password instead.
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
      );

      if (error) throw error;

      setEmailSent(true);
      toast.success("Password reset email sent!", {
        description: "Check your inbox for your reset code",
      });
    } catch (error: unknown) {
      toast.error("Failed to send reset email", {
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail("");
    setEmailSent(false);
    onOpenChange(false);
  };

  const handleEnterCode = () => {
    const target = `/auth/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`;
    handleClose();
    navigate(target);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Your Password</DialogTitle>
          <DialogDescription>
            {emailSent
              ? "We've sent you a password reset code"
              : "Enter your email address and we'll send you a reset code"}
          </DialogDescription>
        </DialogHeader>

        {emailSent ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit reset code to <strong>{email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't receive it? Check your spam folder or try again.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                isLoading={loading}
              >
                Send Reset Code
              </LoadingButton>
            </DialogFooter>
          </form>
        )}

        {emailSent && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleClose}>
              Back to Sign In
            </Button>
            <Button onClick={handleEnterCode}>Enter Code</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
