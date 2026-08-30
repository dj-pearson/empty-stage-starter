import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QUIZ_PAGE, BUDGET_PAGE } from '@/lib/tool-page-content';
import { getAllPersonalityTypes } from '@/lib/quiz/personalityTypes';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/conversion-tracking', () => ({
  trackQuizStart: vi.fn(),
  trackQuizComplete: vi.fn(),
  trackPageView: vi.fn(),
}));

import PickyEaterQuiz from './PickyEaterQuiz';
import BudgetCalculator from './BudgetCalculator';

/**
 * US-648. These two pages rank on almost no text: /picky-eater-quiz prerendered 106
 * words at position 10.8 on 1,754 impressions, /budget-calculator 270 words at position
 * 21.8 on 2,566. Both are interactive forms, and a form gives a crawler nothing.
 *
 * The fix only works if the prose is in the FIRST render. scripts/prerender.mjs
 * snapshots the page as it loads, so anything revealed by a click (which is where the
 * six eating patterns used to live, behind finishing the quiz and an email capture)
 * ships as an empty shell to GPTBot, PerplexityBot, ClaudeBot and every social scraper.
 *
 * So these assert on initial paint with nothing clicked, and they assert a word count,
 * because "we added a section" and "the page now has something to rank" are different
 * claims and only the second one is the point.
 */
function renderPage(ui: React.ReactElement, route: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </HelmetProvider>,
  );
}

function wordCount(container: HTMLElement): number {
  return (container.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
}

describe('/picky-eater-quiz first render', () => {
  it('shows the direct answer without anyone clicking Start Quiz', () => {
    const { container } = renderPage(<PickyEaterQuiz />, '/picky-eater-quiz');
    expect(container.textContent).toContain(QUIZ_PAGE.answer);
  });

  it('shows all six eating patterns, which used to need the quiz and an email', () => {
    const { container } = renderPage(<PickyEaterQuiz />, '/picky-eater-quiz');
    const text = container.textContent ?? '';
    for (const type of getAllPersonalityTypes()) {
      expect(text, `${type.name} is missing from first paint`).toContain(type.name);
      expect(text).toContain(type.primaryChallenge);
    }
  });

  it('answers the adult self-assessment queries on the page itself', () => {
    const { container } = renderPage(<PickyEaterQuiz />, '/picky-eater-quiz');
    const text = container.textContent ?? '';
    expect(text).toContain(QUIZ_PAGE.adultNote.heading);
    for (const paragraph of QUIZ_PAGE.adultNote.body) {
      expect(text).toContain(paragraph);
    }
  });

  it('renders every FAQ, so the FAQPage markup describes visible content', () => {
    // FAQ markup whose answers are not on the page is a structured data violation, not
    // just bad manners.
    const { container } = renderPage(<PickyEaterQuiz />, '/picky-eater-quiz');
    for (const faq of QUIZ_PAGE.faqs) {
      expect(container.textContent).toContain(faq.question);
      expect(container.textContent).toContain(faq.answer);
    }
  });

  it('carries far more than the 106 words it prerendered before', () => {
    // 1,609 at the time of writing. The floor is set well below that so ordinary edits
    // do not trip it, and well above 106 so deleting the section does.
    const { container } = renderPage(<PickyEaterQuiz />, '/picky-eater-quiz');
    expect(wordCount(container)).toBeGreaterThan(1200);
  });
});

describe('/budget-calculator first render', () => {
  it('shows the direct answer and the intro above the fold of the crawler', () => {
    const { container } = renderPage(<BudgetCalculator />, '/budget-calculator');
    const text = container.textContent ?? '';
    expect(text).toContain(BUDGET_PAGE.answer);
    for (const paragraph of BUDGET_PAGE.intro) {
      expect(text).toContain(paragraph);
    }
  });

  it('renders every FAQ, so the FAQPage markup describes visible content', () => {
    const { container } = renderPage(<BudgetCalculator />, '/budget-calculator');
    for (const faq of BUDGET_PAGE.faqs) {
      expect(container.textContent).toContain(faq.question);
      expect(container.textContent).toContain(faq.answer);
    }
  });

  it('quotes the USDA figures on the page, not only in the schema', () => {
    const { container } = renderPage(<BudgetCalculator />, '/budget-calculator');
    for (const figure of ['$818', '$1,072', '$1,334', '$1,604']) {
      expect(container.textContent, `${figure} is not on the page`).toContain(figure);
    }
  });

  it('carries far more than the 270 words it prerendered before', () => {
    // 939 at the time of writing, against 270 before.
    const { container } = renderPage(<BudgetCalculator />, '/budget-calculator');
    expect(wordCount(container)).toBeGreaterThan(800);
  });
});
