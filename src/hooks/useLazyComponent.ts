import { lazy, ComponentType, useEffect } from 'react';

/**
 * Enhanced lazy loading with preloading support
 *
 * Usage:
 * ```tsx
 * const HeavyComponent = lazyWithPreload(() => import('./HeavyComponent'));
 *
 * // Preload on hover
 * <button onMouseEnter={() => HeavyComponent.preload()}>
 *   Open Heavy Component
 * </button>
 * ```
 */
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  const Component = lazy(factory);
  let factoryPromise: Promise<{ default: T }> | undefined;

  const LazyComponent = Component as typeof Component & {
    preload: () => Promise<{ default: T }>;
  };

  LazyComponent.preload = () => {
    if (!factoryPromise) {
      factoryPromise = factory();
    }
    return factoryPromise;
  };

  return LazyComponent;
}

/**
 * Hook to preload a lazy component on mount or on demand
 *
 * Usage:
 * ```tsx
 * const HeavyComponent = lazyWithPreload(() => import('./HeavyComponent'));
 *
 * function MyComponent() {
 *   // Preload immediately on mount
 *   useLazyPreload(HeavyComponent);
 *
 *   // Or preload after delay
 *   useLazyPreload(HeavyComponent, { delay: 2000 });
 *
 *   return <Suspense><HeavyComponent /></Suspense>;
 * }
 * ```
 */
export function useLazyPreload<T extends ComponentType<any>>(
  Component: T & { preload?: () => Promise<any> },
  options: { delay?: number; enabled?: boolean } = {}
) {
  const { delay = 0, enabled = true } = options;

  useEffect(() => {
    if (!enabled || !Component.preload) return;

    let timeoutId: NodeJS.Timeout;

    if (delay > 0) {
      timeoutId = setTimeout(() => {
        Component.preload?.();
      }, delay);
    } else {
      Component.preload();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [Component, delay, enabled]);
}

/**
 * Hook to preload components on intersection (when entering viewport)
 *
 * Usage:
 * ```tsx
 * const HeavyComponent = lazyWithPreload(() => import('./HeavyComponent'));
 *
 * function MyComponent() {
 *   const ref = useLazyPreloadOnIntersect(HeavyComponent);
 *
 *   return <div ref={ref}>Scroll to load HeavyComponent</div>;
 * }
 * ```
 */
export function useLazyPreloadOnIntersect<T extends ComponentType<any>>(
  Component: T & { preload?: () => Promise<any> },
  options: IntersectionObserverInit = {}
) {
  const { threshold = 0.1, rootMargin = '50px', ...rest } = options;

  useEffect(() => {
    if (!Component.preload) return;

    let observer: IntersectionObserver;
    const element = document.querySelector('[data-lazy-preload]');

    if (element) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              Component.preload?.();
              observer.disconnect();
            }
          });
        },
        { threshold, rootMargin, ...rest }
      );

      observer.observe(element);
    }

    return () => {
      if (observer) observer.disconnect();
    };
  }, [Component, threshold, rootMargin]);
}

/**
 * Preload multiple components in sequence
 *
 * Usage:
 * ```tsx
 * const components = [
 *   lazyWithPreload(() => import('./Component1')),
 *   lazyWithPreload(() => import('./Component2')),
 *   lazyWithPreload(() => import('./Component3')),
 * ];
 *
 * // Preload all components
 * preloadComponents(components);
 * ```
 */
export async function preloadComponents(
  components: Array<{ preload?: () => Promise<any> }>,
  options: { sequential?: boolean; delay?: number } = {}
) {
  const { sequential = false, delay = 0 } = options;

  if (sequential) {
    // Preload one at a time
    for (const component of components) {
      if (component.preload) {
        await component.preload();
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  } else {
    // Preload all in parallel
    await Promise.all(
      components.map((component) => component.preload?.())
    );
  }
}

/**
 * Hook to preload components on idle (using requestIdleCallback)
 *
 * Usage:
 * ```tsx
 * const HeavyComponent = lazyWithPreload(() => import('./HeavyComponent'));
 *
 * function MyComponent() {
 *   useLazyPreloadOnIdle(HeavyComponent);
 *   return <div>Component will preload when browser is idle</div>;
 * }
 * ```
 */
export function useLazyPreloadOnIdle<T extends ComponentType<any>>(
  Component: T & { preload?: () => Promise<any> },
  options: { timeout?: number } = {}
) {
  const { timeout = 2000 } = options;

  useEffect(() => {
    if (!Component.preload) return;

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(
        () => {
          Component.preload?.();
        },
        { timeout }
      );

      return () => {
        window.cancelIdleCallback(id);
      };
    } else {
      const id = setTimeout(() => {
        Component.preload?.();
      }, timeout);

      return () => {
        clearTimeout(id);
      };
    }
  }, [Component, timeout]);
}
