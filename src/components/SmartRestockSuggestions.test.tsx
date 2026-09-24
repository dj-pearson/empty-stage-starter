import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import type { Food, GroceryItem } from '@/types';

type RpcAnswer = { data: unknown; error: null };
const rpc = vi.fn<(name: string, args: { p_kid_id: string | null }) => Promise<RpcAnswer>>();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (name: string, args: { p_kid_id: string | null }) => rpc(name, args) },
}));

const foods: Food[] = [
  { id: 'milk', name: 'Milk', category: 'dairy', is_safe: true, is_try_bite: false, unit: 'gal' },
  { id: 'apples', name: 'Apples', category: 'fruit', is_safe: true, is_try_bite: false, unit: 'lb' },
  { id: 'rice', name: 'Rice', category: 'carb', is_safe: true, is_try_bite: false, unit: 'bag' },
];
let groceryItems: GroceryItem[] = [];

vi.mock('@/contexts/AppContext', () => ({
  useFoods: () => ({ foods }),
  useGrocery: () => ({ groceryItems }),
}));

vi.mock('@/hooks/useAutoRestockPref', () => ({
  useAutoRestockPref: () => ({ enabled: false, leadDays: 3 }),
}));

import { SmartRestockSuggestions } from './SmartRestockSuggestions';

function suggestion(foodId: string, name: string) {
  return {
    food_id: foodId,
    food_name: name,
    current_quantity: 0,
    recommended_quantity: 2,
    reason: 'Low stock',
    priority: 'medium',
    category: 'dairy',
  };
}

function deferred() {
  let resolve!: (value: RpcAnswer) => void;
  const promise = new Promise<RpcAnswer>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  rpc.mockReset();
  groceryItems = [];
});

describe('SmartRestockSuggestions', () => {
  it("shows 'on list' for a suggestion already waiting on the list, and leaves it out of Add all", async () => {
    groceryItems = [{ id: 'g1', name: 'milk', quantity: 1, unit: 'gal', checked: false, category: 'dairy' }];
    rpc.mockResolvedValue({ data: [suggestion('milk', 'Milk'), suggestion('apples', 'Apples')], error: null });
    const onAddItems = vi.fn();
    render(<SmartRestockSuggestions userId="u1" onAddItems={onAddItems} />);

    const toggle = await screen.findByRole('button', { name: /1 running low/i });
    fireEvent.click(toggle);
    expect(screen.getByText('On list')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add Milk/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Add all/i }));
    expect(onAddItems).toHaveBeenCalledTimes(1);
    const [items, source] = onAddItems.mock.calls[0];
    expect(source).toBe('manual');
    expect(items).toHaveLength(1);
    // The pantry's unit, not "servings".
    expect(items[0]).toMatchObject({ name: 'Apples', unit: 'lb', added_via: 'restock' });
  });

  it("a rapid kid switch keeps the later kid's results", async () => {
    const forA = deferred();
    const forB = deferred();
    rpc.mockImplementation((_name, args) => (args.p_kid_id === 'kid-a' ? forA.promise : forB.promise));

    const { rerender } = render(<SmartRestockSuggestions userId="u1" kidId="kid-a" onAddItems={vi.fn()} />);
    rerender(<SmartRestockSuggestions userId="u1" kidId="kid-b" onAddItems={vi.fn()} />);

    // The later kid answers first, then the earlier request lands late.
    await act(async () => {
      forB.resolve({ data: [suggestion('rice', 'Rice')], error: null });
    });
    await act(async () => {
      forA.resolve({ data: [suggestion('apples', 'Apples'), suggestion('milk', 'Milk')], error: null });
    });

    fireEvent.click(await screen.findByRole('button', { name: /1 running low/i }));
    expect(screen.getByText('Rice')).toBeTruthy();
    expect(screen.queryByText('Apples')).toBeNull();
  });

  it('renders nothing while the first answer is out', () => {
    rpc.mockReturnValue(new Promise(() => {}));
    const { container } = render(<SmartRestockSuggestions userId="u1" onAddItems={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
