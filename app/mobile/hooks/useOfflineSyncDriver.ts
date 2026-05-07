import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import { useNetworkStatus } from './useNetworkStatus';
import { drainQueue, type QueuedOp } from '../lib/syncQueue';

/**
 * US-127: drain the offline write-queue when the device reconnects.
 *
 * Mounts inside the root layout via `<OfflineSyncDriver />`. On every
 * `(connected, reachable)` transition from `false → true` the driver runs
 * `drainQueue` once; on success the entries are removed, on failure they
 * stay queued with an attempts counter (max 5 before drop).
 *
 * The executor is intentionally simple — one switch per op kind. New
 * `QueuedOpKind` values must be added here too; an unhandled kind drops
 * the op via the catch-all (returns false → retried 5 times → dropped),
 * which is the correct behaviour for an op the current build doesn't know
 * how to replay.
 */

async function executeOp(op: QueuedOp): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false; // Wait for the next online tick when auth catches up.

    switch (op.kind) {
      case 'grocery.toggle': {
        const { id, checked } = op.payload as { id: string; checked: boolean };
        const { error } = await supabase
          .from('grocery_items')
          .update({ checked })
          .eq('id', id);
        return !error;
      }
      case 'grocery.insert': {
        const payload = { ...op.payload, user_id: user.id };
        const { error } = await supabase.from('grocery_items').insert(payload);
        return !error;
      }
      case 'plan.insert': {
        const payload = { ...op.payload, user_id: user.id };
        const { error } = await supabase.from('plan_entries').insert(payload);
        return !error;
      }
      case 'plan.update': {
        const { id, ...updates } = op.payload as { id: string } & Record<string, unknown>;
        const { error } = await supabase.from('plan_entries').update(updates).eq('id', id);
        return !error;
      }
      case 'plan.delete': {
        const { id } = op.payload as { id: string };
        const { error } = await supabase.from('plan_entries').delete().eq('id', id);
        return !error;
      }
      case 'food.update': {
        const { id, ...updates } = op.payload as { id: string } & Record<string, unknown>;
        const { error } = await supabase.from('foods').update(updates).eq('id', id);
        return !error;
      }
      case 'kid.insert': {
        const payload = { ...op.payload, user_id: user.id };
        const { error } = await supabase.from('kids').insert(payload);
        return !error;
      }
      default: {
        // Unknown op kind — report failure so it gets dropped after retries.
        return false;
      }
    }
  } catch (err) {
    console.warn('[syncQueue] executor threw:', err);
    return false;
  }
}

export function useOfflineSyncDriver(): void {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const online = isConnected && isInternetReachable;
    if (!online) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      // Drain on reconnection. Don't await — fire-and-forget so React's
      // effect lifecycle stays cheap.
      drainQueue(executeOp)
        .then((res) => {
          if (res.succeeded > 0 || res.dropped > 0) {
            console.log(
              `[syncQueue] drain: ${res.succeeded} ok, ${res.failed} retry, ${res.dropped} dropped`
            );
          }
        })
        .catch((err) => console.warn('[syncQueue] drain failed:', err));
    }
  }, [isConnected, isInternetReachable]);
}
