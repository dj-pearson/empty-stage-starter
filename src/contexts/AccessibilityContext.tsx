import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getStorage } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

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

export interface AccessibilityPreferences {
  // Motion and Animation
  reducedMotion: boolean; // Reduce or disable animations

  // Visual
  highContrast: boolean; // Enhanced color contrast
  largeText: boolean; // Larger font sizes
  fontSize: 'default' | 'large' | 'x-large'; // Granular font size control

  // Screen Reader
  screenReaderMode: boolean; // Optimize for screen readers
  announcePageChanges: boolean; // Announce route changes
  verboseDescriptions: boolean; // More detailed ARIA descriptions

  // Keyboard
  enhancedFocus: boolean; // More visible focus indicators
  keyboardShortcuts: boolean; // Enable keyboard shortcuts

  // Timing
  extendedTimeouts: boolean; // Longer timeouts for interactions
  disableAutoplay: boolean; // Disable auto-playing media

  // Cognitive
  simplifiedUI: boolean; // Reduce visual complexity
  dyslexiaFont: boolean; // Use dyslexia-friendly font
}

interface AccessibilityContextType {
  preferences: AccessibilityPreferences;
  updatePreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  updatePreferences: (updates: Partial<AccessibilityPreferences>) => void;
  resetPreferences: () => void;
  isLoading: boolean;

  // Screen reader announcements
  announce: (message: string, priority?: 'polite' | 'assertive') => void;

  // Utility functions
  shouldReduceMotion: () => boolean;
  shouldUseHighContrast: () => boolean;
  getFontSizeClass: () => string;
}

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

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

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
    const detectSystemPreferences = () => {
      const updates: Partial<AccessibilityPreferences> = {};

      // Detect reduced motion preference
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        updates.reducedMotion = true;
      }

      // Detect high contrast preference
      if (window.matchMedia('(prefers-contrast: high)').matches) {
        updates.highContrast = true;
      }

      // Detect forced colors (Windows High Contrast Mode)
      if (window.matchMedia('(forced-colors: active)').matches) {
        updates.highContrast = true;
      }

      return updates;
    };

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
          const parsed = JSON.parse(stored);
          setPreferences(prev => {
            const merged = { ...prev, ...parsed };
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
              const merged = { ...prev, ...data.preferences };
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

    // Reduced motion
    if (preferences.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // High contrast
    if (preferences.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // Font size. `largeText` is a quick boolean shortcut to the "large" size;
    // the granular `fontSize` control wins when it is set above default.
    const effectiveFontSize =
      preferences.fontSize === 'default' && preferences.largeText ? 'large' : preferences.fontSize;
    root.classList.remove('text-size-default', 'text-size-large', 'text-size-x-large');
    root.classList.add(`text-size-${effectiveFontSize}`);

    // Simplified UI — reduces visual complexity (hides decorative elements,
    // flattens shadows/gradients) via CSS in index.css.
    if (preferences.simplifiedUI) {
      root.classList.add('simplified-ui');
    } else {
      root.classList.remove('simplified-ui');
    }

    // Verbose descriptions — class hook that reveals supplementary helper text
    // marked with [data-a11y-verbose] (see index.css).
    if (preferences.verboseDescriptions) {
      root.classList.add('verbose-descriptions');
    } else {
      root.classList.remove('verbose-descriptions');
    }

    // Enhanced focus
    if (preferences.enhancedFocus) {
      root.classList.add('enhanced-focus');
    } else {
      root.classList.remove('enhanced-focus');
    }

    // Dyslexia font
    if (preferences.dyslexiaFont) {
      root.classList.add('dyslexia-font');
    } else {
      root.classList.remove('dyslexia-font');
    }

    // Screen reader mode
    if (preferences.screenReaderMode) {
      root.classList.add('screen-reader-optimized');
    } else {
      root.classList.remove('screen-reader-optimized');
    }
  }, [preferences]);

  const updatePreference = useCallback(<K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  const updatePreferences = useCallback((updates: Partial<AccessibilityPreferences>) => {
    setPreferences(prev => ({ ...prev, ...updates }));
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', priority === 'assertive' ? 'alert' : 'status');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;

    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => {
      if (document.body.contains(announcement)) {
        document.body.removeChild(announcement);
      }
    }, 1000);
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

  return (
    <AccessibilityContext.Provider
      value={{
        preferences,
        updatePreference,
        updatePreferences,
        resetPreferences,
        isLoading,
        announce,
        shouldReduceMotion,
        shouldUseHighContrast,
        getFontSizeClass,
      }}
    >
      {children}
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
