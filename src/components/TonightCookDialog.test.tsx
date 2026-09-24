/**
 * TonightCookDialog: the optional Serving panel on the last step, and a timer
 * that is announced on start, pause and done instead of every second.
 */

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { TonightCookDialog } from './TonightCookDialog';
import type { KidPlate } from '@/lib/platePlanner';
import type { Recipe } from '@/types';

vi.mock('@/lib/analytics', () => ({ analytics: { trackEvent: vi.fn() } }));

const RECIPE: Recipe = {
  id: 'r1',
  name: 'Peanut noodles',
  food_ids: [],
  instructions: 'Boil the noodles.',
};

const SAUCE = {
  componentId: 'c-sauce',
  componentName: 'Sauce',
  placement: 'held_back' as const,
  reasons: [],
  separated: false,
};

const PLATES: KidPlate[] = [
  {
    kidId: 'k1',
    kidName: 'Ava',
    placements: [SAUCE],
    onPlate: [],
    separated: [],
    heldBack: [SAUCE],
    exposure: null,
    blocked: false,
    blockedBy: null,
    isEmpty: false,
  },
  {
    kidId: 'k2',
    kidName: 'Cal',
    placements: [SAUCE],
    onPlate: [],
    separated: [],
    heldBack: [SAUCE],
    exposure: null,
    blocked: true,
    blockedBy: {
      kind: 'severe_allergen',
      copyKind: 'severe',
      componentName: 'Sauce',
      foodName: 'Peanut sauce',
    },
    isEmpty: false,
  },
];

describe('TonightCookDialog', () => {
  it('renders the Serving panel naming the blocked kid when plates are passed', () => {
    render(<TonightCookDialog recipe={RECIPE} open onClose={vi.fn()} plates={PLATES} />);
    const panel = screen.getByTestId('tonight-cook-serving');
    expect(panel).toHaveTextContent('Serving');
    expect(panel).toHaveTextContent(/Not for Cal tonight/);
    expect(panel).toHaveTextContent('Ava');
  });

  it('has no Serving panel without the plates prop', () => {
    render(<TonightCookDialog recipe={RECIPE} open onClose={vi.fn()} />);
    expect(screen.queryByTestId('tonight-cook-serving')).toBeNull();
  });

  it('keeps aria-live off the ticking timer and announces start and pause', () => {
    vi.useFakeTimers();
    try {
      render(<TonightCookDialog recipe={RECIPE} open onClose={vi.fn()} />);
      const timer = screen.getByTestId('tonight-cook-timer');
      expect(timer).not.toHaveAttribute('aria-live');
      expect(timer.closest('[aria-live]')).toBeNull();

      const status = screen.getByRole('status');
      fireEvent.click(screen.getByRole('button', { name: 'Start 1 minute timer' }));
      expect(status).toHaveTextContent('1 minute timer started');

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(timer).toHaveTextContent('00:57');
      expect(status).toHaveTextContent('1 minute timer started');

      fireEvent.click(screen.getByRole('button', { name: 'Pause timer' }));
      expect(status).toHaveTextContent('Timer paused');
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces when the timer is done', () => {
    vi.useFakeTimers();
    try {
      render(<TonightCookDialog recipe={RECIPE} open onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Start 1 minute timer' }));
      act(() => {
        vi.advanceTimersByTime(61_000);
      });
      expect(screen.getByRole('status')).toHaveTextContent('Timer done');
    } finally {
      vi.useRealTimers();
    }
  });
});
