import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import { MAX_INDEXABLE_TIER } from '@/lib/pseo/indexability';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const rows = [
  { slug: 'foods/chicken-nuggets', title: 'Chicken Nuggets', meta_description: null, page_type: 'FOOD_CHAINING_GUIDE', tier: 1 },
  { slug: 'foods/mac-and-cheese', title: 'Mac and Cheese', meta_description: null, page_type: 'FOOD_CHAINING_GUIDE', tier: 1 },
  { slug: 'foods/pickled-walnuts', title: 'Pickled Walnuts', meta_description: null, page_type: 'FOOD_CHAINING_GUIDE', tier: 2 },
  { slug: 'foods/quince-paste', title: 'Quince Paste', meta_description: null, page_type: 'FOOD_CHAINING_GUIDE', tier: 3 },
  { slug: 'foods/untiered', title: 'Untiered', meta_description: null, page_type: 'FOOD_CHAINING_GUIDE', tier: null },
];

const select = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: (cols: string) => {
      select(cols);
      return chain;
    },
    eq: () => chain,
    order: () => Promise.resolve({ data: rows, error: null }),
  });
  return { supabase: { from: () => chain } };
});

import GuidesIndex from './GuidesIndex';

function collectionSchema() {
  const scripts = Array.from(
    document.head.querySelectorAll('script[type="application/ld+json"]')
  );
  for (const script of scripts) {
    const parsed = JSON.parse(script.textContent ?? '{}');
    if (parsed['@type'] === 'CollectionPage') return parsed;
  }
  return null;
}

/**
 * Guides above MAX_INDEXABLE_TIER stay published, linked and useful, and carry
 * noindex, follow on purpose. The page listing them is right. A CollectionPage naming
 * them as its members is not: it claims a set of pages as what the hub is about while
 * the same site asks Google to ignore them.
 */
describe('/guides CollectionPage schema', () => {
  beforeEach(() => {
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
    select.mockClear();
  });

  it('reads tier so it can tell the two apart', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <GuidesIndex />
        </MemoryRouter>
      </HelmetProvider>,
    );
    await waitFor(() => expect(select).toHaveBeenCalled());
    expect(select.mock.calls[0][0]).toContain('tier');
  });

  it('claims only the guides the site is asking to have indexed', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <GuidesIndex />
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(() => expect(collectionSchema()).not.toBeNull());
    const list = collectionSchema().mainEntity;

    const expected = rows.filter((r) => r.tier !== null && r.tier <= MAX_INDEXABLE_TIER);
    expect(list.numberOfItems).toBe(expected.length);
    expect(list.itemListElement.map((i: { name: string }) => i.name)).toEqual(
      expected.map((r) => r.title),
    );
  });

  it('names no URL that carries noindex', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter>
          <GuidesIndex />
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(() => expect(collectionSchema()).not.toBeNull());
    const urls: string[] = collectionSchema().mainEntity.itemListElement.map(
      (i: { url: string }) => i.url,
    );

    for (const row of rows.filter((r) => r.tier === null || r.tier > MAX_INDEXABLE_TIER)) {
      expect(urls.some((u) => u.endsWith(row.slug))).toBe(false);
    }
  });

  it('still renders every guide on the page for readers', async () => {
    const { container } = render(
      <HelmetProvider>
        <MemoryRouter>
          <GuidesIndex />
        </MemoryRouter>
      </HelmetProvider>,
    );

    await waitFor(() => expect(container.textContent).toContain('Chicken Nuggets'));
    for (const row of rows) {
      expect(container.textContent, `${row.title} is missing from the page`).toContain(row.title);
    }
  });
});
