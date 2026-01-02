import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Centralized authentication guard component
 *
 * Features:
 * - Silent session check without premature redirects
 * - Loading state while verifying authentication
 * - Route memory - saves intended destination before redirect
 * - Only redirects if session is definitively invalid
 *
 * Fixes:
 * - Race condition where session check redirects before session loads from storage
 * - Lost user position after page reload
 * - Duplicate auth logic across components
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    // CRITICAL: Wait for session to fully load before making any decisions
    const checkSession = async () => {
      try {
        // This will check localStorage and restore session if it exists
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          logger.error("Error checking session:", error);
          setSession(null);
        } else {
          setSession(currentSession);
        }
      } catch (error) {
        logger.error("Unexpected error during session check:", error);
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
        setIsLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Show loading spinner while checking auth
  // This prevents the flash of redirect before session loads
  if (isLoading) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        role="status"
        aria-busy="true"
        aria-label="Verifying authentication"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground animate-pulse">Verifying access...</p>
        <span className="sr-only">Please wait while we verify your authentication</span>
      </div>
    );
  }

  // Session is definitively null - redirect to auth with route memory
  if (session === null) {
    // Save the current location to restore after login
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    const authUrl = `/auth?redirect=${encodeURIComponent(redirectPath)}`;

    return <Navigate to={authUrl} replace />;
  }

  // Session exists - render protected content
  return <>{children}</>;
}
