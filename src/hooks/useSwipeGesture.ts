import { useEffect, useRef } from 'react';

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Minimum distance in pixels to trigger swipe
  velocityThreshold?: number; // Minimum velocity to trigger swipe
  preventDefaultTouchmoveEvent?: boolean;
}

/**
 * Hook to detect swipe gestures on mobile devices
 *
 * Usage:
 * const ref = useSwipeGesture({
 *   onSwipeRight: () => navigate(-1), // Swipe right to go back
 *   onSwipeLeft: () => navigate(1),   // Swipe left to go forward
 * });
 *
 * return <div ref={ref}>Content</div>
 */
export function useSwipeGesture(options: SwipeGestureOptions) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    velocityThreshold = 0.3,
    preventDefaultTouchmoveEvent = false,
  } = options;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (preventDefaultTouchmoveEvent) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);

        // Only prevent default if horizontal swipe is more significant than vertical
        if (deltaX > deltaY && deltaX > threshold / 2) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX.current = e.changedTouches[0].clientX;
      touchEndY.current = e.changedTouches[0].clientY;

      const deltaX = touchEndX.current - touchStartX.current;
      const deltaY = touchEndY.current - touchStartY.current;
      const deltaTime = Date.now() - touchStartTime.current;

      // Calculate velocity (pixels per millisecond)
      const velocityX = Math.abs(deltaX) / deltaTime;
      const velocityY = Math.abs(deltaY) / deltaTime;

      // Determine if horizontal or vertical swipe is more dominant
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Check if swipe meets threshold and velocity requirements
      if (absX > absY) {
        // Horizontal swipe
        if (absX > threshold && velocityX > velocityThreshold) {
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        }
      } else {
        // Vertical swipe
        if (absY > threshold && velocityY > velocityThreshold) {
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }

      // Reset values
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
      touchStartTime.current = 0;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold,
    velocityThreshold,
    preventDefaultTouchmoveEvent,
  ]);

  return elementRef;
}

/**
 * Hook specifically for back navigation (swipe right to go back)
 *
 * Usage:
 * const ref = useSwipeBack(() => navigate(-1));
 * return <div ref={ref}>Content</div>
 */
export function useSwipeBack(onBack: () => void, enabled: boolean = true) {
  return useSwipeGesture({
    onSwipeRight: enabled ? onBack : undefined,
    threshold: 80, // Slightly higher threshold for back navigation
    preventDefaultTouchmoveEvent: true,
  });
}
