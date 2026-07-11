import { useEffect, useRef, RefObject } from 'react';

/**
 * Hook to detect clicks outside of an element
 *
 * Usage:
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const [isOpen, setIsOpen] = useState(false);
 *
 * useClickOutside(ref, () => {
 *   setIsOpen(false);
 * });
 *
 * return (
 *   <div ref={ref}>
 *     {isOpen && <Dropdown />}
 *   </div>
 * );
 * ```
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
): void {
  // US-543: keep the (often inline) handler in a ref so the listeners aren't
  // torn down and re-added on every render — the effect depends only on
  // [ref, enabled] now.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref?.current;

      // Do nothing if clicking ref's element or descendent elements
      if (!el || el.contains(event.target as Node)) {
        return;
      }

      handlerRef.current(event);
    };

    // Use capture phase to ensure we detect clicks before other handlers
    document.addEventListener('mousedown', listener, true);
    document.addEventListener('touchstart', listener, true);

    return () => {
      document.removeEventListener('mousedown', listener, true);
      document.removeEventListener('touchstart', listener, true);
    };
  }, [ref, enabled]);
}

/**
 * Hook to detect clicks outside of multiple elements
 *
 * Usage:
 * ```tsx
 * const dropdownRef = useRef<HTMLDivElement>(null);
 * const buttonRef = useRef<HTMLButtonElement>(null);
 *
 * useClickOutsideMultiple([dropdownRef, buttonRef], () => {
 *   setIsOpen(false);
 * });
 * ```
 */
export function useClickOutsideMultiple<T extends HTMLElement = HTMLElement>(
  refs: RefObject<T>[],
  handler: (event: MouseEvent | TouchEvent) => void,
  enabled: boolean = true
): void {
  // US-543: handler in a ref so listeners aren't re-added every render. NOTE:
  // callers should pass a memoized `refs` array (e.g. useMemo) — a fresh array
  // literal each render still re-runs this effect by identity.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const listener = (event: MouseEvent | TouchEvent) => {
      // Check if click is inside any of the refs
      const clickedInside = refs.some((ref) => {
        const el = ref?.current;
        return el && el.contains(event.target as Node);
      });

      // If clicked outside all refs, call handler
      if (!clickedInside) {
        handlerRef.current(event);
      }
    };

    document.addEventListener('mousedown', listener, true);
    document.addEventListener('touchstart', listener, true);

    return () => {
      document.removeEventListener('mousedown', listener, true);
      document.removeEventListener('touchstart', listener, true);
    };
  }, [refs, enabled]);
}
