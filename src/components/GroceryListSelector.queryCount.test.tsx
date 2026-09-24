import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import type { GroceryListRow } from '@/hooks/useGroceryLists';

/**
 * US-864: the lists are fetched once per identity, not once per selection.
 *
 * The old selector had `selectedListId` in its effect's dependency array AND
 * changed it -- it auto-selected the default -- so every mount fetched,
 * selected, and fetched again (6 x GET /rest/v1/grocery_lists per load). The
 * fetch now lives in useGroceryLists and the selector only renders, so these
 * tests drive the pair the way the page does.
 */
const queries: string[] = [];
let failNext = false;

const row = (id: string, name: string, is_default: boolean): GroceryListRow => ({
  id,
  name,
  is_default,
  is_archived: false,
  user_id: '00000000-0000-4000-8000-000000000001',
  household_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  color: null,
  description: null,
  icon: null,
  store_layout_id: null,
  store_name: null,
});

const LISTS = [row('list-default', 'Weekly shop', true), row('list-other', 'Party', false)];

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.eq = self;
    chain.or = self;
    chain.order = self;
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (failNext) {
        failNext = false;
        return resolve({ data: null, error: { message: 'offline' } });
      }
      return resolve({ data: LISTS, error: null });
    };
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
const { useGroceryLists } = await import('@/hooks/useGroceryLists');

const USER = '00000000-0000-4000-8000-000000000001';
const HOUSEHOLD = '00000000-0000-4000-8000-00000000aaa1';

type Api = ReturnType<typeof useGroceryLists>;
let api: Api | null = null;

function Harness({ householdId = null, onCreateNew = () => {} }: { householdId?: string | null; onCreateNew?: () => void }) {
  const lists = useGroceryLists(USER, householdId);
  api = lists;
  return (
    <GroceryListSelector
      lists={lists.lists}
      selectedListId={lists.selectedListId}
      loading={lists.loading}
      error={lists.error}
      onRetry={() => void lists.refresh()}
      // Inline arrows on purpose: new identities every render must not refetch.
      onListChange={(id) => lists.setSelectedListId(id)}
      onCreateNew={() => onCreateNew()}
      onManageLists={() => {}}
      summary="3 left"
    />
  );
}

const listQueries = () => queries.filter((t) => t === 'grocery_lists').length;

describe('GroceryListSelector query count', () => {
  beforeEach(() => {
    queries.length = 0;
    failNext = false;
    api = null;
    localStorage.clear();
  });

  it('fetches once on mount and selects the default', async () => {
    render(<Harness />);
    await waitFor(() => expect(api?.selectedListId).toBe('list-default'));
    expect(screen.getByText('Weekly shop')).toBeInTheDocument();
    expect(screen.getByText('3 left')).toBeInTheDocument();
    expect(listQueries()).toBe(1);
  });

  it('does not refetch when the selection changes or the parent re-renders', async () => {
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(api?.lists).toHaveLength(2));

    act(() => api?.setSelectedListId('list-other'));
    for (let i = 0; i < 3; i += 1) rerender(<Harness />);
    await new Promise((r) => setTimeout(r, 20));

    expect(api?.selectedListId).toBe('list-other');
    expect(listQueries()).toBe(1);
  });

  it('refetches once per mutation', async () => {
    render(<Harness />);
    await waitFor(() => expect(api?.lists).toHaveLength(2));

    act(() => api?.upsertLocal(row('list-new', 'Costco run', false)));
    await waitFor(() => expect(listQueries()).toBe(2));

    act(() => api?.removeLocal('list-other'));
    await waitFor(() => expect(listQueries()).toBe(3));

    await new Promise((r) => setTimeout(r, 20));
    expect(listQueries()).toBe(3);
  });

  it('refetches when the household resolves, because that changes the filter', async () => {
    const { rerender } = render(<Harness />);
    await waitFor(() => expect(listQueries()).toBe(1));

    rerender(<Harness householdId={HOUSEHOLD} />);
    await waitFor(() => expect(listQueries()).toBe(2));
  });

  it('shows retry, never the create CTA, when the fetch fails', async () => {
    failNext = true;
    const onCreateNew = vi.fn();
    render(<Harness onCreateNew={onCreateNew} />);

    const retry = await screen.findByRole('button', { name: /try again/i });
    expect(screen.queryByText(/create your first list/i)).not.toBeInTheDocument();

    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByText('Weekly shop')).toBeInTheDocument());
    expect(listQueries()).toBe(2);
    expect(onCreateNew).not.toHaveBeenCalled();
  });
});
