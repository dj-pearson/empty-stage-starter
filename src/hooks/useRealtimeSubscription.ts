import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

const subscriptionLog = logger.withContext('RealtimeSub');

/** Global registry of active subscriptions for debugging */
const activeSubscriptions = new Map<string, { createdAt: number; table: string }>();

/**
 * Returns a snapshot of all active real-time subscriptions.
 * Useful for debugging in the browser console.
 */
export function getActiveSubscriptions(): ReadonlyMap<string, { createdAt: number; table: string }> {
  return activeSubscriptions;
}

/**
 * Register an externally-managed subscription in the global tracking registry.
 * Use this for subscriptions not created via `useRealtimeSubscription` (e.g. AppContext).
 */
export function registerSubscription(channelName: string, table: string): void {
  if (activeSubscriptions.has(channelName)) {
    subscriptionLog.warn('Duplicate subscription detected (external)', { channelName, table });
  }
  subscriptionLog.debug('Registering external subscription', { channelName, table });
  activeSubscriptions.set(channelName, { createdAt: Date.now(), table });
}

/**
 * Unregister an externally-managed subscription from the global tracking registry.
 */
export function unregisterSubscription(channelName: string): void {
  subscriptionLog.debug('Unregistering external subscription', { channelName });
  activeSubscriptions.delete(channelName);
}

interface SubscriptionConfig {
  /** Unique channel name. Must be stable across renders. */
  channelName: string;
  /** The database table to subscribe to. */
  table: string;
  /** Schema (defaults to 'public'). */
  schema?: string;
  /** Event filter: '*', 'INSERT', 'UPDATE', or 'DELETE'. */
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  /** Optional column filter string, e.g. `household_id=eq.abc123`. */
  filter?: string;
  /** Whether the subscription should be active. Pass false to skip subscribing. */
  enabled?: boolean;
}

/**
 * Custom hook that manages a single Supabase real-time postgres_changes subscription.
 *
 * Handles:
 * - Proper cleanup via `supabase.removeChannel()` on unmount/dependency change
 * - Duplicate subscription prevention (warns if same channel name already active)
 * - Dev-mode lifecycle logging (subscribe, unsubscribe, payload received)
 * - Global registry for debugging
 *
 * @param config - Subscription configuration
 * @param callback - Handler called when a change event is received
 * @param deps - Additional dependency array values that should trigger resubscription
 */
export function useRealtimeSubscription<T extends Record<string, unknown>>(
  config: SubscriptionConfig,
  callback: (payload: RealtimePostgresChangesPayload<T>) => void,
  deps: unknown[] = [],
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const {
    channelName,
    table,
    schema = 'public',
    event = '*',
    filter,
    enabled = true,
  } = config;

  useEffect(() => {
    if (!enabled) return;

    // Warn about duplicate channel names
    if (activeSubscriptions.has(channelName)) {
      subscriptionLog.warn('Duplicate subscription detected', {
        channelName,
        table,
        existingCreatedAt: activeSubscriptions.get(channelName)?.createdAt,
      });
    }

    subscriptionLog.debug('Subscribing', { channelName, table, event, filter });

    const channelConfig: {
      event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
      schema: string;
      table: string;
      filter?: string;
    } = { event, schema, table };

    if (filter) {
      channelConfig.filter = filter;
    }

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        channelConfig,
        (payload) => {
          subscriptionLog.debug('Change received', {
            channelName,
            table,
            eventType: payload.eventType,
          });
          callbackRef.current(payload as RealtimePostgresChangesPayload<T>);
        },
      )
      .subscribe((status) => {
        subscriptionLog.debug('Channel status changed', { channelName, status });
      });

    activeSubscriptions.set(channelName, { createdAt: Date.now(), table });

    return () => {
      subscriptionLog.debug('Unsubscribing', { channelName, table });
      activeSubscriptions.delete(channelName);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, schema, event, filter, enabled, ...deps]);
}
