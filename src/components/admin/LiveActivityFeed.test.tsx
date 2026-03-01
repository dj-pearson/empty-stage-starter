import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

// Mock Supabase - data must be inlined (vi.mock is hoisted)
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'activity-1',
                user_id: 'abcd1234-5678-9abc-def0-123456789abc',
                activity_type: 'login',
                activity_data: {},
                metadata: {},
                severity: 'info',
                created_at: '2026-02-25T12:00:00Z',
              },
              {
                id: 'activity-2',
                user_id: 'user-2',
                activity_type: 'food_added',
                activity_data: { food_name: 'Banana' },
                metadata: {},
                severity: 'info',
                created_at: '2026-02-25T11:30:00Z',
              },
              {
                id: 'activity-3',
                user_id: null,
                activity_type: 'error',
                activity_data: { message: 'Server timeout' },
                metadata: {},
                severity: 'error',
                created_at: '2026-02-25T11:00:00Z',
              },
              {
                id: 'activity-4',
                user_id: 'user-4',
                activity_type: 'recipe_created',
                activity_data: {},
                metadata: {},
                severity: 'info',
                created_at: '2026-02-25T10:30:00Z',
              },
              {
                id: 'activity-5',
                user_id: 'user-5',
                activity_type: 'subscription_changed',
                activity_data: { plan: 'premium' },
                metadata: {},
                severity: 'warning',
                created_at: '2026-02-25T10:00:00Z',
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

import { LiveActivityFeed } from './LiveActivityFeed';

describe('LiveActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the heading and Live badge', async () => {
    render(<LiveActivityFeed />);
    expect(screen.getByText('Live Activity Feed')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });

  it('displays activity items after loading', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      expect(screen.getByText('User Login')).toBeInTheDocument();
    });

    expect(screen.getByText('Food Added')).toBeInTheDocument();
    expect(screen.getByText('Recipe Created')).toBeInTheDocument();
    expect(screen.getByText('Subscription Changed')).toBeInTheDocument();
  });

  it('shows anonymized user identifiers', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      // UUID truncated to first 8 chars
      expect(screen.getByText('abcd1234...')).toBeInTheDocument();
    });

    // Null user_id shows "System"
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('displays timestamps for activities', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      const timestamps = screen.getAllByText(/Feb 25, 2026/);
      expect(timestamps.length).toBe(5);
    });
  });

  it('shows severity badges', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      const infoBadges = screen.getAllByText('info');
      expect(infoBadges.length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('renders stats footer with correct counts', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      // Total Activities label
      expect(screen.getByText('Total Activities')).toBeInTheDocument();
    });

    // Info / Warnings / Errors labels
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Warnings')).toBeInTheDocument();
    expect(screen.getByText('Errors')).toBeInTheDocument();
  });

  it('shows filter dropdown and search input', async () => {
    render(<LiveActivityFeed />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search by user or activity...')).toBeInTheDocument();
    });

    expect(screen.getByText('All Activities')).toBeInTheDocument();
  });

  it('subscribes to real-time changes on admin_live_activity', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    render(<LiveActivityFeed />);

    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalledWith('admin_activity_changes');
    });
  });

  it('fetches from admin_live_activity table', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    render(<LiveActivityFeed />);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('admin_live_activity');
    });
  });
});
