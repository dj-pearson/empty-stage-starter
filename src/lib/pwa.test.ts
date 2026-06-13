import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onOnlineStatusChange } from './pwa';

describe('onOnlineStatusChange', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes the exact listeners it added on cleanup (no leak)', () => {
    const cleanup = onOnlineStatusChange(() => {});

    const onlineHandler = addSpy.mock.calls.find(([type]) => type === 'online')?.[1];
    const offlineHandler = addSpy.mock.calls.find(([type]) => type === 'offline')?.[1];
    expect(onlineHandler).toBeTypeOf('function');
    expect(offlineHandler).toBeTypeOf('function');

    cleanup();

    // The SAME function references must be passed to removeEventListener,
    // otherwise the browser never removes them (the original bug).
    expect(removeSpy).toHaveBeenCalledWith('online', onlineHandler);
    expect(removeSpy).toHaveBeenCalledWith('offline', offlineHandler);
  });

  it('invokes the callback with the correct online state', () => {
    const cb = vi.fn();
    onOnlineStatusChange(cb);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    expect(cb).toHaveBeenCalledWith(true);
    expect(cb).toHaveBeenCalledWith(false);
  });
});
