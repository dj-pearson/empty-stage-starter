import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import '@/i18n/appLocale';
import { SiblingPickerChips } from './SiblingPickerChips';
import type { Kid } from '@/types';

const KIDS = [
  { id: 'ava', name: 'Ava', allergens: ['peanut'], allergen_severity: { peanut: 'severe' } },
  { id: 'ben', name: 'Ben', allergens: ['egg'] },
  { id: 'cal', name: 'Cal', allergens: [] },
] as unknown as Kid[];

function setup(selected: string[] = ['ava']) {
  const onChange = vi.fn();
  const onSelectAll = vi.fn();
  render(
    <SiblingPickerChips
      kids={KIDS}
      selectedKidIds={selected}
      onChange={onChange}
      onSelectAll={onSelectAll}
      allergyMarkers={{ ava: 'severe', ben: 'unrated', cal: 'none' }}
    />
  );
  return { onChange, onSelectAll };
}

describe('SiblingPickerChips', () => {
  it('renders an unrated marker with the same accessible text as severe', () => {
    setup();
    const ava = screen.getByTestId('allergy-marker-ava');
    const ben = screen.getByTestId('allergy-marker-ben');
    expect(ava).toHaveTextContent('has a severe allergy');
    expect(ben.textContent).toBe(ava.textContent);
    expect(ava).toHaveAttribute('title', 'Peanut');
    expect(ben).toHaveAttribute('title', 'Egg');
    expect(screen.queryByTestId('allergy-marker-cal')).not.toBeInTheDocument();
  });

  it('reads a severity saved under another spelling (canonical match, not a raw key lookup)', () => {
    const dee = {
      id: 'dee',
      name: 'Dee',
      allergens: ['Peanuts', 'egg'],
      allergen_severity: { peanut: 'severe', eggs: 'mild' },
    } as unknown as Kid;
    render(
      <SiblingPickerChips
        kids={[dee]}
        selectedKidIds={[]}
        onChange={vi.fn()}
        onSelectAll={vi.fn()}
        allergyMarkers={{ dee: 'severe' }}
      />
    );
    // The mild egg allergy is recorded under "eggs"; only the peanut one is named.
    expect(screen.getByTestId('allergy-marker-dee')).toHaveAttribute('title', 'Peanuts');
  });

  it("'Everyone' calls onSelectAll", () => {
    const { onSelectAll } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('toggling the last selected kid off calls onChange([])', () => {
    const { onChange } = setup(['ava']);
    fireEvent.click(screen.getByRole('button', { name: /Ava/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('labels the group with the visible "Cooking for" text', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Cooking for' })).toBeInTheDocument();
  });
});
