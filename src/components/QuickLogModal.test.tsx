import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
// The amount buttons render through react-i18next; without the real
// instance they would be labelled with their keys.
import '@/i18n';
import userEvent from '@testing-library/user-event';
import { QuickLogModal } from './QuickLogModal';

/**
 * US-812 / US-813.
 *
 * These assertions used to read QuickLogModal.tsx as text and grep it for
 * `disabled={isLoading || awaitingMealChoice}`, because rendering anything in
 * this repo died on "Cannot read properties of null (reading 'useState')" --
 * two React copies in node_modules, which is US-813. A grep for a disabled
 * prop passes just as happily when the button is never rendered at all, so it
 * was pinning the source rather than the behaviour. Now it renders.
 *
 * What is being pinned: the floating "Log Meal Result" action is on every
 * dashboard page with no meal in context, so the modal has to ask which meal
 * when there is a genuine choice, and must not let a result land on whichever
 * meal happened to be first.
 */

const meals = [
  { id: 'breakfast-1', label: 'breakfast - porridge' },
  { id: 'dinner-1', label: 'dinner - fish pie' },
];

function setup(props: Partial<React.ComponentProps<typeof QuickLogModal>> = {}) {
  const onLog = vi.fn();
  render(
    <QuickLogModal open onOpenChange={vi.fn()} onLog={onLog} {...props} />
  );
  return { onLog, user: userEvent.setup() };
}

const ateButton = () => screen.getByRole('button', { name: /Ate it!/ });

describe('the meal picker', () => {
  it('is not shown when the caller already knows the meal', () => {
    // The Home page opens this from a specific meal row and passes no meals.
    setup();
    expect(screen.queryByText('Which meal?')).not.toBeInTheDocument();
  });

  it('is not shown for a single planned meal', () => {
    setup({ meals: [meals[0]] });
    expect(screen.queryByText('Which meal?')).not.toBeInTheDocument();
  });

  it('offers a row per meal once there is a choice', () => {
    setup({ meals });
    expect(screen.getByText('Which meal?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'breakfast - porridge' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dinner - fish pie' })).toBeInTheDocument();
  });
});

describe('logging a result', () => {
  it('logs against the only planned meal without asking', async () => {
    const { onLog, user } = setup({ meals: [meals[0]] });

    await user.click(ateButton());

    expect(onLog).toHaveBeenCalledWith('ate', undefined, 'breakfast-1', undefined);
  });

  it('will not log until the user has said which meal', async () => {
    const { onLog, user } = setup({ meals });

    expect(ateButton()).toBeDisabled();
    await user.click(ateButton());

    expect(onLog).not.toHaveBeenCalled();
  });

  it('logs against the chosen meal, not the first one', async () => {
    const { onLog, user } = setup({ meals });

    await user.click(screen.getByRole('button', { name: 'dinner - fish pie' }));
    expect(ateButton()).toBeEnabled();
    await user.click(ateButton());

    expect(onLog).toHaveBeenCalledWith('ate', undefined, 'dinner-1', undefined);
  });

  it('marks the chosen meal for anyone not looking at the colour', async () => {
    const { user } = setup({ meals });
    const dinner = screen.getByRole('button', { name: 'dinner - fish pie' });

    expect(dinner).toHaveAttribute('aria-pressed', 'false');
    await user.click(dinner);

    expect(dinner).toHaveAttribute('aria-pressed', 'true');
  });

  it('sends a typed note with the result', async () => {
    const { onLog, user } = setup({ meals: [meals[0]] });

    await user.type(screen.getByLabelText(/Add a note/), 'left the peas');
    await user.click(screen.getByRole('button', { name: /Refused/ }));

    expect(onLog).toHaveBeenCalledWith('refused', 'left the peas', 'breakfast-1', undefined);
  });

  it('sends a quick-note suggestion the same way', async () => {
    const { onLog, user } = setup({ meals: [meals[0]] });

    await user.click(screen.getByRole('button', { name: 'Asked for more' }));
    await user.click(screen.getByRole('button', { name: /Tried a bite/ }));

    expect(onLog).toHaveBeenCalledWith('tasted', 'Asked for more', 'breakfast-1', undefined);
  });

  it('sends how much was eaten when the user picked an amount', async () => {
    const { onLog, user } = setup({ meals: [meals[0]] });

    await user.click(screen.getByRole('button', { name: 'Nibbles' }));
    expect(screen.getByRole('button', { name: 'Nibbles' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(ateButton());

    expect(onLog).toHaveBeenCalledWith('ate', undefined, 'breakfast-1', 'nibbles');
  });

  it('passes no meal id when the caller named the meal itself', async () => {
    const { onLog, user } = setup({ mealName: 'lunch' });

    await user.click(ateButton());

    expect(onLog).toHaveBeenCalledWith('ate', undefined, undefined, undefined);
  });

  it('closes on a successful log', async () => {
    const onOpenChange = vi.fn();
    const { user } = setup({ meals: [meals[0]], onOpenChange });

    await user.click(ateButton());

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open when the handler rejects, so the result is not lost', async () => {
    const onOpenChange = vi.fn();
    const { user } = setup({
      meals: [meals[0]],
      onOpenChange,
      onLog: vi.fn().mockRejectedValue(new Error('offline')),
    });

    await user.click(ateButton());

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(ateButton()).toBeEnabled();
  });
});
