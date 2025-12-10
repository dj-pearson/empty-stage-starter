/**
 * OAuth Token Hook
 *
 * React hook for managing OAuth tokens with automatic refresh and rotation.
 *
 * Usage:
 * ```tsx
 * function GoogleSearchConsole() {
 *   const { token, isValid, isLoading, error, refresh, revoke } = useOAuthToken('google');
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (!isValid) return <ConnectButton />;
 *
 *   return <DataDisplay token={token} />;
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { getTokenManager, OAuthTokenManager } from '@/lib/oauth-token-rotation';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';

export interface UseOAuthTokenResult {
  /** Current access token (null if not available) */
  token: string | null;
  /** Whether the token is valid and usable */
  isValid: boolean;
  /** Whether token operations are in progress */
  isLoading: boolean;
  /** Any error that occurred */
  error: Error | null;
  /** Manually trigger a token refresh */
  refresh: () => Promise<void>;
  /** Revoke and delete the token */
  revoke: () => Promise<void>;
  /** Whether the user has connected this OAuth provider */
  isConnected: boolean;
  /** Token expiration timestamp */
  expiresAt: Date | null;
}

export function useOAuthToken(provider: string): UseOAuthTokenResult {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tokenManager, setTokenManager] = useState<OAuthTokenManager | null>(null);

  const log = logger.withContext(`useOAuthToken:${provider}`);

  // Initialize user ID and token manager
  useEffect(() => {
    const initializeAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        setTokenManager(getTokenManager(provider));
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        setTokenManager(getTokenManager(provider));
      } else {
        setUserId(null);
        setToken(null);
        setIsConnected(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [provider]);

  // Load and validate token
  useEffect(() => {
    if (!userId || !tokenManager) {
      setIsLoading(false);
      return;
    }

    const loadToken = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const hasToken = await tokenManager.hasValidToken(userId);
        setIsConnected(hasToken);

        if (hasToken) {
          const validToken = await tokenManager.getValidToken(userId);
          setToken(validToken);

          // Get expiration time
          const { data } = await supabase
            .from('oauth_tokens')
            .select('expires_at')
            .eq('user_id', userId)
            .eq('provider', provider)
            .single();

          if (data?.expires_at) {
            setExpiresAt(new Date(data.expires_at));
          }
        }
      } catch (err) {
        log.error('Failed to load token', err);
        setError(err instanceof Error ? err : new Error('Failed to load token'));
      } finally {
        setIsLoading(false);
      }
    };

    loadToken();

    // Start auto-refresh
    tokenManager.startAutoRefresh(userId, (err) => {
      setError(err);
    });

    return () => {
      tokenManager.stopAutoRefresh();
    };
  }, [userId, tokenManager, provider]);

  // Manual refresh
  const refresh = useCallback(async () => {
    if (!userId || !tokenManager) {
      throw new Error('Not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      const validToken = await tokenManager.getValidToken(userId);
      setToken(validToken);

      // Update expiration time
      const { data } = await supabase
        .from('oauth_tokens')
        .select('expires_at')
        .eq('user_id', userId)
        .eq('provider', provider)
        .single();

      if (data?.expires_at) {
        setExpiresAt(new Date(data.expires_at));
      }
    } catch (err) {
      log.error('Failed to refresh token', err);
      setError(err instanceof Error ? err : new Error('Failed to refresh token'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId, tokenManager, provider]);

  // Revoke token
  const revoke = useCallback(async () => {
    if (!userId || !tokenManager) {
      throw new Error('Not authenticated');
    }

    setIsLoading(true);
    setError(null);

    try {
      await tokenManager.revokeToken(userId);
      setToken(null);
      setIsConnected(false);
      setExpiresAt(null);
    } catch (err) {
      log.error('Failed to revoke token', err);
      setError(err instanceof Error ? err : new Error('Failed to revoke token'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId, tokenManager]);

  return {
    token,
    isValid: !!token && (!expiresAt || expiresAt > new Date()),
    isLoading,
    error,
    refresh,
    revoke,
    isConnected,
    expiresAt,
  };
}

/**
 * Hook to initiate OAuth flow for a provider
 */
export function useOAuthConnect(provider: string) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async (redirectUri: string) => {
    setIsConnecting(true);
    setError(null);

    try {
      // Call Edge Function to get OAuth URL
      const { data, error: funcError } = await invokeEdgeFunction(`${provider}-oauth`, {
        body: { action: 'getAuthUrl', redirectUri },
      });

      if (funcError || !data?.authUrl) {
        throw new Error(funcError?.message || 'Failed to get OAuth URL');
      }

      // Store state for verification
      sessionStorage.setItem(`${provider}_oauth_state`, data.state);

      // Redirect to OAuth provider
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      setIsConnecting(false);
      throw err;
    }
  }, [provider]);

  return {
    connect,
    isConnecting,
    error,
  };
}

/**
 * Hook to handle OAuth callback
 */
export function useOAuthCallback(provider: string) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState(false);

  const processCallback = useCallback(async (code: string, state: string) => {
    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      // Verify state
      const storedState = sessionStorage.getItem(`${provider}_oauth_state`);
      if (storedState !== state) {
        throw new Error('Invalid OAuth state - possible CSRF attack');
      }

      // Exchange code for tokens
      const { data, error: funcError } = await invokeEdgeFunction(`${provider}-oauth`, {
        body: { action: 'exchangeCode', code, state },
      });

      if (funcError || !data?.success) {
        throw new Error(funcError?.message || 'Failed to exchange OAuth code');
      }

      // Clear stored state
      sessionStorage.removeItem(`${provider}_oauth_state`);

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('OAuth callback failed'));
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [provider]);

  return {
    processCallback,
    isProcessing,
    error,
    success,
  };
}
