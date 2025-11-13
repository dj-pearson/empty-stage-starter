/**
 * Common React Hooks
 *
 * Collection of commonly used hooks for various UI patterns.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook for copying text to clipboard
 *
 * Usage:
 * ```tsx
 * const { copy, copied, error } = useCopyToClipboard();
 *
 * <button onClick={() => copy('Text to copy')}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </button>
 * ```
 */
export function useCopyToClipboard(resetDelay: number = 2000) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, resetDelay);
      } catch (err) {
        setError(err as Error);
        setCopied(false);
      }
    },
    [resetDelay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { copy, copied, error };
}

/**
 * Hook for detecting user idle state
 *
 * Usage:
 * ```tsx
 * const isIdle = useIdle(5000); // 5 seconds
 *
 * if (isIdle) {
 *   // Show "Are you still there?" message
 * }
 * ```
 */
export function useIdle(timeout: number = 60000): boolean {
  const [isIdle, setIsIdle] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleActivity = () => {
      setIsIdle(false);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, timeout);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

    events.forEach((event) => {
      document.addEventListener(event, handleActivity);
    });

    // Initial timeout
    handleActivity();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [timeout]);

  return isIdle;
}

/**
 * Hook for detecting online/offline status
 *
 * Usage:
 * ```tsx
 * const isOnline = useOnline();
 *
 * {!isOnline && <Alert>You are offline</Alert>}
 * ```
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook for previous value
 *
 * Usage:
 * ```tsx
 * const [count, setCount] = useState(0);
 * const previousCount = usePrevious(count);
 *
 * // count changed from {previousCount} to {count}
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Hook for toggle state
 *
 * Usage:
 * ```tsx
 * const [isOpen, toggle, setIsOpen] = useToggle(false);
 *
 * <button onClick={toggle}>Toggle</button>
 * <button onClick={() => setIsOpen(true)}>Open</button>
 * ```
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => {
    setValue((prev) => !prev);
  }, []);

  return [value, toggle, setValue];
}

/**
 * Hook for counter state
 *
 * Usage:
 * ```tsx
 * const { count, increment, decrement, reset, set } = useCounter(0, { min: 0, max: 10 });
 * ```
 */
export function useCounter(
  initialValue: number = 0,
  options: { min?: number; max?: number } = {}
) {
  const { min, max } = options;
  const [count, setCount] = useState(initialValue);

  const increment = useCallback(
    (amount: number = 1) => {
      setCount((prev) => {
        const newValue = prev + amount;
        if (max !== undefined && newValue > max) return max;
        return newValue;
      });
    },
    [max]
  );

  const decrement = useCallback(
    (amount: number = 1) => {
      setCount((prev) => {
        const newValue = prev - amount;
        if (min !== undefined && newValue < min) return min;
        return newValue;
      });
    },
    [min]
  );

  const reset = useCallback(() => {
    setCount(initialValue);
  }, [initialValue]);

  const set = useCallback(
    (value: number) => {
      if (min !== undefined && value < min) {
        setCount(min);
      } else if (max !== undefined && value > max) {
        setCount(max);
      } else {
        setCount(value);
      }
    },
    [min, max]
  );

  return { count, increment, decrement, reset, set };
}

/**
 * Hook for array state management
 *
 * Usage:
 * ```tsx
 * const { value, push, remove, filter, update, clear } = useArray([1, 2, 3]);
 * ```
 */
export function useArray<T>(initialValue: T[] = []) {
  const [value, setValue] = useState<T[]>(initialValue);

  const push = useCallback((item: T) => {
    setValue((prev) => [...prev, item]);
  }, []);

  const remove = useCallback((index: number) => {
    setValue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const filter = useCallback((callback: (item: T) => boolean) => {
    setValue((prev) => prev.filter(callback));
  }, []);

  const update = useCallback((index: number, newItem: T) => {
    setValue((prev) => prev.map((item, i) => (i === index ? newItem : item)));
  }, []);

  const clear = useCallback(() => {
    setValue([]);
  }, []);

  const set = useCallback((newValue: T[]) => {
    setValue(newValue);
  }, []);

  return {
    value,
    set,
    push,
    remove,
    filter,
    update,
    clear,
  };
}

/**
 * Hook for set state management
 *
 * Usage:
 * ```tsx
 * const { has, add, remove, toggle, clear } = useSet(new Set([1, 2, 3]));
 * ```
 */
export function useSet<T>(initialValue?: Set<T>) {
  const [set, setSet] = useState<Set<T>>(initialValue || new Set());

  const add = useCallback((item: T) => {
    setSet((prev) => new Set(prev).add(item));
  }, []);

  const remove = useCallback((item: T) => {
    setSet((prev) => {
      const newSet = new Set(prev);
      newSet.delete(item);
      return newSet;
    });
  }, []);

  const toggle = useCallback((item: T) => {
    setSet((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(item)) {
        newSet.delete(item);
      } else {
        newSet.add(item);
      }
      return newSet;
    });
  }, []);

  const clear = useCallback(() => {
    setSet(new Set());
  }, []);

  const has = useCallback((item: T) => set.has(item), [set]);

  return {
    set,
    has,
    add,
    remove,
    toggle,
    clear,
  };
}

/**
 * Hook for map state management
 *
 * Usage:
 * ```tsx
 * const { get, set, remove, clear } = useMap(new Map([['key', 'value']]));
 * ```
 */
export function useMap<K, V>(initialValue?: Map<K, V>) {
  const [map, setMap] = useState<Map<K, V>>(initialValue || new Map());

  const set = useCallback((key: K, value: V) => {
    setMap((prev) => new Map(prev).set(key, value));
  }, []);

  const remove = useCallback((key: K) => {
    setMap((prev) => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
  }, []);

  const clear = useCallback(() => {
    setMap(new Map());
  }, []);

  const get = useCallback((key: K) => map.get(key), [map]);

  const has = useCallback((key: K) => map.has(key), [map]);

  return {
    map,
    get,
    set,
    remove,
    clear,
    has,
  };
}

/**
 * Hook for interval
 *
 * Usage:
 * ```tsx
 * useInterval(() => {
 *   console.log('Every second');
 * }, 1000);
 * ```
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

/**
 * Hook for timeout
 *
 * Usage:
 * ```tsx
 * useTimeout(() => {
 *   console.log('After 3 seconds');
 * }, 3000);
 * ```
 */
export function useTimeout(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    const id = setTimeout(() => savedCallback.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
}

/**
 * Hook for updating state in intervals
 *
 * Usage:
 * ```tsx
 * const now = useIntervalUpdate(1000); // Updates every second
 * ```
 */
export function useIntervalUpdate(interval: number = 1000): number {
  const [tick, setTick] = useState(0);

  useInterval(() => {
    setTick((prev) => prev + 1);
  }, interval);

  return tick;
}
