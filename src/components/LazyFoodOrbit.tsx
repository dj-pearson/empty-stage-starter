import { lazy, Suspense } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The floating-food hero (US-772).
 *
 * This used to branch: a CSS version on phones and under reduced motion, and a
 * react-three-fiber scene on desktops above 1280px. The 3D branch cost 824KB of
 * JavaScript -- vendor-three-core at 665KB plus vendor-three-eco at 159KB -- to
 * float six emoji and four translucent shapes behind a headline. VisibleFoodOrbit
 * already did the same job in CSS, for every phone visitor, and nobody had
 * reported the phone hero as the lesser one.
 *
 * So the branch is gone and the CSS version is the hero. @react-three/fiber was
 * also pinned at a 9.0.0-beta in production dependencies, which is its own
 * reason not to keep it for decoration.
 *
 * VisibleFoodOrbit handles reduced motion itself by delegating to
 * VisibleFoodFallback; the check here keeps the still frame from paying for the
 * animated chunk at all.
 */
const VisibleFoodOrbit = lazy(() =>
  import('@/components/VisibleFoodOrbit').then((module) => ({
    default: module.VisibleFoodOrbit,
  }))
);

const VisibleFoodFallback = lazy(() =>
  import('@/components/VisibleFoodOrbit').then((module) => ({
    default: module.VisibleFoodFallback,
  }))
);

export function LazyFoodOrbit({ className = '' }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Suspense fallback={<div className={className} />}>
      {shouldReduceMotion ? (
        <VisibleFoodFallback className={className} />
      ) : (
        <VisibleFoodOrbit className={className} />
      )}
    </Suspense>
  );
}
