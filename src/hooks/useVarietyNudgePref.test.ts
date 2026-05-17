import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const trackEvent = vi.fn();
vi.mock('@/lib/analytics', () => ({
  analytics: { trackEvent: (...args: unknown[]) => trackEvent(...args) },
}));

import { useVarietyNudgePref } from './useVarietyNudgePref';

describe('useVarietyNudgePref', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to ON when nothing is persisted', () => {
    const { result } = renderHook(() => useVarietyNudgePref());
    expect(result.current.enabled).toBe(true);
  });

  it('loads a persisted false value', () => {
    // @ts-ignore - localStorage is a vitest mock in setup
    localStorage.getItem.mockReturnValueOnce(JSON.stringify(false));
    const { result } = renderHook(() => useVarietyNudgePref());
    expect(result.current.enabled).toBe(false);
  });

  it('persists and fires variety_nudge_toggled telemetry on change', () => {
    const { result } = renderHook(() => useVarietyNudgePref());

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'eatpal.nudge_variety',
      JSON.stringify(false)
    );
    expect(trackEvent).toHaveBeenCalledWith('variety_nudge_toggled', { enabled: false });
  });

  it('toggles back ON and reports it', () => {
    const { result } = renderHook(() => useVarietyNudgePref());

    act(() => {
      result.current.setEnabled(false);
    });
    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(trackEvent).toHaveBeenLastCalledWith('variety_nudge_toggled', { enabled: true });
  });
});
