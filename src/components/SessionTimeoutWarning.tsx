import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logger } from "@/lib/logger";

/**
 * US-317: session-expiry prompt, driven by auth events rather than polling.
 *
 * The previous version polled `session.expires_at` every minute and popped a
 * "Session Expiring Soon" dialog inside a fixed 5-minute window. But the
 * Supabase client runs with `autoRefreshToken: true`, so the token is renewed
 * automatically well before it expires — the dialog fired on a perfectly
 * healthy session, which is the confusing "odd times" popup desktop users
 * reported.
 *
 * New model: subscribe to `onAuthStateChange` and only warn when a refresh
 * has ACTUALLY failed. The SDK emits:
 *   - TOKEN_REFRESHED / SIGNED_IN  -> session is healthy, hide any warning.
 *   - SIGNED_OUT                    -> the SDK gave up (refresh token expired
 *                                      or revoked) OR the user signed out.
 * We warn only on an *unexpected* SIGNED_OUT (not one the user initiated and
 * not while already on /auth). The action takes them to /auth to sign back
 * in — there's no "Extend" because once SIGNED_OUT fires the refresh token is
 * already gone, so a manual refreshSession() would just fail.
 */
export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Set right before a deliberate sign-out so the resulting SIGNED_OUT event
  // doesn't flash the "session expired" dialog on the way to /auth.
  const deliberateSignOutRef = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        // Auto-refresh succeeded (or a fresh sign-in) — session is healthy.
        setShowWarning(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        if (deliberateSignOutRef.current) {
          deliberateSignOutRef.current = false;
          return;
        }
        // Already on the auth screen — nothing to prompt.
        if (location.pathname.startsWith("/auth")) return;
        // Unexpected sign-out == the client could not refresh the token. This
        // is the only condition that surfaces the dialog.
        logger.debug("Session ended unexpectedly; prompting re-auth");
        setShowWarning(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname]);

  const handleSignInAgain = () => {
    setShowWarning(false);
    const redirectPath = `${location.pathname}${location.search}`;
    navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
  };

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expired</AlertDialogTitle>
          <AlertDialogDescription>
            Your session expired and couldn't be refreshed automatically. Please
            sign in again to keep working — your data is safe.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleSignInAgain}>
            Sign In Again
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
