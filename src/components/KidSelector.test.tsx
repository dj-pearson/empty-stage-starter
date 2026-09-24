/**
 * KidSelector with no children is a link to the add-child form. Kids.tsx
 * honours ?add=1; the old ?new=1 landed on the page and opened nothing.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const kidsState = vi.hoisted(() => ({ kidsHydrated: true }));

vi.mock('@/contexts/AppContext', () => ({
  useKids: () => ({ kids: [], activeKidId: null, setActiveKid: vi.fn(), kidsHydrated: kidsState.kidsHydrated }),
}));

import { KidSelector } from './KidSelector';

describe('KidSelector', () => {
  it('links an account with no children to the add-child form', () => {
    kidsState.kidsHydrated = true;
    render(
      <MemoryRouter>
        <KidSelector />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Add your child' })).toHaveAttribute('href', '/dashboard/kids?add=1');
  });

  it('renders nothing before the kids load settles', () => {
    kidsState.kidsHydrated = false;
    const { container } = render(
      <MemoryRouter>
        <KidSelector />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
