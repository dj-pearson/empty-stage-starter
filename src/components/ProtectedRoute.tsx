import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured, configurationErrors, checkSupabaseHealth } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Session, AuthError } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; session: Session }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: string; isRetryable: boolean };

/**
 * Categorize auth errors for better handling
 */
function categorizeSessionError(error: AuthError | Error): { message: string; isRetryable: boolean } {
  const message = error.message.toLowerCase();

  // Network errors are retryable
  if (message.includes('failed to fetch') || message.includes('network')) {
    return {
      message: 'Unable to connect to authentication server. Please check your connection.',
      isRetryable: true,
    };
  }

  // Server errors are retryable
  if ('status' in error && typeof error.status === 'number' && error.status >= 500) {
    return {
      message: 'Authentication service is temporarily unavailable.',
      isRetryable: true,
    };
  }

  // Session expired/invalid - not an error, just means user needs to log in
  if (message.includes('session') || message.includes('token') || message.includes('jwt')) {
    return {
      message: 'Your session has expired. Please sign in again.',
      isRetryable: false,
    };
  }

  // Default: treat as retryable
  return {
    message: error.message,
    isRetryable: true,
  };
}

/**
 * ProtectedRoute - Centralized authentication guard component
 *
 * Features:
 * - Silent session check without premature redirects
 * - Loading state while verifying authentication
 * - Route memory - saves intended destination before redirect
 * - Distinguishes between "not authenticated" and "error checking auth"
 * - Connection error handling with retry capability
 *
 * Fixes:
 * - Race condition where session check redirects before session loads from storage
 * - Lost user position after page reload
 * - Duplicate auth logic across components
 * - Better error handling for self-hosted Supabase environments
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [authState, setAuthState] = useState<AuthState>({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const location = useLocation();

  const checkSession = async (isRetry = false) => {
    // Check configuration first
    if (!isSupabaseConfigured) {
      setAuthState({
        status: 'error',
        error: 'Authentication service is not configured. ' + configurationErrors.join(' '),
        isRetryable: false,
      });
      return;
    }

    if (!isRetry) {
      setAuthState({ status: 'loading' });
    }

    try {
      // This will check localStorage and restore session if it exists
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();

      if (error) {
        const categorized = categorizeSessionError(error);
        logger.error("Error checking session:", error);

        if (categorized.isRetryable) {
          setAuthState({
            status: 'error',
            error: categorized.message,
            isRetryable: true,
          });
        } else {
          // Non-retryable session errors mean user needs to authenticate
          setAuthState({ status: 'unauthenticated' });
        }
      } else if (currentSession) {
        setAuthState({ status: 'authenticated', session: currentSession });
      } else {
        setAuthState({ status: 'unauthenticated' });
      }
    } catch (error) {
      logger.error("Unexpected error during session check:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAuthState({
        status: 'error',
        error: `Failed to verify authentication: ${errorMessage}`,
        isRetryable: true,
      });
    }
  };

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      await checkSession();
    };

    initSession();

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (!mounted) return;

        if (currentSession) {
          setAuthState({ status: 'authenticated', session: currentSession });
        } else {
          setAuthState({ status: 'unauthenticated' });
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleRetry = async () => {
    setRetryCount(prev => prev + 1);
    await checkSession(true);
  };

  const handleTestConnection = async () => {
    setAuthState({ status: 'loading' });

    try {
      const health = await checkSupabaseHealth();

      if (!health.isConnected) {
        setAuthState({
          status: 'error',
          error: health.connectionError || 'Unable to connect to server',
          isRetryable: true,
        });
      } else {
        // Connection is good, retry session check
        await checkSession(true);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAuthState({
        status: 'error',
        error: `Connection test failed: ${errorMessage}`,
        isRetryable: true,
      });
    }
  };

  // Show loading spinner while checking auth
  if (authState.status === 'loading') {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-3"
        role="status"
        aria-busy="true"
        aria-label="Verifying authentication"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground animate-pulse">
          {retryCount > 0 ? 'Retrying...' : 'Verifying access...'}
        </p>
        <span className="sr-only">Please wait while we verify your authentication</span>
      </div>
    );
  }

  // Show error state with retry option
  if (authState.status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="max-w-md w-full">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription className="mt-2">
              <p className="mb-4">{authState.error}</p>
              <div className="flex gap-2 flex-wrap">
                {authState.isRetryable && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTestConnection}
                    >
                      Test Connection
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.href = '/auth'}
                >
                  Go to Sign In
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  // Session is definitively null - redirect to auth with route memory
  if (authState.status === 'unauthenticated') {
    // Save the current location to restore after login
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    const authUrl = `/auth?redirect=${encodeURIComponent(redirectPath)}`;

    return <Navigate to={authUrl} replace />;
  }

  // Session exists - render protected content
  return <>{children}</>;
}
