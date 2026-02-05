/**
 * Login History Service
 *
 * Handles comprehensive login tracking including:
 * - Device/browser detection
 * - IP geolocation (via free API)
 * - Session tracking
 * - Suspicious activity detection
 */

import { supabase } from '@/integrations/supabase/client';
import { parseUserAgent, generateDeviceFingerprint, type ParsedUserAgent } from './user-agent-parser';
import { logger } from './logger';

export type LoginMethod = 'password' | 'google' | 'apple' | 'magic_link' | 'otp' | 'unknown';

export interface LoginHistoryEntry {
  id: string;
  user_id: string | null;
  email: string;
  logged_in_at: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  os_version: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  login_method: LoginMethod;
  success: boolean;
  failure_reason: string | null;
  session_id: string | null;
  device_fingerprint: string | null;
  logged_out_at: string | null;
  session_duration_seconds: number | null;
  metadata: Record<string, unknown>;
}

export interface GeoLocation {
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  ip: string | null;
}

export interface LoginSummary {
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  unique_devices: number;
  unique_locations: number;
  first_login: string | null;
  last_login: string | null;
  most_used_device: string | null;
  most_used_browser: string | null;
  most_used_location: string | null;
}

export interface SuspiciousLoginResult {
  is_suspicious: boolean;
  reason: string;
  risk_score: number;
}

/**
 * Get IP-based geolocation using a free API
 * Uses ip-api.com which allows 45 requests per minute for free
 */
async function getGeoLocation(): Promise<GeoLocation> {
  const defaultGeo: GeoLocation = {
    country: null,
    country_code: null,
    region: null,
    city: null,
    latitude: null,
    longitude: null,
    timezone: null,
    ip: null,
  };

  try {
    // Using ip-api.com - free for non-commercial use, 45 req/min
    // For production, consider ipinfo.io, ipdata.co, or MaxMind GeoLite2
    const response = await fetch('http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone,query', {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      return defaultGeo;
    }

    const data = await response.json();

    if (data.status !== 'success') {
      return defaultGeo;
    }

    return {
      country: data.country || null,
      country_code: data.countryCode || null,
      region: data.regionName || data.region || null,
      city: data.city || null,
      latitude: data.lat || null,
      longitude: data.lon || null,
      timezone: data.timezone || null,
      ip: data.query || null,
    };
  } catch (error) {
    logger.warn('Failed to get geolocation', error);
    return defaultGeo;
  }
}

/**
 * Get or create session ID for tracking
 */
function getSessionId(): string {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return `server-${Date.now()}`;
  }

  let sessionId = sessionStorage.getItem('login_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('login_session_id', sessionId);
  }
  return sessionId;
}

/**
 * Login History Logger Class
 */
class LoginHistoryLogger {
  private readonly log = logger.withContext('LoginHistory');
  private deviceFingerprint: string | null = null;
  private geoCache: GeoLocation | null = null;
  private geoCacheTime: number = 0;
  private readonly GEO_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get device fingerprint (cached)
   */
  private async getDeviceFingerprint(): Promise<string> {
    if (this.deviceFingerprint) {
      return this.deviceFingerprint;
    }
    this.deviceFingerprint = await generateDeviceFingerprint();
    return this.deviceFingerprint;
  }

  /**
   * Get geolocation (cached for 5 minutes)
   */
  private async getGeo(): Promise<GeoLocation> {
    const now = Date.now();
    if (this.geoCache && now - this.geoCacheTime < this.GEO_CACHE_TTL) {
      return this.geoCache;
    }
    this.geoCache = await getGeoLocation();
    this.geoCacheTime = now;
    return this.geoCache;
  }

  /**
   * Log a successful login
   */
  async logLogin(
    userId: string,
    email: string,
    method: LoginMethod,
    metadata: Record<string, unknown> = {}
  ): Promise<string | null> {
    return this.recordLogin(userId, email, method, true, null, metadata);
  }

