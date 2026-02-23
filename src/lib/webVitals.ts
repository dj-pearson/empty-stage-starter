/**
 * Core Web Vitals Monitoring
 *
 * Tracks LCP, FID, CLS, TTFB, and INP metrics using the web-vitals library.
 * Reports metrics to Sentry as custom performance measurements.
 * Optionally logs to console in development mode.
 */

import type { Metric } from 'web-vitals';

const isDev = import.meta.env.DEV;

function reportToSentry(metric: Metric): void {
  try {
    // Dynamically import Sentry to avoid circular deps
    import('@sentry/react').then((Sentry) => {
      Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');
    }).catch(() => {
      // Sentry not available — skip
    });
  } catch {
    // Sentry not configured
  }
}

function reportMetric(metric: Metric): void {
  if (isDev) {
    const rating = metric.rating; // 'good' | 'needs-improvement' | 'poor'
    const color = rating === 'good' ? '#0cce6b' : rating === 'needs-improvement' ? '#ffa400' : '#ff4e42';
    console.log(
      `%c[Web Vitals] ${metric.name}: ${Math.round(metric.value * 100) / 100} (${rating})`,
      `color: ${color}; font-weight: bold;`,
    );
  }

  reportToSentry(metric);
}

/**
 * Initialize Core Web Vitals tracking.
 * Call this once in main.tsx after the app renders.
 */
export async function initWebVitals(): Promise<void> {
  try {
    const { onCLS, onFID, onLCP, onTTFB, onINP } = await import('web-vitals');

    onCLS(reportMetric);
    onFID(reportMetric);
    onLCP(reportMetric);
    onTTFB(reportMetric);
    onINP(reportMetric);

    if (isDev) {
      console.log('[Web Vitals] Monitoring initialized');
    }
  } catch {
    if (isDev) {
      console.warn('[Web Vitals] Failed to initialize — web-vitals library not available');
    }
  }
}
