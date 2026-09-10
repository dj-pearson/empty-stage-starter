import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { NoIndexOnError } from './NoIndexOnError';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/sentry', () => ({ logError: vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/pricing' }),
}));

const robots = () => Array.from(document.head.querySelectorAll('meta[name="robots"]'));

function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

/** The head index.html ships, which describes the homepage on every URL. */
function seedShellHead() {
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'robots');
  meta.setAttribute('content', 'index, follow, max-image-preview:large');
  meta.setAttribute('data-rh', 'true');
  document.head.appendChild(meta);
}

describe('NoIndexOnError', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('adds a noindex directive while mounted', () => {
    const { unmount } = render(<NoIndexOnError />);

    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute('content')).toBe('noindex, follow');

    unmount();
    expect(robots()).toHaveLength(0);
  });

  it('leaves exactly one directive, not a contradicting pair', () => {
    seedShellHead();
    render(<NoIndexOnError />);

    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute('content')).toBe('noindex, follow');
  });

  it('puts the displaced directive back when the error clears', () => {
    seedShellHead();
    const { unmount } = render(<NoIndexOnError />);
    unmount();

    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute('content')).toBe('index, follow, max-image-preview:large');
  });
});

describe('a crashed route is not indexable', () => {
  beforeEach(() => {
    document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('RouteErrorBoundary noindexes the page it caught for', () => {
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>,
    );

    expect(screen.getByText(/encountered an error/i)).toBeInTheDocument();
    expect(robots()[0]?.getAttribute('content')).toBe('noindex, follow');
  });

  it('goes back to indexable when Try Again recovers', async () => {
    seedShellHead();
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('kaboom');
      return <p>recovered</p>;
    }

    render(
      <RouteErrorBoundary>
        <Flaky />
      </RouteErrorBoundary>,
    );
    expect(robots()[0].getAttribute('content')).toBe('noindex, follow');

    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute('content')).toBe('index, follow, max-image-preview:large');
  });

  it('the full-page boundary noindexes too', () => {
    render(
      <ErrorBoundary fullPage>
        <Boom />
      </ErrorBoundary>,
    );

    expect(robots()[0]?.getAttribute('content')).toBe('noindex, follow');
  });

  it('a single failed widget does not noindex the page around it', () => {
    seedShellHead();
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute('content')).toBe('index, follow, max-image-preview:large');
  });
});