  /**
   * Log a failed login attempt
   */
  async logFailedLogin(
    email: string,
    method: LoginMethod,
    failureReason: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string | null> {
    return this.recordLogin(null, email, method, false, failureReason, metadata);
  }

  /**
   * Record a login event
   */
  private async recordLogin(
    userId: string | null,
    email: string,
    method: LoginMethod,
    success: boolean,
    failureReason: string | null,
    metadata: Record<string, unknown> = {}
  ): Promise<string | null> {
    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const parsed = parseUserAgent(userAgent);
      const [fingerprint, geo] = await Promise.all([
        this.getDeviceFingerprint(),
        this.getGeo(),
      ]);

      const sessionId = getSessionId();

      const entry = {
        user_id: userId,
        email,
        ip_address: geo.ip,
        user_agent: userAgent,
        device_type: parsed.deviceType,
        browser_name: parsed.browserName,
        browser_version: parsed.browserVersion,
        os_name: parsed.osName,
        os_version: parsed.osVersion,
        country: geo.country,
        country_code: geo.country_code,
        region: geo.region,
        city: geo.city,
        latitude: geo.latitude,
        longitude: geo.longitude,
        timezone: geo.timezone,
        login_method: method,
        success,
        failure_reason: failureReason,
        session_id: sessionId,
        device_fingerprint: fingerprint,
        metadata: {
          ...metadata,
          url: typeof window !== 'undefined' ? window.location.href : null,
          referrer: typeof document !== 'undefined' ? document.referrer : null,
        },
      };

      this.log.debug(`Login ${success ? 'success' : 'failure'}: ${email}`, {
        method,
        device: parsed.deviceType,
        browser: parsed.browserName,
        location: geo.city ? `${geo.city}, ${geo.country}` : 'Unknown',
      });

      const { data, error } = await supabase
        .from('login_history')
        .insert(entry)
        .select('id')
        .single();

      if (error) {
        this.log.error('Failed to record login history', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      this.log.error('Error recording login history', error);
      return null;
    }
  }

  /**
   * Log a logout event
   */
  async logLogout(userId: string): Promise<void> {
    try {
      const sessionId = getSessionId();

      // Find the most recent login for this session
      const { data: loginEntry, error: fetchError } = await supabase
        .from('login_history')
        .select('id, logged_in_at')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('success', true)
        .is('logged_out_at', null)
        .order('logged_in_at', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !loginEntry) {
        this.log.debug('No matching login entry found for logout', { userId, sessionId });
        return;
      }

      const loggedInAt = new Date(loginEntry.logged_in_at);
      const loggedOutAt = new Date();
      const durationSeconds = Math.floor((loggedOutAt.getTime() - loggedInAt.getTime()) / 1000);

      const { error: updateError } = await supabase
        .from('login_history')
        .update({
          logged_out_at: loggedOutAt.toISOString(),
          session_duration_seconds: durationSeconds,
        })
        .eq('id', loginEntry.id);

      if (updateError) {
        this.log.error('Failed to record logout', updateError);
      } else {
        this.log.debug('Logout recorded', { userId, durationSeconds });
      }
    } catch (error) {
      this.log.error('Error recording logout', error);
    }
  }

  /**
   * Get login history for the current user
   */
  async getUserLoginHistory(limit = 50): Promise<LoginHistoryEntry[]> {
    try {
      const { data, error } = await supabase
        .from('login_history')
        .select('*')
        .order('logged_in_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to fetch login history', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.log.error('Error fetching login history', error);
      return [];
    }
  }

  /**
   * Get login history for a specific user (admin)
   */
  async getLoginHistoryByUser(userId: string, limit = 100): Promise<LoginHistoryEntry[]> {
    try {
      const { data, error } = await supabase
        .from('login_history')
        .select('*')
        .eq('user_id', userId)
        .order('logged_in_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error('Failed to fetch user login history', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.log.error('Error fetching user login history', error);
      return [];
    }
  }

  /**
   * Get all login history (admin only)
   */
  async getAllLoginHistory(filters: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    loginMethod?: LoginMethod;
    success?: boolean;
    deviceType?: string;
    country?: string;
    searchEmail?: string;
  } = {}): Promise<{ data: LoginHistoryEntry[]; total: number }> {
    try {
      let query = supabase
        .from('login_history')
        .select('*', { count: 'exact' })
        .order('logged_in_at', { ascending: false });

      if (filters.startDate) {
        query = query.gte('logged_in_at', filters.startDate.toISOString());
      }
      if (filters.endDate) {
        query = query.lte('logged_in_at', filters.endDate.toISOString());
      }
      if (filters.loginMethod) {
        query = query.eq('login_method', filters.loginMethod);
      }
      if (filters.success !== undefined) {
        query = query.eq('success', filters.success);
      }
      if (filters.deviceType) {
        query = query.eq('device_type', filters.deviceType);
      }
      if (filters.country) {
        query = query.eq('country_code', filters.country);
      }
      if (filters.searchEmail) {
        query = query.ilike('email', `%${filters.searchEmail}%`);
      }

      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        this.log.error('Failed to fetch all login history', error);
        return { data: [], total: 0 };
      }

      return { data: data || [], total: count || 0 };
    } catch (error) {
      this.log.error('Error fetching all login history', error);
      return { data: [], total: 0 };
    }
  }

  /**
   * Get login summary for a user
   */
  async getUserLoginSummary(userId: string): Promise<LoginSummary | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_login_summary', { target_user_id: userId })
        .single();

      if (error) {
        this.log.error('Failed to get login summary', error);
        return null;
      }

      return data as LoginSummary;
    } catch (error) {
      this.log.error('Error getting login summary', error);
      return null;
    }
  }

