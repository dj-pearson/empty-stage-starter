/**
 * OAuth Token Rotation Service
 *
 * Provides secure token rotation for OAuth integrations (Google Search Console, Analytics, etc.)
 * Implements best practices for refresh token security:
 * - Automatic token refresh before expiration
 * - Secure storage of tokens
 * - Token rotation on each refresh (when supported)
 * - Audit logging of token operations
 *
 * Usage:
 * ```typescript
 * import { OAuthTokenManager, useOAuthToken } from '@/lib/oauth-token-rotation';
 *
 * // Initialize manager
 * const tokenManager = new OAuthTokenManager('google');
 *
 * // Use hook in components
 * const { token, isValid, refresh } = useOAuthToken('google');
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

// Token refresh buffer - refresh tokens 5 minutes before expiration
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Maximum token age before forced rotation (for providers without rotation)
const MAX_TOKEN_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  provider: string;
  scope?: string;
  tokenType?: string;
  createdAt: number;
  rotationCount: number;
}

export interface TokenRotationConfig {
  provider: string;
  refreshEndpoint: string;
  clientId: string;
  clientSecretEnv: string; // Environment variable name for client secret
  rotationEnabled: boolean;
  maxRotations?: number;
}

// Provider configurations
export const OAUTH_PROVIDERS: Record<string, TokenRotationConfig> = {
  google: {
    provider: 'google',
    refreshEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    rotationEnabled: true,
    maxRotations: 100,
  },
  bing: {
    provider: 'bing',
    refreshEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: import.meta.env.VITE_BING_CLIENT_ID || '',
    clientSecretEnv: 'BING_CLIENT_SECRET',
    rotationEnabled: true,
    maxRotations: 100,
  },
};

/**
 * Security audit event types for OAuth operations
 */
export type OAuthAuditEvent =
  | 'TOKEN_CREATED'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_ROTATED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REFRESH_FAILED'
  | 'TOKEN_VALIDATION_FAILED'
  | 'SUSPICIOUS_ACTIVITY';

/**
 * OAuth Token Manager
 *
 * Manages OAuth tokens for a specific provider with automatic refresh and rotation
 */
export class OAuthTokenManager {
  private provider: string;
  private config: TokenRotationConfig;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly log = logger.withContext('OAuthTokenManager');

  constructor(provider: string) {
    this.provider = provider;
    this.config = OAUTH_PROVIDERS[provider];

    if (!this.config) {
      throw new Error(`Unknown OAuth provider: ${provider}`);
    }
  }

