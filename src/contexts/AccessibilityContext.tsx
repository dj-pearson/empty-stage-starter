import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  // Load preferences from storage
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storage = await getStorage();
        const stored = await storage.getItem(STORAGE_KEY);

        if (stored) {
          const parsed = JSON.parse(stored);
          setPreferences(prev => ({ ...prev, ...parsed }));
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

        if (session?.user) {
          setUserId(session.user.id);

          const { data, error } = await supabase
            .from('user_accessibility_preferences')
            .select('*')
            .eq('user_id', session.user.id)
            .single();

          if (data && !error) {
            setPreferences(prev => ({
              ...prev,
              ...data.preferences,
            }));
          }
        }
      } catch (error) {
        // Silently fail - table might not exist yet
        logger.debug('Could not load accessibility preferences from Supabase:', error);
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
    if (isLoading) return;

    const savePreferences = async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(STORAGE_KEY, JSON.stringify(preferences));

        // Also save to Supabase if authenticated
        if (userId) {
          await supabase
            .from('user_accessibility_preferences')
            .upsert({
              user_id: userId,
              preferences,
              updated_at: new Date().toISOString(),
            });
        }
      } catch (error) {
        logger.error('Error saving accessibility preferences:', error);
      }
    };

    savePreferences();
  }, [preferences, userId, isLoading]);

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

    // Font size
    root.classList.remove('text-size-default', 'text-size-large', 'text-size-x-large');
    root.classList.add(`text-size-${preferences.fontSize}`);

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
