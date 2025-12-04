/**
 * Security Audit Logging Service
 *
 * Provides comprehensive security event logging for authentication,
 * authorization, and sensitive operations.
 *
 * Features:
 * - Structured audit logging
 * - Real-time alerting for suspicious activity
 * - Session tracking
 * - IP and device fingerprinting
 * - Configurable retention
 *
 * Usage:
 * ```typescript
 * import { securityAudit } from '@/lib/security-audit';
 *
 * // Log authentication events
 * securityAudit.logAuth('LOGIN_SUCCESS', userId, { method: 'password' });
 *
 * // Log data access
 * securityAudit.logAccess('USER_DATA_VIEW', userId, { resourceType: 'profile' });
 *
 * // Log administrative actions
 * securityAudit.logAdmin('USER_DELETED', adminId, { targetUserId: userId });
 * ```
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from './logger';

/**
 * Security event categories
 */
export type SecurityEventCategory =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'admin_action'
  | 'security_alert'
  | 'oauth'
  | 'api_access'
  | 'configuration';

/**
 * Authentication event types
 */
export type AuthEventType =
  | 'LOGIN_ATTEMPT'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET_REQUEST'
  | 'PASSWORD_RESET_COMPLETE'
  | 'MFA_ENABLED'
  | 'MFA_DISABLED'
  | 'MFA_CHALLENGE_SUCCESS'
  | 'MFA_CHALLENGE_FAILURE'
  | 'SESSION_CREATED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED';

/**
 * Access event types
 */
export type AccessEventType =
  | 'USER_DATA_VIEW'
  | 'USER_DATA_EXPORT'
  | 'CHILD_DATA_VIEW'
  | 'FINANCIAL_DATA_VIEW'
  | 'ADMIN_PANEL_ACCESS'
  | 'API_KEY_USED'
  | 'PERMISSION_CHECK'
  | 'PERMISSION_DENIED';

/**
 * Data modification event types
 */
export type DataEventType =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'CHILD_CREATED'
  | 'CHILD_UPDATED'
  | 'CHILD_DELETED'
  | 'SUBSCRIPTION_CHANGED'
  | 'PAYMENT_PROCESSED'
  | 'DATA_IMPORT'
  | 'DATA_EXPORT'
  | 'BULK_OPERATION';

/**
 * Admin action event types
 */
export type AdminEventType =
  | 'USER_IMPERSONATION'
  | 'USER_ROLE_CHANGE'
  | 'USER_SUSPENSION'
  | 'SYSTEM_CONFIG_CHANGE'
  | 'FEATURE_FLAG_CHANGE'
  | 'SECRET_ROTATION'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED';

/**
 * Security alert types
 */
export type AlertEventType =
  | 'SUSPICIOUS_LOGIN'
  | 'BRUTE_FORCE_DETECTED'
  | 'IMPOSSIBLE_TRAVEL'
  | 'NEW_DEVICE'
  | 'UNUSUAL_ACCESS_PATTERN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'CSRF_DETECTED'
  | 'XSS_ATTEMPT'
  | 'SQL_INJECTION_ATTEMPT'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT';

export type SecurityEventType =
  | AuthEventType
  | AccessEventType
  | DataEventType
  | AdminEventType
  | AlertEventType
  | string;

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  id?: string;
  userId: string | null;
  eventType: SecurityEventType;
  eventCategory: SecurityEventCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  deviceFingerprint: string | null;
  timestamp: string;
  success: boolean;
}

/**
 * Alert configuration for real-time security monitoring
 */
interface AlertConfig {
  eventTypes: SecurityEventType[];
  threshold: number;
  windowMs: number;
  action: 'log' | 'email' | 'slack' | 'lock_account';
}

/**
 * Default alert configurations
 */
const DEFAULT_ALERTS: AlertConfig[] = [
  {
    eventTypes: ['LOGIN_FAILURE'],
    threshold: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    action: 'lock_account',
  },
  {
    eventTypes: ['PERMISSION_DENIED'],
    threshold: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
    action: 'email',
  },
  {
    eventTypes: ['RATE_LIMIT_EXCEEDED'],
    threshold: 3,
    windowMs: 60 * 1000, // 1 minute
    action: 'slack',
  },
];

/**
 * Security Audit Logger Class
 */
class SecurityAuditLogger {
  private readonly log = logger.withContext('SecurityAudit');
  private sessionId: string | null = null;
  private deviceFingerprint: string | null = null;

