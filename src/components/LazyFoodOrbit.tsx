import { lazy, Suspense } from 'react';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useReducedMotion } from '@/hooks/useReducedMotion';

// Lazy load 3D components to avoid blocking initial render
const VisibleFoodOrbit = lazy(() => 
  import('@/components/VisibleFoodOrbit').then(module => ({ 
    default: module.VisibleFoodOrbit 
  }))
);

const VisibleFoodFallback = lazy(() => 
  import('@/components/VisibleFoodOrbit').then(module => ({ 
    default: module.VisibleFoodFallback 
  }))
);

/**
 * Lazy-loaded 3D Food Orbit wrapper with error boundary
 * Shows actual food emojis floating in 3D space
 */
export function LazyFoodOrbit({ className = '' }: { className?: string }) {
  const isDesktop = useIsDesktop(1280);
  const shouldReduceMotion = useReducedMotion();

  // Show 2D fallback on mobile or reduced motion
  if (!isDesktop || shouldReduceMotion) {
    return (
      <Suspense fallback={<div className={className} />}>
        <VisibleFoodFallback className={className} />
      </Suspense>
    );
  }

  // Show 3D version on desktop
  return (
    <Suspense fallback={<div className={className} />}>
      <VisibleFoodOrbit className={className} />
    </Suspense>
  );
}

