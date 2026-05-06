/**
 * EatPal Mobile Theme
 * Consistent design tokens matching the web app's Tailwind theme.
 *
 * `colors` is the LIGHT palette — kept as the default export so existing call
 * sites continue to work without a sweeping refactor. For dark-mode-aware
 * screens, use `useTheme()` from `app/mobile/contexts/ThemeContext` which
 * returns `theme.colors` from either `LIGHT_COLORS` or `DARK_COLORS` based on
 * the user's preference + system color scheme.
 */

export const LIGHT_COLORS = {
  primary: '#10b981',
  primaryDark: '#059669',
  primaryLight: '#34d399',
  background: '#ffffff',
  surface: '#f9fafb',
  card: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  info: '#3b82f6',
  tabInactive: '#9ca3af',
  tabActive: '#10b981',
  inputBackground: '#f3f4f6',
} as const;

export const DARK_COLORS: typeof LIGHT_COLORS = {
  primary: '#10b981',
  primaryDark: '#059669',
  primaryLight: '#34d399',
  background: '#111827',
  surface: '#0f172a',
  card: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  border: '#374151',
  error: '#f87171',
  warning: '#fbbf24',
  success: '#34d399',
  info: '#60a5fa',
  tabInactive: '#6b7280',
  tabActive: '#34d399',
  inputBackground: '#374151',
};

export type AppColors = typeof LIGHT_COLORS;

/**
 * Backwards-compatible default: the LIGHT palette plus the historical dark-
 * suffixed token pairs (`backgroundDark`, `textDark`, etc.) so that any code
 * still spot-reading `colors.textDark` keeps working until it migrates to
 * `useTheme()`.
 */
export const colors = {
  ...LIGHT_COLORS,
  backgroundDark: DARK_COLORS.background,
  surfaceDark: DARK_COLORS.surface,
  cardDark: DARK_COLORS.card,
  textDark: DARK_COLORS.text,
  textSecondaryDark: DARK_COLORS.textSecondary,
  borderDark: DARK_COLORS.border,
  inputBackgroundDark: DARK_COLORS.inputBackground,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
