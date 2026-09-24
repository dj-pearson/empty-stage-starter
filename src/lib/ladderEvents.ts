/**
 * Same-tab signal that a ladder row was written (started, paused, resumed,
 * stepped, removed, restored). Tastings have their own signal in
 * foodAttemptHistory; this one covers the edits that move next_due_on or
 * status without a tasting, so the Food Tracker nav badge re-counts.
 */
type LadderChangedListener = () => void;

const listeners = new Set<LadderChangedListener>();

export function notifyLadderChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One broken listener must not stop the others or fail the write.
    }
  }
}

export function onLadderChanged(listener: LadderChangedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
