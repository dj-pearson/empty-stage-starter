/**
 * The foods a chain can start from for one child (contract 2).
 *
 * An anchor is a food this child already eats. Tiers, strongest first:
 *   always    - on kid.always_eats_foods (ids or names)
 *   mastered  - a ladder row the child finished
 *   reliable  - logged results say they eat it (3+ results, 67%+ ate), from
 *               plan results and food_attempts together, refusals included
 *   climbing  - an active ladder row already at a full bite or portion
 *   household - the household's is_safe foods, only when every other tier is
 *               empty, so a brand-new child still has somewhere to start
 *
 * Every anchor passes getKidFoodFit: an allergen hit (an allergy with no
 * recorded severity counts as severe) or a dislike drops it. A food id that is
 * not in foodsById is dropped, so an anchor always has a real name.
 *
 * Pure: no React, no Supabase.
 */

import type { Food, Kid, PlanEntry } from "@/types";
import type { LadderRow } from "@/hooks/useFoodLadder";
import { buildResultIndex, getKidFoodFit, selectReliableFoods, type ResultIndex } from "./kidFit";
import { kidSafeFoodIds, type KidLadderRow } from "./kidProgress";
import { addIsoDays } from "./date-utils";

export type AnchorSource = "always" | "mastered" | "reliable" | "climbing" | "household";

export interface ChainAnchor {
  foodId: string;
  name: string;
  source: AnchorSource;
  ate?: number;
  tries?: number;
}

export interface BuildChainAnchorsInput {
  kid: Kid;
  foodsById: ReadonlyMap<string, Food>;
  ladderRows: readonly LadderRow[];
  attempts: readonly { food_id: string; outcome: string }[];
  planEntries: readonly PlanEntry[];
  todayIso: string;
}

const TIER_RANK: Record<AnchorSource, number> = {
  always: 0,
  mastered: 1,
  reliable: 2,
  climbing: 3,
  household: 4,
};

const RELIABLE_LIMIT = 12;
const CLIMBING_RUNGS = new Set<string>(["full_bite", "full_portion"]);

/** food_attempts.outcome to the plan-result vocabulary kidFit counts. */
const ATTEMPT_RESULT: Record<string, "ate" | "tasted" | "refused"> = {
  success: "ate",
  partial: "tasted",
  refused: "refused",
  tantrum: "refused",
};

/** The day after a YYYY-MM-DD key, so today's logged results still count. */
function nextIsoDay(iso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return undefined;
  return addIsoDays(iso, 1);
}

/**
 * Plan results and ladder attempts in one index. Attempts carry no date, so
 * they add to the counts but never move lastResult.
 */
function buildMergedIndex(input: BuildChainAnchorsInput): ResultIndex {
  const index = buildResultIndex(input.planEntries, input.kid.id, nextIsoDay(input.todayIso));
  for (const attempt of input.attempts) {
    if (!attempt?.food_id) continue;
    const result = ATTEMPT_RESULT[attempt.outcome];
    if (!result) continue;
    let stats = index.get(attempt.food_id);
    if (!stats) {
      stats = { tries: 0, ate: 0, tasted: 0, refused: 0, offered: 0, lastResult: null, lastDate: null };
      index.set(attempt.food_id, stats);
    }
    stats.offered++;
    stats.tries++;
    stats[result]++;
  }
  return index;
}

function toKidLadderRow(row: LadderRow): KidLadderRow {
  return {
    kid_id: row.kidId,
    food_id: row.foodId,
    status: row.status,
    current_rung: row.currentRung,
  };
}

export function buildChainAnchors(input: BuildChainAnchorsInput): ChainAnchor[] {
  const { kid, foodsById } = input;
  const index = buildMergedIndex(input);
  const kidRows = input.ladderRows.filter((r) => r.kidId === kid.id);

  const picked = new Map<string, ChainAnchor>();
  const add = (foodId: string, source: AnchorSource, stats?: { ate: number; tries: number }) => {
    const food = foodsById.get(foodId);
    if (!food || !food.name) return;
    const fit = getKidFoodFit(kid, food, index);
    if (fit.allergen !== null || fit.disliked) return;
    const prev = picked.get(foodId);
    if (prev && TIER_RANK[prev.source] <= TIER_RANK[source]) return;
    const known = stats ?? index.get(foodId);
    const anchor: ChainAnchor = { foodId, name: food.name, source };
    if (known && known.tries > 0) {
      anchor.ate = known.ate;
      anchor.tries = known.tries;
    }
    picked.set(foodId, anchor);
  };

  // always and mastered: kidSafeFoodIds resolves names and applies the fit
  // floor. Asking twice (without and with the ladder) splits the two tiers.
  const alwaysIds = kidSafeFoodIds(kid, [], foodsById);
  const safeIds = kidSafeFoodIds(kid, kidRows.map(toKidLadderRow), foodsById);
  for (const id of alwaysIds) add(id, "always");
  for (const id of safeIds) if (!alwaysIds.has(id)) add(id, "mastered");

  for (const r of selectReliableFoods(index, foodsById, kid, { minTries: 3, minAteShare: 0.67, limit: RELIABLE_LIMIT })) {
    add(r.food.id, "reliable", { ate: r.ate, tries: r.tries });
  }

  for (const row of kidRows) {
    if (row.status === "active" && CLIMBING_RUNGS.has(row.currentRung)) add(row.foodId, "climbing");
  }

  if (picked.size === 0) {
    for (const food of foodsById.values()) if (food.is_safe) add(food.id, "household");
  }

  return [...picked.values()].sort(
    (a, b) =>
      TIER_RANK[a.source] - TIER_RANK[b.source] ||
      (b.ate ?? 0) - (a.ate ?? 0) ||
      a.name.localeCompare(b.name) ||
      (a.foodId < b.foodId ? -1 : a.foodId > b.foodId ? 1 : 0),
  );
}
