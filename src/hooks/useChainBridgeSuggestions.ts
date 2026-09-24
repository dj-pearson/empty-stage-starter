/**
 * Food-chaining suggestions next to one safe food, for Meal Builder's bridge
 * zone.
 *
 * Calls get_food_chain_suggestions once per source food per session (a
 * module-level cache), and drops a response that lands after the safe food
 * changed, so a slow answer for the old food never fills the new food's
 * bridge. Errors read as "no suggestions": the bridge is optional, and the
 * zone says 'empty' rather than blocking the plate.
 *
 * Returns undefined while the answer is outstanding, which plateBuilder reads
 * as 'pending' for the bridge zone.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { ChainSuggestionLike } from '@/lib/plateBuilder';

const CHAIN_LIMIT = 5;

const cache = new Map<string, ChainSuggestionLike[]>();

/** Tests reset the per-session cache between cases. */
export function clearChainBridgeCache(): void {
  cache.clear();
}

interface ChainRpcRow {
  food_id: string;
  similarity_score: number;
}

function toSuggestions(rows: readonly ChainRpcRow[] | null | undefined): ChainSuggestionLike[] {
  const out: ChainSuggestionLike[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.food_id !== 'string') continue;
    const score = Number(row.similarity_score);
    out.push({ foodId: row.food_id, similarityScore: Number.isFinite(score) ? score : 0 });
  }
  return out;
}

export function useChainBridgeSuggestions(
  safeFoodId: string | null | undefined,
): readonly ChainSuggestionLike[] | undefined {
  const [result, setResult] = useState<{ source: string; suggestions: ChainSuggestionLike[] } | null>(
    () => (safeFoodId && cache.has(safeFoodId) ? { source: safeFoodId, suggestions: cache.get(safeFoodId) ?? [] } : null),
  );

  useEffect(() => {
    if (!safeFoodId) return;
    const cached = cache.get(safeFoodId);
    if (cached) {
      setResult({ source: safeFoodId, suggestions: cached });
      return;
    }
    let cancelled = false;
    (async () => {
      let suggestions: ChainSuggestionLike[] = [];
      try {
        const { data, error } = await supabase.rpc('get_food_chain_suggestions', {
          source_food: safeFoodId,
          limit_count: CHAIN_LIMIT,
        });
        if (error) throw error;
        suggestions = toSuggestions(data);
        cache.set(safeFoodId, suggestions);
      } catch (err) {
        logger.warn('Chain suggestions unavailable for the bridge zone:', err);
        suggestions = [];
      }
      if (!cancelled) setResult({ source: safeFoodId, suggestions });
    })();
    return () => {
      cancelled = true;
    };
  }, [safeFoodId]);

  if (!safeFoodId) return undefined;
  if (result?.source === safeFoodId) return result.suggestions;
  const cached = cache.get(safeFoodId);
  return cached;
}
