import { useState, useEffect, useCallback, Dispatch, SetStateAction } from 'react';

/**
 * Persist state in localStorage with automatic sync
 *
 * Usage:
 * ```tsx
 * const [name, setName] = useLocalStorage('userName', 'Guest');
 *
 * // Works like useState but persists to localStorage
 * <input value={name} onChange={(e) => setName(e.target.value)} />
 * ```
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when value changes
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      try {
        // Use functional update to avoid stale closure issues
        setStoredValue((prev) => {
          const valueToStore = value instanceof Function ? value(prev) : value;

          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          }

          return valueToStore;
        });
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key]
  );

  // Remove value from localStorage
  const removeValue = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
        setStoredValue(initialValue);
      }
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // Listen for changes in other tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch (error) {
          console.error(`Error parsing localStorage key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return [storedValue, setValue, removeValue];
}

/**
 * Session storage variant (clears on tab close)
 *
 * Usage:
 * ```tsx
 * const [formData, setFormData] = useSessionStorage('formData', {});
 * ```
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error loading sessionStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value) => {
      try {
        // Use functional update to avoid stale closure issues
        setStoredValue((prev) => {
          const valueToStore = value instanceof Function ? value(prev) : value;

          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
          }

          return valueToStore;
        });
      } catch (error) {
        console.error(`Error setting sessionStorage key "${key}":`, error);
      }
    },
    [key]
  );

  const removeValue = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(key);
        setStoredValue(initialValue);
      }
    } catch (error) {
      console.error(`Error removing sessionStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

/**
 * Hook to check if a value exists in localStorage
 *
 * Usage:
 * ```tsx
 * const hasSeenWelcome = useLocalStorageValue('hasSeenWelcome');
 *
 * {!hasSeenWelcome && <WelcomeModal />}
 * ```
 */
export function useLocalStorageValue(key: string): boolean {
  const [exists, setExists] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.localStorage.getItem(key) !== null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        setExists(e.newValue !== null);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return exists;
}
