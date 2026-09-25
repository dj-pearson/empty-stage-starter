import { useEffect, useState } from "react";
import { pendingWebOps, SYNC_QUEUE_EVENT, type WebQueuedOp } from "@/lib/webSyncQueue";

export interface PendingGroceryIds {
  /** Grocery row ids with at least one write still waiting in the offline queue. */
  ids: Set<string>;
  /** Ops waiting, which can exceed ids.size (a toggle and an edit on one row). */
  count: number;
}

const EMPTY: PendingGroceryIds = { ids: new Set(), count: 0 };

/** The row an op addresses: `id` for toggle/update/delete, `row.id` for an insert. */
function opRowId(op: WebQueuedOp): string | null {
  const payload = op.payload as { id?: unknown; row?: { id?: unknown } };
  if (typeof payload?.id === "string") return payload.id;
  if (typeof payload?.row?.id === "string") return payload.row.id;
  return null;
}

/** Pure, exported for tests. */
export function pendingIdsFromOps(ops: readonly WebQueuedOp[]): PendingGroceryIds {
  if (ops.length === 0) return EMPTY;
  const ids = new Set<string>();
  for (const op of ops) {
    if (!op.kind.startsWith("grocery.")) continue;
    const id = opRowId(op);
    if (id) ids.add(id);
  }
  return { ids, count: ops.length };
}

/**
 * Which grocery rows are still only on this device (US-823 queue visibility).
 *
 * Re-reads the queue whenever webSyncQueue or the drain fires
 * `eatpal:syncqueue`, and on `online`, so a row's cloud-off mark clears when
 * its write lands rather than on the next reload.
 */
export function usePendingGroceryIds(userId: string | null | undefined): PendingGroceryIds {
  const [state, setState] = useState<PendingGroceryIds>(EMPTY);

  useEffect(() => {
    if (!userId) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      void pendingWebOps(userId).then((ops) => {
        if (!cancelled) setState(pendingIdsFromOps(ops));
      });
    };
    refresh();
    window.addEventListener(SYNC_QUEUE_EVENT, refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SYNC_QUEUE_EVENT, refresh);
      window.removeEventListener("online", refresh);
    };
  }, [userId]);

  return state;
}
