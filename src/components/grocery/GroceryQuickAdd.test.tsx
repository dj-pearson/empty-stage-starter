import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { Food, GroceryItem } from '@/types';

const foods: Food[] = [{ id: 'f1', name: 'Bananas', category: 'fruit', is_safe: true, is_try_bite: false }];
const groceryItems: GroceryItem[] = [
  { id: 'g1', name: 'Oat milk', quantity: 1, unit: '', checked: true, category: 'dairy' },
  { id: 'g2', name: 'Bread', quantity: 1, unit: '', checked: false, category: 'carb' },
];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods }),
  useGrocery: () => ({ groceryItems }),
}));

import { GroceryQuickAdd } from './GroceryQuickAdd';

describe('GroceryQuickAdd', () => {
  it("Enter on '2 lb chicken' adds quantity 2 in lb, clears the field and keeps focus", () => {
    const onAdd = vi.fn();
    render(<GroceryQuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText('Add an item') as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '2 lb chicken' } });
    fireEvent.submit(input.closest('form')!);

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [items] = onAdd.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 2, unit: 'lb', added_via: 'quick_add' });
    expect(items[0].name.toLowerCase()).toContain('chicken');
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('status').textContent).toMatch(/chicken/i);
  });

  it('adds nothing for a blank line', () => {
    const onAdd = vi.fn();
    render(<GroceryQuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText('Add an item');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('suggests pantry names and recently bought names, not unbought rows', () => {
    const { container } = render(<GroceryQuickAdd onAdd={vi.fn()} />);
    const options = [...container.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['Bananas', 'Oat milk']);
  });
});
