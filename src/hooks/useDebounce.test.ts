import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebounce, useDebouncedCallback } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  it('should debounce value changes', { timeout: 10000 }, async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 500 },
      }
    );

    expect(result.current).toBe('initial');

    // Update value
    rerender({ value: 'updated', delay: 500 });

    // Value should still be initial before delay
    expect(result.current).toBe('initial');

    // Fast-forward time
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Now value should be updated
    await waitFor(() => {
      expect(result.current).toBe('updated');
    });
  }, { timeout: 10000 });

  it('should cancel previous timeout on rapid changes', { timeout: 10000 }, async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      {
        initialProps: { value: 'first' },
      }
    );

    expect(result.current).toBe('first');

    // Rapid changes
    rerender({ value: 'second' });
    rerender({ value: 'third' });
    rerender({ value: 'fourth' });

    // Should still be initial
    expect(result.current).toBe('first');

    // Fast-forward full delay from last change
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Should be the last value
    await waitFor(() => {
      expect(result.current).toBe('fourth');
    });
  }, { timeout: 10000 });

  it('should work with different data types', { timeout: 10000 }, async () => {
    // Test with number
    const { result: numberResult, rerender: numberRerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 0 } }
    );

    numberRerender({ value: 42 });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(numberResult.current).toBe(42);
    });

    // Test with object
    const { result: objectResult, rerender: objectRerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: { name: 'initial' } } }
    );

    const newValue = { name: 'updated' };
    objectRerender({ value: newValue });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(objectResult.current).toEqual(newValue);
    });
  }, { timeout: 10000 });

  it('should respect custom delay', async () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      {
        initialProps: { value: 'initial', delay: 1000 },
      }
    );

    rerender({ value: 'updated', delay: 1000 });

    // Should not update after 500ms
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(result.current).toBe('initial');

    // Should update after 1000ms
    act(() => {
      vi.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(result.current).toBe('updated');
    });
  });
});

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should debounce callback execution', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    // Call the debounced function
    act(() => {
      result.current('test');
    });

    // Callback should not be called immediately
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward time
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Now callback should be called
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('test');
  });

  it('should cancel previous callback on rapid calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    // Rapid calls
    act(() => {
      result.current('first');
      result.current('second');
      result.current('third');
    });

    // Callback should not be called yet
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward full delay
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Should only be called once with last argument
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });

  it('should handle multiple arguments', () => {
    const callback = vi.fn();
    const { result } = renderHook(() =>
      useDebouncedCallback((a: string, b: number, c: boolean) => callback(a, b, c), 500)
    );

    act(() => {
      result.current('test', 42, true);
    });

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(callback).toHaveBeenCalledWith('test', 42, true);
  });

  it('should cleanup timeout on unmount', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current('test');
    });

    // Unmount before timeout completes
    unmount();

    // Fast-forward time
    act(() => {
      vi.runOnlyPendingTimers();
    });

    // Callback should not be called after unmount
    expect(callback).not.toHaveBeenCalled();
  });
});
