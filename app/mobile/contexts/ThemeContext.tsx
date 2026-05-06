import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme, Appearance, type ColorSchemeName } from 'react-native';
import { safeStorage } from '@/lib/platform';
import { LIGHT_COLORS, DARK_COLORS, type AppColors } from '../lib/theme';

/**
 * US-129: theme provider for mobile.
 *
 * Three modes:
 *   - 'system' (default): follow `useColorScheme()` — flips when the OS
 *     theme changes mid-session.
 *   - 'light': force light regardless of OS.
 *   - 'dark':  force dark regardless of OS.
 *
 * Preference persists via `safeStorage` (web → localStorage; native →
 * expo-secure-store) under `eatpal.theme.mode`. The legacy
 * `eatpal.profile.darkMode` boolean from US-122 is migrated on first read.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY_MODE = 'eatpal.theme.mode';
const LEGACY_KEY_DARK = 'eatpal.profile.darkMode';

interface ThemeContextValue {
  mode: ThemeMode;
  /** Resolved scheme (honours system when mode === 'system'). */
  scheme: 'light' | 'dark';
  colors: AppColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(mode: ThemeMode, systemScheme: ColorSchemeName): 'light' | 'dark' {
  if (mode === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Hydrate from storage on mount; migrate legacy dark-mode boolean if present.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persisted = await safeStorage.getItem(STORAGE_KEY_MODE);
        if (cancelled) return;
        if (persisted === 'system' || persisted === 'light' || persisted === 'dark') {
          setModeState(persisted);
          return;
        }
        // No stored mode — check the legacy boolean.
        const legacy = await safeStorage.getItem(LEGACY_KEY_DARK);
        if (legacy !== null && !cancelled) {
          const migrated: ThemeMode = legacy === 'true' ? 'dark' : 'system';
          setModeState(migrated);
          await safeStorage.setItem(STORAGE_KEY_MODE, migrated);
        }
      } catch {
        // storage unavailable — fall back to default 'system'.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void safeStorage.setItem(STORAGE_KEY_MODE, next);
  }, []);

  // Listen to system changes in case useColorScheme is stale on some platforms.
  useEffect(() => {
    const sub = Appearance.addChangeListener(() => {
      // Re-render is driven by useColorScheme already; this listener is a
      // safety net for older RN versions that don't propagate immediately.
    });
    return () => sub?.remove?.();
  }, []);

  const scheme = resolveScheme(mode, systemScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      scheme,
      colors: scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS,
      setMode,
    }),
    [mode, scheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook for screens to read the active theme.
 * Falls back to LIGHT colours when no provider is mounted (e.g. running a
 * screen in isolation under a test renderer).
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return {
    mode: 'light',
    scheme: 'light',
    colors: LIGHT_COLORS,
    setMode: () => {},
  };
}