  /**
   * Check for suspicious login patterns
   */
  async checkSuspiciousLogin(
    userId: string,
    ipAddress: string | null,
    countryCode: string | null
  ): Promise<SuspiciousLoginResult> {
    try {
      const fingerprint = await this.getDeviceFingerprint();

      const { data, error } = await supabase
        .rpc('check_suspicious_login', {
          p_user_id: userId,
          p_ip_address: ipAddress,
          p_device_fingerprint: fingerprint,
          p_country_code: countryCode,
        })
        .single();

      if (error) {
        this.log.error('Failed to check suspicious login', error);
        return { is_suspicious: false, reason: '', risk_score: 0 };
      }

      return data as SuspiciousLoginResult;
    } catch (error) {
      this.log.error('Error checking suspicious login', error);
      return { is_suspicious: false, reason: '', risk_score: 0 };
    }
  }

  /**
   * Get daily login statistics
   */
  async getDailyStats(days = 30): Promise<{
    login_date: string;
    total_logins: number;
    unique_users: number;
    successful_logins: number;
    failed_logins: number;
    password_logins: number;
    google_logins: number;
    apple_logins: number;
    mobile_logins: number;
    desktop_logins: number;
    tablet_logins: number;
    avg_session_seconds: number;
  }[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('login_stats_daily')
        .select('*')
        .gte('login_date', startDate.toISOString().split('T')[0])
        .order('login_date', { ascending: false });

      if (error) {
        this.log.error('Failed to fetch daily stats', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.log.error('Error fetching daily stats', error);
      return [];
    }
  }

  /**
   * Get country statistics
   */
  async getCountryStats(): Promise<{
    country: string;
    country_code: string;
    total_logins: number;
    unique_users: number;
    successful_logins: number;
    first_login: string;
    last_login: string;
  }[]> {
    try {
      const { data, error } = await supabase
        .from('login_stats_by_country')
        .select('*')
        .order('total_logins', { ascending: false })
        .limit(50);

      if (error) {
        this.log.error('Failed to fetch country stats', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.log.error('Error fetching country stats', error);
      return [];
    }
  }

  /**
   * Get platform statistics
   */
  async getPlatformStats(): Promise<{
    device_type: string;
    browser_name: string;
    os_name: string;
    total_logins: number;
    unique_users: number;
    percentage: number;
  }[]> {
    try {
      const { data, error } = await supabase
        .from('login_stats_by_platform')
        .select('*')
        .order('total_logins', { ascending: false })
        .limit(50);

      if (error) {
        this.log.error('Failed to fetch platform stats', error);
        return [];
      }

      return data || [];
    } catch (error) {
      this.log.error('Error fetching platform stats', error);
      return [];
    }
  }
}

// Export singleton instance
export const loginHistory = new LoginHistoryLogger();

// Export types
export type { ParsedUserAgent };
