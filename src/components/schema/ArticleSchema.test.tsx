import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock react-helmet-async to capture the JSON-LD output
let capturedJsonLd: string = '';
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => {
    // Extract JSON-LD from script children
    const childArray = React.Children.toArray(children);
    childArray.forEach((child: unknown) => {
      if (React.isValidElement(child) && child.type === 'script') {
        capturedJsonLd = (child.props as { children?: string }).children || '';
      }
    });
    return null;
  },
}));

import { ArticleSchema } from './ArticleSchema';

describe('ArticleSchema', () => {
  it('renders without crashing', () => {
    render(
      <ArticleSchema
        title="Test Article"
        description="Test description"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );
    expect(document.body).toBeTruthy();
  });

  it('generates valid JSON-LD', () => {
    render(
      <ArticleSchema
        title="Meal Planning for Picky Eaters"
        description="Tips for meal planning"
        url="https://tryeatpal.com/blog/meal-planning"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@graph']).toBeDefined();
    expect(Array.isArray(parsed['@graph'])).toBe(true);
  });

  it('includes Article type in graph', () => {
    render(
      <ArticleSchema
        title="Test Article"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const article = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Article');
    expect(article).toBeDefined();
    expect(article.headline).toBe('Test Article');
    expect(article.description).toBe('Test');
  });

  it('emits no BreadcrumbList of its own', () => {
    // Every page rendering this also renders a real breadcrumb -- BlogPost through
    // BreadcrumbNavigation, PseoPage through BreadcrumbSchema. This component used to
    // add a second, hardcoded Home -> Blog -> title, so articles shipped two
    // BreadcrumbList entities that disagreed, and on a guide the hardcoded one claimed
    // /blog as the parent of /guides/foods/<slug>.
    render(
      <ArticleSchema
        title="Chicken Nuggets"
        description="A food chaining guide"
        url="https://tryeatpal.com/guides/foods/chicken-nuggets"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const types = parsed['@graph'].map((item: Record<string, unknown>) => item['@type']);
    expect(types).not.toContain('BreadcrumbList');
  });

  it('leaves no dangling breadcrumb reference on the WebPage', () => {
    render(
      <ArticleSchema
        title="Test"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const webPage = parsed['@graph'].find(
      (item: Record<string, unknown>) => item['@type'] === 'WebPage',
    );
    expect(webPage).toBeDefined();
    expect(webPage.breadcrumb).toBeUndefined();
  });

  it('includes WebPage in graph', () => {
    render(
      <ArticleSchema
        title="Test"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const webpage = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'WebPage');
    expect(webpage).toBeDefined();
  });

  it('uses default author and publisher', () => {
    render(
      <ArticleSchema
        title="Test"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const article = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Article');
    // A named human, not "EatPal Team". Google reads an organisation-as-author byline on
    // health content as an absence of authorship, and every pSEO guide renders this
    // schema with the defaults. The author URL has to resolve to a page that actually
    // describes who wrote it; see src/pages/Authors.tsx.
    expect(article.author.name).toBe('Dj Pearson');
    expect(article.author.url).toBe('https://tryeatpal.com/authors');
    expect(article.publisher.name).toBe('EatPal');
  });

  it('uses custom author when provided', () => {
    render(
      <ArticleSchema
        title="Test"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
        authorName="Custom Author"
        authorUrl="https://example.com"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const article = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Article');
    expect(article.author.name).toBe('Custom Author');
    expect(article.author.url).toBe('https://example.com');
  });

  it('includes keywords when provided', () => {
    render(
      <ArticleSchema
        title="Test"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
        keywords={['meal planning', 'picky eaters']}
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const article = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'Article');
    expect(article.keywords).toBe('meal planning, picky eaters');
  });
});
