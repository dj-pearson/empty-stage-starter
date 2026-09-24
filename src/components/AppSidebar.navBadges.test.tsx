import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { NavBadge } from './NavBadge';
import type { NavBadges } from '@/lib/navigation';

/**
 * Item 33 on the desktop sidebar: the badge is drawn next to the label and
 * read out as part of the link's name, and it survives the sidebar collapsing
 * to icons, where the label is gone.
 */

const badges: NavBadges = {
  groceryLeft: { kind: 'count', count: 6 },
  dinnerUnplanned: { kind: 'dot' },
  unloggedMeals: { kind: 'count', count: 1 },
  ladderDue: { kind: 'count', count: 3 },
};

function renderSidebar(b?: NavBadges) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SidebarProvider defaultOpen>
        <AppSidebar entitlements={{}} badges={b} />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe('AppSidebar badges', () => {
  it('names each badged link with its status', () => {
    renderSidebar(badges);
    expect(screen.getByRole('link', { name: 'Grocery, 6 items left' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Planner, no dinner planned today' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home, 1 meal to log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Food Tracker, 3 foods to offer today' })).toBeInTheDocument();
  });

  it('draws the count and the dot, hidden from assistive tech', () => {
    renderSidebar(badges);
    const grocery = screen.getByRole('link', { name: 'Grocery, 6 items left' });
    const count = within(grocery).getByTestId('nav-badge-count');
    expect(count).toHaveTextContent('6');
    expect(count).toHaveAttribute('aria-hidden', 'true');
    const planner = screen.getByRole('link', { name: 'Planner, no dinner planned today' });
    expect(within(planner).getByTestId('nav-badge-dot')).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves unbadged links and an empty badge set alone', () => {
    renderSidebar({ groceryLeft: { kind: 'count', count: 0 } });
    expect(screen.getByRole('link', { name: 'Grocery' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Recipes' })).toBeInTheDocument();
    expect(screen.queryByTestId('nav-badge-count')).toBeNull();
  });

  it('keeps the badge on the icon when collapsed', async () => {
    renderSidebar(badges);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    const grocery = screen.getByRole('link', { name: 'Grocery, 6 items left' });
    expect(within(grocery).getByTestId('nav-badge-count')).toHaveTextContent('6');
  });
});

describe('NavBadge', () => {
  it('caps a large count', () => {
    render(<NavBadge value={{ kind: 'count', count: 140 }} placement="inline" />);
    expect(screen.getByTestId('nav-badge-count')).toHaveTextContent('99+');
  });

  it('animates only when motion is allowed', () => {
    render(<NavBadge value={{ kind: 'dot' }} placement="corner" />);
    const dot = screen.getByTestId('nav-badge-dot');
    const classes = dot.className.split(/\s+/);
    const animated = classes.filter((c) => c.includes('animate') || c.includes('zoom') || c.includes('fade'));
    expect(animated.length).toBeGreaterThan(0);
    expect(animated.every((c) => c.startsWith('motion-safe:'))).toBe(true);
  });
});
