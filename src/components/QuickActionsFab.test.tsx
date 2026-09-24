import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '@/i18n';
import { QuickActionsFab, type QuickActionsFabProps } from './QuickActionsFab';

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

function setup(props: Partial<QuickActionsFabProps> = {}, path = '/dashboard') {
  const onLogMeal = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <QuickActionsFab
                kidCount={2}
                hasUnloggedToday
                onLogMeal={onLogMeal}
                todayKey="2026-09-24"
                {...props}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return { onLogMeal, user: userEvent.setup() };
}

const fab = () => screen.getByRole('button', { name: /quick actions/i });
const menu = () => screen.getByRole('group', { name: 'Quick actions' });

describe('QuickActionsFab', () => {
  it('names every action for assistive tech', async () => {
    const { user } = setup();
    await user.click(fab());

    const buttons = within(menu()).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Log a meal',
      'Plan tonight',
      'Grocery list',
    ]);
    for (const b of buttons) expect(b).toHaveAccessibleName();
    expect(within(menu()).getByRole('button', { name: 'Grocery list' })).toHaveAttribute(
      'aria-keyshortcuts',
      'G'
    );
  });

  it('reports its state and what it controls', async () => {
    const { user } = setup();
    expect(fab()).toHaveAttribute('aria-expanded', 'false');
    const controls = fab().getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toHaveAttribute('hidden');

    await user.click(fab());

    expect(fab()).toHaveAttribute('aria-expanded', 'true');
    expect(menu().id).toBe(controls);
  });

  it('moves focus into the menu on open', async () => {
    const { user } = setup();
    await user.click(fab());
    expect(screen.getByRole('button', { name: 'Log a meal' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const { user } = setup();
    await user.click(fab());
    await user.keyboard('{Escape}');

    expect(fab()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Log a meal' })).not.toBeInTheDocument();
    expect(fab()).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const { user } = setup();
    await user.click(fab());
    await user.click(screen.getByTestId('where'));
    expect(fab()).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers only "Add your first child" to an account with no kids', async () => {
    const { user } = setup({ kidCount: 0 });
    await user.click(fab());

    const buttons = within(menu()).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute('aria-label', 'Add your first child');
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/kids?new=1');
  });

  it('hides the action for the page you are on', async () => {
    const { user } = setup({}, '/dashboard/grocery');
    await user.click(fab());
    expect(within(menu()).queryByRole('button', { name: 'Grocery list' })).not.toBeInTheDocument();
    expect(within(menu()).getByRole('button', { name: 'Plan tonight' })).toBeInTheDocument();
  });

  it('offers logging only while something today is unlogged', async () => {
    const { user } = setup({ hasUnloggedToday: false });
    await user.click(fab());
    expect(within(menu()).queryByRole('button', { name: 'Log a meal' })).not.toBeInTheDocument();
  });

  it('plans tonight on today, dinner', async () => {
    const { user } = setup();
    await user.click(fab());
    await user.click(screen.getByRole('button', { name: 'Plan tonight' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/planner?date=2026-09-24&slot=dinner');
  });

  it('opens the quick log for "Log a meal"', async () => {
    const { user, onLogMeal } = setup();
    await user.click(fab());
    await user.click(screen.getByRole('button', { name: 'Log a meal' }));
    expect(onLogMeal).toHaveBeenCalledTimes(1);
  });
});
