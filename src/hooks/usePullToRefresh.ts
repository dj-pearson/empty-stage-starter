import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from "@/lib/logger";

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Distance in pixels to trigger refresh
  resistance?: number; // How much to slow down the pull (higher = more resistance)
  enabled?: boolean;
  /**
   * How far the page is scrolled. A pull only starts, and only takes over the
   * touch, when this reads 0. Defaults to the container's own scrollTop when
   * the container actually scrolls, else the document's: a container that
   * grows with its content always reads 0, which is how a pull used to hijack
   * every downward swipe halfway down the pantry.
   */
  getScrollTop?: () => number;
}

function defaultScrollTop(container: HTMLElement): number {
  if (container.scrollHeight > container.clientHeight) return container.scrollTop;
  if (typeof document !== 'undefined' && document.scrollingElement) {
    return document.scrollingElement.scrollTop;
  }
  return typeof window !== 'undefined' ? window.scrollY : 0;
}

/**
 * Hook to implement pull-to-refresh functionality on mobile
 *
 * Usage:
 * const { pullToRefreshRef, isRefreshing, pullDistance } = usePullToRefresh({
 *   onRefresh: async () => {
 *     await fetchData();
 *   }
 * });
 *
 * return (
 *   <div ref={pullToRefreshRef}>
 *     {isRefreshing && <LoadingSpinner />}
 *     <Content />
 *   </div>
 * );
 */
export function usePullToRefresh(options: PullToRefreshOptions) {
  const {
    onRefresh,
    threshold = 80,
    resistance = 2.5,
    enabled = true,
    getScrollTop,
  } = options;

  // Read through a ref so a new inline getter each render does not re-run the
  // listener effect.
  const getScrollTopRef = useRef(getScrollTop);
  getScrollTopRef.current = getScrollTop;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistanceState] = useState(0);

  const touchStartY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtTop = useRef<boolean>(true);
  // Mirror pullDistance in a ref so the touch-listener effect can read the
  // latest value without depending on it. Depending on pullDistance re-ran the
  // effect (removing + re-adding all four listeners) on every pixel of the pull,
  // which could drop the gesture mid-drag.
  const pullDistanceRef = useRef(0);
  const setPullDistance = useCallback((value: number) => {
    pullDistanceRef.current = value;
    setPullDistanceState(value);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !enabled) return;

    setIsRefreshing(true);

    try {
      await onRefresh();
    } catch (error) {
      logger.error('Pull to refresh error:', error);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh, isRefreshing, enabled, setPullDistance]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const readScrollTop = () =>
      getScrollTopRef.current ? getScrollTopRef.current() : defaultScrollTop(container);

    const checkScrollPosition = () => {
      isAtTop.current = readScrollTop() <= 0;
    };

    const handleTouchStart = (e: TouchEvent) => {
      checkScrollPosition();
      if (isAtTop.current && !isRefreshing) {
        touchStartY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isAtTop.current || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = currentY.current - touchStartY.current;

      if (distance > 0) {
        // The page may have scrolled since touchstart (momentum, or a swipe
        // that started up and turned down). Re-check before taking the touch.
        if (readScrollTop() > 0) {
          isAtTop.current = false;
          setPullDistance(0);
          return;
        }
        // Apply resistance to make it feel natural
        const resistedDistance = distance / resistance;
        setPullDistance(Math.min(resistedDistance, threshold * 1.5));

        // Prevent default if pulling down
        if (distance > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (pullDistanceRef.current >= threshold) {
        handleRefresh();
      } else {
        setPullDistance(0);
      }

      touchStartY.current = 0;
      currentY.current = 0;
    };

    container.addEventListener('scroll', checkScrollPosition, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('scroll', checkScrollPosition);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [threshold, resistance, handleRefresh, isRefreshing, enabled, setPullDistance]);

  return {
    pullToRefreshRef: containerRef,
    isRefreshing,
    pullDistance,
    triggerRefresh: handleRefresh,
  };
}
