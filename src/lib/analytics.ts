/**
 * Analytics Utilities
 *
 * Helper functions for tracking user events, page views, and conversions.
 * Provides a unified interface for analytics providers (GA4, Mixpanel, etc.)
 */

/**
 * Analytics event interface
 */
export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, any>;
  timestamp?: number;
}

/**
 * Page view event
 */
export interface PageView {
  path: string;
  title: string;
  referrer?: string;
  search?: string;
}

/**
 * User properties for identification
 */
export interface UserProperties {
  userId?: string;
  email?: string;
  name?: string;
  plan?: string;
  signupDate?: string;
  [key: string]: any;
}

/**
 * Analytics provider interface
 */
export interface AnalyticsProvider {
  trackEvent(event: AnalyticsEvent): void;
  trackPageView(pageView: PageView): void;
  identifyUser(properties: UserProperties): void;
  reset(): void;
}

/**
 * Google Analytics 4 provider
 */
class GA4Provider implements AnalyticsProvider {
  constructor(private measurementId: string) {}

  trackEvent(event: AnalyticsEvent): void {
    if (typeof window === 'undefined' || !window.gtag) return;

    window.gtag('event', event.name, {
      ...event.properties,
      event_timestamp: event.timestamp || Date.now(),
    });
  }

  trackPageView(pageView: PageView): void {
    if (typeof window === 'undefined' || !window.gtag) return;

    window.gtag('config', this.measurementId, {
      page_path: pageView.path,
      page_title: pageView.title,
    });
  }

  identifyUser(properties: UserProperties): void {
    if (typeof window === 'undefined' || !window.gtag) return;

    if (properties.userId) {
      window.gtag('config', this.measurementId, {
        user_id: properties.userId,
      });
    }

    window.gtag('set', 'user_properties', properties);
  }

  reset(): void {
    // GA4 doesn't have a built-in reset, but we can clear user ID
    if (typeof window === 'undefined' || !window.gtag) return;

    window.gtag('config', this.measurementId, {
      user_id: null,
    });
  }
}

/**
 * Console provider for development
 */
class ConsoleProvider implements AnalyticsProvider {
  trackEvent(event: AnalyticsEvent): void {
    console.log('[Analytics] Event:', event);
  }

  trackPageView(pageView: PageView): void {
    console.log('[Analytics] Page View:', pageView);
  }

  identifyUser(properties: UserProperties): void {
    console.log('[Analytics] Identify User:', properties);
  }

  reset(): void {
    console.log('[Analytics] Reset User');
  }
}

/**
 * Analytics manager class
 */
class AnalyticsManager {
  private providers: AnalyticsProvider[] = [];
  private queue: AnalyticsEvent[] = [];
  private isInitialized = false;

  /**
   * Initialize analytics with providers
   */
  init(providers: AnalyticsProvider[]): void {
    this.providers = providers;
    this.isInitialized = true;

    // Process queued events
    this.queue.forEach((event) => this.trackEvent(event));
    this.queue = [];
  }

  /**
   * Track custom event
   *
   * Usage:
   * ```tsx
   * analytics.trackEvent('button_clicked', {
   *   button_name: 'signup',
   *   page: '/pricing',
   * });
   * ```
   */
  trackEvent(name: string, properties?: Record<string, any>): void {
    const event: AnalyticsEvent = {
      name,
      properties,
      timestamp: Date.now(),
    };

    if (!this.isInitialized) {
      this.queue.push(event);
      return;
    }

    this.providers.forEach((provider) => provider.trackEvent(event));
  }

  /**
   * Track page view
   *
   * Usage:
   * ```tsx
   * analytics.trackPageView('/pricing', 'Pricing Page');
   * ```
   */
  trackPageView(path: string, title: string): void {
    const pageView: PageView = {
      path,
      title,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      search: typeof window !== 'undefined' ? window.location.search : undefined,
    };

    if (!this.isInitialized) {
      // Queue page view as event
      this.queue.push({
        name: 'page_view',
        properties: pageView,
        timestamp: Date.now(),
      });
      return;
    }

    this.providers.forEach((provider) => provider.trackPageView(pageView));
  }