  /**
   * Store a new OAuth token securely
   */
  async storeToken(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number, // seconds
    scope?: string
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = now + expiresIn * 1000;

    const tokenData: OAuthToken = {
      accessToken,
      refreshToken,
      expiresAt,
      provider: this.provider,
      scope,
      tokenType: 'Bearer',
      createdAt: now,
      rotationCount: 0,
    };

    // Store encrypted token in database
    const { error } = await supabase.from('oauth_tokens').upsert(
      {
        user_id: userId,
        provider: this.provider,
        access_token_encrypted: await this.encryptToken(accessToken),
        refresh_token_encrypted: await this.encryptToken(refreshToken),
        expires_at: new Date(expiresAt).toISOString(),
        scope,
        rotation_count: 0,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      },
      {
        onConflict: 'user_id,provider',
      }
    );

    if (error) {
      this.log.error('Failed to store OAuth token', error);
      throw new Error('Failed to store OAuth token');
    }

    await this.logAuditEvent(userId, 'TOKEN_CREATED', {
      provider: this.provider,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    this.log.info(`Token stored for provider: ${this.provider}`);
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  async getValidToken(userId: string): Promise<string | null> {
    const tokenRecord = await this.getStoredToken(userId);

    if (!tokenRecord) {
      this.log.debug('No token found for user');
      return null;
    }

    const now = Date.now();
    const expiresAt = new Date(tokenRecord.expires_at).getTime();

    // Check if token needs refresh (expired or within buffer)
    if (now >= expiresAt - REFRESH_BUFFER_MS) {
      this.log.info('Token expired or expiring soon, refreshing...');
      return await this.refreshToken(userId, tokenRecord);
    }

    // Check if forced rotation is needed (for long-lived tokens)
    const createdAt = new Date(tokenRecord.created_at).getTime();
    if (now - createdAt > MAX_TOKEN_AGE_MS && this.config.rotationEnabled) {
      this.log.info('Token age exceeded, forcing rotation...');
      return await this.refreshToken(userId, tokenRecord, true);
    }

    // Decrypt and return current token
    return await this.decryptToken(tokenRecord.access_token_encrypted);
  }

  /**
   * Refresh the OAuth token
   */
  private async refreshToken(
    userId: string,
    tokenRecord: any,
    forceRotation = false
  ): Promise<string | null> {
    try {
      const refreshToken = await this.decryptToken(tokenRecord.refresh_token_encrypted);

      // Call Edge Function to refresh token (keeps client secret secure)
      const { data, error } = await supabase.functions.invoke('oauth-token-refresh', {
        body: {
          provider: this.provider,
          refreshToken,
          forceRotation,
        },
      });

      if (error || !data?.accessToken) {
        this.log.error('Token refresh failed', error);
        await this.logAuditEvent(userId, 'TOKEN_REFRESH_FAILED', {
          provider: this.provider,
          error: error?.message || 'Unknown error',
        });
        return null;
      }

      const now = Date.now();
      const expiresAt = now + (data.expiresIn || 3600) * 1000;
      const newRotationCount = tokenRecord.rotation_count + 1;

      // Check rotation limit
      if (this.config.maxRotations && newRotationCount > this.config.maxRotations) {
        this.log.warn('Token rotation limit reached, requiring re-authentication');
        await this.logAuditEvent(userId, 'SUSPICIOUS_ACTIVITY', {
          provider: this.provider,
          reason: 'rotation_limit_exceeded',
          rotationCount: newRotationCount,
        });
        await this.revokeToken(userId);
        return null;
      }

      // Update stored token
      const { error: updateError } = await supabase
        .from('oauth_tokens')
        .update({
          access_token_encrypted: await this.encryptToken(data.accessToken),
          refresh_token_encrypted: data.refreshToken
            ? await this.encryptToken(data.refreshToken)
            : tokenRecord.refresh_token_encrypted,
          expires_at: new Date(expiresAt).toISOString(),
          rotation_count: newRotationCount,
          updated_at: new Date(now).toISOString(),
        })
        .eq('user_id', userId)
        .eq('provider', this.provider);

      if (updateError) {
        this.log.error('Failed to update token after refresh', updateError);
        throw updateError;
      }

      // Log appropriate audit event
      const auditEvent: OAuthAuditEvent = data.refreshToken ? 'TOKEN_ROTATED' : 'TOKEN_REFRESHED';
      await this.logAuditEvent(userId, auditEvent, {
        provider: this.provider,
        rotationCount: newRotationCount,
        expiresAt: new Date(expiresAt).toISOString(),
      });

      this.log.info(`Token ${auditEvent.toLowerCase()} for provider: ${this.provider}`);
      return data.accessToken;
    } catch (error) {
      this.log.error('Token refresh error', error);
      await this.logAuditEvent(userId, 'TOKEN_REFRESH_FAILED', {
        provider: this.provider,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Revoke and delete stored token
   */
  async revokeToken(userId: string): Promise<void> {
    const { error } = await supabase
      .from('oauth_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('provider', this.provider);

    if (error) {
      this.log.error('Failed to revoke token', error);
      throw error;
    }

    await this.logAuditEvent(userId, 'TOKEN_REVOKED', {
      provider: this.provider,
    });

    this.log.info(`Token revoked for provider: ${this.provider}`);
  }

  /**
   * Check if user has a valid token
   */
  async hasValidToken(userId: string): Promise<boolean> {
    const tokenRecord = await this.getStoredToken(userId);
    if (!tokenRecord) return false;

    const now = Date.now();
    const expiresAt = new Date(tokenRecord.expires_at).getTime();

    // Consider token valid if we can refresh it
    return now < expiresAt || !!tokenRecord.refresh_token_encrypted;
  }

  /**
   * Get stored token record
   */
  private async getStoredToken(userId: string): Promise<any | null> {
    const { data, error } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', this.provider)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }

  /**
   * Encrypt token for storage
   * Note: In production, use proper encryption (e.g., Supabase Vault)
   */
  private async encryptToken(token: string): Promise<string> {
    // Simple base64 encoding for now
    // TODO: Replace with proper encryption using Supabase Vault or similar
    return btoa(token);
  }

  /**
   * Decrypt stored token
   */
  private async decryptToken(encryptedToken: string): Promise<string> {
    // Simple base64 decoding for now
    // TODO: Replace with proper decryption
    return atob(encryptedToken);
  }

  /**
   * Log audit event for security monitoring
   */
  private async logAuditEvent(
    userId: string,
    eventType: OAuthAuditEvent,
    metadata: Record<string, unknown>
  ): Promise<void> {
    try {
      await supabase.from('security_audit_logs').insert({
        user_id: userId,
        event_type: `oauth:${eventType}`,
        event_category: 'authentication',
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
        },
        ip_address: null, // Populated by Edge Function if needed
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
    } catch (error) {
      // Don't fail the main operation if audit logging fails
      this.log.error('Failed to log audit event', error);
    }
  }

  /**
   * Start automatic token refresh monitoring
   */
  startAutoRefresh(userId: string, onError?: (error: Error) => void): void {
    this.stopAutoRefresh();

    const checkAndRefresh = async () => {
      try {
        const tokenRecord = await this.getStoredToken(userId);
        if (!tokenRecord) {
          this.log.debug('No token to auto-refresh');
          return;
        }

        const now = Date.now();
        const expiresAt = new Date(tokenRecord.expires_at).getTime();
        const timeUntilRefresh = expiresAt - REFRESH_BUFFER_MS - now;

        if (timeUntilRefresh <= 0) {
          // Refresh now
          await this.getValidToken(userId);
        }

        // Schedule next check
        const nextCheckIn = Math.min(
          Math.max(timeUntilRefresh, 60000), // At least 1 minute
          REFRESH_BUFFER_MS // At most the buffer time
        );

        this.refreshTimer = setTimeout(checkAndRefresh, nextCheckIn);
      } catch (error) {
        this.log.error('Auto-refresh error', error);
        onError?.(error instanceof Error ? error : new Error('Auto-refresh failed'));
      }
    };

    // Start checking
    checkAndRefresh();
  }

  /**
   * Stop automatic token refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

/**
 * Create a singleton manager for each provider
 */
const tokenManagers: Record<string, OAuthTokenManager> = {};

export function getTokenManager(provider: string): OAuthTokenManager {
  if (!tokenManagers[provider]) {
    tokenManagers[provider] = new OAuthTokenManager(provider);
  }
  return tokenManagers[provider];
}
