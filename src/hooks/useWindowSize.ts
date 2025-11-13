import { useState, useEffect } from 'react';

export interface WindowSize {
  width: number;
  height: number;
}

/**
 * Hook to track window dimensions
 *
 * Usage:
 * ```tsx
 * const { width, height } = useWindowSize();
 *
 * return (
 *   <div>
 *     Window is {width}px wide and {height}px tall
 *     {width < 768 && <MobileLayout />}
 *     {width >= 768 && <DesktopLayout />}
 *   </div>
 * );
 * ```
 */
export function useWindowSize(): WindowSize {
  const [windowSize, setWindowSize] = useState<WindowSize>(() => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
}

/**
 * Debounced version of useWindowSize to reduce re-renders
 *
 * Usage:
 * ```tsx
 * const { width, height } = useWindowSizeDebounced(200);
 * ```
 */
export function useWindowSizeDebounced(delay: number = 200): WindowSize {
  const [windowSize, setWindowSize] = useState<WindowSize>(() => {
    if (typeof window === 'undefined') {
      return { width: 0, height: 0 };
    }
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, delay);
    };

    window.addEventListener('resize', handleResize);

    // Initial call
    handleResize();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [delay]);

  return windowSize;
}

/**
 * Hook to check if window width is within a range
 *
 * Usage:
 * ```tsx
 * const isMobile = useWindowWidthRange(0, 768);
 * const isTablet = useWindowWidthRange(769, 1024);
 * ```
 */
export function useWindowWidthRange(min: number, max: number): boolean {
  const { width } = useWindowSize();
  return width >= min && width <= max;
}

/**
 * Hook to check if window is portrait or landscape
 *
 * Usage:
 * ```tsx
 * const orientation = useWindowOrientation();
 *
 * return (
 *   <div>
 *     Current orientation: {orientation}
 *     {orientation === 'portrait' && <PortraitLayout />}
 *     {orientation === 'landscape' && <LandscapeLayout />}
 *   </div>
 * );
 * ```
 */
export function useWindowOrientation(): 'portrait' | 'landscape' {
  const { width, height } = useWindowSize();
  return width > height ? 'landscape' : 'portrait';
}
