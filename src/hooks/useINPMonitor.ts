/**
 * useINPMonitor - React hook for monitoring Interaction to Next Paint
 *
 * Tracks INP interactions in real-time and provides the current
 * estimated INP value and rating. Useful for development dashboards
 * and production monitoring.
 *
 * Usage:
 * ```tsx
 * function PerformanceOverlay() {
 *   const { inp, rating, interactions } = useINPMonitor();
 *
 *   return (
 *     <div>
 *       <p>INP: {inp ?? 'N/A'}ms ({rating})</p>
 *       <p>Interactions tracked: {interactions}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  observeINP,
  calculateINP,
  rateINP,
  type INPEntry,
  type INPRating,
} from "@/lib/inp-optimizer";

export interface UseINPMonitorResult {
  inp: number | null;
  rating: INPRating | null;
  interactions: number;
  worstInteraction: INPEntry | null;
  reset: () => void;
}

export function useINPMonitor(): UseINPMonitorResult {
  const [inp, setInp] = useState<number | null>(null);
  const [rating, setRating] = useState<INPRating | null>(null);
  const [interactions, setInteractions] = useState(0);
  const [worstInteraction, setWorstInteraction] = useState<INPEntry | null>(
    null,
  );
  const entriesRef = useRef<INPEntry[]>([]);

  const reset = useCallback(() => {
    entriesRef.current = [];
    setInp(null);
    setRating(null);
    setInteractions(0);
    setWorstInteraction(null);
  }, []);

  useEffect(() => {
    const cleanup = observeINP((entry) => {
      entriesRef.current.push(entry);

      const currentINP = calculateINP(entriesRef.current);
      setInp(currentINP);
      setRating(currentINP !== null ? rateINP(currentINP) : null);
      setInteractions(entriesRef.current.length);

      if (
        !worstInteraction ||
        entry.duration > worstInteraction.duration
      ) {
        setWorstInteraction(entry);
      }
    });

    return cleanup;
  }, [worstInteraction]);

  return { inp, rating, interactions, worstInteraction, reset };
}
