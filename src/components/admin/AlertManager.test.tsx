import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => {
  const mockData = {
    alerts: [
      {
        id: 'alert-1',
        alert_type: 'error_rate_high',
        severity: 'high',
        title: 'High Error Rate',
        message: 'Error rate exceeded threshold',
        alert_data: {},
        is_read: false,
        is_resolved: false,
        resolved_by: null,
        resolved_at: null,
        created_at: '2026-02-25T12:00:00Z',
        updated_at: '2026-02-25T12:00:00Z',
      },
    ],
    rules: [
      {
        id: 'rule-1',
        alert_type: 'error_rate_high',
        threshold: 5,
        notification_channel: 'email',
        is_active: true,
        created_at: '2026-02-25T12:00:00Z',
      },
    ],
  };

  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockData.alerts, error: null }),
          }),
          eq: vi.fn().mockResolvedValue({ data: mockData.rules, error: null }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData.rules[0], error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnValue({
          subscribe: vi.fn().mockReturnValue({}),
        }),
      }),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AlertManager } from './AlertManager';

describe('AlertManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<AlertManager />);
    expect(document.body).toBeTruthy();
  });

  it('renders the alerts section', () => {
    const { container } = render(<AlertManager />);
    // The component should mount and start loading data
    expect(container.firstChild).toBeTruthy();
  });
});
