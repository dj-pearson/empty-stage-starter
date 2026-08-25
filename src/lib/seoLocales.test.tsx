import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { SEOHead } from '@/components/SEOHead';
import { DEFAULT_SEO_LOCALE, SEO_LOCALES } from '@/lib/seo-config';
import { resources } from '@/i18n';

/**
 * US-652. generateHreflangTags sat in src/lib/seo-helpers.ts with passing tests
 * and no caller, while SEOHead emitted canonical and og:alternate only. These
 * assertions pin the wiring and, more importantly, pin the locale list to the
 * i18n resource files so a new language cannot ship undeclared.
 */
function renderHead(props: Partial<Parameters<typeof SEOHead>[0]> = {}) {
  return render(
    <HelmetProvider>
      <SEOHead
        title="Test"
        description="Test description"
        canonicalUrl="https://tryeatpal.com/guides"
        {...props}
      />
    </HelmetProvider>
  );
}

const alternates = () =>
  [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((el) => ({
    hreflang: el.getAttribute('hreflang'),
    href: el.getAttribute('href'),
  }));

describe('hreflang emission (US-652)', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel="alternate"]').forEach((el) => el.remove());
  });

  it('emits one alternate per locale plus x-default', async () => {
    renderHead();
    await waitFor(() => expect(alternates().length).toBeGreaterThan(0));

    const tags = alternates();
    expect(tags.map((t) => t.hreflang)).toEqual([
      ...SEO_LOCALES.map((l) => (l.region ? `${l.lang}-${l.region}` : l.lang)),
      'x-default',
    ]);
  });

  it('points every alternate at an absolute URL matching the canonical', async () => {
    renderHead({ canonicalUrl: 'https://tryeatpal.com/compare/eatpal-vs-mealime' });
    await waitFor(() => expect(alternates().length).toBeGreaterThan(0));

    for (const tag of alternates()) {
      expect(tag.href).toBe('https://tryeatpal.com/compare/eatpal-vs-mealime');
      expect(tag.href?.startsWith('https://')).toBe(true);
    }
  });

  it('emits no duplicate hreflang values', async () => {
    renderHead();
    await waitFor(() => expect(alternates().length).toBeGreaterThan(0));

    const values = alternates().map((t) => t.hreflang);
    expect(new Set(values).size).toBe(values.length);
  });

  it('emits nothing on a noindex page', async () => {
    renderHead({ noindex: true });
    // Give Helmet the same chance to flush it gets in the passing cases.
    await waitFor(() =>
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow'
      )
    );
    expect(alternates()).toEqual([]);
  });

  it('x-default resolves to the default locale URL', async () => {
    renderHead();
    await waitFor(() => expect(alternates().length).toBeGreaterThan(0));

    const tags = alternates();
    const xDefault = tags.find((t) => t.hreflang === 'x-default');
    const primary = tags.find((t) => t.hreflang?.startsWith(DEFAULT_SEO_LOCALE.lang));
    expect(xDefault?.href).toBe(primary?.href);
  });
});

describe('the locale list has one home (US-652)', () => {
  it('matches the i18n resource files exactly', () => {
    // A locale file added without an SEO_LOCALES entry ships a language search
    // engines are never told about. This is the assertion that stops it.
    expect(Object.keys(resources).sort()).toEqual(SEO_LOCALES.map((l) => l.lang).sort());
  });

  it('declares no region until there is a region-specific page to point at', () => {
    // en-US would tell Google this page is for the United States, which is
    // wrong for the UK, Canadian and Australian parents already reading it.
    for (const locale of SEO_LOCALES) {
      expect(locale.region).toBeUndefined();
    }
  });

  it('still ships only English, so this is wiring and not a launch', () => {
    expect(SEO_LOCALES.map((l) => l.lang)).toEqual(['en']);
    expect(DEFAULT_SEO_LOCALE.lang).toBe('en');
  });
});
