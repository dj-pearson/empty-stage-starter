/**
 * Barrel export for all custom hooks
 *
 * Usage:
 * ```tsx
 * import { useDebounce, useLocalStorage, useMediaQuery } from '@/hooks';
 * ```
 */

// Debouncing
export { useDebounce, useDebouncedCallback } from './useDebounce';

// Storage
export { useLocalStorage, useSessionStorage, useLocalStorageValue } from './useLocalStorage';

// Media Queries & Responsive
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsLargeDesktop,
  usePrefersReducedMotion,
  usePrefersDarkMode,
  usePrefersHighContrast,
} from './useMediaQuery';

// Window Size
export {
  useWindowSize,
  useWindowSizeDebounced,
  useWindowWidthRange,
  useWindowOrientation,
} from './useWindowSize';

// Click Outside
export { useClickOutside, useClickOutsideMultiple } from './useClickOutside';

// Intersection Observer
export {
  useIntersectionObserver,
  useIntersectionObserverMultiple,
  useIsVisible,
} from './useIntersectionObserver';

// Lazy Loading
export {
  lazyWithPreload,
  useLazyPreload,
  useLazyPreloadOnIntersect,
  useLazyPreloadOnIdle,
  preloadComponents,
} from './useLazyComponent';

// Mobile Optimizations
export {
  useMobileOptimizations,
  useOptimizedSettings,
  useMobileDocumentOptimizations,
  useHapticFeedback,
  useNetworkStatus,
} from './useMobileOptimizations';

// Keyboard Navigation & Accessibility
export {
  useKeyboardNavigation,
  useEscapeKey,
  useFocusOnMount,
  useRestoreFocus,
  useRovingTabIndex,
} from './useKeyboardNavigation';

// Async Operations
export { useAsync, useFetch, usePoll, useRetry } from './useAsync';

// Common Patterns
export {
  useCopyToClipboard,
  useIdle,
  useOnline,
  usePrevious,
  useToggle,
  useCounter,
  useArray,
  useSet,
  useMap,
  useInterval,
  useTimeout,
  useIntervalUpdate,
} from './useCommon';

// Feature Flags & Limits
export { useFeatureFlag, useFeatureFlags } from './useFeatureFlag';
export { useFeatureLimit } from './useFeatureLimit';

// Re-export types
export type { WindowSize } from './useWindowSize';
export type { UseIntersectionObserverOptions } from './useIntersectionObserver';
export type { MobileInfo } from './useMobileOptimizations';
export type { KeyboardNavigationOptions } from './useKeyboardNavigation';
export type { AsyncState } from './useAsync';
