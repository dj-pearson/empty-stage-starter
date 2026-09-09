import { atLeast, below, between } from '@/lib/breakpoints';
import { useState, useEffect } from 'react';

/**
 * Hook to track media query matches
 *
 * Usage:
 * ```tsx
 * const isMobile = useMediaQuery('(max-width: 768px)');
 * const isDark = useMediaQuery('(prefers-color-scheme: dark)');
 * const isLandscape = useMediaQuery('(orientation: landscape)');
 *
 * return (
 *   <div>
 *     {isMobile ? <MobileNav /> : <DesktopNav />}
 *   </div>
 * );
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia(query);

    // Update matches state
    const updateMatches = (e: MediaQueryListEvent | MediaQueryList) => {
      setMatches(e.matches);
    };

    // Initial check
    updateMatches(mediaQuery);

    // Listen for changes
    // Use addEventListener if available, fallback to addListener for older browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateMatches);
      return () => mediaQuery.removeEventListener('change', updateMatches);
    } else {
      // @ts-ignore - for older browsers
      mediaQuery.addListener(updateMatches);
      // @ts-ignore
      return () => mediaQuery.removeListener(updateMatches);
    }
  }, [query]);

  return matches;
}

/**
 * Pre-configured breakpoint hooks
 */
// Derived from src/lib/breakpoints.ts so each one flips on the same pixel as
// the Tailwind prefix it corresponds to. They used to be hand-written and each
// was off by one against the stylesheet: mobile included 768px where `md:` had
// already gone desktop, desktop started at 1025px where `lg:` starts at 1024,
// and "large desktop" was 1440px, which is not a Tailwind breakpoint at all.
export const useIsMobile = () => useMediaQuery(below('md'));
export const useIsTablet = () => useMediaQuery(between('md', 'lg'));
export const useIsDesktop = () => useMediaQuery(atLeast('lg'));
export const useIsLargeDesktop = () => useMediaQuery(atLeast('xl'));

/**
 * Accessibility preference hooks
 */
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');
export const usePrefersDarkMode = () => useMediaQuery('(prefers-color-scheme: dark)');
export const usePrefersHighContrast = () => useMediaQuery('(prefers-contrast: high)');
