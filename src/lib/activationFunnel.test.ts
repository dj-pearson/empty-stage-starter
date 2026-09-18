import { describe, it, expect, beforeEach, vi } from 'vitest';

const trackFunnelEvent = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/conversion-tracking', async () => {
  const actual = await vi.importActual<typeof import('@/lib/conversion-tracking')>(
    '@/lib/conversion-tracking',
  );
  return { ...actual, trackFunnelEvent: (...a: unknown[]) => trackFunnelEvent(...a) };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  ACTIVATION_STORAGE_KEY,
  forgetActivation,
  hasFired,
  readFired,
  trackActivationOnce,
  withFired,
} from './activationFunnel';

beforeEach(() => {
  localStorage.clear();
  trackFunnelEvent.mockClear();
});

describe('the once-per-user decision', () => {
  it('is false for a user who has fired nothing', () => {
    expect(hasFired({}, 'u1', 'food_added')).toBe(false);
  });

  it('does not confuse one user with another', () => {
    const fired = withFired({}, 'u1', 'food_added');
    expect(hasFired(fired, 'u1', 'food_added')).toBe(true);
    expect(hasFired(fired, 'u2', 'food_added')).toBe(false);
  });

  it('does not confuse one event with another', () => {
    const fired = withFired({}, 'u1', 'food_added');
    expect(hasFired(fired, 'u1', 'meal_planned')).toBe(false);
  });

  it('leaves other users untouched when marking one', () => {
    const before = withFired({}, 'u2', 'child_created');
    const after = withFired(before, 'u1', 'food_added');
    expect(after.u2).toEqual(['child_created']);
    expect(after.u1).toEqual(['food_added']);
  });

  it('is a no-op the second time, and does not grow the list', () => {
    const once = withFired({}, 'u1', 'food_added');
    expect(withFired(once, 'u1', 'food_added')).toBe(once);
  });
});

describe('reading the marker back', () => {
  it('reads an empty record when nothing was stored', () => {
    expect(readFired()).toEqual({});
  });

  it('reads unparseable storage as empty, so the event fires again rather than being lost', () => {
    localStorage.setItem(ACTIVATION_STORAGE_KEY, '{ not json');
    expect(readFired()).toEqual({});
  });

  it('reads a non-object as empty', () => {
    localStorage.setItem(ACTIVATION_STORAGE_KEY, '["an","array"]');
    expect(readFired()).toEqual({});
  });

  it('keeps the users it can read when one entry is malformed', () => {
    localStorage.setItem(
      ACTIVATION_STORAGE_KEY,
      JSON.stringify({ u1: ['food_added'], u2: 'not an array', u3: ['meal_planned', 7] }),
    );
    expect(readFired()).toEqual({ u1: ['food_added'], u3: ['meal_planned'] });
  });
});

describe('trackActivationOnce', () => {
  it('emits the first time and stays quiet afterwards', () => {
    expect(trackActivationOnce('food_added', 'u1')).toBe(true);
    expect(trackActivationOnce('food_added', 'u1')).toBe(false);
    expect(trackActivationOnce('food_added', 'u1')).toBe(false);

    expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith('food_added', undefined);
  });

  it('survives a reload, because the marker is the storage and not a module variable', () => {
    trackActivationOnce('meal_planned', 'u1');
    trackFunnelEvent.mockClear();

    // Same storage, fresh read -- which is what a new page load does.
    expect(hasFired(readFired(), 'u1', 'meal_planned')).toBe(true);
    expect(trackActivationOnce('meal_planned', 'u1')).toBe(false);
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it('gives a second account on the same device its own first time', () => {
    expect(trackActivationOnce('child_created', 'u1')).toBe(true);
    expect(trackActivationOnce('child_created', 'u2')).toBe(true);
    expect(trackFunnelEvent).toHaveBeenCalledTimes(2);
  });

  it('passes the event data through', () => {
    trackActivationOnce('food_added', 'u1', { category: 'dairy' });
    expect(trackFunnelEvent).toHaveBeenCalledWith('food_added', { category: 'dairy' });
  });

  it('does nothing without a user, because an unattributable activation cannot be joined', () => {
    // This is the whole reason the funnel is in Supabase rather than GA4.
    expect(trackActivationOnce('food_added', null)).toBe(false);
    expect(trackActivationOnce('food_added', undefined)).toBe(false);
    expect(trackActivationOnce('food_added', '')).toBe(false);
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it('still emits when storage refuses to remember, rather than swallowing the event', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    try {
      expect(trackActivationOnce('food_added', 'u1')).toBe(true);
      expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it('forgets one user without touching the others', () => {
    trackActivationOnce('food_added', 'u1');
    trackActivationOnce('food_added', 'u2');
    forgetActivation('u1');

    const fired = readFired();
    expect(fired.u1).toBeUndefined();
    expect(fired.u2).toEqual(['food_added']);
  });
});
