import { createContext, useContext } from 'react';

/**
 * The accessibility context object and its types, with no dependencies.
 *
 * AccessibilityContext.tsx owns the provider (and with it the Supabase client);
 * this module owns only the React context. useReducedMotion reads the context
 * from here so that roughly forty animated components do not import the
 * Supabase client through it, and so a test that mocks
 * '@/contexts/AccessibilityContext' does not also strip the reduced-motion
 * hook of the context it reads.
 */

// A type alias, not an interface: aliases get an implicit index signature, so
// the object is assignable to Supabase's Json column type without a cast.
export type AccessibilityPreferences = {
  // Motion and Animation
  reducedMotion: boolean; // Reduce or disable animations

  // Visual
  highContrast: boolean; // Enhanced color contrast
  /**
   * Kept for older clients, which read and write it. Derived on write as
   * `fontSize !== 'default'`; `fontSize` is the source of truth.
   */
  largeText: boolean;
  fontSize: 'default' | 'large' | 'x-large'; // Granular font size control

  // Screen Reader
  /** Stored key kept; in the UI this is "move focus to the page heading on navigation". */
  screenReaderMode: boolean;
  announcePageChanges: boolean; // Announce route changes
  /** No consumer; kept so the stored JSON round-trips for older clients. */
  verboseDescriptions: boolean;

  // Keyboard
  enhancedFocus: boolean; // More visible focus indicators
  keyboardShortcuts: boolean; // Single-key dashboard shortcuts

  // Timing
  extendedTimeouts: boolean; // Toasts stay on screen longer (App.tsx)
  /** No consumer; kept so the stored JSON round-trips for older clients. */
  disableAutoplay: boolean;

  // Cognitive
  simplifiedUI: boolean; // Flatter look: no shadows or gradients
  dyslexiaFont: boolean; // Use dyslexia-friendly font
};

export type AnnouncePriority = 'polite' | 'assertive';

export interface AccessibilityContextType {
  preferences: AccessibilityPreferences;
  updatePreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  updatePreferences: (updates: Partial<AccessibilityPreferences>) => void;
  /**
   * Back to defaults, keeping what the operating system asks for (reduced
   * motion, high contrast). Returns the preferences it replaced, so the caller
   * can offer an Undo with updatePreferences(previous).
   */
  resetPreferences: () => AccessibilityPreferences;
  isLoading: boolean;
  /** True when a user is signed in, so a change is saved to their account and not only this device. */
  syncsToAccount: boolean;

  // Screen reader announcements
  announce: (message: string, priority?: AnnouncePriority) => void;

  // Utility functions
  shouldReduceMotion: () => boolean;
  shouldUseHighContrast: () => boolean;
  getFontSizeClass: () => string;
}

export const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

/**
 * The context, or undefined outside the provider. Never throws, so the
 * prerender pass and provider-less tests can call it.
 */
export function useOptionalAccessibility(): AccessibilityContextType | undefined {
  return useContext(AccessibilityContext);
}
