import { useEffect, useRef, useState } from 'react';
import { safeStorage } from '@/lib/platform';

/**
 * Persisted UI filter/search/sort state — the "recall" fix.
 *
 * Every mobile list screen previously re-derived its search box, filters and
 * sort from scratch on mount, so leaving a tab and coming back (or relaunching)
 * wiped whatever you had set. This hook hydrates the state from `safeStorage`
 * once on mount and writes it back (debounced) whenever it changes, keyed per
 * screen (e.g. `eatpal.mobile.recipes.filters`).
 *
 * Stored values are shallow-merged over `defaults`, so adding a new filter
 * field in a later release safely picks up its default instead of `undefined`.
 */
export function usePersistedFilters<T extends object>(
  storageKey: string,
  defaults: T
): {
  filters: T;
  setFilters: React.Dispatch<React.SetStateAction<T>>;
  hydrated: boolean;
} {
  const [filters, setFilters] = useState<T>(defaults);
  const [hydrated, setHydrated] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate once from storage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await safeStorage.getItem(storageKey);
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as Partial<T>;
          if (parsed && typeof parsed === 'object') {
            setFilters((prev) => ({ ...prev, ...parsed }));
          }
        }
      } catch {
        // Corrupt/unavailable storage → fall back to defaults silently.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // storageKey is stable per screen; defaults intentionally excluded.
  }, [storageKey]);

  // Debounced write-through after hydration (avoid clobbering stored value
  // with the initial defaults before we've read it).
  useEffect(() => {
    if (!hydrated) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      void safeStorage.setItem(storageKey, JSON.stringify(filters));
    }, 300);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [filters, hydrated, storageKey]);

  return { filters, setFilters, hydrated };
}
