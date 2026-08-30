import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ARFID_PAGES } from '@/lib/arfid-content';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import ArfidPage from './ArfidPage';

/**
 * US-649, following ComparisonPage.test.tsx. Checks the two things a crawler sees: that
 * the prose is in the first render at all, and that a guessed slug lands on the real 404
 * rather than an empty template Google would happily index.
 */
function renderSlug(slug: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/arfid/${slug}`]}>
        <Routes>
          <Route path="/arfid/:slug" element={<ArfidPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('ArfidPage (US-649)', () => {
  it.each(ARFID_PAGES.map((p) => p.slug))('%s renders its heading and direct answer', (slug) => {
    const page = ARFID_PAGES.find((p) => p.slug === slug)!;
    const { container } = renderSlug(slug);

    expect(screen.getByRole('heading', { level: 1, name: page.h1 })).toBeInTheDocument();
    expect(container.textContent).toContain(page.answer);
  });

  it.each(ARFID_PAGES.map((p) => p.slug))('%s renders the not-treatment note', (slug) => {
    const page = ARFID_PAGES.find((p) => p.slug === slug)!;
    const { container } = renderSlug(slug);
    expect(container.textContent).toContain(page.careNote);
  });

  it.each(ARFID_PAGES.map((p) => p.slug))('%s renders every FAQ it marks up', (slug) => {
    // FAQPage markup whose answers are not visible on the page is a structured data
    // violation, not just bad manners.
    const page = ARFID_PAGES.find((p) => p.slug === slug)!;
    const { container } = renderSlug(slug);
    for (const faq of page.faqs) {
      expect(container.textContent).toContain(faq.question);
      expect(container.textContent).toContain(faq.answer);
    }
  });

  it('renders NotFound for a slug that does not exist', () => {
    const { container } = renderSlug('arfid-cure');
    for (const page of ARFID_PAGES) {
      expect(container.textContent).not.toContain(page.answer);
    }
    expect(container.textContent).toMatch(/404|not found/i);
  });
});
