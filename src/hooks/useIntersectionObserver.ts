import { useEffect, useState, useRef, RefObject } from 'react';
import { logger } from "@/lib/logger";

export interface UseIntersectionObserverOptions extends IntersectionObserverInit {
  /**
   * Only trigger once and stop observing
   */
  triggerOnce?: boolean;
  /**
   * Initial visibility state
   */
  initialIsIntersecting?: boolean;
}

/**
 * Hook to observe element intersection with viewport
 *
 * Usage:
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const { isIntersecting, entry } = useIntersectionObserver(ref, {
 *   threshold: 0.5,
 *   triggerOnce: true,
 * });
 *
 * return (
 *   <div ref={ref} className={isIntersecting ? 'fade-in' : ''}>
 *     Content loads when visible
 *   </div>
 * );
 * ```
 */
export function useIntersectionObserver<T extends HTMLElement = HTMLElement>(
  elementRef: RefObject<T>,
  options: UseIntersectionObserverOptions = {}
): {
  isIntersecting: boolean;
  entry: IntersectionObserverEntry | null;
} {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
    triggerOnce = false,
    initialIsIntersecting = false,
  } = options;

  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);
  const [isIntersecting, setIsIntersecting] = useState<boolean>(initialIsIntersecting);
  // Track the triggerOnce short-circuit in a ref instead of reading the
  // isIntersecting state, so the effect no longer depends on isIntersecting —
  // depending on it recreated the observer on every visibility toggle.
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;

    // Skip if IntersectionObserver is not supported
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    // If already triggered and triggerOnce, don't observe again
    if (triggerOnce && hasTriggeredRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
        setIsIntersecting(entry.isIntersecting);

        // If triggerOnce and now intersecting, stop observing
        if (triggerOnce && entry.isIntersecting) {
          hasTriggeredRef.current = true;
          observer.unobserve(element);
        }
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [elementRef, threshold, root, rootMargin, triggerOnce]);

  return { isIntersecting, entry };
}

/**
 * Hook to track visibility of multiple elements
 *
 * Usage:
 * ```tsx
 * const refs = [useRef(), useRef(), useRef()];
 * const visibilityMap = useIntersectionObserverMultiple(refs);
 *
 * refs.forEach((ref, index) => {
 *   logger.info(`Element ${index} is ${visibilityMap.get(ref.current) ? 'visible' : 'hidden'}`);
 * });
 * ```
 */
export function useIntersectionObserverMultiple<T extends HTMLElement = HTMLElement>(
  elementRefs: RefObject<T>[],
  options: IntersectionObserverInit = {}
): Map<T, boolean> {
  const { root = null, rootMargin = '0px', threshold = 0 } = options;
  const [visibilityMap, setVisibilityMap] = useState<Map<T, boolean>>(new Map());
  // Depend on primitive option values (not the options object, which is a fresh
  // {} every render) and the ref count. Previously [elementRefs, options] made
  // the effect reconnect the observer on every render — callers typically pass a
  // new array/options literal each time.
  const thresholdKey = JSON.stringify(threshold);

  useEffect(() => {
    const elements = elementRefs.map((ref) => ref.current).filter(Boolean) as T[];

    if (elements.length === 0 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      setVisibilityMap((prev) => {
        const newMap = new Map(prev);
        entries.forEach((entry) => {
          newMap.set(entry.target as T, entry.isIntersecting);
        });
        return newMap;
      });
    }, { root, rootMargin, threshold });

    elements.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
    };
    // elementRefs is intentionally excluded (fresh array each render). Callers
    // whose element SET changes without changing the count should memoize refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, rootMargin, thresholdKey, elementRefs.length]);

  return visibilityMap;
}

/**
 * Simple hook that returns true when element is visible
 *
 * Usage:
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const isVisible = useIsVisible(ref);
 *
 * return <div ref={ref}>{isVisible && <HeavyComponent />}</div>;
 * ```
 */
export function useIsVisible<T extends HTMLElement = HTMLElement>(
  elementRef: RefObject<T>,
  options?: UseIntersectionObserverOptions
): boolean {
  const { isIntersecting } = useIntersectionObserver(elementRef, options);
  return isIntersecting;
}
