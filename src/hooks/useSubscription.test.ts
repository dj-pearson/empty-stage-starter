import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the hook
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnValue({
        subscribe: vi.fn().mockReturnValue({}),
      }),
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

vi.mock('@/lib/edge-functions', () => ({
  invokeEdgeFunction: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));

import { useSubscription } from './useSubscription';

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial loading state', () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.loading).toBe(true);
    expect(result.current.subscription).toBeNull();
  });

  it('returns null subscription when no user is logged in', async () => {
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.subscription).toBeNull();
  });

  it('provides status helper properties', async () => {
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // With null subscription, all status helpers should be false
    expect(result.current.isActive).toBe(false);
    expect(result.current.isTrialing).toBe(false);
    expect(result.current.isPastDue).toBe(false);
    expect(result.current.isCanceled).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.willCancelAtPeriodEnd).toBe(false);
  });

  it('exposes action methods', async () => {
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.upgrade).toBe('function');
    expect(typeof result.current.cancel).toBe('function');
    expect(typeof result.current.reactivate).toBe('function');
    expect(typeof result.current.changeBillingCycle).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('actionLoading is initially false', async () => {
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.actionLoading).toBe(false);
  });
});
