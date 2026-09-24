import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QuickLogProvider, useQuickLog, type QuickLogContextValue } from './QuickLogContext';

describe('QuickLogContext page actions', () => {
  it('registerPageAction sets pageAction and the returned unregister clears it', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QuickLogProvider openQuickLog={vi.fn()}>{children}</QuickLogProvider>
    );
    const { result } = renderHook(() => useQuickLog(), { wrapper });
    expect(result.current.pageAction).toBeNull();

    const run = vi.fn();
    let unregister = () => {};
    act(() => {
      unregister = result.current.registerPageAction({ label: 'Log a tasting', run });
    });
    expect(result.current.pageAction?.label).toBe('Log a tasting');
    result.current.pageAction?.run();
    expect(run).toHaveBeenCalledTimes(1);

    act(() => unregister());
    expect(result.current.pageAction).toBeNull();
  });

  it('a stale unregister does not clear a newer registration', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QuickLogProvider openQuickLog={vi.fn()}>{children}</QuickLogProvider>
    );
    const { result } = renderHook(() => useQuickLog(), { wrapper });
    let first = () => {};
    act(() => {
      first = result.current.registerPageAction({ label: 'A', run: vi.fn() });
    });
    act(() => {
      result.current.registerPageAction({ label: 'B', run: vi.fn() });
    });
    act(() => first());
    expect(result.current.pageAction?.label).toBe('B');
  });

  it('reports changes to a controlling shell', () => {
    const onChange = vi.fn();
    let ctx: QuickLogContextValue | null = null;
    function Probe() {
      ctx = useQuickLog();
      return null;
    }
    render(
      <QuickLogProvider openQuickLog={vi.fn()} pageAction={null} onPageActionChange={onChange}>
        <Probe />
      </QuickLogProvider>
    );
    const action = { label: 'Log a tasting', run: vi.fn() };
    let unregister = () => {};
    act(() => {
      unregister = ctx!.registerPageAction(action);
    });
    expect(onChange).toHaveBeenLastCalledWith(action);
    act(() => unregister());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('useQuickLog outside the provider stays a no-op', () => {
    const { result } = renderHook(() => useQuickLog());
    expect(result.current.pageAction).toBeNull();
    expect(() => result.current.openQuickLog()).not.toThrow();
    const unregister = result.current.registerPageAction({ label: 'x', run: vi.fn() });
    expect(() => unregister()).not.toThrow();
    expect(result.current.pageAction).toBeNull();
  });
});
