/**
 * INP (Interaction to Next Paint) Optimizer
 *
 * Utilities for measuring and optimizing INP, which replaced FID as a
 * Core Web Vital in March 2024. INP measures the latency of ALL
 * interactions throughout the page lifecycle, not just the first one.
 *
 * Good INP: <= 200ms
 * Needs Improvement: 200ms - 500ms
 * Poor: > 500ms
 *
 * Key optimization strategies:
 * 1. Yield to main thread during long tasks (using scheduler.yield or setTimeout)
 * 2. Minimize input delay by reducing main thread blocking
 * 3. Optimize event handlers to reduce processing time
 * 4. Minimize DOM changes to reduce presentation delay
 */

const INP_GOOD_THRESHOLD = 200;
const INP_POOR_THRESHOLD = 500;

export type INPRating = "good" | "needs-improvement" | "poor";

export interface INPEntry {
  duration: number;
  startTime: number;
  name: string;
  rating: INPRating;
}

/**
 * Rate an INP value according to Core Web Vitals thresholds
 */
export function rateINP(durationMs: number): INPRating {
  if (durationMs <= INP_GOOD_THRESHOLD) return "good";
  if (durationMs <= INP_POOR_THRESHOLD) return "needs-improvement";
  return "poor";
}

/**
 * Yield to the main thread to prevent long tasks from blocking interactions.
 *
 * Uses scheduler.yield() when available (Chrome 115+), falls back to
 * setTimeout for broader browser support.
 *
 * Usage:
 * ```ts
 * async function handleExpensiveClick() {
 *   doPartOne();
 *   await yieldToMain();
 *   doPartTwo();
 *   await yieldToMain();
 *   doPartThree();
 * }
 * ```
 */
export function yieldToMain(): Promise<void> {
  if (
    "scheduler" in globalThis &&
    typeof (globalThis as Record<string, unknown>).scheduler === "object" &&
    (globalThis as Record<string, unknown>).scheduler !== null &&
    "yield" in ((globalThis as Record<string, unknown>).scheduler as Record<string, unknown>)
  ) {
    return ((globalThis as Record<string, unknown>).scheduler as { yield: () => Promise<void> }).yield();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Break a long task into chunks that yield back to the main thread.
 *
 * Usage:
 * ```ts
 * await runInChunks(items, (item) => processItem(item), 5);
 * ```
 */
export async function runInChunks<T>(
  items: T[],
  processor: (item: T, index: number) => void,
  chunkSize: number = 5,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    processor(items[i], i);
    if ((i + 1) % chunkSize === 0 && i + 1 < items.length) {
      await yieldToMain();
    }
  }
}

/**
 * Create a debounced event handler optimized for INP.
 * Processes the handler in a microtask to reduce input delay.
 */
export function createINPOptimizedHandler<T extends (...args: unknown[]) => void>(
  handler: T,
  options: { debounceMs?: number } = {},
): (...args: Parameters<T>) => void {
  const { debounceMs } = options;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    if (debounceMs) {
      timeoutId = setTimeout(() => {
        handler(...args);
        timeoutId = null;
      }, debounceMs);
    } else {
      // Use requestAnimationFrame to batch with next paint
      requestAnimationFrame(() => {
        handler(...args);
      });
    }
  };
}

/**
 * Observe and collect INP entries using PerformanceObserver.
 *
 * Returns a cleanup function to disconnect the observer.
 *
 * Usage:
 * ```ts
 * const cleanup = observeINP((entry) => {
 *   console.log('Interaction:', entry.name, entry.duration, entry.rating);
 *   if (entry.rating === 'poor') {
 *     reportToAnalytics(entry);
 *   }
 * });
 *
 * // Later:
 * cleanup();
 * ```
 */
export function observeINP(
  callback: (entry: INPEntry) => void,
): () => void {
  if (typeof PerformanceObserver === "undefined") {
    return () => {};
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (
          entry.entryType === "event" &&
          entry.duration > 0
        ) {
          callback({
            duration: entry.duration,
            startTime: entry.startTime,
            name: (entry as PerformanceEventTiming).name,
            rating: rateINP(entry.duration),
          });
        }
      }
    });

    observer.observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit);

    return () => observer.disconnect();
  } catch {
    // Browser doesn't support event timing
    return () => {};
  }
}

/**
 * Get the estimated INP value from collected interaction entries.
 *
 * INP is the worst interaction latency, ignoring the top outlier
 * for pages with 50+ interactions (uses 98th percentile).
 */
export function calculateINP(entries: INPEntry[]): number | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => b.duration - a.duration);

  if (sorted.length >= 50) {
    // Use 98th percentile for pages with many interactions
    const index = Math.floor(sorted.length * 0.02);
    return sorted[index].duration;
  }

  // For fewer interactions, use the worst one
  return sorted[0].duration;
}
