import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { comparisonPages } from '@/lib/comparison-content';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import ComparisonPage from './ComparisonPage';

/**
 * US-646. The route existing is the whole point of this story, so these render
 * through the router rather than calling the component directly, and they check
 * the two things a crawler sees: the JSON-LD, and that an unknown slug lands on
 * the 404 page instead of an empty template Google would happily index.
 */
function renderSlug(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/compare/${slug}`]}>
        <Routes>
          <Route path="/compare/:slug" element={<ComparisonPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  );
}

describe('ComparisonPage (US-646)', () => {
  beforeEach(() => document.getElementById('comparison-schema')?.remove());

  it.each(comparisonPages.map((p) => p.slug))('%s renders its heading and table', (slug) => {
    const page = comparisonPages.find((p) => p.slug === slug)!;
    renderSlug(slug);

    expect(screen.getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    for (const row of page.rows) {
      expect(screen.getByRole('rowheader', { name: row.dimension })).toBeInTheDocument();
    }
  });

  it.each(comparisonPages.map((p) => p.slug))('%s emits parseable ItemList JSON-LD', (slug) => {
    const page = comparisonPages.find((p) => p.slug === slug)!;
    renderSlug(slug);

    const tag = document.getElementById('comparison-schema');
    expect(tag).toBeTruthy();
    const parsed = JSON.parse(tag!.textContent!);
    expect(parsed['@type']).toBe('ItemList');
    expect(parsed.name).toBe(page.title);
    expect(parsed.numberOfItems).toBe(2);
    expect(parsed.itemListElement.map((e: { item: { name: string } }) => e.item.name)).toEqual([
      'EatPal',
      page.competitor,
    ]);
    // No invented review numbers ride along in the structured data.
    for (const entry of parsed.itemListElement) {
      expect(entry.item).not.toHaveProperty('aggregateRating');
    }
  });

  it.each(comparisonPages.map((p) => p.slug))(
    '%s surfaces at least one row the competitor wins',
    (slug) => {
      const page = comparisonPages.find((p) => p.slug === slug)!;
      renderSlug(slug);
      const wins = screen.getAllByText(`${page.competitor} wins this one`);
      expect(wins.length).toBe(page.rows.filter((r) => r.competitorWins).length);
      expect(wins.length).toBeGreaterThan(0);
    }
  );

  it('renders the 404 page for a slug with no content', () => {
    renderSlug('eatpal-vs-a-product-that-does-not-exist');
    expect(document.getElementById('comparison-schema')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
