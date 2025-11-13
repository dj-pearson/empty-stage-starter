import { useEffect, useCallback, RefObject } from 'react';

/**
 * Keyboard navigation handler for arrow keys
 *
 * Useful for custom dropdowns, menus, and list navigation
 *
 * Usage:
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * useKeyboardNavigation(containerRef, {
 *   onEscape: () => setIsOpen(false),
 *   onEnter: (index) => selectItem(index),
 * });
 * ```
 */
export interface KeyboardNavigationOptions {
  /**
   * Selector for focusable items within the container
   * @default 'button, [role="menuitem"], [role="option"], a'
   */
  itemSelector?: string;
  /**
   * Enable arrow key navigation
   * @default true
   */
  enableArrowKeys?: boolean;
  /**
   * Enable Home/End keys to jump to first/last item
   * @default true
   */
  enableHomeEnd?: boolean;
  /**
   * Wrap focus when reaching first/last item
   * @default true
   */
  wrap?: boolean;
  /**
   * Callback when Escape key is pressed
   */
  onEscape?: () => void;
  /**
   * Callback when Enter key is pressed
   * @param index - Index of currently focused item
   */
  onEnter?: (index: number) => void;
  /**
   * Callback when Space key is pressed
   * @param index - Index of currently focused item
   */
  onSpace?: (index: number) => void;
}

export function useKeyboardNavigation(
  containerRef: RefObject<HTMLElement>,
  options: KeyboardNavigationOptions = {}
) {
  const {
    itemSelector = 'button, [role="menuitem"], [role="option"], a',
    enableArrowKeys = true,
    enableHomeEnd = true,
    wrap = true,
    onEscape,
    onEnter,
    onSpace,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!containerRef.current) return;

      const items = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(itemSelector)
      ).filter((item) => !item.hasAttribute('disabled'));

      if (items.length === 0) return;

      const currentIndex = items.findIndex((item) => item === document.activeElement);

      switch (event.key) {
        case 'ArrowDown':
          if (enableArrowKeys) {
            event.preventDefault();
            const nextIndex = currentIndex + 1;
            if (nextIndex < items.length) {
              items[nextIndex].focus();
            } else if (wrap) {
              items[0].focus();
            }
          }
          break;

        case 'ArrowUp':
          if (enableArrowKeys) {
            event.preventDefault();
            const prevIndex = currentIndex - 1;
            if (prevIndex >= 0) {
              items[prevIndex].focus();
            } else if (wrap) {
              items[items.length - 1].focus();
            }
          }
          break;

        case 'Home':
          if (enableHomeEnd) {
            event.preventDefault();
            items[0].focus();
          }
          break;

        case 'End':
          if (enableHomeEnd) {
            event.preventDefault();
            items[items.length - 1].focus();
          }
          break;

        case 'Escape':
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;

        case 'Enter':
          if (onEnter && currentIndex !== -1) {
            event.preventDefault();
            onEnter(currentIndex);
          }
          break;

        case ' ':
          if (onSpace && currentIndex !== -1) {
            event.preventDefault();
            onSpace(currentIndex);
          }
          break;
      }
    },
    [containerRef, itemSelector, enableArrowKeys, enableHomeEnd, wrap, onEscape, onEnter, onSpace]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, handleKeyDown]);
}

/**
 * Hook for escape key handling
 *
 * Usage:
 * ```tsx
 * useEscapeKey(() => setIsOpen(false), isOpen);
 * ```
 */
export function useEscapeKey(callback: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        callback();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [callback, enabled]);
}

/**
 * Hook for managing focus on mount and cleanup
 *
 * Usage:
 * ```tsx
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * useFocusOnMount(buttonRef);
 * ```
 */
export function useFocusOnMount(elementRef: RefObject<HTMLElement>, enabled: boolean = true) {
  useEffect(() => {
    if (enabled && elementRef.current) {
      // Small delay to ensure DOM is ready
      const timeoutId = setTimeout(() => {
        elementRef.current?.focus();
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [elementRef, enabled]);
}

/**
 * Hook for restoring focus to previous element
 *
 * Useful for modals and dialogs
 *
 * Usage:
 * ```tsx
 * useRestoreFocus(isOpen);
 * ```
 */
export function useRestoreFocus(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement;

    return () => {
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active]);
}

/**
 * Hook for managing roving tabindex in a list
 *
 * Only one item in the list is tabbable at a time (tabindex="0"),
 * others have tabindex="-1"
 *
 * Usage:
 * ```tsx
 * const { activeIndex, setActiveIndex } = useRovingTabIndex(items.length);
 * ```
 */
import { useState } from 'react';

export function useRovingTabIndex(itemCount: number, initialIndex: number = 0) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const getTabIndex = useCallback(
    (index: number) => {
      return index === activeIndex ? 0 : -1;
    },
    [activeIndex]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % itemCount);
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
          break;

        case 'Home':
          event.preventDefault();
          setActiveIndex(0);
          break;

        case 'End':
          event.preventDefault();
          setActiveIndex(itemCount - 1);
          break;
      }
    },
    [itemCount]
  );

  return {
    activeIndex,
    setActiveIndex,
    getTabIndex,
    handleKeyDown,
  };
}
