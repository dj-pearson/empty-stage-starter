/**
 * Centralized Loading Components
 *
 * Import all loading-related components from this file for convenience:
 *
 * ```tsx
 * import {
 *   LoadingFallback,
 *   Skeleton,
 *   RecipeCardSkeleton,
 *   CalendarSkeleton,
 *   GroceryListSkeleton,
 *   ListSkeleton,
 *   TableSkeleton,
 *   HeroSkeleton,
 *   SkeletonLoader,
 *   CardSkeleton,
 * } from '@/components/loading';
 * ```
 */

// Main loading fallback with spinner
export { LoadingFallback, SkeletonLoader, CardSkeleton } from '../LoadingFallback';

// Skeleton components for different UI patterns
export {
  Skeleton,
  RecipeCardSkeleton,
  GroceryListSkeleton,
  CalendarSkeleton,
  ListSkeleton,
  TableSkeleton,
} from '../LoadingSkeletons';

// Hero skeleton for landing page
export { HeroSkeleton } from '../HeroSkeleton';
