/**
 * Security Audit Hook
 *
 * React hook for security audit logging in components.
 *
 * Usage:
 * ```tsx
 * function UserSettings() {
 *   const { logDataAccess, logDataChange, logs, isLoading } = useSecurityAudit();
 *
 *   useEffect(() => {
 *     logDataAccess('USER_DATA_VIEW', { page: 'settings' });
 *   }, []);
 *
 *   const handlePasswordChange = async () => {
 *     // ... change password
 *     await logDataChange('PASSWORD_CHANGE', { method: 'manual' });
 *   };
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  securityAudit,
  AuthEventType,
  AccessEventType,
  DataEventType,
  AlertEventType,
  AuditLogEntry,
  SecurityEventCategory,
} from '@/lib/security-audit';

export interface UseSecurityAuditResult {
  /** Log an authentication event */
  logAuth: (eventType: AuthEventType, metadata?: Record<string, unknown>, success?: boolean) => Promise<void>;
  /** Log a data access event */
  logDataAccess: (eventType: AccessEventType, metadata?: Record<string, unknown>) => Promise<void>;
  /** Log a data modification event */
  logDataChange: (eventType: DataEventType, metadata?: Record<string, unknown>) => Promise<void>;
  /** Log a security alert */
  logAlert: (eventType: AlertEventType, metadata?: Record<string, unknown>) => Promise<void>;
  /** Query audit logs for the current user */
  queryLogs: (filters?: AuditLogFilters) => Promise<AuditLogEntry[]>;
  /** Recent audit logs for the current user */
  logs: AuditLogEntry[];
  /** Whether logs are being loaded */
  isLoading: boolean;
  /** Refresh logs */
  refreshLogs: () => Promise<void>;
}

export interface AuditLogFilters {
  eventType?: string;
  eventCategory?: SecurityEventCategory;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export function useSecurityAudit(): UseSecurityAuditResult {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Log authentication event
  const logAuth = useCallback(async (
    eventType: AuthEventType,
    metadata: Record<string, unknown> = {},
    success = true
  ) => {
    await securityAudit.logAuth(eventType, userId, metadata, success);
  }, [userId]);

  // Log data access event
  const logDataAccess = useCallback(async (
    eventType: AccessEventType,
    metadata: Record<string, unknown> = {}
  ) => {
    if (!userId) return;
    await securityAudit.logAccess(eventType, userId, metadata);
  }, [userId]);

  // Log data modification event
  const logDataChange = useCallback(async (
    eventType: DataEventType,
    metadata: Record<string, unknown> = {}
  ) => {
    if (!userId) return;
    await securityAudit.logData(eventType, userId, metadata);
  }, [userId]);

  // Log security alert
  const logAlert = useCallback(async (
    eventType: AlertEventType,
    metadata: Record<string, unknown> = {}
  ) => {
    await securityAudit.logAlert(eventType, userId, metadata);
  }, [userId]);

  // Query logs
  const queryLogs = useCallback(async (filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> => {
    if (!userId) return [];

    return await securityAudit.queryLogs({
      userId,
      eventType: filters.eventType,
      eventCategory: filters.eventCategory,
      severity: filters.severity,
      startDate: filters.startDate,
      endDate: filters.endDate,
    }, filters.limit || 100);
  }, [userId]);

  // Refresh logs
  const refreshLogs = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const recentLogs = await queryLogs({ limit: 50 });
      setLogs(recentLogs);
    } finally {
      setIsLoading(false);
    }
  }, [userId, queryLogs]);

  // Load initial logs
  useEffect(() => {
    if (userId) {
      refreshLogs();
    }
  }, [userId]);

  return {
    logAuth,
    logDataAccess,
    logDataChange,
    logAlert,
    queryLogs,
    logs,
    isLoading,
    refreshLogs,
  };
}

/**
 * Hook for admin security audit functionality
 */
export function useAdminSecurityAudit() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [allLogs, setAllLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalEvents: number;
    criticalEvents: number;
    failedLogins: number;
    activeUsers: number;
  } | null>(null);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      setIsAdmin(roleData?.role === 'admin');
      setIsLoading(false);
    };

    checkAdmin();
  }, []);

  // Fetch all logs (admin only)
  const fetchAllLogs = useCallback(async (filters: AuditLogFilters = {}) => {
    if (!isAdmin) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters.limit || 500);

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

      if (error) throw error;

      setAllLogs(data || []);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  // Fetch security stats
  const fetchStats = useCallback(async () => {
    if (!isAdmin) return;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get total events in last 24 hours
    const { count: totalEvents } = await supabase
      .from('security_audit_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', dayAgo.toISOString());

    // Get critical events
    const { count: criticalEvents } = await supabase
      .from('security_audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .gte('created_at', dayAgo.toISOString());

    // Get failed logins
    const { count: failedLogins } = await supabase
      .from('security_audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'LOGIN_FAILURE')
      .gte('created_at', dayAgo.toISOString());

    // Get unique active users
    const { data: activeUsersData } = await supabase
      .from('security_audit_logs')
      .select('user_id')
      .gte('created_at', dayAgo.toISOString())
      .not('user_id', 'is', null);

    const uniqueUsers = new Set(activeUsersData?.map(r => r.user_id) || []);

    setStats({
      totalEvents: totalEvents || 0,
      criticalEvents: criticalEvents || 0,
      failedLogins: failedLogins || 0,
      activeUsers: uniqueUsers.size,
    });
  }, [isAdmin]);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchAllLogs();
      fetchStats();
    }
  }, [isAdmin, fetchAllLogs, fetchStats]);

  return {
    isAdmin,
    allLogs,
    isLoading,
    stats,
    fetchAllLogs,
    fetchStats,
  };
}

export type { AuditLogEntry };
