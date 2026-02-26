import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable mock query builder that resolves with provided data
function createMockQueryBuilder(resolvedValue: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'eq', 'neq', 'gt', 'gte',
    'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'order',
    'limit', 'offset', 'single', 'maybeSingle', 'range',
  ];
  methods.forEach((m) => {
    builder[m] = vi.fn().mockReturnValue(builder);
  });
  // The terminal .then is called when the query is awaited
  builder.then = (resolve: (v: typeof resolvedValue) => void) => {
    resolve(resolvedValue);
    return Promise.resolve(resolvedValue);
  };
  return builder;
}

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: vi.fn().mockImplementation(() =>
      createMockQueryBuilder({
        data: [
          {
            metric_type: 'api_response_time_p50',
            metric_value: 85,
            metric_unit: 'ms',
            recorded_at: '2026-02-25T12:00:00Z',
          },
          {
            metric_type: 'api_response_time_p95',
            metric_value: 180,
            metric_unit: 'ms',
            recorded_at: '2026-02-25T12:00:00Z',
          },
          {
            metric_type: 'error_rate',
            metric_value: 0.35,
            metric_unit: '%',
            recorded_at: '2026-02-25T12:00:00Z',
          },
          {
            metric_type: 'active_users',
            metric_value: 42,
            metric_unit: 'users',
            recorded_at: '2026-02-25T12:00:00Z',
          },
        ],
        error: null,
        count: 42,
      })
    ),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

import { SystemHealthDashboard } from './SystemHealthDashboard';

describe('SystemHealthDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<SystemHealthDashboard />);
    expect(document.body).toBeTruthy();
  });

  it('renders the component container', () => {
    const { container } = render(<SystemHealthDashboard />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders the System Health heading', () => {
    render(<SystemHealthDashboard />);
    // "System Health" appears as both a heading and a quick stats card label
    const matches = screen.getAllByText('System Health');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Live badge', () => {
    render(<SystemHealthDashboard />);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('renders a manual refresh button', () => {
    render(<SystemHealthDashboard />);
    expect(screen.getByTitle('Refresh metrics')).toBeTruthy();
  });

  it('renders database connection status section', () => {
    render(<SystemHealthDashboard />);
    // On initial render the component checks connection; should show one of the states
    const container = document.body;
    const hasDbStatus =
      container.textContent?.includes('Database Connected') ||
      container.textContent?.includes('Database Disconnected') ||
      container.textContent?.includes('Checking');
    expect(hasDbStatus).toBe(true);
  });

  it('renders the error rate trend chart section', () => {
    render(<SystemHealthDashboard />);
    expect(screen.getByText('Error Rate Trend (Last 24 Hours)')).toBeTruthy();
  });

  it('renders the Performance quick stats card', () => {
    render(<SystemHealthDashboard />);
    expect(screen.getByText('Performance')).toBeTruthy();
  });

  it('renders active users metric card', () => {
    render(<SystemHealthDashboard />);
    // "Active Users" appears in both the metric grid and the quick stats card
    const matches = screen.getAllByText('Active Users');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