  /**
   * Identify user
   *
   * Usage:
   * ```tsx
   * analytics.identifyUser({
   *   userId: 'user-123',
   *   email: 'user@example.com',
   *   plan: 'premium',
   * });
   * ```
   */
  identifyUser(properties: UserProperties): void {
    this.providers.forEach((provider) => provider.identifyUser(properties));
  }

  /**
   * Reset user (on logout)
   */
  reset(): void {
    this.providers.forEach((provider) => provider.reset());
  }

  /**
   * Track conversion event
   */
  trackConversion(name: string, value?: number, currency: string = 'USD'): void {
    this.trackEvent('conversion', {
      conversion_name: name,
      value,
      currency,
    });
  }

  /**
   * Track signup
   */
  trackSignup(method: string = 'email'): void {
    this.trackEvent('signup', { method });
  }

  /**
   * Track login
   */
  trackLogin(method: string = 'email'): void {
    this.trackEvent('login', { method });
  }

  /**
   * Track purchase
   */
  trackPurchase(
    transactionId: string,
    value: number,
    items: Array<{ id: string; name: string; price: number; quantity: number }>
  ): void {
    this.trackEvent('purchase', {
      transaction_id: transactionId,
      value,
      currency: 'USD',
      items,
    });
  }

  /**
   * Track subscription
   */
  trackSubscription(plan: string, value: number, interval: 'monthly' | 'yearly'): void {
    this.trackEvent('subscribe', {
      plan,
      value,
      currency: 'USD',
      interval,
    });
  }
}

// Singleton instance
export const analytics = new AnalyticsManager();

// Export providers for initialization
export { GA4Provider, ConsoleProvider };

/**
 * Initialize analytics (call in app initialization)
 *
 * Usage:
 * ```tsx
 * // In development
 * initAnalytics({ development: true });
 *
 * // In production
 * initAnalytics({
 *   gaId: 'G-XXXXXXXXXX',
 * });
 * ```
 */
export function initAnalytics(config: {
  gaId?: string;
  development?: boolean;
}): void {
  const providers: AnalyticsProvider[] = [];

  if (config.development || process.env.NODE_ENV === 'development') {
    providers.push(new ConsoleProvider());
  }

  if (config.gaId && process.env.NODE_ENV === 'production') {
    providers.push(new GA4Provider(config.gaId));
  }

  analytics.init(providers);
}

/**
 * Hook for tracking page views
 *
 * Usage:
 * ```tsx
 * import { useEffect } from 'react';
 * import { useLocation } from 'react-router-dom';
 * import { useAnalyticsPageView } from '@/lib/analytics';
 *
 * function App() {
 *   useAnalyticsPageView();
 *   return <div>...</div>;
 * }
 * ```
 */
export function useAnalyticsPageView() {
  if (typeof window === 'undefined') return;

  // This should be used with react-router
  // import { useEffect } from 'react';
  // import { useLocation } from 'react-router-dom';
  //
  // const location = useLocation();
  //
  // useEffect(() => {
  //   analytics.trackPageView(location.pathname, document.title);
  // }, [location]);
}

/**
 * Track form submission
 */
export function trackFormSubmission(formName: string, success: boolean = true): void {
  analytics.trackEvent('form_submission', {
    form_name: formName,
    success,
  });
}

/**
 * Track search
 */
export function trackSearch(query: string, resultCount?: number): void {
  analytics.trackEvent('search', {
    search_term: query,
    result_count: resultCount,
  });
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(featureName: string, properties?: Record<string, any>): void {
  analytics.trackEvent('feature_used', {
    feature_name: featureName,
    ...properties,
  });
}

/**
 * Track error
 */
export function trackError(errorName: string, errorMessage?: string, fatal: boolean = false): void {
  analytics.trackEvent('error', {
    error_name: errorName,
    error_message: errorMessage,
    fatal,
  });
}

/**
 * Track timing (performance)
 */
export function trackTiming(
  category: string,
  variable: string,
  value: number,
  label?: string
): void {
  analytics.trackEvent('timing', {
    timing_category: category,
    timing_variable: variable,
    timing_value: value,
    timing_label: label,
  });
}

// Declare gtag for TypeScript
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}
