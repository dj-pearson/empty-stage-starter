// Dashboard banner that nudges Apple-relay (or password-less Apple) users
// to bind a real email + set a password. Dismissable per session; the user
// can always finish the flow from Account Settings.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useBindStatus } from "@/hooks/useBindStatus";
import { BindEmailFlow } from "@/components/auth/BindEmailFlow";
import { Mail, X } from "lucide-react";

const DISMISS_KEY = "bind-email-banner-dismissed";

export function BindEmailBanner() {
  const navigate = useNavigate();
  const { loading, needsEmailBind, needsPassword, refresh } = useBindStatus();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  if (loading || dismissed) return null;
  if (!needsEmailBind && !needsPassword) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const title = needsEmailBind ? "Bind a real email to your account" : "Set a password";
  const subtitle = needsEmailBind
    ? "Your account is signed in with Apple's private relay. Add a real email so you can sign in either way."
    : "You signed up with Apple. Set a password so you can sign in with email + password too.";

  return (
    <>
      <div className="bg-primary/5 border-b border-primary/20 px-4 py-3 flex items-start gap-3">
        <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => setOpen(true)}>
            {needsEmailBind ? "Set up" : "Set password"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss banner"
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <BindEmailFlow
            mode={needsEmailBind ? "full" : "password-only"}
            onComplete={async () => {
              await refresh();
              setTimeout(() => setOpen(false), 1200);
            }}
            onCancel={() => setOpen(false)}
          />
          <Button
            variant="link"
            className="text-xs h-auto p-0 self-end"
            onClick={() => { setOpen(false); navigate("/dashboard/settings"); }}
          >
            Manage in Account Settings
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
