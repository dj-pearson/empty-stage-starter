/**
 * Tests for MobileThemeProvider
 * Verifies light/dark mode toggling and color token correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReactNode } from 'react';

// Mock react-native before importing the provider
vi.mock('react-native', () => ({
  useColorScheme: vi.fn(() => 'light'),
  Appearance: {
    addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import { MobileThemeProvider, useTheme } from '../providers/MobileThemeProvider';

function wrapper({ children }: { children: ReactNode }) {
  return <MobileThemeProvider>{children}</MobileThemeProvider>;
}

describe('MobileThemeProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides light colors by default (system=light)', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.isDark).toBe(false);
    expect(result.current.colors.background).toBe('#ffffff');
    expect(result.current.colors.foreground).toBe('#09090b');
    expect(result.current.colors.primary).toBe('#10b981');
  });

  it('toggleTheme switches from light to dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.isDark).toBe(false);

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.isDark).toBe(true);
    expect(result.current.colors.background).toBe('#09090b');
    expect(result.current.colors.foreground).toBe('#fafafa');
  });

  it('setTheme("dark") switches to dark mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.isDark).toBe(true);
    expect(result.current.colors.card).toBe('#18181b');
  });

  it('setTheme("light") returns to light mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme('dark');
    });
    expect(result.current.isDark).toBe(true);

    act(() => {
      result.current.setTheme('light');
    });
    expect(result.current.isDark).toBe(false);
    expect(result.current.colors.background).toBe('#ffffff');
  });

  it('provides all expected color tokens', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    const { colors } = result.current;

    const expectedKeys = [
      'primary', 'primaryForeground', 'background', 'foreground',
      'card', 'cardForeground', 'muted', 'mutedForeground',
      'border', 'destructive', 'destructiveForeground',
      'success', 'successForeground', 'warning', 'warningForeground',
      'accent', 'accentForeground', 'input', 'ring',
    ];

    for (const key of expectedKeys) {
      expect(colors).toHaveProperty(key);
      expect(typeof (colors as Record<string, string>)[key]).toBe('string');
    }
  });
});
