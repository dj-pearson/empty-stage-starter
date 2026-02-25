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
                id: 'activity-1',
                user_id: 'user-1',
                email: 'test@example.com',
                full_name: 'Test User',
                activity_type: 'login',
                activity_data: {},
                metadata: {},
                severity: 'info',
                created_at: '2026-02-25T12:00:00Z',
              },
              {
                id: 'activity-2',
                user_id: 'user-2',
                email: 'admin@example.com',
                full_name: 'Admin User',
                activity_type: 'signup',
                activity_data: {},
                metadata: {},
                severity: 'info',
                created_at: '2026-02-25T11:30:00Z',
              },
            ],
            error: null,
          }),
        }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockReturnValue({}),
      }),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { LiveActivityFeed } from './LiveActivityFeed';

describe('LiveActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<LiveActivityFeed />);
    expect(document.body).toBeTruthy();
  });

  it('renders the component container', () => {
    const { container } = render(<LiveActivityFeed />);
    expect(container.firstChild).toBeTruthy();
  });
});
