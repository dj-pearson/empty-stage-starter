import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const single = vi.fn();
const selected = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: (cols: string) => {
      selected(cols);
      return chain;
    },
    eq: () => chain,
    neq: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    single: () => single(),
  });
  return { supabase: { from: () => chain } };
});

import BlogPost from './BlogPost';

const PUBLISHED = '2026-01-04T09:00:00.000Z';
const EDITED = '2026-06-18T14:30:00.000Z';

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Safe foods that travel',
    slug: 'safe-foods-that-travel',
    content: 'Body copy.',
    excerpt: 'A short excerpt.',
    featured_image_url: null,
    og_image_url: null,
    published_at: PUBLISHED,
    updated_at: EDITED,
    reading_time_minutes: 4,
    views: 0,
    meta_title: null,
    meta_description: null,
    category: { name: 'Nutrition', slug: 'nutrition' },
    ...overrides,
  };
}

function renderPost() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/blog/safe-foods-that-travel']}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

function articleSchema() {
  for (const script of document.head.querySelectorAll('script[type="application/ld+json"]')) {
    const parsed = JSON.parse(script.textContent ?? '{}');
    const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed]);
    const article = nodes.find((n: { '@type'?: string }) => n['@type'] === 'Article');
    if (article) return article;
  }
  return null;
}

const metaContent = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute('content');

/**
 * The sitemap has been submitting blog_posts.updated_at all along. The page said
 * nothing, so ArticleSchema fell back to datePublished and every post claimed it had
 * never been edited -- the site contradicting itself about its own freshness.
 */
describe('BlogPost freshness signals', () => {
  beforeEach(() => {
    single.mockReset();
    selected.mockClear();
    document.head.querySelectorAll('script[type="application/ld+json"]').forEach((el) => el.remove());
  });

  it('fetches updated_at at all', async () => {
    single.mockResolvedValue({ data: post(), error: null });
    renderPost();

    await waitFor(() => expect(selected).toHaveBeenCalled());
    expect(selected.mock.calls[0][0]).toContain('updated_at');
  });

  it('reports the edit date in the Article schema', async () => {
    single.mockResolvedValue({ data: post(), error: null });
    renderPost();

    await waitFor(() => expect(articleSchema()).not.toBeNull());
    expect(articleSchema().datePublished).toBe(PUBLISHED);
    expect(articleSchema().dateModified).toBe(EDITED);
  });

  it('reports it in the meta tags too', async () => {
    single.mockResolvedValue({ data: post(), error: null });
    renderPost();

    await waitFor(() =>
      expect(metaContent('meta[property="article:modified_time"]')).toBe(EDITED),
    );
    expect(metaContent('meta[property="article:published_time"]')).toBe(PUBLISHED);
  });

  it('falls back to publication when the post was never edited', async () => {
    single.mockResolvedValue({ data: post({ updated_at: null }), error: null });
    renderPost();

    await waitFor(() => expect(articleSchema()).not.toBeNull());
    expect(articleSchema().dateModified).toBe(PUBLISHED);
  });

  it('does not backdate a post whose updated_at precedes publication', async () => {
    // A row touched by a migration before its publish date is bookkeeping, not an edit.
    single.mockResolvedValue({ data: post({ updated_at: '2025-11-01T00:00:00.000Z' }), error: null });
    renderPost();

    await waitFor(() => expect(articleSchema()).not.toBeNull());
    expect(articleSchema().dateModified).toBe(PUBLISHED);
  });

  it('survives an unparseable timestamp', async () => {
    single.mockResolvedValue({ data: post({ updated_at: 'not a date' }), error: null });
    renderPost();

    await waitFor(() => expect(articleSchema()).not.toBeNull());
    expect(articleSchema().dateModified).toBe(PUBLISHED);
  });
});
