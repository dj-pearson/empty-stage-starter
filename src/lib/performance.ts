/**
 * Performance Monitoring Utilities
 *
 * Tools for measuring and monitoring web performance metrics,
 * including Core Web Vitals, custom timing, and resource monitoring.
 */

import { useEffect, useRef } from 'react';

/**
 * Performance metric interface
 */
export interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

/**
 * Core Web Vitals thresholds
 */
export const WebVitalsThresholds = {
  LCP: {
    good: 2500,
    needsImprovement: 4000,
  },
  FID: {
    good: 100,
    needsImprovement: 300,
  },
  CLS: {
    good: 0.1,
    needsImprovement: 0.25,
  },
  FCP: {
    good: 1800,
    needsImprovement: 3000,
  },
  TTFB: {
    good: 800,
    needsImprovement: 1800,
  },
  INP: {
    good: 200,
    needsImprovement: 500,
  },
};

/**
 * Get rating for a metric value
 */
function getRating(
  value: number,
  thresholds: { good: number; needsImprovement: number }
): 'good' | 'needs-improvement' | 'poor' {
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.needsImprovement) return 'needs-improvement';
  return 'poor';
}

/**
 * Report performance metric to analytics
 */
function reportMetric(metric: PerformanceMetric): void {
  // Send to analytics service
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.value),
      metric_rating: metric.rating,
      event_category: 'Web Vitals',
    });
  }

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Performance]', metric);
  }
}

/**
 * Measure Largest Contentful Paint (LCP)
 *
 * Usage:
 * ```tsx
 * measureLCP((metric) => {
 *   console.log('LCP:', metric);
 * });
 * ```
 */
export function measureLCP(callback?: (metric: PerformanceMetric) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as any;

      const metric: PerformanceMetric = {
        name: 'LCP',
        value: lastEntry.renderTime || lastEntry.loadTime,
        rating: getRating(lastEntry.renderTime || lastEntry.loadTime, WebVitalsThresholds.LCP),
        timestamp: Date.now(),
      };

      reportMetric(metric);
      callback?.(metric);
    });

    observer.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {
    console.error('Failed to measure LCP:', e);
  }
}

/**
 * Measure First Input Delay (FID)
 */
export function measureFID(callback?: (metric: PerformanceMetric) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const firstInput = entries[0] as any;

      const metric: PerformanceMetric = {
        name: 'FID',
        value: firstInput.processingStart - firstInput.startTime,
        rating: getRating(
          firstInput.processingStart - firstInput.startTime,
          WebVitalsThresholds.FID
        ),
        timestamp: Date.now(),
      };

      reportMetric(metric);
      callback?.(metric);
    });

    observer.observe({ type: 'first-input', buffered: true });
  } catch (e) {
    console.error('Failed to measure FID:', e);
  }
}

/**
 * Measure Cumulative Layout Shift (CLS)
 */
export function measureCLS(callback?: (metric: PerformanceMetric) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  let clsValue = 0;
  let clsEntries: any[] = [];

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any[]) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
          clsEntries.push(entry);
        }
      }
    });

    observer.observe({ type: 'layout-shift', buffered: true });

    // Report final CLS on page hide
    const reportCLS = () => {
      const metric: PerformanceMetric = {
        name: 'CLS',
        value: clsValue,
        rating: getRating(clsValue, WebVitalsThresholds.CLS),
        timestamp: Date.now(),
      };

      reportMetric(metric);
      callback?.(metric);
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportCLS();
      }
    });

    window.addEventListener('pagehide', reportCLS);
  } catch (e) {
    console.error('Failed to measure CLS:', e);
  }
}

/**
 * Measure First Contentful Paint (FCP)
 */
export function measureFCP(callback?: (metric: PerformanceMetric) => void): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  try {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const fcpEntry = entries.find((entry) => entry.name === 'first-contentful-paint') as any;

      if (fcpEntry) {
        const metric: PerformanceMetric = {
          name: 'FCP',
          value: fcpEntry.startTime,
          rating: getRating(fcpEntry.startTime, WebVitalsThresholds.FCP),
          timestamp: Date.now(),
        };

        reportMetric(metric);
        callback?.(metric);
      }
    });

    observer.observe({ type: 'paint', buffered: true });
  } catch (e) {
    console.error('Failed to measure FCP:', e);
  }
}

/**
 * Measure Time to First Byte (TTFB)
 */
