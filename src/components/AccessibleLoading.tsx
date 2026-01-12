import * as React from 'react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useScreenReaderAnnounce, useReducedMotionPreference } from '@/contexts/AccessibilityContext';
import { Loader2 } from 'lucide-react';

interface AccessibleLoadingProps {
  /** Whether the component is in a loading state */
  isLoading: boolean;
  /** The content to render when not loading */
  children: React.ReactNode;
  /** Loading message for screen readers */
  loadingMessage?: string;
  /** Completion message for screen readers */
  completedMessage?: string;
  /** Minimum time to show loading state (prevents flash) */
  minLoadingTime?: number;
  /** Custom loading indicator */
  loadingIndicator?: React.ReactNode;
  /** Additional className for the wrapper */
  className?: string;
  /** Render loading indicator inline with content */
  inline?: boolean;
  /** Size of the loading indicator */
  size?: 'sm' | 'md' | 'lg';
}

export function AccessibleLoading({
  isLoading,
  children,
  loadingMessage = 'Loading...',
  completedMessage = 'Content loaded',
  minLoadingTime = 0,
  loadingIndicator,
  className,
  inline = false,
  size = 'md',
}: AccessibleLoadingProps) {
  const announce = useScreenReaderAnnounce();
  const reducedMotion = useReducedMotionPreference();
  const [showLoading, setShowLoading] = React.useState(isLoading);
  const loadingStartTime = React.useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      loadingStartTime.current = Date.now();
      setShowLoading(true);
      announce(loadingMessage, 'polite');
    } else if (loadingStartTime.current) {
      const elapsed = Date.now() - loadingStartTime.current;
      const remaining = Math.max(0, minLoadingTime - elapsed);

      if (remaining > 0) {
        const timeout = setTimeout(() => {
          setShowLoading(false);
          announce(completedMessage, 'polite');
        }, remaining);
        return () => clearTimeout(timeout);
      } else {
        setShowLoading(false);
        announce(completedMessage, 'polite');
      }
    }
  }, [isLoading, loadingMessage, completedMessage, minLoadingTime, announce]);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  const defaultLoadingIndicator = (
    <div className={cn('flex items-center gap-2', inline && 'inline-flex')}>
      <Loader2
        className={cn(
          sizeClasses[size],
          !reducedMotion && 'animate-spin'
        )}
        aria-hidden="true"
      />
      <span className={reducedMotion ? '' : 'sr-only'}>{loadingMessage}</span>
    </div>
  );

  if (showLoading) {
    return (
      <div
        className={cn(
          'relative',
          !inline && 'flex items-center justify-center min-h-[100px]',
          className
        )}
        aria-busy="true"
        aria-live="polite"
        role="status"
      >
        {loadingIndicator || defaultLoadingIndicator}
      </div>
    );
  }

  return (
    <div className={className} aria-busy="false">
      {children}
    </div>
  );
}

/**
 * Skeleton loading placeholder for content
 */
interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  width,
  height,
  variant = 'rectangular',
  animation = 'pulse',
}: SkeletonProps) {
  const reducedMotion = useReducedMotionPreference();

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-md',
  };

  const animationClasses = {
    pulse: reducedMotion ? '' : 'animate-pulse',
    wave: reducedMotion ? '' : 'animate-pulse', // Simplified for accessibility
    none: '',
  };

  return (
    <div
      className={cn(
        'bg-muted',
        variantClasses[variant],
        animationClasses[animation],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Loading button with accessible state
 */
interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export function LoadingButton({
  isLoading,
  loadingText = 'Loading',
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  const reducedMotion = useReducedMotionPreference();

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2',
        'px-4 py-2 rounded-md',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2
            className={cn('h-4 w-4', !reducedMotion && 'animate-spin')}
            aria-hidden="true"
          />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Progress indicator with accessible announcements
 */
interface AccessibleProgressProps {
  value: number;
  max?: number;
  label: string;
  showValue?: boolean;
  className?: string;
  announceProgress?: boolean;
  announceInterval?: number;
}

export function AccessibleProgress({
  value,
  max = 100,
  label,
  showValue = true,
  className,
  announceProgress = true,
  announceInterval = 25,
}: AccessibleProgressProps) {
  const announce = useScreenReaderAnnounce();
  const lastAnnouncedRef = React.useRef<number>(0);
  const percentage = Math.round((value / max) * 100);

  useEffect(() => {
    if (announceProgress) {
      // Announce at intervals to avoid too many announcements
      const currentInterval = Math.floor(percentage / announceInterval);
      if (currentInterval > lastAnnouncedRef.current) {
        lastAnnouncedRef.current = currentInterval;
        announce(`${label}: ${percentage}% complete`, 'polite');
      }

      // Always announce completion
      if (percentage === 100 && lastAnnouncedRef.current !== 100) {
        lastAnnouncedRef.current = 100;
        announce(`${label}: Complete`, 'assertive');
      }
    }
  }, [percentage, label, announceProgress, announceInterval, announce]);

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex justify-between text-sm">
        <span id={`${label}-label`}>{label}</span>
        {showValue && (
          <span aria-hidden="true">{percentage}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-labelledby={`${label}-label`}
        aria-valuetext={`${percentage} percent`}
        className="h-2 bg-muted rounded-full overflow-hidden"
      >
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default AccessibleLoading;
