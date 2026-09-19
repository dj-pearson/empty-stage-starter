import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, PAGE_SIZE, ROW_CEILING } from './fetchAllRows';

/**
 * US-819. The load showed a household its first 500 foods and 500 grocery
 * items and said nothing, and the grocery slice was ordered oldest-first, so
 * the items just added were the ones dropped.
 *
 * What is pinned here is the walk itself: that it reads past the first page,
 * that it knows where the end is, that an error is never reported as a short
 * read, and that the ceiling is a stop rather than a silent cut.
 */

/** A table of `total` rows, answering .range() the way PostgREST does. */
function table(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: `row-${i}` }));
  const calls: Array<[number, number]> = [];
  return {
    calls,
    page: (from: number, to: number) => {
      calls.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  };
}

describe('reading a table to the end', () => {
  it('returns everything from a table smaller than one page', async () => {
    const t = table(3);
    const result = await fetchAllRows(t.page, { pageSize: 10 });

    expect(result.data).toHaveLength(3);
    expect(result.truncated).toBe(false);
    // One request, because a short page is the end.
    expect(t.calls).toEqual([[0, 9]]);
  });

  it('keeps going past the first page', async () => {
    const t = table(2500);
    const result = await fetchAllRows(t.page, { pageSize: 1000 });

    expect(result.data).toHaveLength(2500);
    expect(result.truncated).toBe(false);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once more when the last page is exactly full', async () => {
    // 2000 rows in pages of 1000 gives two full pages, and a full page is
    // indistinguishable from "there may be more" -- which is the same
    // ambiguity that made reachedRowCap a message rather than a claim.
    const t = table(2000);
    const result = await fetchAllRows(t.page, { pageSize: 1000 });

    expect(result.data).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
    expect(t.calls[2]).toEqual([2000, 2999]);
  });

  it('handles an empty table', async () => {
    const t = table(0);
    const result = await fetchAllRows(t.page, { pageSize: 10 });

    expect(result.data).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('treats a null data page as the end rather than throwing', async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await fetchAllRows(page, { pageSize: 10 });

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('preserves the order the pages arrived in', async () => {
    const t = table(25);
    const result = await fetchAllRows<{ id: string }>(t.page, { pageSize: 10 });

    expect(result.data?.map((r) => r.id).slice(0, 3)).toEqual(['row-0', 'row-1', 'row-2']);
    expect(result.data?.[24].id).toBe('row-24');
  });
});

describe('an error is not a short read', () => {
  it('fails the whole walk rather than returning the pages it got', async () => {
    // Half a catalogue reported as success is the exact failure this function
    // exists to remove, so a mid-walk error must not come back as data.
    const error = { message: 'JWT expired' };
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 10 }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error });

    const result = await fetchAllRows(page, { pageSize: 10 });

    expect(result.data).toBeNull();
    expect(result.error).toBe(error);
  });

  it('fails on the very first page too', async () => {
    const error = { message: 'permission denied' };
    const page = vi.fn().mockResolvedValue({ data: null, error });

    expect(await fetchAllRows(page, { pageSize: 10 })).toEqual({
      data: null,
      error,
      truncated: false,
    });
  });
});

describe('the ceiling', () => {
  it('stops the walk and says so', async () => {
    const t = table(5000);
    const result = await fetchAllRows(t.page, { pageSize: 100, ceiling: 250 });

    expect(result.truncated).toBe(true);
    expect(result.data).toHaveLength(250);
  });

  it('is not reported for a table that merely ends on the ceiling', async () => {
    // Exactly at the ceiling with nothing beyond it is a complete read. The
    // old reachedRowCap could not tell these apart; paging can.
    const t = table(200);
    const result = await fetchAllRows(t.page, { pageSize: 100, ceiling: 200 });

    expect(result.data).toHaveLength(200);
    expect(result.truncated).toBe(false);
    // Three requests: two full pages, then the short one that ends it.
    expect(t.calls).toHaveLength(3);
  });

  it('defaults well clear of the caps it replaces', () => {
    // 500 foods / 200 recipes / 500 grocery items were the old limits.
    expect(ROW_CEILING).toBeGreaterThanOrEqual(10_000);
    expect(PAGE_SIZE).toBe(1000);
  });
});