export function measureTTFB(callback?: (metric: PerformanceMetric) => void): void {
  if (typeof window === 'undefined' || !window.performance) return;

  try {
    const navigationEntry = performance.getEntriesByType('navigation')[0] as any;

    if (navigationEntry) {
      const ttfb = navigationEntry.responseStart - navigationEntry.requestStart;

      const metric: PerformanceMetric = {
        name: 'TTFB',
        value: ttfb,
        rating: getRating(ttfb, WebVitalsThresholds.TTFB),
        timestamp: Date.now(),
      };

      reportMetric(metric);
      callback?.(metric);
    }
  } catch (e) {
    console.error('Failed to measure TTFB:', e);
  }
}

/**
 * Initialize all Core Web Vitals measurements
 */
export function initWebVitals(): void {
  measureLCP();
  measureFID();
  measureCLS();
  measureFCP();
  measureTTFB();
}

/**
 * Performance timer for custom measurements
 *
 * Usage:
 * ```tsx
 * const timer = new PerformanceTimer('data-load');
 * // ... do work
 * timer.end(); // Automatically reports to analytics
 * ```
 */
export class PerformanceTimer {
  private startTime: number;
  private startMark: string;
  private endMark: string;

  constructor(private name: string) {
    this.startMark = `${name}-start`;
    this.endMark = `${name}-end`;
    this.startTime = performance.now();

    if ('mark' in performance) {
      performance.mark(this.startMark);
    }
  }

  end(): number {
    const duration = performance.now() - this.startTime;

    if ('mark' in performance && 'measure' in performance) {
      performance.mark(this.endMark);
      try {
        performance.measure(this.name, this.startMark, this.endMark);
      } catch (e) {
        // Marks might not exist, ignore
      }
    }

    // Report to analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'timing_complete', {
        name: this.name,
        value: Math.round(duration),
        event_category: 'Performance',
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance Timer] ${this.name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }
}

/**
 * Hook for measuring component render time
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   usePerformanceTimer('MyComponent');
 *   return <div>...</div>;
 * }
 * ```
 */
export function usePerformanceTimer(name: string): void {
  const timerRef = useRef<PerformanceTimer | null>(null);

  useEffect(() => {
    timerRef.current = new PerformanceTimer(name);

    return () => {
      timerRef.current?.end();
    };
  }, [name]);
}

/**
 * Measure resource loading times
 */
export function measureResourceTiming(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  try {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    // Group by type
    const byType: Record<string, number[]> = {};

    resources.forEach((resource) => {
      const type = resource.initiatorType || 'other';
      if (!byType[type]) byType[type] = [];
      byType[type].push(resource.duration);
    });

    // Calculate averages and report
    Object.entries(byType).forEach(([type, durations]) => {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const max = Math.max(...durations);

      if (process.env.NODE_ENV === 'development') {
        console.log(`[Resource Timing] ${type}:`, {
          count: durations.length,
          average: avg.toFixed(2),
          max: max.toFixed(2),
        });
      }
    });
  } catch (e) {
    console.error('Failed to measure resource timing:', e);
  }
}

/**
 * Monitor memory usage (if available)
 */
export function monitorMemoryUsage(): void {
  if (typeof window === 'undefined' || !('memory' in performance)) return;

  try {
    const memory = (performance as any).memory;

    if (process.env.NODE_ENV === 'development') {
      console.log('[Memory Usage]', {
        usedJSHeapSize: (memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        totalJSHeapSize: (memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        jsHeapSizeLimit: (memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB',
      });
    }
  } catch (e) {
    console.error('Failed to monitor memory:', e);
  }
}

/**
 * Get navigation timing info
 */
export function getNavigationTiming(): Record<string, number> | null {
  if (typeof window === 'undefined' || !window.performance) return null;

  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    if (!nav) return null;

    return {
      dnsLookup: nav.domainLookupEnd - nav.domainLookupStart,
      tcpConnect: nav.connectEnd - nav.connectStart,
      request: nav.responseStart - nav.requestStart,
      response: nav.responseEnd - nav.responseStart,
      domProcessing: nav.domComplete - nav.domInteractive,
      domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
      loadComplete: nav.loadEventEnd - nav.loadEventStart,
      totalTime: nav.loadEventEnd - nav.fetchStart,
    };
  } catch (e) {
    console.error('Failed to get navigation timing:', e);
    return null;
  }
}

/**
 * Check if user is on slow connection
 */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) return false;

  const connection = (navigator as any).connection;
  if (!connection) return false;

  // Check for 2G or slow-2g
  if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
    return true;
  }

  // Check for Save Data mode
  if (connection.saveData) {
    return true;
  }

  return false;
}

/**
 * Get connection info
 */
export function getConnectionInfo(): {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
} | null {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) return null;

  const connection = (navigator as any).connection;
  if (!connection) return null;

  return {
    effectiveType: connection.effectiveType,
    downlink: connection.downlink,
    rtt: connection.rtt,
    saveData: connection.saveData,
  };
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}
