/**
 * Conversion Funnel Tracking
 *
 * Client-side tracking for conversion funnel analytics.
 * Tracks page views, funnel events, and session data.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// Session ID generation and storage
const SESSION_KEY = 'eatpal_session_id';
const SESSION_EXPIRY = 30 * 60 * 1000; // 30 minutes

interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface DeviceInfo {
  device_type: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
}

/**
 * Get or create session ID
 */
function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    const { id, timestamp } = JSON.parse(stored);
    // Check if session is still valid (30 min)
    if (Date.now() - timestamp < SESSION_EXPIRY) {
      // Refresh timestamp
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, timestamp: Date.now() }));
      return id;
    }
  }

  // Create new session ID
  const newId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: newId, timestamp: Date.now() }));
  return newId;
}

/**
 * Get UTM parameters from URL
 */
function getUTMParams(): UTMParams {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    utm_term: params.get('utm_term') || undefined,
  };
}

/**
 * Get device information
 */
function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { device_type: 'desktop', browser: 'unknown', os: 'unknown' };
  }

  const ua = navigator.userAgent;

  // Device type detection
  let device_type: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device_type = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
    device_type = 'mobile';
  }

  // Browser detection
  let browser = 'unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  // OS detection
  let os = 'unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return { device_type, browser, os };
}

/**
 * Track a page view
 */
export async function trackPageView(
  pagePath?: string,
  pageTitle?: string
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const sessionId = getSessionId();
    const utmParams = getUTMParams();
    const deviceInfo = getDeviceInfo();

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();

    // Call the tracking function
    const { error } = await supabase.rpc('track_page_view', {
      p_session_id: sessionId,
      p_page_path: pagePath || window.location.pathname,
      p_page_title: pageTitle || document.title,
      p_referrer: document.referrer || null,
      p_utm_source: utmParams.utm_source || null,
      p_utm_medium: utmParams.utm_medium || null,
      p_utm_campaign: utmParams.utm_campaign || null,
      p_utm_content: utmParams.utm_content || null,
      p_utm_term: utmParams.utm_term || null,
      p_device_type: deviceInfo.device_type,
      p_browser: deviceInfo.browser,
      p_os: deviceInfo.os,
      p_user_id: user?.id || null,
    });

    if (error) {
      logger.warn('Failed to track page view:', error);
    }
  } catch (error) {
    logger.warn('Error tracking page view:', error);
  }
}

/**
 * Funnel event types
 */
export type FunnelEventType =
  | 'landing_view'
  | 'quiz_start'
  | 'quiz_complete'
  | 'email_capture'
  | 'signup'
  | 'trial_start'
  | 'paid_conversion';

/**
 * Track a funnel event
 */
export async function trackFunnelEvent(
  eventType: FunnelEventType,
  eventData?: Record<string, any>
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const sessionId = getSessionId();
    const utmParams = getUTMParams();

    // Get current user if authenticated
    const { data: { user } } = await supabase.auth.getUser();

    // Call the tracking function
    const { error } = await supabase.rpc('track_funnel_event', {
      p_session_id: sessionId,
      p_event_type: eventType,
      p_event_data: eventData || {},
      p_page_path: window.location.pathname,
      p_user_id: user?.id || null,
      p_utm_source: utmParams.utm_source || null,
      p_utm_medium: utmParams.utm_medium || null,
      p_utm_campaign: utmParams.utm_campaign || null,
    });

    if (error) {
      logger.warn('Failed to track funnel event:', error);
    }
  } catch (error) {
    logger.warn('Error tracking funnel event:', error);
  }
}

/**
 * Track landing page view
 */
export function trackLandingView(): void {
  trackFunnelEvent('landing_view');
}

/**
 * Track quiz start
 */
export function trackQuizStart(quizType?: string): void {
  trackFunnelEvent('quiz_start', { quiz_type: quizType });
}

/**
 * Track quiz completion
 */
export function trackQuizComplete(quizType?: string, result?: string): void {
  trackFunnelEvent('quiz_complete', { quiz_type: quizType, result });
}

/**
 * Track email capture
 */
export function trackEmailCapture(source?: string): void {
  trackFunnelEvent('email_capture', { source });
}

/**
 * Track user signup
 */
export function trackSignup(method?: string): void {
  trackFunnelEvent('signup', { method });
}

/**
 * Track trial start
 */
export function trackTrialStart(planId?: string): void {
  trackFunnelEvent('trial_start', { plan_id: planId });
}

/**
 * Track paid conversion
 */
export function trackPaidConversion(planId?: string, amount?: number): void {
  trackFunnelEvent('paid_conversion', { plan_id: planId, amount });
}

/**
 * React hook for tracking page views on route change
 */
export function usePageViewTracking(): void {
  // This should be used with React Router
  // Example usage:
  // const location = useLocation();
  // useEffect(() => {
  //   trackPageView(location.pathname, document.title);
  // }, [location.pathname]);
}

/**
 * Get conversion funnel metrics for a date range
 */
export async function getConversionFunnelMetrics(days: number = 30): Promise<{
  pageViews: number;
  quizStarts: number;
  quizCompletes: number;
  emailCaptures: number;
  signups: number;
  trialStarts: number;
  paidConversions: number;
} | null> {
  try {
    // First try to get data from conversion_funnel_summary view
    const { data: summaryData, error: summaryError } = await supabase
      .from('conversion_funnel_summary')
      .select('*')
      .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('date', { ascending: false });

    if (!summaryError && summaryData && summaryData.length > 0) {
      // Aggregate the data
      const aggregated = summaryData.reduce(
        (acc, day) => ({
          pageViews: acc.pageViews + (day.landing_views || 0),
          quizStarts: acc.quizStarts + (day.quiz_starts || 0),
          quizCompletes: acc.quizCompletes + (day.quiz_completes || 0),
          emailCaptures: acc.emailCaptures + (day.email_captures || 0),
          signups: acc.signups + (day.signups || 0),
          trialStarts: acc.trialStarts + (day.trial_starts || 0),
          paidConversions: acc.paidConversions + (day.paid_conversions || 0),
        }),
        {
          pageViews: 0,
          quizStarts: 0,
          quizCompletes: 0,
          emailCaptures: 0,
          signups: 0,
          trialStarts: 0,
          paidConversions: 0,
        }
      );

      return aggregated;
    }

    // Fallback to direct funnel_events query if view doesn't exist
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabase
      .from('funnel_events')
      .select('event_type')
      .gte('created_at', startDate.toISOString());

    if (eventsError) {
      logger.warn('Failed to fetch funnel events:', eventsError);
      return null;
    }

    const metrics = {
      pageViews: 0,
      quizStarts: 0,
      quizCompletes: 0,
      emailCaptures: 0,
      signups: 0,
      trialStarts: 0,
      paidConversions: 0,
    };

    events?.forEach((event) => {
      switch (event.event_type) {
        case 'landing_view':
          metrics.pageViews++;
          break;
        case 'quiz_start':
          metrics.quizStarts++;
          break;
        case 'quiz_complete':
          metrics.quizCompletes++;
          break;
        case 'email_capture':
          metrics.emailCaptures++;
          break;
        case 'signup':
          metrics.signups++;
          break;
        case 'trial_start':
          metrics.trialStarts++;
          break;
        case 'paid_conversion':
          metrics.paidConversions++;
          break;
      }
    });

    return metrics;
  } catch (error) {
    logger.error('Error getting conversion funnel metrics:', error);
    return null;
  }
}
