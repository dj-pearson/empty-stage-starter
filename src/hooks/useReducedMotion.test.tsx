import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

/**
 * US-821. The hook used to start at false and correct itself in an effect.
 * One render at the wrong value is enough: framer-motion reads its variants at
 * mount, so the dashboard's entrance animation played for people who had asked
 * for no motion, and the corrected value arrived after it had started.
 */
function stubMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('reports the preference on the very first render', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    // Not "eventually true" -- true before any effect has run, because the
    // animation it gates has already been configured by then.
    expect(result.current).toBe(true);
  });

  it('reports no preference when none is set', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('assumes no preference when matchMedia is missing', () => {
    // The prerender pass runs without a window.
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
