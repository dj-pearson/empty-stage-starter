import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from './useReducedMotion';

/**
 * US-821. The hook used to start at false and correct itself in an effect.
 * One render at the wrong value is enough: framer-motion reads its variants at
 * mount, so the dashboard's entrance animation played for people who had asked
 * for no motion, and the corrected value arrived after it had started.
 */
/**
 * Every test stubs matchMedia for itself and unstubs afterwards.
 *
 * This file used to have a sibling, useReducedMotion.test.ts, whose tests
 * leaned on the ambient window.matchMedia from src/test/setup.ts and installed
 * their own with vi.spyOn and no restore. Under --sequence.shuffle it failed 3
 * runs in 6, always on "returns false when prefers-reduced-motion is not set",
 * which inherited a matches:true stub from whichever test the shuffle put in
 * front of it. vi.restoreAllMocks() is NOT the fix and makes it worse: the
 * setup.ts global is a vi.fn() with an implementation rather than a spy over a
 * real function, so restoring it leaves matchMedia returning undefined and the
 * hook throws on `.matches`. Depending on no ambient state is the fix. The two
 * tests that sibling uniquely covered -- the change listener and its cleanup --
 * moved here.
 */
function stubMatchMedia(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const removeEventListener = vi.fn();
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener,
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => query));
  return {
    removeEventListener,
    /** Fire a system preference change at everyone listening. */
    change(next: boolean) {
      for (const cb of listeners) cb({ matches: next } as MediaQueryListEvent);
    },
  };
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

  it('follows the preference changing while the page is open', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.change(true));

    expect(result.current).toBe(true);
  });

  it('stops listening once the consumer unmounts', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());

    unmount();

    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
