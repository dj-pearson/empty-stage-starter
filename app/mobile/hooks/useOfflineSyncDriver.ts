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
  // US-823: whether this mount has drained yet.
  //
  // The driver used to fire only on a false -> true transition, and
  // useNetworkStatus starts optimistic ({isConnected: true, isInternetReachable:
  // true}) rather than unknown. So a cold start with ops already on disk --
  // queued offline, then the app closed or killed before it reconnected --
  // found `online` true and `wasOffline` false and never drained. Those writes
  // sat there until the device happened to drop its connection and regain it,
  // and MAX_QUEUE eventually trimmed the oldest away unsent.
  const drainedThisMount = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const online = isConnected && isInternetReachable;
    if (!online) {
      wasOffline.current = true;
      return;
    }

    const reconnected = wasOffline.current;
    if (reconnected || !drainedThisMount.current) {
      wasOffline.current = false;
      drainedThisMount.current = true;
      // Drain on reconnection, and once on a mount that starts online to pick
      // up anything a previous session left behind. Don't await -- fire-and-
      // forget so React's effect lifecycle stays cheap.
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
