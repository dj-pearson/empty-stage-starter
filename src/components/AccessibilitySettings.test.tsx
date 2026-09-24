import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccessibilitySettings } from './AccessibilitySettings';
import { AccessibilityProvider } from '@/contexts/AccessibilityContext';

const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

function renderSettings(headless = true) {
  return render(
    <MemoryRouter>
      <AccessibilityProvider>
        <AccessibilitySettings headless={headless} />
      </AccessibilityProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  toastSuccess.mockReset();
});

describe('AccessibilitySettings', () => {
  it('headless drops the card header; the full page keeps it and links the statement', () => {
    const { unmount } = renderSettings(true);
    expect(screen.queryByText('Need help?')).toBeNull();
    unmount();
    renderSettings(false);
    expect(screen.getByText('Need help?')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Read the accessibility statement' }).getAttribute('href')).toBe(
      '/accessibility'
    );
  });

  it('renders the deep-link targets the hub registers', () => {
    renderSettings();
    for (const id of ['font-size', 'reduced-motion', 'high-contrast', 'dyslexia-font', 'screen-reader-mode', 'extended-timeouts']) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it('has no switch for preferences nothing reads', () => {
    renderSettings();
    expect(screen.queryByText(/autoplay/i)).toBeNull();
    expect(screen.queryByText(/verbose/i)).toBeNull();
    expect(screen.queryByRole('switch', { name: /^large text$/i })).toBeNull();
  });

  it('announces a toggle by its label and state, not its key', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(screen.getByRole('switch', { name: 'Keep messages on screen longer' }));
    const polite = document.getElementById('a11y-live-polite') as HTMLElement;
    await vi.waitFor(() => expect(polite.textContent).toBe('Keep messages on screen longer on'));
  });

  it('keeps the rest under More options, with the shortcuts reference always shown there', async () => {
    const user = userEvent.setup();
    renderSettings();
    expect(screen.queryByRole('switch', { name: 'Single-key shortcuts' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /more options/i }));
    const shortcuts = screen.getByRole('switch', { name: 'Single-key shortcuts' });
    await user.click(shortcuts);
    expect(shortcuts.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Keyboard shortcuts')).toBeTruthy();
    expect(screen.getByText('Single-key shortcuts are off.')).toBeTruthy();
  });

  it('says where it saves', () => {
    renderSettings();
    expect(screen.getByText('Saved on this device')).toBeTruthy();
  });

  it('reset toasts once with an Undo that restores the previous settings', async () => {
    const user = userEvent.setup();
    renderSettings();
    const quick = screen.getByRole('group', { name: 'Comfort settings' });
    await user.click(within(quick).getByRole('switch', { name: /easier-to-read font/i }));
    expect(document.documentElement.classList.contains('dyslexia-font')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(document.documentElement.classList.contains('dyslexia-font')).toBe(false);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    const [, options] = toastSuccess.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(options.action.label).toBe('Undo');

    await vi.waitFor(() => {
      options.action.onClick();
      expect(document.documentElement.classList.contains('dyslexia-font')).toBe(true);
    });
  });
});
