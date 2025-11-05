import { useEffect, useRef, useState, useCallback } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // Distance in pixels to trigger refresh
  resistance?: number; // How much to slow down the pull (higher = more resistance)
  enabled?: boolean;
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
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const touchStartY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtTop = useRef<boolean>(true);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !enabled) return;

    setIsRefreshing(true);

    try {
      await onRefresh();
    } catch (error) {
      console.error('Pull to refresh error:', error);
    } finally {
      setIsRefreshing(false);
      setPullDistance(0);
    }
  }, [onRefresh, isRefreshing, enabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const checkScrollPosition = () => {
      isAtTop.current = container.scrollTop === 0;
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
      if (pullDistance >= threshold) {
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
  }, [pullDistance, threshold, handleRefresh, isRefreshing, enabled]);

  return {
    pullToRefreshRef: containerRef,
    isRefreshing,
    pullDistance,
    triggerRefresh: handleRefresh,
  };
}
