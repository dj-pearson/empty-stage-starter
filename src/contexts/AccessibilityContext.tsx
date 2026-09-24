import React, { useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getStorage } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  AccessibilityContext,
  useOptionalAccessibility,
  type AccessibilityPreferences,
  type AnnouncePriority,
} from './accessibilityContextCore';

export type { AccessibilityPreferences } from './accessibilityContextCore';
export { useOptionalAccessibility };

/**
 * Accessibility Preferences Context
 *
 * Provides user-configurable accessibility settings that persist across sessions.
 * Integrates with system preferences (prefers-reduced-motion, prefers-contrast)
 * and allows users to override or customize settings.
 *
 * WCAG 2.1 AA Compliance Features:
 * - Respects prefers-reduced-motion (WCAG 2.3.3)
 * - Supports high contrast modes (WCAG 1.4.3, 1.4.6)
 * - Configurable font sizes (WCAG 1.4.4)
 * - Screen reader optimization mode
 * - Keyboard navigation enhancements
 */

const STORAGE_KEY = 'accessibility-preferences';

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  reducedMotion: false,
  highContrast: false,
  largeText: false,
  fontSize: 'default',
  screenReaderMode: false,
  announcePageChanges: true,
  verboseDescriptions: false,
  enhancedFocus: false,
  keyboardShortcuts: true,
  extendedTimeouts: false,
  disableAutoplay: true,
  simplifiedUI: false,
  dyslexiaFont: false,
};

const FONT_SIZES: ReadonlyArray<AccessibilityPreferences['fontSize']> = ['default', 'large', 'x-large'];

/**
 * One shape for fontSize/largeText, whoever wrote the row.
 *
 * An older client (and the old quick widget) turned on `largeText` and left
 * `fontSize` at 'default'; the stylesheet treated that as large. So on read,
 * largeText with a default fontSize means 'large'. On write, largeText is
 * derived from fontSize, so an older client reading the row sees a value that
 * agrees with the size actually shown.
 */
function normalizePreferences(prefs: AccessibilityPreferences): AccessibilityPreferences {
  const size = FONT_SIZES.includes(prefs.fontSize) ? prefs.fontSize : 'default';
  const fontSize = size === 'default' && prefs.largeText === true ? 'large' : size;
  const largeText = fontSize !== 'default';
  if (fontSize === prefs.fontSize && largeText === prefs.largeText) return prefs;
  return { ...prefs, fontSize, largeText };
}

/**
 * Apply a partial update. A caller that sets only `largeText` (an older build
 * of a component, or a stored row) moves fontSize with it; otherwise fontSize
 * wins and largeText follows.
 */
function applyUpdates(
  prev: AccessibilityPreferences,
  updates: Partial<AccessibilityPreferences>
): AccessibilityPreferences {
  const next = { ...prev, ...updates };
  if (updates.largeText !== undefined && updates.fontSize === undefined) {
    next.fontSize = updates.largeText ? (prev.fontSize === 'default' ? 'large' : prev.fontSize) : 'default';
  }
  if (updates.fontSize !== undefined) next.largeText = updates.fontSize !== 'default';
  return normalizePreferences(next);
}

const mediaMatches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** What the operating system asks for. Only ever turns things on. */
function detectSystemPreferences(): Partial<AccessibilityPreferences> {
  const updates: Partial<AccessibilityPreferences> = {};
  if (mediaMatches('(prefers-reduced-motion: reduce)')) updates.reducedMotion = true;
  // prefers-contrast, or forced colors (Windows High Contrast Mode).
  if (mediaMatches('(prefers-contrast: high)') || mediaMatches('(forced-colors: active)')) {
    updates.highContrast = true;
  }
  return updates;
}

/** Preference -> class on <html>. The stylesheet (index.css) does the rest. */
const PREFERENCE_CLASSES: ReadonlyArray<[keyof AccessibilityPreferences, string]> = [
  ['reducedMotion', 'reduce-motion'],
  ['highContrast', 'high-contrast'],
  ['simplifiedUI', 'simplified-ui'],
  ['verboseDescriptions', 'verbose-descriptions'],
  ['enhancedFocus', 'enhanced-focus'],
  ['dyslexiaFont', 'dyslexia-font'],
  ['screenReaderMode', 'screen-reader-optimized'],
];

