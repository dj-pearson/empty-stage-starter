import { useState, useEffect } from 'react';

/**
 * Hook to detect if user is on desktop (width >= 1024px)
 * Used to conditionally render performance-intensive 3D features
 */
export function useIsDesktop(minWidth: number = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const checkIsDesktop = () => {
      setIsDesktop(window.innerWidth >= minWidth);
    };

    // Check on mount
    checkIsDesktop();

    // Check on resize
    window.addEventListener('resize', checkIsDesktop);
    return () => window.removeEventListener('resize', checkIsDesktop);
  }, [minWidth]);

  return isDesktop;
}

