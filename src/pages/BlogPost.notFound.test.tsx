import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const single = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    lte: self,
    order: self,
    limit: self,
    neq: self,
    single: () => single(),
    then: undefined,
  });
  return {
    supabase: {
      from: () => chain,
    },
  };
});

import BlogPost from './BlogPost';

function renderSlug(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/blog/${slug}`]}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPost />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/**
 * A slug that returns no row is not a rare case: deleted posts, drafts, typos and old
 * inbound links all land here, and the SPA answers 200 to every one of them. What the
 * branch puts in the <head> is therefore the only thing separating a soft 404 from an
 * indexed thin page.
 */
describe('BlogPost, missing slug', () => {
  beforeEach(() => {
    single.mockReset();
    single.mockResolvedValue({ data: null, error: { message: 'No rows' } });
    document.head.querySelectorAll('[data-rh="true"]').forEach((el) => el.remove());
  });

  it('renders the not-found body rather than an empty article', async () => {
    // i18next is not initialised here, so t() yields the key. The keys resolve to
    // "Article Not Found" and its explanation in src/i18n/locales/en.json; what this
    // asserts is that the branch rendered at all.
    const { container } = renderSlug('no-such-post');
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(container.textContent).toContain('blogPost.notFoundTitle');
    expect(container.textContent).toContain('blogPost.notFoundText');
  });

  it('tells crawlers not to index it', async () => {
    renderSlug('no-such-post');

    await waitFor(() => {
      const robots = document.head.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content')).toBe('noindex, follow');
    });
  });

  it('does not leave the homepage canonical standing on a dead URL', async () => {
    // index.html ships a data-rh canonical pointing at https://tryeatpal.com/ because it
    // is also the SPA fallback document. Helmet claims those tags on mount; this branch
    // declaring no canonical of its own is what removes it instead of inheriting it.
    const canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    canonical.setAttribute('href', 'https://tryeatpal.com/');
    canonical.setAttribute('data-rh', 'true');
    document.head.appendChild(canonical);

    renderSlug('no-such-post');

    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toBeTruthy();
    });
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('gives the page a title of its own', async () => {
    renderSlug('no-such-post');
    await waitFor(() => expect(document.title).toBe('Article not found - EatPal'));
  });
});
