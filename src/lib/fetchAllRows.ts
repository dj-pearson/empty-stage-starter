/**
 * Page a Supabase select to completion instead of cutting it off at a limit
 * (US-819).
 *
 * The initial load used to take the first 500 foods, 200 recipes and 500
 * grocery items and write each slice into state wholesale, so a household over
 * any of those numbers was shown a partial catalogue that looked complete. The
 * ordering made it worse than "some rows are missing": grocery_items came back
 * oldest-first, so the items a household had just added were exactly the ones
 * cut.
 *
 * Paging in the loader rather than paging the UI is the deliberate choice. Every
 * consumer of AppContext -- the pantry filters, the recipe pickers, the aisle
 * grouping, the planner's food lookups -- searches and groups the whole slice in
 * memory. Server-side search would mean rewriting all of them; paging here keeps
 * the "one source of truth, whole slice in memory" contract those consumers are
 * written against, and costs one extra round trip per 1000 rows only for the
 * households that actually have them.
 *
 * THE TIEBREAKER IS NOT OPTIONAL. `.range()` paging is only coherent over a
 * TOTAL order. Ordering foods by name alone leaves rows with equal names in an
 * unspecified order between requests, and two rows that swap places across a
 * page boundary mean one is fetched twice and the other never. Callers pass a
 * unique column (id) as the last sort key; there is no way to enforce that from
 * here, so it is stated loudly instead.
 */

/** Rows per request. PostgREST's own default ceiling is 1000. */
export const PAGE_SIZE = 1000;

/**
 * Hard stop, so a runaway household cannot page forever and hang the load.
 * Twenty times the largest cap it replaces; reaching it is pathological rather
 * than merely large, and it is reported rather than silently applied.
 */
export const ROW_CEILING = 10_000;

export interface PagedResult<T> {
  data: T[] | null;
  error: unknown;
  /** True when the ceiling stopped the walk with rows still unread. */
  truncated: boolean;
}

/** One page of a select, as PostgREST answers it. */
export type PageFetcher<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: unknown }>;

export interface FetchAllOptions {
  pageSize?: number;
  ceiling?: number;
}

/**
 * Read every row the query matches, one page at a time.
 *
 * Stops on the first short page, which is how PostgREST says "that was the
 * last one" without a second count query. An error on any page fails the whole
 * read: half a catalogue reported as success is the failure mode this function
 * exists to remove, so it is not reintroduced by returning partial rows.
 */
export async function fetchAllRows<T>(
  page: PageFetcher<T>,
  options: FetchAllOptions = {}
): Promise<PagedResult<T>> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const ceiling = options.ceiling ?? ROW_CEILING;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error, truncated: false };

    const batch = data ?? [];
    rows.push(...batch);

    // Short page: there is no next one.
    if (batch.length < pageSize) return { data: rows, error: null, truncated: false };

    if (rows.length >= ceiling) {
      const capped = rows.slice(0, ceiling);
      // Ask for the single row past the ceiling before calling this truncated.
      // Landing exactly on the ceiling with nothing beyond it is a COMPLETE
      // read, and saying otherwise would put back the ambiguity that made the
      // old reachedRowCap a hedge ("showing your first 500") rather than a
      // fact. One extra request, only for a household this large.
      const probe = await page(ceiling, ceiling);
      if (probe.error) return { data: null, error: probe.error, truncated: false };
      return { data: capped, error: null, truncated: (probe.data ?? []).length > 0 };
    }
  }
}
