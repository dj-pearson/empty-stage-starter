import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => toastError(...a), info: (...a: unknown[]) => toastInfo(...a), success: vi.fn() }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isStripePortalUrl, openBillingPortal } from './billingPortal';

const t = (_key: string, opts: { defaultValue: string }) => opts.defaultValue;

describe('openBillingPortal', () => {
  const assign = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign, pathname: '/dashboard/billing' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('assigns a stripe.com URL in the same tab', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { url: 'https://billing.stripe.com/p/session_1' }, error: null });
    await expect(openBillingPortal({ invoke, t })).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('manage-payment-methods', { body: { action: 'get-portal-url' } });
    expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session_1');
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    'http://billing.stripe.com/p/session_1',
    'https://evil.com/p/session_1',
    'https://billing.stripe.com.evil.com/p/session_1',
    'javascript:alert(1)',
    'not a url',
  ])('refuses %s with a toast', async (url) => {
    const invoke = vi.fn().mockResolvedValue({ data: { url }, error: null });
    await expect(openBillingPortal({ invoke, t })).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('never sends anyone to /pricing when the function errors', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error('No subscription found') });
    await expect(openBillingPortal({ invoke, t })).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/dashboard/billing');
    expect(toastInfo).toHaveBeenCalledTimes(1);
  });

  it('toasts rather than throws when invoke rejects', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('network'));
    await expect(openBillingPortal({ invoke, t })).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('toasts when no URL comes back', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: {}, error: null });
    await expect(openBillingPortal({ invoke, t })).resolves.toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

describe('isStripePortalUrl', () => {
  it('accepts https hosts under stripe.com only', () => {
    expect(isStripePortalUrl('https://billing.stripe.com/p/x')).toBe(true);
    expect(isStripePortalUrl('https://BILLING.STRIPE.COM/p/x')).toBe(true);
    expect(isStripePortalUrl('https://notstripe.com/p/x')).toBe(false);
    expect(isStripePortalUrl('https://stripe.com.evil.com/p/x')).toBe(false);
    expect(isStripePortalUrl(undefined)).toBe(false);
  });
});
