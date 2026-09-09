import { useEffect, useState } from 'react';

/**
 * Hook to detect if user prefers reduced motion
 * Respects system accessibility preferences (prefers-reduced-motion)
 * Critical for WCAG 2.1 Level AA compliance
 */
export function useReducedMotion() {
  /**
   * Read synchronously on the FIRST render, not in the effect (US-821).
   *
   * This used to be useState(false) with the real value arriving in the
   * effect below, so every consumer rendered once believing there was no
   * preference. One render is all it takes: framer-motion reads its variants
   * at mount, so the dashboard captured `hidden: { opacity: 0 }` and animated
   * in anyway -- the entrance this hook exists to suppress ran, and the
   * corrected value arrived too late to stop it. The elements carried an
   * inline `opacity: 0` while the fade played, which is also why an axe scan
   * of the dashboard measured text against a half-transparent card.
   *
   * matchMedia is available synchronously in a browser. The guard is for the
   * prerender pass, which has no window and should assume no preference.
   */
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    // Same guard as the initial read. Without it the hook throws wherever
    // matchMedia is absent, which the initial read alone does not cover.
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
    // Fallback for older browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, []);
  
  return prefersReducedMotion;
}

