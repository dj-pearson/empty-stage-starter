import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase - vi.mock is hoisted, so all data must be inline
vi.mock('@/integrations/supabase/client', () => {
  const alerts = [
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
    {
      id: 'alert-2',
      alert_type: 'disk_usage_high',
      severity: 'medium',
      title: 'Disk Usage Warning',
      message: 'Disk usage at 90%',
      alert_data: { disk_percent: 90 },
      is_read: true,
      is_resolved: true,
      resolved_by: 'user-1',
      resolved_at: '2026-02-25T14:00:00Z',
      created_at: '2026-02-25T10:00:00Z',
      updated_at: '2026-02-25T14:00:00Z',
    },
  ];

  const rules = [
    {
      id: 'rule-1',
      alert_type: 'error_rate_high',
      threshold: 5,
      notification_channel: 'email',
      is_active: true,
      created_at: '2026-02-25T12:00:00Z',
    },
  ];

  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: alerts, error: null }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: rules[0], error: null }),
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
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      },
    },
  };
});

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
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

  it('renders the header with Alert Notifications title', () => {
    render(<AlertManager />);
    expect(screen.getByText('Alert Notifications')).toBeTruthy();
  });

  it('renders the alerts section', () => {
    const { container } = render(<AlertManager />);
    expect(container.firstChild).toBeTruthy();
  });

  it('renders stats cards', () => {
    render(<AlertManager />);
    expect(screen.getByText('Unresolved Alerts')).toBeTruthy();
    expect(screen.getByText('Critical Alerts')).toBeTruthy();
    expect(screen.getByText('Unread Alerts')).toBeTruthy();
    expect(screen.getByText('Active Rules')).toBeTruthy();
  });

  it('renders tabs for Active Alerts, Alert Rules, and Alert History', () => {
    render(<AlertManager />);
    expect(screen.getByText('Active Alerts')).toBeTruthy();
    expect(screen.getByText('Alert Rules')).toBeTruthy();
    expect(screen.getByText('Alert History')).toBeTruthy();
  });

  it('renders Show All toggle button', () => {
    render(<AlertManager />);
    expect(screen.getByText('Show All')).toBeTruthy();
  });
});
