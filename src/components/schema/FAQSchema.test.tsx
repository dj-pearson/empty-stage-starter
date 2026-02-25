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

import { FAQSchema } from './FAQSchema';

describe('FAQSchema', () => {
  const mockFaqs = [
    { question: 'What is EatPal?', answer: 'EatPal is a meal planning app for families.' },
    { question: 'How does it help picky eaters?', answer: 'Through food chaining and gradual exposure.' },
  ];

  it('renders without crashing', () => {
    render(<FAQSchema faqs={mockFaqs} />);
    expect(document.body).toBeTruthy();
  });

  it('generates valid JSON-LD with FAQPage type', () => {
    render(<FAQSchema faqs={mockFaqs} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('FAQPage');
  });

  it('includes all FAQ entries as Question items', () => {
    render(<FAQSchema faqs={mockFaqs} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed.mainEntity).toHaveLength(2);
  });

  it('formats questions correctly', () => {
    render(<FAQSchema faqs={mockFaqs} />);

    const parsed = JSON.parse(capturedJsonLd);
    const firstQuestion = parsed.mainEntity[0];

    expect(firstQuestion['@type']).toBe('Question');
    expect(firstQuestion.name).toBe('What is EatPal?');
    expect(firstQuestion.acceptedAnswer['@type']).toBe('Answer');
    expect(firstQuestion.acceptedAnswer.text).toBe('EatPal is a meal planning app for families.');
  });

  it('handles empty FAQ array', () => {
    render(<FAQSchema faqs={[]} />);

    const parsed = JSON.parse(capturedJsonLd);
    expect(parsed.mainEntity).toHaveLength(0);
  });

  it('includes second FAQ entry correctly', () => {
    render(<FAQSchema faqs={mockFaqs} />);

    const parsed = JSON.parse(capturedJsonLd);
    const secondQuestion = parsed.mainEntity[1];

    expect(secondQuestion.name).toBe('How does it help picky eaters?');
    expect(secondQuestion.acceptedAnswer.text).toBe('Through food chaining and gradual exposure.');
  });
});
