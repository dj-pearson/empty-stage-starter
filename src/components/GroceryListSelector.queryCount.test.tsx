import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

/**
 * US-864: the selector fetches the lists once per identity, not once per
 * selection.
 *
 * The effect had `selectedListId` in its dependency array AND changed it -- it
 * auto-selects the default list -- so every mount fetched, selected, and
 * fetched again. Measured on the built grocery page: 6 x
 * GET /rest/v1/grocery_lists per load.
 */
const queries: string[] = [];

const LISTS = [
  { id: 'list-default', name: 'Weekly shop', is_default: true, is_archived: false },
  { id: 'list-other', name: 'Party', is_default: false, is_archived: false },
];

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.or = self;
    chain.order = self;
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: LISTS, error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => {
        queries.push(table);
        return builder();
      },
    },
  };
});

vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const { GroceryListSelector } = await import('./GroceryListSelector');

const USER = '00000000-0000-4000-8000-000000000001';

describe('GroceryListSelector query count', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('fetches once on mount and auto-selects the default', async () => {
    const onListChange = vi.fn();
    const onDefaultListChange = vi.fn();

    render(
      <GroceryListSelector
        userId={USER}
        selectedListId={null}
        onListChange={onListChange}
        onCreateNew={() => {}}
        onManageLists={() => {}}
        onDefaultListChange={onDefaultListChange}
      />
    );

    await waitFor(() => expect(onListChange).toHaveBeenCalledWith('list-default'));
    expect(onDefaultListChange).toHaveBeenCalledWith('list-default');
    // The number this story is about. Auto-selecting used to cost a second one.
    expect(queries.filter((t) => t === 'grocery_lists')).toHaveLength(1);
  });

  it('does not refetch when the selection changes', async () => {
    const onListChange = vi.fn();
    const { rerender } = render(
      <GroceryListSelector
        userId={USER}
        selectedListId={null}
        onListChange={onListChange}
        onCreateNew={() => {}}
        onManageLists={() => {}}
      />
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    rerender(
      <GroceryListSelector
        userId={USER}
        selectedListId="list-other"
        onListChange={onListChange}
        onCreateNew={() => {}}
        onManageLists={() => {}}
      />
    );
    await new Promise((r) => setTimeout(r, 20));

    // Which lists exist does not depend on which one is selected.
    expect(queries).toHaveLength(1);
  });

  it('does not refetch when the parent re-renders with new callback identities', async () => {
    // The measured bug did not need this -- setSelectedListId is stable -- but
    // an inline arrow at the call site would have made every parent render a
    // query, silently.
    const { rerender } = render(
      <GroceryListSelector
        userId={USER}
        selectedListId="list-other"
        onListChange={() => {}}
        onCreateNew={() => {}}
        onManageLists={() => {}}
        onDefaultListChange={() => {}}
      />
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    for (let i = 0; i < 3; i += 1) {
      rerender(
        <GroceryListSelector
          userId={USER}
          selectedListId="list-other"
          onListChange={() => {}}
          onCreateNew={() => {}}
          onManageLists={() => {}}
          onDefaultListChange={() => {}}
        />
      );
    }
    await new Promise((r) => setTimeout(r, 20));
    expect(queries).toHaveLength(1);
  });

  it('does refetch when the household resolves, because that changes the filter', async () => {
    const { rerender } = render(
      <GroceryListSelector
        userId={USER}
        selectedListId="list-other"
        onListChange={() => {}}
        onCreateNew={() => {}}
        onManageLists={() => {}}
      />
    );
    await waitFor(() => expect(queries).toHaveLength(1));

    rerender(
      <GroceryListSelector
        userId={USER}
        householdId="00000000-0000-4000-8000-00000000aaa1"
        selectedListId="list-other"
        onListChange={() => {}}
        onCreateNew={() => {}}
        onManageLists={() => {}}
      />
    );
    // A household-scoped query returns a different set, so this one is not
    // waste -- the point is that only the things in the filter trigger it.
    await waitFor(() => expect(queries).toHaveLength(2));
  });
});
