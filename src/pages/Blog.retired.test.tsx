import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import { RETIRED_BLOG_SLUGS } from '@/lib/retired-blog-slugs';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const RETIRED = 'feeding-kids-on-a-schedule-what-actually-works';
const SURVIVOR = RETIRED_BLOG_SLUGS[RETIRED];

const posts = [
  {
    id: '1',
    title: 'The surviving copy',
    slug: SURVIVOR,
    excerpt: 'This is the one that ranks.',
    featured_image_url: null,
    published_at: '2026-02-01T00:00:00.000Z',
    reading_time_minutes: 5,
    category: { name: 'Planning', slug: 'planning' },
  },
  {
    id: '2',
    title: 'The retired duplicate',
    slug: RETIRED,
    excerpt: 'This one 301s away.',
    featured_image_url: null,
    published_at: '2026-01-01T00:00:00.000Z',
    reading_time_minutes: 5,
    category: { name: 'Planning', slug: 'planning' },
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const build = (table: string) => {
    const chain: Record<string, unknown> = {};
    const settle = () =>
      Promise.resolve(
        table === 'blog_posts'
          ? { data: posts, error: null }
          : { data: [{ id: 'c1', name: 'Planning', slug: 'planning' }], error: null },
      );
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      lte: () => chain,
      order: () => settle(),
    });
    return chain;
  };
  return { supabase: { from: (table: string) => build(table) } };
});

import Blog from './Blog';

function renderBlog() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Blog />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

/**
 * A retired duplicate keeps its published row on purpose -- the 301 is what visitors
 * see, and the row stays so the content is recoverable. That only holds if nothing
 * links to the retired URL. /blog is prerendered and indexable, so its links are the
 * site's own statement about which posts exist.
 */
describe('/blog and retired duplicates', () => {
  beforeEach(() => {
    expect(SURVIVOR, 'fixture slug is no longer retired').toBeTruthy();
  });

  it('lists the surviving post', async () => {
    const { container } = renderBlog();
    await waitFor(() => expect(container.textContent).toContain('The surviving copy'));
  });

  it('does not list the retired duplicate', async () => {
    const { container } = renderBlog();
    await waitFor(() => expect(container.textContent).toContain('The surviving copy'));
    expect(container.textContent).not.toContain('The retired duplicate');
  });

  it('links to no URL that public/_redirects 301s away', async () => {
    const { container } = renderBlog();
    await waitFor(() => expect(container.textContent).toContain('The surviving copy'));

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    for (const retired of Object.keys(RETIRED_BLOG_SLUGS)) {
      expect(hrefs).not.toContain(`/blog/${retired}`);
    }
  });
});
