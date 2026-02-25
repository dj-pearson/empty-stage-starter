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

  it('includes BreadcrumbList in graph', () => {
    render(
      <ArticleSchema
        title="Test Article"
        description="Test"
        url="https://tryeatpal.com/blog/test"
        datePublished="2026-01-15"
      />
    );

    const parsed = JSON.parse(capturedJsonLd);
    const breadcrumb = parsed['@graph'].find((item: Record<string, unknown>) => item['@type'] === 'BreadcrumbList');
    expect(breadcrumb).toBeDefined();
    expect(breadcrumb.itemListElement).toHaveLength(3);
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
    expect(article.author.name).toBe('EatPal Team');
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
