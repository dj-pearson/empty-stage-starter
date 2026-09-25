import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { Food, Kid } from '@/types';

const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn() }),
}));

const foods: Food[] = [
  {
    id: 'pb',
    name: 'Peanut butter',
    category: 'snack',
    is_safe: true,
    is_try_bite: false,
    unit: 'jar',
    quantity: 0,
    allergens: ['peanuts'],
  },
];
const kids = [{ id: 'leo', name: 'Leo', allergens: ['peanut'] }] as Kid[];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods }),
  useKids: () => ({ kids }),
}));

import { AddGroceryItemDialog } from './AddGroceryItemDialog';

function setup(props: Partial<Parameters<typeof AddGroceryItemDialog>[0]> = {}) {
  const onAddItems = vi.fn();
  const onOpenChange = vi.fn();
  const utils = render(
    <AddGroceryItemDialog open onOpenChange={onOpenChange} onAddItems={onAddItems} selectedListId="list-1" {...props} />,
  );
  return { ...utils, onAddItems, onOpenChange };
}

const nameInput = () => screen.getByLabelText('Item name') as HTMLInputElement;

beforeEach(() => {
  toastSuccess.mockReset();
});

describe('AddGroceryItemDialog', () => {
  it('closing without adding shows no success toast', () => {
    const { onOpenChange, onAddItems } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Bread' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onAddItems).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('Cancel resets the form', () => {
    const { rerender, onAddItems, onOpenChange } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Bread' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    rerender(<AddGroceryItemDialog open onOpenChange={onOpenChange} onAddItems={onAddItems} />);
    expect(nameInput().value).toBe('');
  });

  it('adds one item with the real count, then clears the name and keeps focus', async () => {
    const { onAddItems, onOpenChange } = setup();
    fireEvent.change(nameInput(), { target: { value: 'Bread' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.5' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(onAddItems).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Bread', quantity: 1.5, grocery_list_id: 'list-1', added_via: 'manual' }),
    ]);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/Bread/);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(nameInput().value).toBe('');
    expect(document.activeElement).toBe(nameInput());
  });

  it("the allergen warning blocks the add until 'Add anyway'", () => {
    const { onAddItems } = setup();
    fireEvent.change(nameInput(), { target: { value: 'peanut butter' } });

    expect(screen.getByRole('alert').textContent).toMatch(/Leo: peanut/);
    const add = screen.getByRole('button', { name: 'Add item' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.submit(nameInput().closest('form')!);
    expect(onAddItems).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    expect(onAddItems).toHaveBeenCalledTimes(1);
    // Prefilled from the pantry because the parent had not touched them.
    expect(onAddItems.mock.calls[0][0][0]).toMatchObject({ name: 'peanut butter', unit: 'jar', category: 'snack' });
  });
});
