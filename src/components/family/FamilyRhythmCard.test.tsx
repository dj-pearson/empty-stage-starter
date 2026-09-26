import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { addIsoDays } from '@/lib/date-utils';
import type { KidAttemptRow } from '@/lib/kidProgress';
import { FamilyRhythmCard } from './FamilyRhythmCard';
import { FamilyMilestones } from './FamilyMilestones';

const TODAY = '2026-09-24'; // Thursday
const at = (day: string, outcome = 'refused', food = 'broccoli'): KidAttemptRow => ({
  kid_id: 'kid-a',
  food_id: food,
  attempted_at: day,
  outcome,
});

function renderCard(attempts: KidAttemptRow[]) {
  return render(
    <MemoryRouter>
      <FamilyRhythmCard attempts={attempts} todayIso={TODAY} milestonesHref="/dashboard/progress?section=family" />
    </MemoryRouter>,
  );
}

describe('FamilyRhythmCard', () => {
  it('invites a first log when nothing has been logged', () => {
    renderCard([]);
    expect(screen.getByTestId('family-streak')).toHaveTextContent('Log a meal to start a streak');
    expect(screen.getByTestId('family-week-goal')).toHaveTextContent('0 of 5 days logged this week');
    expect(screen.queryByTestId('family-recap')).toBeNull();
  });

  it('counts refusals as logging, shows the week meter and last week', () => {
    renderCard([
      at(addIsoDays(TODAY, -3)), // Monday
      at(addIsoDays(TODAY, -2)),
      at(addIsoDays(TODAY, -1)),
      at(TODAY),
      at('2026-09-15', 'success', 'kiwi'),
    ]);
    expect(screen.getByTestId('family-streak')).toHaveTextContent('4-day logging streak');
    expect(screen.getByTestId('family-week-goal')).toHaveTextContent('4 of 5 days logged this week');
    expect(screen.getByTestId('family-recap')).toHaveTextContent('1 day logged · 1 offer · 1 new food offered');
    expect(screen.getByText('Thursday: logged')).toBeInTheDocument();
    expect(screen.getByText('Friday: still ahead')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Family milestones' })).toHaveAttribute(
      'href',
      '/dashboard/progress?section=family',
    );
  });

  it('warns when yesterday spent the grace day', () => {
    renderCard([at(addIsoDays(TODAY, -2)), at(addIsoDays(TODAY, -3)), at(addIsoDays(TODAY, -4))]);
    expect(screen.getByText(/Log anything today to keep the streak/)).toBeInTheDocument();
  });

  it('says the goal is reached at five days', () => {
    const friday = addIsoDays(TODAY, 1);
    render(
      <MemoryRouter>
        <FamilyRhythmCard attempts={[0, 1, 2, 3, 4].map((i) => at(addIsoDays(friday, -i)))} todayIso={friday} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('family-week-goal')).toHaveTextContent('Week goal reached: 5 days logged together.');
    expect(screen.queryByRole('link', { name: 'Family milestones' })).toBeNull();
  });
});

describe('FamilyMilestones', () => {
  it('lists earned milestones with dates and locked ones with progress', () => {
    render(<FamilyMilestones attempts={[at(TODAY)]} todayIso={TODAY} />);
    const list = screen.getByTestId('family-milestones');
    expect(list).toHaveTextContent('First log');
    expect(list).toHaveTextContent('New');
    expect(list).toHaveTextContent('1 / 7');
    expect(screen.getByText(/1 of 10 earned/)).toBeInTheDocument();
  });
});