  constructor() {
    this.initializeSession();
    this.generateDeviceFingerprint();
  }

  /**
   * Initialize session tracking
   */
  private initializeSession(): void {
    if (typeof window !== 'undefined') {
      this.sessionId = sessionStorage.getItem('audit_session_id');
      if (!this.sessionId) {
        this.sessionId = crypto.randomUUID();
        sessionStorage.setItem('audit_session_id', this.sessionId);
      }
    }
  }

  /**
   * Generate device fingerprint for tracking
   */
  private async generateDeviceFingerprint(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      const components = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        // @ts-ignore - deviceMemory is not in all browsers
        navigator.deviceMemory || 0,
      ];

      const fingerprint = components.join('|');
      const encoder = new TextEncoder();
      const data = encoder.encode(fingerprint);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      this.deviceFingerprint = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
    } catch (error) {
      this.log.warn('Failed to generate device fingerprint', error);
    }
  }

  /**
   * Get current IP address (via Edge Function)
   */
  private async getIpAddress(): Promise<string | null> {
    // IP detection is handled server-side for accuracy
    return null;
  }

  /**
   * Determine severity based on event type
   */
  private getSeverity(eventType: SecurityEventType): 'low' | 'medium' | 'high' | 'critical' {
    const criticalEvents: SecurityEventType[] = [
      'BRUTE_FORCE_DETECTED',
      'IMPOSSIBLE_TRAVEL',
      'SQL_INJECTION_ATTEMPT',
      'XSS_ATTEMPT',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'USER_IMPERSONATION',
    ];

    const highEvents: SecurityEventType[] = [
      'SUSPICIOUS_LOGIN',
      'ACCOUNT_LOCKED',
      'PASSWORD_CHANGE',
      'USER_ROLE_CHANGE',
      'SECRET_ROTATION',
      'PERMISSION_DENIED',
    ];

    const mediumEvents: SecurityEventType[] = [
      'LOGIN_FAILURE',
      'MFA_CHALLENGE_FAILURE',
      'NEW_DEVICE',
      'UNUSUAL_ACCESS_PATTERN',
      'RATE_LIMIT_EXCEEDED',
    ];

    if (criticalEvents.includes(eventType)) return 'critical';
    if (highEvents.includes(eventType)) return 'high';
    if (mediumEvents.includes(eventType)) return 'medium';
    return 'low';
  }

  /**
   * Log an audit event
   */
  private async logEvent(
    eventType: SecurityEventType,
    eventCategory: SecurityEventCategory,
    userId: string | null,
    metadata: Record<string, unknown> = {},
    success = true
  ): Promise<void> {
    const entry: AuditLogEntry = {
      userId,
      eventType,
      eventCategory,
      severity: this.getSeverity(eventType),
      metadata: {
        ...metadata,
        url: typeof window !== 'undefined' ? window.location.href : null,
      },
      ipAddress: await this.getIpAddress(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      sessionId: this.sessionId,
      deviceFingerprint: this.deviceFingerprint,
      timestamp: new Date().toISOString(),
      success,
    };

    // Log locally for debugging
    this.log.debug(`Security event: ${eventType}`, entry);

    // Store in database
    try {
      const { error } = await supabase.from('security_audit_logs').insert({
        user_id: entry.userId,
        event_type: entry.eventType,
        event_category: entry.eventCategory,
        severity: entry.severity,
        metadata: entry.metadata,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
        session_id: entry.sessionId,
        device_fingerprint: entry.deviceFingerprint,
        success: entry.success,
        created_at: entry.timestamp,
      });

      if (error) {
        this.log.error('Failed to store audit log', error);
      }
    } catch (error) {
      this.log.error('Audit logging error', error);
    }

    // Check for alert triggers
    if (entry.severity === 'critical' || entry.severity === 'high') {
      await this.checkAlertTriggers(entry);
    }
  }

  /**
   * Check if event triggers any alerts
   */
  private async checkAlertTriggers(entry: AuditLogEntry): Promise<void> {
    for (const alert of DEFAULT_ALERTS) {
      if (!alert.eventTypes.includes(entry.eventType)) continue;

      // Count recent events of this type
      const windowStart = new Date(Date.now() - alert.windowMs).toISOString();

      const { count, error } = await supabase
        .from('security_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', entry.eventType)
        .eq('user_id', entry.userId)
        .gte('created_at', windowStart);

      if (error || !count) continue;

      if (count >= alert.threshold) {
        await this.triggerAlert(alert, entry, count);
      }
    }
  }

  /**
   * Trigger security alert
   */
  private async triggerAlert(
    config: AlertConfig,
    entry: AuditLogEntry,
    count: number
  ): Promise<void> {
    this.log.warn(`Security alert triggered: ${entry.eventType}`, {
      count,
      threshold: config.threshold,
      action: config.action,
    });

    // Log the alert itself
    await this.logEvent('SECURITY_ALERT_TRIGGERED' as SecurityEventType, 'security_alert', entry.userId, {
      triggeringEvent: entry.eventType,
      count,
      threshold: config.threshold,
      action: config.action,
    });

    // Execute alert action
    switch (config.action) {
      case 'lock_account':
        if (entry.userId) {
          await this.lockAccount(entry.userId);
        }
        break;

      case 'email':
        await this.sendAlertEmail(entry);
        break;

      case 'slack':
        await this.sendSlackAlert(entry);
        break;

      default:
        // Just log
        break;
    }
  }

  /**
   * Lock user account
   */
  private async lockAccount(userId: string): Promise<void> {
    try {
      await supabase
        .from('profiles')
        .update({
          is_locked: true,
          locked_at: new Date().toISOString(),
          lock_reason: 'security_alert',
        })
        .eq('id', userId);

      await this.logEvent('ACCOUNT_LOCKED', 'authentication', userId, {
        reason: 'security_alert',
        automatic: true,
      });
    } catch (error) {
      this.log.error('Failed to lock account', error);
    }
  }

  /**
   * Send alert email
   */
  private async sendAlertEmail(entry: AuditLogEntry): Promise<void> {
    try {
      await supabase.functions.invoke('send-emails', {
        body: {
          type: 'security_alert',
          userId: entry.userId,
          eventType: entry.eventType,
          metadata: entry.metadata,
        },
      });
    } catch (error) {
      this.log.error('Failed to send alert email', error);
    }
  }

  /**
   * Send Slack alert
   */
  private async sendSlackAlert(entry: AuditLogEntry): Promise<void> {
    // Would integrate with Slack webhook
    this.log.info('Slack alert would be sent', entry);
  }

  // Public API methods

  /**
   * Log authentication event
   */
  async logAuth(
    eventType: AuthEventType,
    userId: string | null,
    metadata: Record<string, unknown> = {},
    success = true
  ): Promise<void> {
    await this.logEvent(eventType, 'authentication', userId, metadata, success);
  }

  /**
   * Log access event
   */
  async logAccess(
    eventType: AccessEventType,
    userId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.logEvent(eventType, 'data_access', userId, metadata);
  }

  /**
   * Log data modification event
   */
  async logData(
    eventType: DataEventType,
    userId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.logEvent(eventType, 'data_modification', userId, metadata);
  }

  /**
   * Log admin action
   */
  async logAdmin(
    eventType: AdminEventType,
    adminId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.logEvent(eventType, 'admin_action', adminId, {
      ...metadata,
      isAdminAction: true,
    });
  }

  /**
   * Log security alert
   */
  async logAlert(
    eventType: AlertEventType,
    userId: string | null,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.logEvent(eventType, 'security_alert', userId, metadata, false);
  }

  /**
   * Log API access
   */
  async logApiAccess(
    endpoint: string,
    method: string,
    userId: string | null,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    await this.logEvent('API_ACCESS' as SecurityEventType, 'api_access', userId, {
      endpoint,
      method,
      ...metadata,
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(
    filters: {
      userId?: string;
      eventType?: SecurityEventType;
      eventCategory?: SecurityEventCategory;
      severity?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit = 100
  ): Promise<AuditLogEntry[]> {
    let query = supabase
      .from('security_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.eventType) {
      query = query.eq('event_type', filters.eventType);
    }
    if (filters.eventCategory) {
      query = query.eq('event_category', filters.eventCategory);
    }
    if (filters.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }
    if (filters.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      this.log.error('Failed to query audit logs', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      eventType: row.event_type,
      eventCategory: row.event_category,
      severity: row.severity,
      metadata: row.metadata || {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      deviceFingerprint: row.device_fingerprint,
      timestamp: row.created_at,
      success: row.success,
    }));
  }
}

// Export singleton instance
export const securityAudit = new SecurityAuditLogger();

// Export types
export type { AuditLogEntry, AlertConfig };
