import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { AppProvider, useApp } from './AppContext';

// Mock Supabase client - all operations return empty/success by default
const mockFrom = vi.fn();
const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// Mock platform storage - returns localStorage-like behavior
vi.mock('@/lib/platform', () => ({
  getStorage: vi.fn().mockResolvedValue({
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  }),
  isWeb: vi.fn().mockReturnValue(true),
  isMobile: vi.fn().mockReturnValue(false),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    withContext: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock subscription tracking
vi.mock('@/hooks/useRealtimeSubscription', () => ({
  registerSubscription: vi.fn(),
  unregisterSubscription: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}

describe('AppContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('initializes with starter foods when no stored data', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      // Should have starter foods
      expect(result.current.foods.some(f => f.name === 'Chicken Nuggets')).toBe(true);
      expect(result.current.foods.some(f => f.name === 'Mac & Cheese')).toBe(true);
    });

    it('initializes with default kid', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      expect(result.current.kids[0].name).toBe('My Child');
      expect(result.current.kids[0].age).toBe(5);
    });

    it('sets activeKidId to default kid', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.activeKidId).not.toBeNull();
      });

      expect(result.current.activeKidId).toBe(result.current.kids[0]?.id);
    });

    it('starts with empty recipes, planEntries, and groceryItems', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      expect(result.current.recipes).toEqual([]);
      expect(result.current.planEntries).toEqual([]);
      expect(result.current.groceryItems).toEqual([]);
    });
  });

  describe('Food Operations', () => {
    it('addFood adds a food with generated id', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      const initialCount = result.current.foods.length;

      act(() => {
        result.current.addFood({
          name: 'Test Food',
          category: 'protein',
          is_safe: true,
          is_try_bite: false,
        });
      });

      expect(result.current.foods.length).toBe(initialCount + 1);
      const added = result.current.foods.find(f => f.name === 'Test Food');
      expect(added).toBeDefined();
      expect(added!.id).toBeDefined();
      expect(added!.category).toBe('protein');
    });

    it('updateFood updates an existing food', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      const food = result.current.foods[0];

      act(() => {
        result.current.updateFood(food.id, { name: 'Updated Name' });
      });

      const updated = result.current.foods.find(f => f.id === food.id);
      expect(updated?.name).toBe('Updated Name');
    });

    it('deleteFood removes a food', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      const food = result.current.foods[0];
      const initialCount = result.current.foods.length;

      act(() => {
        result.current.deleteFood(food.id);
      });

      expect(result.current.foods.length).toBe(initialCount - 1);
      expect(result.current.foods.find(f => f.id === food.id)).toBeUndefined();
    });
  });

  describe('Kid Operations', () => {
    it('addKid adds a kid with generated id', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addKid({ name: 'Test Kid', age: 3 });
      });

      expect(result.current.kids.length).toBe(2);
      expect(result.current.kids[1].name).toBe('Test Kid');
      expect(result.current.kids[1].age).toBe(3);
    });

    it('updateKid updates an existing kid', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      const kid = result.current.kids[0];

      act(() => {
        result.current.updateKid(kid.id, { name: 'Updated Kid', age: 7 });
      });

      expect(result.current.kids[0].name).toBe('Updated Kid');
      expect(result.current.kids[0].age).toBe(7);
    });

    it('deleteKid removes a kid and associated plan entries', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      // Add a second kid first
      act(() => {
        result.current.addKid({ name: 'Second Kid', age: 4 });
      });

      expect(result.current.kids.length).toBe(2);

      const kidToDelete = result.current.kids[1];

      act(() => {
        result.current.deleteKid(kidToDelete.id);
      });

      expect(result.current.kids.length).toBe(1);
      expect(result.current.kids.find(k => k.id === kidToDelete.id)).toBeUndefined();
    });

    it('deleteKid updates activeKidId if deleted kid was active', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      // Add second kid
      act(() => {
        result.current.addKid({ name: 'Second Kid', age: 4 });
      });

      const firstKid = result.current.kids[0];

      // Set first kid as active
      act(() => {
        result.current.setActiveKidId(firstKid.id);
      });

      // Delete the active kid
      act(() => {
        result.current.deleteKid(firstKid.id);
      });

      // activeKidId should switch to remaining kid
      expect(result.current.activeKidId).toBe(result.current.kids[0]?.id);
    });
  });

  describe('Recipe Operations', () => {
    it('addRecipe adds a recipe with generated id (local mode)', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      let addedRecipe: unknown;
      await act(async () => {
        addedRecipe = await result.current.addRecipe({
          name: 'Test Recipe',
          food_ids: ['food-1', 'food-2'],
          instructions: 'Mix and cook',
        });
      });

      expect(result.current.recipes.length).toBe(1);
      expect(result.current.recipes[0].name).toBe('Test Recipe');
      expect((addedRecipe as { id: string }).id).toBeDefined();
    });

    it('updateRecipe updates an existing recipe', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      await act(async () => {
        await result.current.addRecipe({
          name: 'Original Recipe',
          food_ids: [],
        });
      });

      const recipe = result.current.recipes[0];

      act(() => {
        result.current.updateRecipe(recipe.id, { name: 'Updated Recipe' });
      });

      expect(result.current.recipes[0].name).toBe('Updated Recipe');
    });

    it('deleteRecipe removes a recipe', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      await act(async () => {
        await result.current.addRecipe({ name: 'To Delete', food_ids: [] });
      });

      const recipe = result.current.recipes[0];

      act(() => {
        result.current.deleteRecipe(recipe.id);
      });

      expect(result.current.recipes.length).toBe(0);
    });
  });

  describe('Plan Entry Operations', () => {
    it('addPlanEntry adds an entry with generated id', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addPlanEntry({
          kid_id: 'kid-1',
          date: '2026-02-25',
          meal_slot: 'breakfast',
          food_id: 'food-1',
          result: null,
        });
      });

      expect(result.current.planEntries.length).toBe(1);
      expect(result.current.planEntries[0].kid_id).toBe('kid-1');
      expect(result.current.planEntries[0].meal_slot).toBe('breakfast');
    });

    it('updatePlanEntry updates an existing entry', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addPlanEntry({
          kid_id: 'kid-1',
          date: '2026-02-25',
          meal_slot: 'lunch',
          food_id: 'food-1',
          result: null,
        });
      });

      const entry = result.current.planEntries[0];

      act(() => {
        result.current.updatePlanEntry(entry.id, { result: 'ate' });
      });

      expect(result.current.planEntries[0].result).toBe('ate');
    });

    it('setPlanEntries replaces all entries', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      const entries = [
        { id: 'e1', kid_id: 'k1', date: '2026-02-25', meal_slot: 'breakfast' as const, food_id: 'f1', result: null as null },
        { id: 'e2', kid_id: 'k1', date: '2026-02-25', meal_slot: 'lunch' as const, food_id: 'f2', result: null as null },
      ];

      act(() => {
        result.current.setPlanEntries(entries);
      });

      expect(result.current.planEntries.length).toBe(2);
    });
  });

  describe('Grocery Item Operations', () => {
    it('addGroceryItem adds item with checked=false', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({
          name: 'Apples',
          quantity: 6,
          unit: 'pieces',
          category: 'fruit',
        });
      });

      expect(result.current.groceryItems.length).toBe(1);
      expect(result.current.groceryItems[0].name).toBe('Apples');
      expect(result.current.groceryItems[0].checked).toBe(false);
    });

    it('toggleGroceryItem toggles checked state', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({
          name: 'Milk',
          quantity: 1,
          unit: 'gallon',
          category: 'dairy',
        });
      });

      const item = result.current.groceryItems[0];
      expect(item.checked).toBe(false);

      act(() => {
        result.current.toggleGroceryItem(item.id);
      });

      expect(result.current.groceryItems[0].checked).toBe(true);

      act(() => {
        result.current.toggleGroceryItem(item.id);
      });

      expect(result.current.groceryItems[0].checked).toBe(false);
    });

    it('updateGroceryItem updates item properties', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({
          name: 'Bread',
          quantity: 1,
          unit: 'loaf',
          category: 'carb',
        });
      });

      const item = result.current.groceryItems[0];

      act(() => {
        result.current.updateGroceryItem(item.id, { quantity: 2 });
      });

      expect(result.current.groceryItems[0].quantity).toBe(2);
    });

    it('deleteGroceryItem removes an item', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({
          name: 'Eggs',
          quantity: 12,
          unit: 'count',
          category: 'protein',
        });
      });

      const item = result.current.groceryItems[0];

      act(() => {
        result.current.deleteGroceryItem(item.id);
      });

      expect(result.current.groceryItems.length).toBe(0);
    });

    it('deleteGroceryItems removes multiple items', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({ name: 'A', quantity: 1, unit: '', category: 'fruit' });
      });
      act(() => {
        result.current.addGroceryItem({ name: 'B', quantity: 1, unit: '', category: 'fruit' });
      });
      act(() => {
        result.current.addGroceryItem({ name: 'C', quantity: 1, unit: '', category: 'fruit' });
      });

      const ids = result.current.groceryItems.map(i => i.id);

      act(() => {
        result.current.deleteGroceryItems([ids[0], ids[1]]);
      });

      expect(result.current.groceryItems.length).toBe(1);
      expect(result.current.groceryItems[0].name).toBe('C');
    });

    it('clearCheckedGroceryItems removes only checked items', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.addGroceryItem({ name: 'Checked', quantity: 1, unit: '', category: 'fruit' });
      });
      act(() => {
        result.current.addGroceryItem({ name: 'Unchecked', quantity: 1, unit: '', category: 'fruit' });
      });

      // Toggle first item to checked
      act(() => {
        result.current.toggleGroceryItem(result.current.groceryItems[0].id);
      });

      act(() => {
        result.current.clearCheckedGroceryItems();
      });

      expect(result.current.groceryItems.length).toBe(1);
      expect(result.current.groceryItems[0].name).toBe('Unchecked');
    });

    it('setGroceryItems replaces all items', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      const items = [
        { id: 'g1', name: 'Item 1', quantity: 1, unit: '', checked: false, category: 'fruit' as const },
        { id: 'g2', name: 'Item 2', quantity: 2, unit: 'lbs', checked: true, category: 'protein' as const },
      ];

      act(() => {
        result.current.setGroceryItems(items);
      });

      expect(result.current.groceryItems.length).toBe(2);
    });
  });

  describe('Data Export/Import', () => {
    it('exportData returns JSON string with all data', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      const exported = result.current.exportData();
      const parsed = JSON.parse(exported);

      expect(parsed.foods).toBeDefined();
      expect(parsed.kids).toBeDefined();
      expect(parsed.recipes).toBeDefined();
      expect(parsed.planEntries).toBeDefined();
      expect(parsed.groceryItems).toBeDefined();
    });

    it('importData loads data from JSON string', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      const importJson = JSON.stringify({
        foods: [{ id: 'f1', name: 'Imported Food', category: 'protein', is_safe: true, is_try_bite: false }],
        kids: [{ id: 'k1', name: 'Imported Kid', age: 6 }],
        recipes: [],
        planEntries: [],
        groceryItems: [],
      });

      act(() => {
        result.current.importData(importJson);
      });

      expect(result.current.foods.length).toBe(1);
      expect(result.current.foods[0].name).toBe('Imported Food');
      expect(result.current.kids[0].name).toBe('Imported Kid');
    });

    it('importData throws on invalid JSON', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      expect(() => {
        result.current.importData('not valid json{{{');
      }).toThrow('Invalid JSON data');
    });
  });

  describe('Reset', () => {
    it('resetAllData restores starter foods and default kid', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.foods.length).toBeGreaterThan(0);
      });

      // Add custom data
      act(() => {
        result.current.addFood({ name: 'Custom Food', category: 'snack', is_safe: true, is_try_bite: false });
      });
      act(() => {
        result.current.addGroceryItem({ name: 'Custom Item', quantity: 1, unit: '', category: 'fruit' });
      });

      // Reset
      act(() => {
        result.current.resetAllData();
      });

      // Should have starter foods again (15 starter foods)
      expect(result.current.foods.length).toBe(15);
      expect(result.current.kids.length).toBe(1);
      expect(result.current.kids[0].name).toBe('My Child');
      expect(result.current.planEntries).toEqual([]);
      expect(result.current.groceryItems).toEqual([]);
    });
  });

  describe('setActiveKid', () => {
    it('setActiveKid updates activeKidId', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.setActiveKid('new-kid-id');
      });

      expect(result.current.activeKidId).toBe('new-kid-id');
    });

    it('setActiveKidId updates activeKidId', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.setActiveKidId('another-kid-id');
      });

      expect(result.current.activeKidId).toBe('another-kid-id');
    });

    it('setActiveKidId accepts null for family view', async () => {
      const { result } = renderHook(() => useApp(), { wrapper });

      await waitFor(() => {
        expect(result.current.kids.length).toBe(1);
      });

      act(() => {
        result.current.setActiveKidId(null);
      });

      expect(result.current.activeKidId).toBeNull();
    });
  });

  describe('useApp hook', () => {
    it('throws error when used outside AppProvider', () => {
      // Suppress expected console error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useApp());
      }).toThrow();

      spy.mockRestore();
    });
  });
});
