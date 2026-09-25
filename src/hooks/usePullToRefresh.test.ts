/**
 * Pull-to-refresh must not take a downward swipe away from a page that is
 * scrolled. The pantry's container grows with its content, so its own
 * scrollTop is always 0; reading that is how a swipe back up the list used to
 * be swallowed by the pull.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { usePullToRefresh } from './usePullToRefresh';

function touch(type: string, clientY: number): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'touches', { value: [{ clientY }] });
  return event;
}

function setup(opts: { getScrollTop?: () => number } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const onRefresh = vi.fn(() => Promise.resolve());
  const hook = renderHook(() => {
    const result = usePullToRefresh({ onRefresh, ...opts });
    // Attach before the effect runs so its listeners land on the element.
    (result.pullToRefreshRef as { current: HTMLDivElement | null }).current = container;
    return result;
  });
  hook.rerender();
  return { container, hook, onRefresh };
}

/** Start a touch, pull 60px down, and return the move event. */
function pull(container: HTMLElement): TouchEvent {
  act(() => {
    container.dispatchEvent(touch('touchstart', 100));
  });
  const move = touch('touchmove', 160);
  act(() => {
    container.dispatchEvent(move);
  });
  return move;
}

describe('usePullToRefresh', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  it('leaves the touch alone when the window is scrolled down', () => {
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true, writable: true });
    const { container, hook } = setup({ getScrollTop: () => window.scrollY });
    const move = pull(container);
    expect(move.defaultPrevented).toBe(false);
    expect(hook.result.current.pullDistance).toBe(0);
  });

  it('takes the touch when the window is at the top', () => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    const { container, hook } = setup({ getScrollTop: () => window.scrollY });
    const move = pull(container);
    expect(move.defaultPrevented).toBe(true);
    expect(hook.result.current.pullDistance).toBeGreaterThan(0);
  });

  it('re-checks at touchmove: a page scrolled after touchstart is not hijacked', () => {
    let scrollTop = 0;
    const { container } = setup({ getScrollTop: () => scrollTop });
    act(() => {
      container.dispatchEvent(touch('touchstart', 100));
    });
    scrollTop = 300;
    const move = touch('touchmove', 160);
    act(() => {
      container.dispatchEvent(move);
    });
    expect(move.defaultPrevented).toBe(false);
  });

  it('falls back to the document scroll when the container does not scroll', () => {
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true, writable: true });
    const scrolling = document.scrollingElement;
    const prev = scrolling ? scrolling.scrollTop : 0;
    if (scrolling) Object.defineProperty(scrolling, 'scrollTop', { value: 500, configurable: true });
    try {
      const { container } = setup();
      const move = pull(container);
      expect(move.defaultPrevented).toBe(false);
    } finally {
      if (scrolling) Object.defineProperty(scrolling, 'scrollTop', { value: prev, configurable: true });
    }
  });
});
