import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logger } from "@/lib/logger";

const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // check every minute

export function SessionTimeoutWarning() {
  const [showWarning, setShowWarning] = useState(false);
  const [expiresIn, setExpiresIn] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const checkSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const expiresAt = session.expires_at;
      if (!expiresAt) return;

      const expiresAtMs = expiresAt * 1000;
      const timeLeft = expiresAtMs - Date.now();

      if (timeLeft <= 0) {
        // Session already expired
        setShowWarning(false);
        const redirectPath = `${location.pathname}${location.search}`;
        navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
      } else if (timeLeft <= WARNING_BEFORE_EXPIRY_MS) {
        // Show warning
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        setExpiresIn(minutes > 0 ? `${minutes} min ${seconds} sec` : `${seconds} sec`);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    } catch (err) {
      logger.debug("Session check error", err);
    }
  }, [location, navigate]);

  useEffect(() => {
    checkSession();
    intervalRef.current = setInterval(checkSession, CHECK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkSession]);

  const handleExtendSession = async () => {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        logger.error("Failed to refresh session", error);
        const redirectPath = `${location.pathname}${location.search}`;
        navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
      } else {
        setShowWarning(false);
      }
    } catch (err) {
      logger.error("Session refresh error", err);
    }
  };

  const handleLogout = async () => {
    setShowWarning(false);
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire in {expiresIn}. Would you like to extend
            your session to continue working?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLogout}>Sign Out</AlertDialogCancel>
          <AlertDialogAction onClick={handleExtendSession}>
            Extend Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
