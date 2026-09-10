import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import FAQ from './FAQ';

function renderFaq() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <FAQ />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

async function settled() {
  await waitFor(() =>
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeTruthy(),
  );
}

function faqSchema() {
  for (const script of document.head.querySelectorAll('script[type="application/ld+json"]')) {
    const parsed = JSON.parse(script.textContent ?? '{}');
    const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] ?? [parsed]);
    const faq = nodes.find((n: { '@type'?: string }) => n['@type'] === 'FAQPage');
    if (faq) return faq;
  }
  return null;
}

/**
 * Google asks that FAQ content be on the page. Content behind an expander counts;
 * content that exists only in structured data does not. Radix unmounts a closed
 * AccordionContent, so every answer lived in the JSON-LD and nowhere else -- including
 * for a crawler that renders JavaScript, because rendering does not click.
 *
 * jsdom has no layout, so what the browser does with the collapse classes cannot be
 * asserted here. That half was measured in Chromium and is recorded in FAQ.tsx: 15
 * panels at 0px, screenshots pixel-identical to before. These tests hold the half that
 * is checkable -- that the text is in the DOM, and that the classes keeping it hidden
 * are still on the element.
 */
describe('/faq answers are on the page, not only in the schema', () => {
  it('declares a FAQPage with questions and answers', async () => {
    renderFaq();
    await settled();

    const schema = faqSchema();
    expect(schema).not.toBeNull();
    expect(schema.mainEntity.length).toBeGreaterThan(5);
  });

  it('renders every answer it declares', async () => {
    const { container } = renderFaq();
    await settled();

    const missing: string[] = [];
    for (const entry of faqSchema().mainEntity) {
      const answer: string = entry.acceptedAnswer?.text ?? '';
      if (answer && !container.textContent?.includes(answer)) missing.push(entry.name);
    }

    expect(missing, `answers absent from the DOM: ${missing.join(' | ')}`).toEqual([]);
  });

  it('renders every question it declares', async () => {
    const { container } = renderFaq();
    await settled();

    for (const entry of faqSchema().mainEntity) {
      expect(container.textContent, `question missing: ${entry.name}`).toContain(entry.name);
    }
  });

  it('keeps each closed answer collapsed', () => {
    // The three classes are load bearing and none is decoration: forceMount leaves the
    // panel unhidden, h-0 alone leaves pb-4's 16px showing, and the group prefix is
    // needed because shadcn puts this className on an inner div with no data-state.
    const { container } = renderFaq();

    const panels = container.querySelectorAll('[role="region"] > div');
    expect(panels.length).toBeGreaterThan(5);
    for (const panel of panels) {
      expect(panel.className).toContain('group-data-[state=closed]:h-0');
      expect(panel.className).toContain('group-data-[state=closed]:overflow-hidden');
      expect(panel.className).toContain('group-data-[state=closed]:pb-0');
    }
  });

  it('marks the item as the group those classes resolve against', () => {
    const { container } = renderFaq();

    const items = container.querySelectorAll('[data-state][data-orientation="vertical"]');
    const groups = [...items].filter((el) => el.className.includes('group'));
    expect(groups.length).toBeGreaterThan(5);
  });
});
