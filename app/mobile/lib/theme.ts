/**
 * EatPal Mobile Theme
 * Consistent design tokens matching the web app's Tailwind theme
 */

export const colors = {
  primary: '#10b981',
  primaryDark: '#059669',
  primaryLight: '#34d399',
  background: '#ffffff',
  backgroundDark: '#111827',
  surface: '#f9fafb',
  surfaceDark: '#1f2937',
  card: '#ffffff',
  cardDark: '#1f2937',
  text: '#111827',
  textDark: '#f9fafb',
  textSecondary: '#6b7280',
  textSecondaryDark: '#9ca3af',
  border: '#e5e7eb',
  borderDark: '#374151',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#10b981',
  info: '#3b82f6',
  tabInactive: '#9ca3af',
  tabActive: '#10b981',
  inputBackground: '#f3f4f6',
  inputBackgroundDark: '#374151',
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
