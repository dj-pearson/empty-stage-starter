/**
 * The accessibility provider's contract with the rest of the app:
 *
 * - Reset goes back to defaults without overriding the operating system, and
 *   hands back what it replaced so the settings page can offer Undo.
 * - fontSize is the source of truth for text size; largeText is derived from
 *   it on write (older clients read it) and honored on read (older clients
 *   wrote it).
 * - announce() speaks through two live regions that stay mounted, and a
 *   repeated message is spoken again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AccessibilityProvider, useAccessibility, type AccessibilityPreferences } from './AccessibilityContext';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

const STORAGE_KEY = 'accessibility-preferences';

const wrapper = ({ children }: { children: ReactNode }) => <AccessibilityProvider>{children}</AccessibilityProvider>;

async function renderProvider() {
  const hook = renderHook(() => useAccessibility(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

type MatchMediaImpl = (query: string) => MediaQueryList;
let originalMatchMedia: MatchMediaImpl;

function stubOs(matching: string[]) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as MatchMediaImpl;
}

beforeEach(() => {
  originalMatchMedia = window.matchMedia;
  localStorage.clear();
  document.documentElement.className = '';
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('resetPreferences', () => {
  it('keeps what the OS asks for, and returns the previous prefs so Undo can restore them', async () => {
    stubOs(['(prefers-reduced-motion: reduce)', '(prefers-contrast: high)']);
    const { result } = await renderProvider();

    // Detected on mount.
    expect(result.current.preferences.reducedMotion).toBe(true);
    expect(result.current.preferences.highContrast).toBe(true);

    act(() =>
      result.current.updatePreferences({
        reducedMotion: false,
        dyslexiaFont: true,
        fontSize: 'x-large',
        keyboardShortcuts: false,
      })
    );
    const before: AccessibilityPreferences = result.current.preferences;

    let previous: AccessibilityPreferences | undefined;
    act(() => {
      previous = result.current.resetPreferences();
    });

    expect(previous).toEqual(before);
    // The raw defaults would have turned both of these off.
    expect(result.current.preferences.reducedMotion).toBe(true);
    expect(result.current.preferences.highContrast).toBe(true);
    // Everything else is back to default.
    expect(result.current.preferences.dyslexiaFont).toBe(false);
    expect(result.current.preferences.fontSize).toBe('default');
    expect(result.current.preferences.largeText).toBe(false);
    expect(result.current.preferences.keyboardShortcuts).toBe(true);

    act(() => result.current.updatePreferences(previous as AccessibilityPreferences));
    expect(result.current.preferences).toEqual(before);
  });

  it('with no OS preference, reset turns motion and contrast off', async () => {
    const { result } = await renderProvider();
    act(() => result.current.updatePreferences({ reducedMotion: true, highContrast: true }));
    act(() => {
      result.current.resetPreferences();
    });
    expect(result.current.preferences.reducedMotion).toBe(false);
    expect(result.current.preferences.highContrast).toBe(false);
  });
});

describe('largeText / fontSize normalization', () => {
  it('reads an older row (largeText on, fontSize default) as large', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ largeText: true, fontSize: 'default' }));
    const { result } = await renderProvider();
    await waitFor(() => expect(result.current.preferences.fontSize).toBe('large'));
    expect(result.current.preferences.largeText).toBe(true);
    expect(document.documentElement.classList.contains('text-size-large')).toBe(true);
    expect(document.documentElement.classList.contains('text-size-default')).toBe(false);
  });

  it('reads a row with a size but no largeText as largeText on', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ largeText: false, fontSize: 'x-large' }));
    const { result } = await renderProvider();
    await waitFor(() => expect(result.current.preferences.fontSize).toBe('x-large'));
    expect(result.current.preferences.largeText).toBe(true);
  });

  it('falls back to default for a fontSize it does not know', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 'huge' }));
    const { result } = await renderProvider();
    await waitFor(() => expect(result.current.preferences.fontSize).toBe('default'));
  });

  it('derives largeText from fontSize on write, and saves both for older clients', async () => {
    const { result } = await renderProvider();

    act(() => result.current.updatePreference('fontSize', 'x-large'));
    expect(result.current.preferences.largeText).toBe(true);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({ fontSize: 'x-large', largeText: true });
    });

    act(() => result.current.updatePreference('fontSize', 'default'));
    expect(result.current.preferences.largeText).toBe(false);
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(saved).toMatchObject({ fontSize: 'default', largeText: false });
    });
  });

  it('a caller that still sets only largeText moves fontSize with it', async () => {
    const { result } = await renderProvider();
    act(() => result.current.updatePreference('largeText', true));
    expect(result.current.preferences.fontSize).toBe('large');
    act(() => result.current.updatePreference('largeText', false));
    expect(result.current.preferences.fontSize).toBe('default');
  });

  it('keeps the stored keys older clients still send', async () => {
    const { result } = await renderProvider();
    act(() => result.current.updatePreference('dyslexiaFont', true));
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(Object.keys(saved)).toEqual(
        expect.arrayContaining(['extendedTimeouts', 'disableAutoplay', 'verboseDescriptions', 'largeText'])
      );
    });
  });
});

describe('announce()', () => {
  it('writes into a persistent polite region, and a repeated message fires again', async () => {
    const { result } = await renderProvider();
    const polite = document.getElementById('a11y-live-polite');
    expect(polite).not.toBeNull();
    expect(polite?.getAttribute('aria-live')).toBe('polite');

    act(() => result.current.announce('Saved'));
    await waitFor(() => expect(polite?.textContent).toBe('Saved'));

    // The same text again: cleared first, so screen readers see a change.
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(polite?.textContent ?? ''));
    observer.observe(polite as HTMLElement, { childList: true, characterData: true, subtree: true });

    act(() => result.current.announce('Saved'));
    expect(polite?.textContent).toBe('');
    await waitFor(() => expect(polite?.textContent).toBe('Saved'));
    observer.disconnect();
    expect(seen).toContain('');
    expect(seen[seen.length - 1]).toBe('Saved');

    // Same node the whole time: nothing is created or removed per message.
    expect(document.getElementById('a11y-live-polite')).toBe(polite);
  });

  it('sends assertive messages to their own region', async () => {
    const { result } = await renderProvider();
    const assertive = document.getElementById('a11y-live-assertive');
    const polite = document.getElementById('a11y-live-polite');
    act(() => result.current.announce('Could not save', 'assertive'));
    await waitFor(() => expect(assertive?.textContent).toBe('Could not save'));
    expect(polite?.textContent).toBe('');
    expect(document.querySelectorAll('[aria-live]').length).toBe(2);
  });
});

describe('classes on <html>', () => {
  it('toggles each preference class on and off', async () => {
    const { result } = await renderProvider();
    const root = document.documentElement;
    act(() => result.current.updatePreferences({ dyslexiaFont: true, simplifiedUI: true, enhancedFocus: true }));
    expect(root.classList.contains('dyslexia-font')).toBe(true);
    expect(root.classList.contains('simplified-ui')).toBe(true);
    expect(root.classList.contains('enhanced-focus')).toBe(true);
    act(() => result.current.updatePreferences({ dyslexiaFont: false, simplifiedUI: false, enhancedFocus: false }));
    expect(root.classList.contains('dyslexia-font')).toBe(false);
    expect(root.classList.contains('simplified-ui')).toBe(false);
    expect(root.classList.contains('enhanced-focus')).toBe(false);
  });
});
