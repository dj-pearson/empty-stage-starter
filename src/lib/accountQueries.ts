import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { sharedQuery } from '@/lib/sharedQuery';

/**
 * US-866: the account-level reads more than one hook needs, defined once.
 *
 * The keys matter as much as the functions. useNavEntitlements and
 * useWhiteLabelTheme both want "my active subscription and its plan name", and
 * before this they each wrote the query out and each paid for it. Two callers of
 * the same exported function with the same key share one request; two hand-rolled
 * copies of the same query never can, however identical they are.
 */

export interface ActiveSubscription {
  status: string | null;
  subscription_plans?: { name: string } | null;
}

export const adminRoleKey = (userId: string) => `user_roles:admin:${userId}`;
export const activeSubscriptionKey = (userId: string) => `user_subscriptions:active:${userId}`;
export const hasPasswordKey = () => 'rpc:current_user_has_password';
export const effectivePlanNameKey = (userId: string) => `rpc:current_user_plan_name:${userId}`;

type PlanNameResult = Database['public']['Functions']['current_user_plan_name']['Returns'];

/** The caller's active subscription with its plan name, or null. */
export function fetchActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  return sharedQuery(activeSubscriptionKey(userId), async () => {
    const { data } = await supabase
      .from('user_subscriptions')
      .select(`
        status,
        subscription_plans(name)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    return (data as ActiveSubscription | null) ?? null;
  });
}

/**
 * The name of the plan the server enforces for the caller, or null.
 *
 * current_user_plan_name resolves through effective_plan_id, so a trial, an
 * App Store subscription or a complimentary grant answers the same as a Stripe
 * card. fetchActiveSubscription only sees Stripe rows with status 'active' and
 * so misses all three; anything that gates on the plan asks this instead.
 *
 * An RPC error rejects (sharedQuery never caches a rejection), so a caller can
 * tell "not Professional" from "could not find out".
 */
export function fetchEffectivePlanName(userId: string): Promise<string | null> {
  return sharedQuery(effectivePlanNameKey(userId), async () => {
    const { data, error } = await supabase.rpc('current_user_plan_name');
    if (error) throw error;
    const name: PlanNameResult | null = data ?? null;
    return typeof name === 'string' && name.length > 0 ? name : null;
  });
}

/** Does the signed-in account have a password set (as opposed to OAuth only)? */
export function fetchHasPassword(): Promise<boolean> {
  return sharedQuery(hasPasswordKey(), async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('current_user_has_password');
    if (error) throw error;
    return Boolean(data);
  });
}