const nextFrame = (fn: () => void) => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(fn);
  } else {
    setTimeout(fn, 16);
  }
};

export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  /*
   * US-862: has the server been asked yet?
   *
   * The local read and the server read finish at different times, and the save
   * effect used to run between them -- so a page load wrote the localStorage
   * value up before the server's answer had arrived, and then wrote again once
   * it had. Saving is held until the server has answered (or until we know
   * there is nobody to ask), which is the same hydration guard AppContext uses
   * before it persists its own cache.
   */
  const [serverSettled, setServerSettled] = useState(false);

  // Detect system preferences on mount
  useEffect(() => {
    const systemPrefs = detectSystemPreferences();
    setPreferences(prev => ({ ...prev, ...systemPrefs }));
  }, []);

  // Listen for system preference changes
  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)');

    const handleReducedMotionChange = (e: MediaQueryListEvent) => {
      setPreferences(prev => ({ ...prev, reducedMotion: e.matches }));
    };

    const handleHighContrastChange = (e: MediaQueryListEvent) => {
      setPreferences(prev => ({ ...prev, highContrast: e.matches }));
    };

    reducedMotionQuery.addEventListener('change', handleReducedMotionChange);
    highContrastQuery.addEventListener('change', handleHighContrastChange);

    return () => {
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      highContrastQuery.removeEventListener('change', handleHighContrastChange);
    };
  }, []);

  /*
   * US-862: what has already been persisted, so loading does not write it back.
   *
   * The save effect below depends on `preferences`, and three separate things
   * set it during a single page load -- the system-preference probe, the
   * localStorage read, and the Supabase read. Each one re-ran the effect, so
   * every page view sent THREE upserts of an unchanged row, the third of them
   * writing the server's own answer straight back to the server. Measured on
   * the built app: 3 x POST /rest/v1/user_accessibility_preferences on every
   * authenticated route, before anything was clicked.
   *
   * Two things were wrong with that beyond the requests. updated_at was bumped
   * on every page load, so the column recorded when the row was last READ. And
   * writing the merge back makes a load a write: a local value the server did
   * not have was pushed up by whichever tab loaded last, which is the opposite
   * of the server-authoritative contract the rest of the app follows (US-341).
   *
   * `rememberPersisted` is called with the value a load produced, so that value
   * is never a change to save. A genuine edit still differs from it and still
   * saves.
   */
  const lastPersistedRef = useRef<string | null>(null);
  const rememberPersisted = useCallback((value: AccessibilityPreferences) => {
    lastPersistedRef.current = JSON.stringify(value);
  }, []);

  // Load preferences from storage
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storage = await getStorage();
        const stored = await storage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed: Partial<AccessibilityPreferences> = JSON.parse(stored);
          setPreferences(prev => {
            const merged = normalizePreferences({ ...prev, ...parsed });
            // Writing a ref inside the updater: deterministic, so running it
            // twice (StrictMode) produces the same value.
            rememberPersisted(merged);
            return merged;
          });
        }
      } catch (error) {
        logger.error('Error loading accessibility preferences:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  // Load from Supabase if user is authenticated
  useEffect(() => {
    const loadFromSupabase = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          // Nobody to ask. Local preferences are the whole truth, and saving
          // them is only a localStorage write.
          setServerSettled(true);
          return;
        }

        if (session?.user) {
          setUserId(session.user.id);

          const { data, error } = await supabase
            .from('user_accessibility_preferences')
            .select('*')
            .single();

          if (data && !error) {
            setPreferences(prev => {
              const merged = normalizePreferences({
                ...prev,
                ...(data.preferences as Partial<AccessibilityPreferences>),
              });
              rememberPersisted(merged);
              return merged;
            });
          }
        }
      } catch (error) {
        // Silently fail - table might not exist yet
        logger.debug('Could not load accessibility preferences from Supabase:', error);
      } finally {
        // Settled either way: a failed read must not hold saving forever.
        setServerSettled(true);
      }
    };

    loadFromSupabase();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserId(session.user.id);
        loadFromSupabase();
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Save preferences whenever they change
  useEffect(() => {
    if (isLoading || !serverSettled) return;

    const serialized = JSON.stringify(preferences);
    // Nothing changed since the last load or save. A page view is not an edit.
    if (serialized === lastPersistedRef.current) return;

    const savePreferences = async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(STORAGE_KEY, serialized);

        // Also save to Supabase if authenticated
        if (userId) {
          await supabase
            .from('user_accessibility_preferences')
            .upsert({
              user_id: userId,
              preferences,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id'
            });
        }
        lastPersistedRef.current = serialized;
      } catch (error) {
        // Deliberately NOT remembered on failure: a write that did not land
        // must be retried by the next change, not treated as persisted.
        logger.error('Error saving accessibility preferences:', error);
      }
    };

    savePreferences();
  }, [preferences, userId, isLoading, serverSettled, rememberPersisted]);

  // Apply CSS classes based on preferences
  useEffect(() => {
    const root = document.documentElement;
    for (const [key, className] of PREFERENCE_CLASSES) {
      root.classList.toggle(className, preferences[key] === true);
    }
    // fontSize is normalized, so a legacy largeText row already reads 'large'.
    for (const size of FONT_SIZES) {
      root.classList.toggle(`text-size-${size}`, preferences.fontSize === size);
    }
  }, [preferences]);

  // Read by resetPreferences, which must hand back what it replaced.
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const updatePreference = useCallback(<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => {
    const update: Partial<AccessibilityPreferences> = {};
    update[key] = value;
    setPreferences(prev => applyUpdates(prev, update));
  }, []);

  const updatePreferences = useCallback((updates: Partial<AccessibilityPreferences>) => {
    setPreferences(prev => applyUpdates(prev, updates));
  }, []);

  const resetPreferences = useCallback(() => {
    const previous = preferencesRef.current;
    // Defaults, but not over the operating system: someone whose OS asks for
    // reduced motion should not get animation back from a reset.
    setPreferences(normalizePreferences({ ...DEFAULT_PREFERENCES, ...detectSystemPreferences() }));
    return previous;
  }, []);

  /*
   * Two live regions that stay mounted for the provider's lifetime. A region
   * created at the moment of the message is often missed: screen readers watch
   * regions that exist, and a node added with its text already in place is not
   * a change to one. Clearing first and writing on the next frame also makes a
   * repeated message ("Saved", "Saved") a change, so it is spoken again.
   */
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string, priority: AnnouncePriority = 'polite') => {
    const region = priority === 'assertive' ? assertiveRef.current : politeRef.current;
    if (!region) return;
    region.textContent = '';
    nextFrame(() => {
      region.textContent = message;
    });
  }, []);

  const shouldReduceMotion = useCallback(() => {
    return preferences.reducedMotion;
  }, [preferences.reducedMotion]);

  const shouldUseHighContrast = useCallback(() => {
    return preferences.highContrast;
  }, [preferences.highContrast]);

  const getFontSizeClass = useCallback(() => {
    switch (preferences.fontSize) {
      case 'large':
        return 'text-lg';
      case 'x-large':
        return 'text-xl';
      default:
        return '';
    }
  }, [preferences.fontSize]);

  const value = useMemo(
    () => ({
      preferences,
      updatePreference,
      updatePreferences,
      resetPreferences,
      isLoading,
      syncsToAccount: userId !== null,
      announce,
      shouldReduceMotion,
      shouldUseHighContrast,
      getFontSizeClass,
    }),
    [
      preferences,
      updatePreference,
      updatePreferences,
      resetPreferences,
      isLoading,
      userId,
      announce,
      shouldReduceMotion,
      shouldUseHighContrast,
      getFontSizeClass,
    ]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
      <div
        ref={politeRef}
        id="a11y-live-polite"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        id="a11y-live-assertive"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}

/**
 * Hook to check if reduced motion is preferred
 * Combines system preference with user preference
 */
export function useReducedMotionPreference() {
  const { preferences } = useAccessibility();
  return preferences.reducedMotion;
}

/**
 * Hook to check if high contrast is preferred
 */
export function useHighContrastPreference() {
  const { preferences } = useAccessibility();
  return preferences.highContrast;
}

/**
 * Hook to announce messages to screen readers
 */
export function useScreenReaderAnnounce() {
  const { announce } = useAccessibility();
  return announce;
}
