import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'flag-1',
              key: 'new_feature',
              name: 'New Feature',
              description: 'A new feature flag',
              enabled: true,
              rollout_percentage: 100,
              targeting_rules: {},
              users_last_7d: 42,
              enabled_count_7d: 38,
              adoption_rate_7d: 90.5,
              created_at: '2026-02-20T12:00:00Z',
              updated_at: '2026-02-25T12:00:00Z',
            },
            {
              id: 'flag-2',
              key: 'beta_feature',
              name: 'Beta Feature',
              description: 'A beta feature',
              enabled: false,
              rollout_percentage: 50,
              targeting_rules: {},
              users_last_7d: 10,
              enabled_count_7d: 5,
              adoption_rate_7d: 50.0,
              created_at: '2026-02-22T12:00:00Z',
              updated_at: '2026-02-25T12:00:00Z',
            },
          ],
          error: null,
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-flag' }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { FeatureFlagDashboard } from './FeatureFlagDashboard';

describe('FeatureFlagDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<FeatureFlagDashboard />);
    expect(document.body).toBeTruthy();
  });

  it('renders the component container', () => {
    const { container } = render(<FeatureFlagDashboard />);
    expect(container.firstChild).toBeTruthy();
  });
});
