import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

let capturedJsonLd: string = '';
vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => {
    const childArray = React.Children.toArray(children);
    childArray.forEach((child: unknown) => {
      if (React.isValidElement(child) && child.type === 'script') {
        capturedJsonLd = (child.props as { children?: string }).children || '';
      }
    });
    return null;
  },
}));

import { BreadcrumbSchema } from './BreadcrumbSchema';

describe('BreadcrumbSchema', () => {
  const mockItems = [
    { name: 'Home', url: 'https://tryeatpal.com' },
    { name: 'Blog', url: 'https://tryeatpal.com/blog' },
    { name: 'Article', url: 'https://tryeatpal.com/blog/article' },
  ];

  it('renders without crashing', () => {
    render(<BreadcrumbSchema items={mockItems} />);
    expect(document.body).toBeTruthy();
  });

  it('generates valid JSON-LD with BreadcrumbList type', () => {
    render(<BreadcrumbSchema items={mockItems} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('BreadcrumbList');
  });

  it('includes all breadcrumb items with correct positions', () => {
    render(<BreadcrumbSchema items={mockItems} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed.itemListElement).toHaveLength(3);
    expect(parsed.itemListElement[0].position).toBe(1);
    expect(parsed.itemListElement[1].position).toBe(2);
    expect(parsed.itemListElement[2].position).toBe(3);
  });

  it('formats items as ListItem type', () => {
    render(<BreadcrumbSchema items={mockItems} />);

    const parsed = JSON.parse(capturedJsonLd);
    parsed.itemListElement.forEach((item: Record<string, unknown>) => {
      expect(item['@type']).toBe('ListItem');
    });
  });

  it('includes correct names and URLs', () => {
    render(<BreadcrumbSchema items={mockItems} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed.itemListElement[0].name).toBe('Home');
    expect(parsed.itemListElement[0].item).toBe('https://tryeatpal.com');
    expect(parsed.itemListElement[1].name).toBe('Blog');
    expect(parsed.itemListElement[2].name).toBe('Article');
  });

  it('handles single breadcrumb item', () => {
    render(<BreadcrumbSchema items={[{ name: 'Home', url: 'https://tryeatpal.com' }]} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed.itemListElement).toHaveLength(1);
  });
});
