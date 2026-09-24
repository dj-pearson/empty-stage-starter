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
 * A touch that starts this close to either screen edge belongs to the OS
 * (iOS back-swipe, Android edge gestures), not to us. Reacting to it moved
 * the planner a day at the same moment the browser navigated back.
 */
export const SWIPE_EDGE_GUARD_PX = 20;

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
  // Callers pass fresh closures on every render. Listeners read them through
  // a ref so they are bound once per element instead of being torn down and
  // re-added on each render (which also dropped a gesture in flight).
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const active = useRef(false);
  const moved = useRef(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const reset = () => {
      active.current = false;
      moved.current = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Pinch and two-finger scroll are not swipes.
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      const t = e.touches[0];
      const width = window.innerWidth || document.documentElement.clientWidth || 0;
      if (t.clientX < SWIPE_EDGE_GUARD_PX || (width > 0 && t.clientX > width - SWIPE_EDGE_GUARD_PX)) {
        reset();
        return;
      }
      touchStartX.current = t.clientX;
      touchStartY.current = t.clientY;
      touchStartTime.current = Date.now();
      active.current = true;
      moved.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      moved.current = true;
      const { threshold = 50, preventDefaultTouchmoveEvent = false } = optionsRef.current;
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
      // A touchend with no single-finger start and no movement in between is
      // a tap, a cancelled pinch, or a synthetic pair of events. A zero-time
      // "swipe" used to divide by zero and fire on Infinity velocity.
      const wasSwipe = active.current && moved.current;
      reset();
      if (!wasSwipe) return;

      const {
        onSwipeLeft,
        onSwipeRight,
        onSwipeUp,
        onSwipeDown,
        threshold = 50,
        velocityThreshold = 0.3,
      } = optionsRef.current;

      const deltaX = e.changedTouches[0].clientX - touchStartX.current;
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      const deltaTime = Math.max(Date.now() - touchStartTime.current, 1);

      // Calculate velocity (pixels per millisecond)
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const velocityX = absX / deltaTime;
      const velocityY = absY / deltaTime;

      if (absX > absY) {
        if (absX > threshold && velocityX > velocityThreshold) {
          if (deltaX > 0) onSwipeRight?.();
          else onSwipeLeft?.();
        }
      } else if (absY > threshold && velocityY > velocityThreshold) {
        if (deltaY > 0) onSwipeDown?.();
        else onSwipeUp?.();
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', reset);
    };
  }, []);

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
