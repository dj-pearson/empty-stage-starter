/**
 * Core Web Vitals Monitoring
 *
 * Tracks LCP, FID, CLS, TTFB, and INP metrics using the web-vitals library.
 * Reports metrics to Sentry as custom performance measurements.
 * Optionally logs to console in development mode.
 */

import type { Metric } from 'web-vitals';
import { logger } from "@/lib/logger";
import { withSentry } from "@/lib/sentryClient";

const isDev = import.meta.env.DEV;

/**
 * US-844: through the shared client, so a metric never CAUSES the download.
 *
 * This already used a dynamic import, but an unguarded one: every metric
 * fetched the SDK, including in dev and in any build where Sentry is switched
 * off -- 126 kB gz to record a measurement that had no client to record it
 * against. withSentry runs only if something has already asked for the module,
 * which in production is initializeSentry at idle. A metric emitted before
 * that is dropped rather than handed to an uninitialised client, which is what
 * happened to it before anyway.
 */
function reportToSentry(metric: Metric): void {
  withSentry((Sentry) => {
    Sentry.setMeasurement(metric.name, metric.value, metric.name === 'CLS' ? '' : 'millisecond');
  });
}

function reportMetric(metric: Metric): void {
  if (isDev) {
    const rating = metric.rating; // 'good' | 'needs-improvement' | 'poor'
    const color = rating === 'good' ? '#0cce6b' : rating === 'needs-improvement' ? '#ffa400' : '#ff4e42';
    logger.info(
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
      logger.info('[Web Vitals] Monitoring initialized');
    }
  } catch {
    if (isDev) {
      logger.warn('[Web Vitals] Failed to initialize — web-vitals library not available');
    }
  }
}
