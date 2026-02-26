import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                metric_type: 'cpu_usage',
                metric_value: 45.2,
                metric_unit: '%',
                recorded_at: '2026-02-25T12:00:00Z',
              },
              {
                metric_type: 'memory_usage',
                metric_value: 62.8,
                metric_unit: '%',
                recorded_at: '2026-02-25T12:00:00Z',
              },
              {
                metric_type: 'api_latency',
                metric_value: 125,
                metric_unit: 'ms',
                recorded_at: '2026-02-25T12:00:00Z',
              },
            ],
            error: null,
          }),
        }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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
});
