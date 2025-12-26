import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingFallbackProps {
  /** Optional loading message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether to take full screen height */
  fullScreen?: boolean;
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Screen reader label for accessibility */
  ariaLabel?: string;
}

/**
 * Loading fallback component for lazy-loaded components
 * Includes proper accessibility attributes for screen readers
 *
 * Usage:
 * ```tsx
 * <Suspense fallback={<LoadingFallback message="Loading page..." />}>
 *   <LazyComponent />
 * </Suspense>
 * ```
 */
export function LoadingFallback({
  message,
  className,
  fullScreen = true,
  size = 'md',
  ariaLabel = 'Loading content',
}: LoadingFallbackProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        fullScreen && 'min-h-screen',
        !fullScreen && 'min-h-[200px]',
        className
      )}
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <Loader2
        className={cn('animate-spin text-primary', sizeClasses[size])}
        aria-hidden="true"
      />
      {message && (
        <p className="text-sm text-muted-foreground animate-pulse" aria-live="polite">
          {message}
        </p>
      )}
      <span className="sr-only">{ariaLabel}, please wait...</span>
    </div>
  );
}

/**
 * Skeleton loader for content
 */
export function SkeletonLoader({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded"
          style={{ width: `${100 - i * 10}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Card skeleton for loading cards
 */
export function CardSkeleton() {
  return (
    <div className="border rounded-lg p-4 space-y-3 animate-pulse">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-4 bg-muted rounded w-1/2" />
      <div className="h-20 bg-muted rounded" />
    </div>
  );
}

// Re-export skeletons from LoadingSkeletons for convenience
export { TableSkeleton, ListSkeleton, CalendarSkeleton, GroceryListSkeleton, RecipeCardSkeleton, Skeleton } from './LoadingSkeletons';
