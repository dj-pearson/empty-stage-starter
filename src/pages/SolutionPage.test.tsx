import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import React from 'react';
import { solutionPages } from '@/lib/solutions-content';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * react-helmet-async does not commit to document.head inside jsdom without a
 * real tick, so the head is captured here instead -- the same approach
 * src/components/schema/FAQSchema.test.tsx already uses for this reason.
 */
let capturedScripts: string[] = [];
let capturedLinks: { rel?: string; href?: string }[] = [];
vi.mock('react-helmet-async', () => ({
  HelmetProvider: ({ children }: { children: React.ReactNode }) => children,
  Helmet: ({ children }: { children: React.ReactNode }) => {
    React.Children.toArray(children).forEach((child: unknown) => {
      if (!React.isValidElement(child)) return;
      if (child.type === 'script') {
        capturedScripts.push((child.props as { children?: string }).children || '');
      }
      if (child.type === 'link') {
        capturedLinks.push(child.props as { rel?: string; href?: string });
      }
    });
    return null;
  },
}));

import SolutionPage from './SolutionPage';

/**
 * US-649. These render through the router because the route existing is the
 * story: /solutions/* used to be a catch-all 301 to /guides, so an unknown slug
 * arriving here is the normal case, not the edge case, and it has to reach the
 * 404 page rather than a thin template.
 */
function renderSlug(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/solutions/${slug}`]}>
      <Routes>
        <Route path="/solutions/:slug" element={<SolutionPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const allScripts = () => capturedScripts.join('\n');

describe('SolutionPage (US-649)', () => {
  beforeEach(() => {
    capturedScripts = [];
    capturedLinks = [];
  });

  it.each(solutionPages.map((p) => p.slug))('%s renders its heading and body', (slug) => {
    const page = solutionPages.find((p) => p.slug === slug)!;
    renderSlug(slug);

    expect(screen.getByRole('heading', { level: 1, name: page.title })).toBeInTheDocument();
    for (const capability of page.capabilities) {
      expect(screen.getByText(capability.name)).toBeInTheDocument();
    }
    for (const limit of page.limits) {
      expect(screen.getByText(limit)).toBeInTheDocument();
    }
    for (const faq of page.faqs) {
      expect(screen.getByText(faq.question)).toBeInTheDocument();
    }
  });

  it.each(solutionPages.map((p) => p.slug))('%s declares its own canonical', (slug) => {
    renderSlug(slug);
    const canonical = capturedLinks.find((link) => link.rel === 'canonical');
    expect(canonical?.href).toBe(`https://tryeatpal.com/solutions/${slug}`);
  });

  it.each(solutionPages.filter((p) => p.medical).map((p) => p.slug))(
    '%s carries MedicalWebPageSchema and the disclaimer, with no reviewer',
    (slug) => {
      renderSlug(slug);
      const emitted = allScripts();

      expect(emitted).toContain('"@type":"MedicalWebPage"');
      expect(emitted).toContain(`"url":"https://tryeatpal.com/solutions/${slug}"`);
      expect(emitted).not.toContain('reviewedBy');
      expect(screen.getByText(/has not been reviewed by a clinician/)).toBeInTheDocument();
    }
  );

  it.each(solutionPages.filter((p) => !p.medical).map((p) => p.slug))(
    '%s emits no medical schema',
    (slug) => {
      renderSlug(slug);
      expect(allScripts()).not.toContain('MedicalWebPage');
    }
  );

  it.each(solutionPages.map((p) => p.slug))('%s emits its FAQs as structured data', (slug) => {
    const page = solutionPages.find((p) => p.slug === slug)!;
    renderSlug(slug);
    const emitted = allScripts();
    expect(emitted).toContain('"@type":"FAQPage"');
    expect(emitted).toContain(JSON.stringify(page.faqs[0].question).slice(1, -1));
  });

  it('renders the 404 page for a slug with no content', () => {
    renderSlug('feeding-therapists');
    expect(screen.queryByRole('heading', { level: 1, name: /Meal planning/ })).toBeNull();
    expect(allScripts()).not.toContain('MedicalWebPage');
  });
});
