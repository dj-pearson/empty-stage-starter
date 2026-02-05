/**
 * Login History Hook
 *
 * React hook for managing login history in components.
 *
 * Usage:
 * ```tsx
 * function SecuritySettings() {
 *   const { loginHistory, isLoading, refreshHistory } = useLoginHistory();
 *
 *   return (
 *     <div>
 *       {loginHistory.map(entry => (
 *         <div key={entry.id}>
 *           {entry.logged_in_at} - {entry.device_type} - {entry.city}, {entry.country}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  loginHistory as loginHistoryService,
  type LoginHistoryEntry,
  type LoginSummary,
  type LoginMethod,
} from '@/lib/login-history';

export interface UseLoginHistoryResult {
  /** User's login history entries */
  loginHistory: LoginHistoryEntry[];
  /** Whether history is being loaded */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Refresh login history */
  refreshHistory: () => Promise<void>;
  /** User's login summary stats */
  summary: LoginSummary | null;
  /** Log a login event manually */
  logLogin: (method: LoginMethod, metadata?: Record<string, unknown>) => Promise<string | null>;
  /** Log a failed login event */
  logFailedLogin: (email: string, method: LoginMethod, reason: string) => Promise<string | null>;
  /** Log a logout event */
  logLogout: () => Promise<void>;
}

export function useLoginHistory(limit = 50): UseLoginHistoryResult {
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [summary, setSummary] = useState<LoginSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
      setUserEmail(user?.email || null);
    };

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id || null);
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Refresh login history
  const refreshHistory = useCallback(async () => {
    if (!userId) {
      setLoginHistory([]);
      setSummary(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [history, userSummary] = await Promise.all([
        loginHistoryService.getUserLoginHistory(limit),
        loginHistoryService.getUserLoginSummary(userId),
      ]);

      setLoginHistory(history);
      setSummary(userSummary);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch login history'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, limit]);

  // Load initial history
  useEffect(() => {
    if (userId) {
      refreshHistory();
    }
  }, [userId, refreshHistory]);

  // Log login
  const logLogin = useCallback(async (
    method: LoginMethod,
    metadata: Record<string, unknown> = {}
  ): Promise<string | null> => {
    if (!userId || !userEmail) return null;
    return loginHistoryService.logLogin(userId, userEmail, method, metadata);
  }, [userId, userEmail]);

  // Log failed login
  const logFailedLogin = useCallback(async (
    email: string,
    method: LoginMethod,
    reason: string
  ): Promise<string | null> => {
    return loginHistoryService.logFailedLogin(email, method, reason);
  }, []);

  // Log logout
  const logLogout = useCallback(async (): Promise<void> => {
    if (!userId) return;
    await loginHistoryService.logLogout(userId);
  }, [userId]);

  return {
    loginHistory,
    isLoading,
    error,
    refreshHistory,
    summary,
    logLogin,
    logFailedLogin,
    logLogout,
  };
}

/**
 * Hook for admin login history functionality
 */
export interface UseAdminLoginHistoryResult {
  /** Whether user is admin */
  isAdmin: boolean;
  /** All login history entries */
  allHistory: LoginHistoryEntry[];
  /** Total count */
  totalCount: number;
  /** Whether history is being loaded */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Fetch login history with filters */
  fetchHistory: (filters?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    loginMethod?: LoginMethod;
    success?: boolean;
    deviceType?: string;
    country?: string;
    searchEmail?: string;
  }) => Promise<void>;
  /** Get login history for specific user */
  getUserHistory: (userId: string) => Promise<LoginHistoryEntry[]>;
  /** Get user login summary */
  getUserSummary: (userId: string) => Promise<LoginSummary | null>;
  /** Daily statistics */
  dailyStats: Awaited<ReturnType<typeof loginHistoryService.getDailyStats>>;
  /** Country statistics */
  countryStats: Awaited<ReturnType<typeof loginHistoryService.getCountryStats>>;
  /** Platform statistics */
  platformStats: Awaited<ReturnType<typeof loginHistoryService.getPlatformStats>>;
  /** Refresh all statistics */
  refreshStats: () => Promise<void>;
}

export function useAdminLoginHistory(): UseAdminLoginHistoryResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [allHistory, setAllHistory] = useState<LoginHistoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dailyStats, setDailyStats] = useState<Awaited<ReturnType<typeof loginHistoryService.getDailyStats>>>([]);
  const [countryStats, setCountryStats] = useState<Awaited<ReturnType<typeof loginHistoryService.getCountryStats>>>([]);
  const [platformStats, setPlatformStats] = useState<Awaited<ReturnType<typeof loginHistoryService.getPlatformStats>>>([]);

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

  // Fetch login history with filters
  const fetchHistory = useCallback(async (filters: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    loginMethod?: LoginMethod;
    success?: boolean;
    deviceType?: string;
    country?: string;
    searchEmail?: string;
  } = {}) => {
    if (!isAdmin) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, total } = await loginHistoryService.getAllLoginHistory(filters);
      setAllHistory(data);
      setTotalCount(total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch login history'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  // Get user-specific history
  const getUserHistory = useCallback(async (userId: string): Promise<LoginHistoryEntry[]> => {
    if (!isAdmin) return [];
    return loginHistoryService.getLoginHistoryByUser(userId);
  }, [isAdmin]);

  // Get user summary
  const getUserSummary = useCallback(async (userId: string): Promise<LoginSummary | null> => {
    if (!isAdmin) return null;
    return loginHistoryService.getUserLoginSummary(userId);
  }, [isAdmin]);

  // Refresh all statistics
  const refreshStats = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoading(true);
    try {
      const [daily, country, platform] = await Promise.all([
        loginHistoryService.getDailyStats(30),
        loginHistoryService.getCountryStats(),
        loginHistoryService.getPlatformStats(),
      ]);

      setDailyStats(daily);
      setCountryStats(country);
      setPlatformStats(platform);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch statistics'));
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin]);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchHistory({ limit: 100 });
      refreshStats();
    }
  }, [isAdmin, fetchHistory, refreshStats]);

  return {
    isAdmin,
    allHistory,
    totalCount,
    isLoading,
    error,
    fetchHistory,
    getUserHistory,
    getUserSummary,
    dailyStats,
    countryStats,
    platformStats,
    refreshStats,
  };
}

export type { LoginHistoryEntry, LoginSummary, LoginMethod };
