/**
 * Opening Stripe's customer portal. The URL comes back from an edge function,
 * so it is checked before the browser is sent anywhere: https only, and a host
 * under stripe.com. The page is then replaced in the same tab (a post-await
 * window.open is blocked as a popup by iOS Safari and other mobile
 * browsers), and Stripe's return_url brings the user back.
 *
 * A failure is a toast. It never sends an already-paying user to /pricing.
 */
import type { EdgeFunctionResponse } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import '@/i18n/appLocale';

export type BillingPortalInvoke = (
  functionName: string,
  options: { body: { action: 'get-portal-url' } },
) => Promise<EdgeFunctionResponse<{ url?: string } | unknown>>;

export type BillingPortalTranslate = (key: string, options: { defaultValue: string }) => string;

/** True for an https URL whose host is stripe.com or a subdomain of it. */
export function isStripePortalUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host.endsWith('.stripe.com');
}

function urlFrom(data: unknown): unknown {
  if (data && typeof data === 'object' && 'url' in data) return (data as { url?: unknown }).url;
  return undefined;
}

/**
 * Ask manage-payment-methods for a portal session and go to it.
 * Resolves true when the browser was sent to Stripe.
 */
export async function openBillingPortal({
  invoke,
  t,
}: {
  invoke: BillingPortalInvoke;
  t: BillingPortalTranslate;
}): Promise<boolean> {
  try {
    const { data, error } = await invoke('manage-payment-methods', { body: { action: 'get-portal-url' } });
    if (error) throw error;
    const url = urlFrom(data);
    if (!url) {
      toast.error(t('billing.portal.unavailable', { defaultValue: "The billing portal isn't available right now. Try again in a minute." }));
      return false;
    }
    if (!isStripePortalUrl(url)) {
      logger.error('Refused a billing portal URL that is not on stripe.com');
      toast.error(t('billing.portal.badUrl', { defaultValue: "We couldn't open the billing portal safely. Nothing was changed." }));
      return false;
    }
    window.location.assign(url);
    return true;
  } catch (err) {
    logger.error('Error opening Stripe portal:', err);
    if (err instanceof Error && err.message.includes('No subscription')) {
      toast.info(t('billing.portal.noCustomer', { defaultValue: "There's no card billing on this account yet, so there's nothing to manage in the portal." }));
    } else {
      toast.error(t('billing.portal.failed', { defaultValue: "Couldn't open the billing portal. Nothing about your billing has changed." }));
    }
    return false;
  }
}
