/**
 * Meal Builder: which foods can go on ONE child's plate for ONE meal slot.
 *
 * The plate has four zones, filled in this order and exclusive in it (a food
 * id lands in at most one zone):
 *
 *   safe     a food this child eats: mastered on their own ladder, on their
 *            always-eats list, or reliably eaten per the plan log. Only when
 *            the child has none of those does the household `is_safe` flag
 *            count, and then only as 'householdUnconfirmed'.
 *   tryBite  today's ladder food: due today, then close to safe. Never a
 *            stalled, paused or backed-off row, and never selectNextStep's
 *            "longest resting" fallback.
 *   bridge   a chain suggestion next to the chosen safe food (food chaining).
 *   gap      a food group the child's day has not covered yet.
 *
 * The allergen floor: a hit on one of the child's allergens drops the food from
 * every zone, whatever the severity, with an unrated allergy counted as
 * severe (kidFit / worstFoodAllergen, which read tags, families and the name).
 * Every food held back is listed with its reason, so the screen can say why.
 *
 * Pure: no React, no Supabase, no clock. `todayIso` and `now` are passed in,
 * and every sort ends on an id so shuffled input gives the same plate.
 */

import type { Food, Kid, MealSlot, PlanEntry, Recipe } from '@/types';
import type { LadderRow } from '@/hooks/useFoodLadder';
import { getStockStatus, toDisplayCategory } from '@/components/pantry/pantryConstants';
import { localIsoDate } from '@/components/foodTracker/ladderDates';
import { addIsoDays } from '@/lib/date-utils';
import {
  buildResultIndex,
  findAllergenConflicts,
  getKidFoodFit,
  selectReliableFoods,
  type KidFit,
  type KidFitKid,
  type ResultIndex,
} from '@/lib/kidFit';
import { kidSafeFoodIds, type KidLadderRow } from '@/lib/kidProgress';
import { groupLadder, type OverviewRow } from '@/lib/ladderOverview';
import { BALANCE_GROUPS, isBalanceGroup, rankEasyAdds, type BalanceGroup } from '@/lib/insights';
import { kidAllergyState } from '@/lib/kidAllergenChips';
import { allergenCopyKind, type AllergenCopyKind } from '@/lib/planAllergenGuard';
import { DAY_SLOTS, SLOT_HOURS } from '@/lib/todayPlan';

export type PlateZone = 'safe' | 'tryBite' | 'bridge' | 'gap';

export type HeldBackReason =
  | 'allergen'
  | 'disliked'
  | 'stalled'
  | 'paused'
  | 'alreadyInSlot'
  | 'alreadyPlannedToday'
  | 'unknownFood';

export interface PlateOption {
  food: Food;
  zone: PlateZone;
  reasonKey:
    | 'mastered'
    | 'alwaysEats'
    | 'reliable'
    | 'householdUnconfirmed'
    | 'dueToday'
    | 'closeToSafe'
    | 'chainPair'
    | 'chainSuggestion'
    | 'gapPantry'
    | 'gapOnList'
    | 'gapOther';
  ate?: number;
  offered?: number;
  rung?: string;
  ladderRowId?: string;
  group?: BalanceGroup;
}

export interface HeldBack {
  food: Food;
  zone: PlateZone;
  reason: HeldBackReason;
  allergen?: string;
  copyKind?: AllergenCopyKind;
}

export type ZoneStatus = 'ready' | 'pending' | 'unavailable' | 'empty' | 'balanced';

export interface PlateCandidates {
  safe: PlateOption[];
  tryBite: PlateOption[];
  bridge: PlateOption[];
  gap: PlateOption[];
  gapGroup: BalanceGroup | null;
  status: Record<PlateZone, ZoneStatus>;
  heldBack: HeldBack[];
  allergyState: 'unknown' | 'none' | 'listed';
  defaults: Partial<Record<PlateZone, string>>;
}

export interface ChainSuggestionLike {
  foodId: string;
  similarityScore: number;
}

export interface SelectPlateInput {
  kid: Kid;
  foods: readonly Food[];
  ladderRows: readonly LadderRow[];
  ladderStatus: 'loading' | 'error' | 'ready';
  planEntries: readonly PlanEntry[];
  recipes: readonly Recipe[];
  /** The plan day the plate is for, 'YYYY-MM-DD'. */
  date: string;
  slot: MealSlot;
  /** The local calendar day, 'YYYY-MM-DD'. Ladder dueness and history read it. */
  todayIso: string;
  /**
   * Chain suggestions for the chosen safe food. Undefined means "not loaded",
   * and the bridge zone reads 'pending' while a safe food is chosen.
   */
  chainSuggestions?: readonly ChainSuggestionLike[];
  /** What the parent or child already picked; overrides the defaults. */
  chosen?: Partial<Record<PlateZone, string>>;
}

/** Choices per zone. More than three is its own kind of pressure. */
export const PLATE_ZONE_LIMIT = 3;

/** Zones in the order they claim foods. */
export const PLATE_ZONES: readonly PlateZone[] = ['safe', 'tryBite', 'bridge', 'gap'];

/** The group the gap filler looks for first: vegetables are the usual hole. */
const GAP_ORDER_PREFERENCE: readonly BalanceGroup[] = ['vegetable', 'fruit', 'protein', 'carb', 'dairy'];
export const GAP_ORDER: readonly BalanceGroup[] = GAP_ORDER_PREFERENCE.filter((g) =>
  BALANCE_GROUPS.includes(g),
);

export type NewPlanEntry = Omit<PlanEntry, 'id'>;

// ---------------------------------------------------------------------------
// LadderRow (camelCase, useFoodLadder) to the shapes the pure helpers read.
// ---------------------------------------------------------------------------

/** A useFoodLadder row as the snake_case row kidSafeFoodIds reads. */
export function ladderRowToKidLadderRow(row: LadderRow): KidLadderRow {
  return {
    id: row.id,
    kid_id: row.kidId,
    food_id: row.foodId,
    status: row.status,
    current_rung: row.currentRung,
    last_attempt_at: row.lastAttemptAt,
    consecutive_successes: row.consecutiveSuccesses,
    consecutive_holds: row.consecutiveHolds,
    next_due_on: row.nextDueOn,
  };
}

/** A useFoodLadder row as the row groupLadder reads, keeping its food id. */
export function ladderRowToOverviewRow(row: LadderRow): OverviewRow & { foodId: string } {
  return {
    id: row.id,
    foodId: row.foodId,
    currentRung: row.currentRung,
    consecutiveSuccesses: row.consecutiveSuccesses,
    consecutiveHolds: row.consecutiveHolds,
    status: row.status,
    nextDueOn: row.nextDueOn,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dayOf = (date: string | null | undefined): string =>
  typeof date === 'string' ? date.slice(0, 10) : '';

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function foodMapSortedById(foods: readonly Food[]): Map<string, Food> {
  // Sorted first so any "first match wins" lookup downstream (always-eats by
  // name) does not depend on the order the foods arrived in.
  const map = new Map<string, Food>();
  for (const f of [...foods].filter((x) => x?.id).sort((a, b) => byId(a.id, b.id))) {
    if (!map.has(f.id)) map.set(f.id, f);
  }
  return map;
}

function groupOf(food: Food): BalanceGroup | undefined {
  const cat = toDisplayCategory(food.category);
  return isBalanceGroup(cat) ? cat : undefined;
}

function inStock(food: Food): boolean {
  return getStockStatus(food.quantity) !== 'out';
}

/** Food ids a plan entry puts on the plate: its food, plus its recipe's foods. */
function entryFoodIds(entry: PlanEntry, recipesById: ReadonlyMap<string, Recipe>): string[] {
  const ids: string[] = [];
  if (entry.food_id) ids.push(entry.food_id);
  if (entry.recipe_id) {
    const recipe = recipesById.get(entry.recipe_id);
    for (const id of recipe?.food_ids ?? []) if (id) ids.push(id);
  }
  return ids;
}

class HeldBackLog {
  private readonly seen = new Set<string>();
  readonly list: HeldBack[] = [];

  add(food: Food, zone: PlateZone, reason: HeldBackReason, fit?: KidFit): void {
    const key = `${zone}|${food.id}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    const entry: HeldBack = { food, zone, reason };
    if (reason === 'allergen' && fit?.allergen) {
      entry.allergen = fit.allergen;
      entry.copyKind = allergenCopyKind({
        severity: fit.allergenSeverity ?? null,
        severityRecorded: fit.allergenSeverityRecorded,
      });
    }
    this.list.push(entry);
  }

  /** An unknown food has no Food row; it gets a stub carrying just its id. */
  addUnknown(foodId: string, zone: PlateZone): void {
    const stub: Food = { id: foodId, name: '', category: 'snack', is_safe: false, is_try_bite: false };
    this.add(stub, zone, 'unknownFood');
  }
}

/** The fit reason a food is kept off the plate for this kid, or null. */
function fitBlock(fit: KidFit): 'allergen' | 'disliked' | null {
  if (fit.allergen) return 'allergen';
  if (fit.disliked) return 'disliked';
  return null;
}

// ---------------------------------------------------------------------------
// The selector
// ---------------------------------------------------------------------------

const SAFE_SOURCE_RANK = { chainPair: -1, mastered: 0, alwaysEats: 1, reliable: 2, householdUnconfirmed: 3 } as const;
type SafeSource = keyof typeof SAFE_SOURCE_RANK;

interface SafeDraft {
  food: Food;
  source: SafeSource;
  row?: LadderRow;
}

export function selectPlateCandidates(input: SelectPlateInput): PlateCandidates {
  const { kid, ladderStatus, date, slot, todayIso } = input;
  const chosen = input.chosen ?? {};
  const foodsById = foodMapSortedById(input.foods);
  const sortedFoods = [...foodsById.values()];
  const recipesById = new Map(input.recipes.map((r) => [r.id, r] as const));
  const held = new HeldBackLog();

  const kidEntries = input.planEntries.filter((e) => e.kid_id === kid.id);
  const resultIndex: ResultIndex = buildResultIndex(kidEntries, kid.id, addIsoDays(todayIso, 1));
  const fitCache = new Map<string, KidFit>();
  const fitOf = (food: Food): KidFit => {
    let fit = fitCache.get(food.id);
    if (!fit) {
      fit = getKidFoodFit(kid, food, resultIndex);
      fitCache.set(food.id, fit);
    }
    return fit;
  };

  const dayEntries = kidEntries.filter((e) => dayOf(e.date) === date);
  const inSlot = new Set<string>();
  const plannedThatDay = new Set<string>();
  for (const e of dayEntries) {
    for (const id of entryFoodIds(e, recipesById)) {
      plannedThatDay.add(id);
      if (e.meal_slot === slot) inSlot.add(id);
    }
  }

  const kidRows = input.ladderRows
    .filter((r) => r.kidId === kid.id)
    .sort((a, b) => byId(a.id, b.id));
  const rowById = new Map(kidRows.map((r) => [r.id, r] as const));
  const masteredRowByFood = new Map<string, LadderRow>();
  for (const r of kidRows) {
    if (r.status === 'mastered' && !masteredRowByFood.has(r.foodId)) masteredRowByFood.set(r.foodId, r);
  }

  const claimed = new Set<string>();

  // ---- safe ---------------------------------------------------------------
  const kidFit: KidFitKid = kid;
  const safeIds = kidSafeFoodIds(kidFit, kidRows.map(ladderRowToKidLadderRow), foodsById);
  const reliable = selectReliableFoods(resultIndex, foodsById, kidFit, { limit: foodsById.size });
  const alwaysEatsIds = new Set<string>();
  for (const food of sortedFoods) if (fitOf(food).alwaysEats) alwaysEatsIds.add(food.id);

  // Mastered or always-eats foods kidSafeFoodIds dropped: say why.
  for (const id of [...masteredRowByFood.keys(), ...alwaysEatsIds].sort(byId)) {
    if (safeIds.has(id)) continue;
    const food = foodsById.get(id);
    if (!food) {
      held.addUnknown(id, 'safe');
      continue;
    }
    const block = fitBlock(fitOf(food));
    if (block) held.add(food, 'safe', block, fitOf(food));
  }

  const drafts = new Map<string, SafeDraft>();
  for (const id of safeIds) {
    const food = foodsById.get(id);
    if (!food) continue;
    const row = masteredRowByFood.get(id);
    drafts.set(id, { food, source: row ? 'mastered' : 'alwaysEats', row });
  }
  for (const r of reliable) {
    if (!drafts.has(r.food.id)) drafts.set(r.food.id, { food: r.food, source: 'reliable' });
  }
  if (drafts.size === 0) {
    for (const food of sortedFoods) {
      if (!food.is_safe) continue;
      const fit = fitOf(food);
      const block = fitBlock(fit);
      if (block) {
        held.add(food, 'safe', block, fit);
        continue;
      }
      drafts.set(food.id, { food, source: 'householdUnconfirmed' });
    }
  }

  const ateOf = (id: string): number => resultIndex.get(id)?.ate ?? 0;
  const rankSafe = (list: SafeDraft[]): SafeDraft[] =>
    [...list].sort(
      (a, b) =>
        SAFE_SOURCE_RANK[a.source] - SAFE_SOURCE_RANK[b.source] ||
        ateOf(b.food.id) - ateOf(a.food.id) ||
        Number(inStock(b.food)) - Number(inStock(a.food)) ||
        a.food.name.localeCompare(b.food.name) ||
        byId(a.food.id, b.food.id),
    );

  let safeDrafts: SafeDraft[] = [];
  for (const d of rankSafe([...drafts.values()])) {
    if (inSlot.has(d.food.id)) {
      held.add(d.food, 'safe', 'alreadyInSlot');
      continue;
    }
    safeDrafts.push(d);
  }
  safeDrafts = safeDrafts.slice(0, PLATE_ZONE_LIMIT);
  for (const d of safeDrafts) claimed.add(d.food.id);

  // ---- try bite -----------------------------------------------------------
  type TryDraft = { food: Food; row: LadderRow; reasonKey: 'dueToday' | 'closeToSafe' };
  let tryDrafts: TryDraft[] = [];
  let tryStatus: ZoneStatus;
  if (ladderStatus === 'loading') {
    tryStatus = 'pending';
  } else if (ladderStatus === 'error') {
    tryStatus = 'unavailable';
  } else {
    const groups = groupLadder(kidRows.map(ladderRowToOverviewRow), todayIso);
    // Rows that would be due by date but are resting: listed, never offered.
    for (const r of groups.resting) {
      if (r.nextDueOn === null || r.nextDueOn > todayIso) continue;
      const food = foodsById.get(r.foodId);
      if (food) held.add(food, 'tryBite', 'paused');
    }
    const ordered = [
      ...groups.dueToday.map((r, i) => ({ r, group: 0, i, reasonKey: 'dueToday' as const })),
      ...groups.closeToSafe.map((r, i) => ({ r, group: 1, i, reasonKey: 'closeToSafe' as const })),
    ];
    ordered.sort((a, b) => {
      const sa = rowById.get(a.r.id)?.preferredMealSlot === slot ? 0 : 1;
      const sb = rowById.get(b.r.id)?.preferredMealSlot === slot ? 0 : 1;
      return sa - sb || a.group - b.group || a.i - b.i || byId(a.r.id, b.r.id);
    });
    const seenFood = new Set<string>();
    for (const { r, reasonKey } of ordered) {
      const row = rowById.get(r.id);
      if (!row || seenFood.has(row.foodId)) continue;
      seenFood.add(row.foodId);
      const food = foodsById.get(row.foodId);
      if (!food) {
        held.addUnknown(row.foodId, 'tryBite');
        continue;
      }
      if (groups.stalledIds.has(r.id)) {
        held.add(food, 'tryBite', 'stalled');
        continue;
      }
      if (row.status !== 'active') {
        held.add(food, 'tryBite', 'paused');
        continue;
      }
      const fit = fitOf(food);
      const block = fitBlock(fit);
      if (block) {
        held.add(food, 'tryBite', block, fit);
        continue;
      }
      if (inSlot.has(food.id)) {
        held.add(food, 'tryBite', 'alreadyInSlot');
        continue;
      }
      if (plannedThatDay.has(food.id)) {
        held.add(food, 'tryBite', 'alreadyPlannedToday');
        continue;
      }
      if (claimed.has(food.id)) continue;
      tryDrafts.push({ food, row, reasonKey });
    }
    tryDrafts = tryDrafts.slice(0, PLATE_ZONE_LIMIT);
    tryStatus = tryDrafts.length > 0 ? 'ready' : 'empty';
  }
  for (const t of tryDrafts) claimed.add(t.food.id);

  const tryBiteId =
    chosen.tryBite && tryDrafts.some((t) => t.food.id === chosen.tryBite)
      ? chosen.tryBite
      : tryDrafts[0]?.food.id;

  // ---- chain pair: the try bite's paired safe food leads the safe zone -----
  let pairedId: string | undefined;
  const tryRow = tryDrafts.find((t) => t.food.id === tryBiteId)?.row;
  const pairId = tryRow?.pairedSafeFoodId ?? null;
  if (pairId && pairId !== tryBiteId) {
    const food = foodsById.get(pairId);
    const fit = food ? fitOf(food) : null;
    if (food && fit && !fitBlock(fit) && !inSlot.has(pairId)) {
      pairedId = pairId;
      const rest = safeDrafts.filter((d) => d.food.id !== pairId);
      for (const d of safeDrafts) claimed.delete(d.food.id);
      safeDrafts = [{ food, source: 'chainPair' as const, row: masteredRowByFood.get(pairId) }, ...rest].slice(
        0,
        PLATE_ZONE_LIMIT,
      );
      // A pair that was also offered as a try bite now sits in safe only.
      tryDrafts = tryDrafts.filter((t) => t.food.id !== pairId);
      for (const d of safeDrafts) claimed.add(d.food.id);
    }
  }

  const safe: PlateOption[] = safeDrafts.map((d) => {
    const stats = resultIndex.get(d.food.id);
    const option: PlateOption = {
      food: d.food,
      zone: 'safe',
      reasonKey: d.source,
      ate: stats?.ate ?? 0,
      offered: stats?.offered ?? 0,
      group: groupOf(d.food),
    };
    if (d.row) {
      option.rung = d.row.currentRung;
      option.ladderRowId = d.row.id;
    }
    return option;
  });

  const tryBite: PlateOption[] = tryDrafts.map((t) => {
    const stats = resultIndex.get(t.food.id);
    return {
      food: t.food,
      zone: 'tryBite',
      reasonKey: t.reasonKey,
      ate: stats?.ate ?? 0,
      offered: stats?.offered ?? 0,
      rung: t.row.currentRung,
      ladderRowId: t.row.id,
      group: groupOf(t.food),
    };
  });

  const defaults: Partial<Record<PlateZone, string>> = {};
  if (pairedId) defaults.safe = pairedId;
  else if (safe[0]) defaults.safe = safe[0].food.id;
  if (tryBite.length > 0) defaults.tryBite = tryBite.some((o) => o.food.id === tryBiteId) ? tryBiteId : tryBite[0].food.id;

  const safeId = chosen.safe && safe.some((o) => o.food.id === chosen.safe) ? chosen.safe : defaults.safe;
  const effectiveTryId =
    chosen.tryBite && tryBite.some((o) => o.food.id === chosen.tryBite) ? chosen.tryBite : defaults.tryBite;

  // ---- bridge -------------------------------------------------------------
  const bridge: PlateOption[] = [];
  let bridgeStatus: ZoneStatus;
  if (!safeId) {
    bridgeStatus = 'empty';
  } else if (!input.chainSuggestions) {
    bridgeStatus = 'pending';
  } else {
    const suggestions = [...input.chainSuggestions]
      .filter((s) => s && typeof s.foodId === 'string' && s.foodId)
      .sort((a, b) => b.similarityScore - a.similarityScore || byId(a.foodId, b.foodId));
    const seen = new Set<string>();
    for (const s of suggestions) {
      if (bridge.length >= PLATE_ZONE_LIMIT) break;
      if (seen.has(s.foodId) || s.foodId === safeId) continue;
      seen.add(s.foodId);
      const food = foodsById.get(s.foodId);
      if (!food) {
        held.addUnknown(s.foodId, 'bridge');
        continue;
      }
      const fit = fitOf(food);
      const block = fitBlock(fit);
      if (block) {
        held.add(food, 'bridge', block, fit);
        continue;
      }
      if (inSlot.has(food.id)) {
        held.add(food, 'bridge', 'alreadyInSlot');
        continue;
      }
      if (claimed.has(food.id)) continue;
      const stats = resultIndex.get(food.id);
      bridge.push({
        food,
        zone: 'bridge',
        reasonKey: 'chainSuggestion',
        ate: stats?.ate ?? 0,
        offered: stats?.offered ?? 0,
        group: groupOf(food),
      });
    }
    bridgeStatus = bridge.length > 0 ? 'ready' : 'empty';
  }
  for (const o of bridge) claimed.add(o.food.id);
  const bridgeId = chosen.bridge && bridge.some((o) => o.food.id === chosen.bridge) ? chosen.bridge : undefined;

  // ---- gap ----------------------------------------------------------------
  const covered = new Set<BalanceGroup>();
  const cover = (id: string | undefined) => {
    const food = id ? foodsById.get(id) : undefined;
    const g = food ? groupOf(food) : undefined;
    if (g) covered.add(g);
  };
  for (const e of dayEntries) for (const id of entryFoodIds(e, recipesById)) cover(id);
  cover(safeId);
  cover(effectiveTryId);
  cover(bridgeId);

  const gapGroup = GAP_ORDER.find((g) => !covered.has(g)) ?? null;
  const gap: PlateOption[] = [];
  let gapStatus: ZoneStatus;
  if (gapGroup === null) {
    gapStatus = 'balanced';
  } else {
    for (const food of sortedFoods) {
      if (groupOf(food) !== gapGroup) continue;
      const fit = fitOf(food);
      if (fit.allergen) held.add(food, 'gap', 'allergen', fit);
    }
    const adds = rankEasyAdds({
      kid,
      group: gapGroup,
      foods: sortedFoods,
      resultIndex,
      onListKeys: new Set<string>(),
      limit: sortedFoods.length,
    });
    for (const add of adds) {
      if (gap.length >= PLATE_ZONE_LIMIT) break;
      if (inSlot.has(add.food.id)) {
        held.add(add.food, 'gap', 'alreadyInSlot');
        continue;
      }
      if (claimed.has(add.food.id)) continue;
      const stats = resultIndex.get(add.food.id);
      gap.push({
        food: add.food,
        zone: 'gap',
        reasonKey: add.availability === 'pantry' ? 'gapPantry' : add.availability === 'onList' ? 'gapOnList' : 'gapOther',
        ate: stats?.ate ?? 0,
        offered: stats?.offered ?? 0,
        group: gapGroup,
      });
    }
    gapStatus = gap.length > 0 ? 'ready' : 'empty';
  }
  if (gap[0]) defaults.gap = gap[0].food.id;

  return {
    safe,
    tryBite,
    bridge,
    gap,
    gapGroup,
    status: {
      safe: safe.length > 0 ? 'ready' : 'empty',
      tryBite: tryStatus,
      bridge: bridgeStatus,
      gap: gapStatus,
    },
    heldBack: held.list,
    allergyState: kidAllergyState(kid),
    defaults,
  };
}

// ---------------------------------------------------------------------------
// Which slot to open on
// ---------------------------------------------------------------------------

/** Meal slots the builder opens on; the try bite and the second snack ride along. */
const OPENABLE_SLOTS: readonly Exclude<MealSlot, 'try_bite'>[] = DAY_SLOTS.filter(
  (s): s is Exclude<MealSlot, 'try_bite'> => s !== 'try_bite' && s !== 'snack2',
);

/**
 * The next meal slot today with nothing planned for this kid. A slot stays
 * open until an hour after it starts (lunch at 12:59 still counts). With
 * nothing left today, tomorrow's breakfast.
 */
export function nextOpenSlot(
  kidId: string,
  planEntries: readonly PlanEntry[],
  now: Date,
): { date: string; slot: MealSlot } {
  const today = localIsoDate(now);
  const hourNow = now.getHours() + now.getMinutes() / 60;
  const planned = new Set<MealSlot>();
  for (const e of planEntries) {
    if (e.kid_id === kidId && dayOf(e.date) === today) planned.add(e.meal_slot);
  }
  for (const s of OPENABLE_SLOTS) {
    if (SLOT_HOURS[s] <= hourNow - 1) continue;
    if (!planned.has(s)) return { date: today, slot: s };
  }
  return { date: addIsoDays(today, 1), slot: 'breakfast' };
}

// ---------------------------------------------------------------------------
// What "Add to plan" writes
// ---------------------------------------------------------------------------

/**
 * The plan rows for a built plate. Each food once, in zone order; a food
 * already in the slot it would land in is skipped (the unique index on
 * household/kid/date/slot/food would refuse it anyway). The try bite goes
 * under 'try_bite' unless `tryBiteSlot` is 'same'.
 */
export function planWriteEntries(
  kidId: string,
  date: string,
  slot: MealSlot,
  chosen: Partial<Record<PlateZone, string>>,
  existing: readonly PlanEntry[],
  tryBiteSlot: 'try_bite' | 'same' = 'try_bite',
): { entries: NewPlanEntry[]; skipped: string[] } {
  const taken = new Set<string>();
  for (const e of existing) {
    if (e.kid_id === kidId && dayOf(e.date) === date) taken.add(`${e.meal_slot}|${e.food_id}`);
  }
  const seen = new Set<string>();
  const entries: NewPlanEntry[] = [];
  const skipped: string[] = [];
  for (const zone of PLATE_ZONES) {
    const foodId = chosen[zone];
    if (!foodId || seen.has(foodId)) continue;
    seen.add(foodId);
    const mealSlot: MealSlot = zone === 'tryBite' && tryBiteSlot === 'try_bite' ? 'try_bite' : slot;
    const key = `${mealSlot}|${foodId}`;
    if (taken.has(key)) {
      skipped.push(foodId);
      continue;
    }
    taken.add(key);
    entries.push({ kid_id: kidId, date, meal_slot: mealSlot, food_id: foodId, result: null });
  }
  return { entries, skipped };
}

// ---------------------------------------------------------------------------
// Plates that went well before
// ---------------------------------------------------------------------------

export interface FavouritePlate {
  /** The sorted food ids joined with ','. */
  key: string;
  foodIds: string[];
  /** How many past meals served exactly this set and mostly went well. */
  count: number;
  /** Most recent date it was served. */
  lastDate: string;
  /** The slot it was last served in. */
  slot: MealSlot;
}

/**
 * Past plates (one kid, one date, one slot, two or more foods) where most
 * rows were eaten or tasted, grouped by the set of foods. Most often first,
 * then most recent. A plate with a food that now hits the kid's allergens, or
 * a food we no longer know, is dropped.
 */
export function favouritePlates(
  planEntries: readonly PlanEntry[],
  kidId: string,
  todayIso: string,
  kid: Pick<Kid, 'id' | 'allergens'> & Partial<Pick<Kid, 'allergen_severity'>>,
  foodsById: ReadonlyMap<string, Food>,
  limit = 6,
): FavouritePlate[] {
  const meals = new Map<string, { date: string; slot: MealSlot; rows: PlanEntry[] }>();
  for (const e of planEntries) {
    if (e.kid_id !== kidId || !e.food_id) continue;
    const date = dayOf(e.date);
    if (!date || date > todayIso) continue;
    const key = `${date}|${e.meal_slot}`;
    let meal = meals.get(key);
    if (!meal) {
      meal = { date, slot: e.meal_slot, rows: [] };
      meals.set(key, meal);
    }
    meal.rows.push(e);
  }

  const plates = new Map<string, FavouritePlate>();
  for (const meal of meals.values()) {
    const ids = [...new Set(meal.rows.map((r) => r.food_id))].sort(byId);
    if (ids.length < 2) continue;
    const good = meal.rows.filter((r) => r.result === 'ate' || r.result === 'tasted').length;
    if (good * 2 <= meal.rows.length) continue;
    const key = ids.join(',');
    const plate = plates.get(key);
    if (!plate) {
      plates.set(key, { key, foodIds: ids, count: 1, lastDate: meal.date, slot: meal.slot });
    } else {
      plate.count++;
      if (meal.date > plate.lastDate || (meal.date === plate.lastDate && meal.slot < plate.slot)) {
        plate.lastDate = meal.date;
        plate.slot = meal.slot;
      }
    }
  }

  return [...plates.values()]
    .filter((p) => p.foodIds.every((id) => foodsById.has(id)))
    .filter((p) => findAllergenConflicts([kid], p.foodIds, foodsById).length === 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
        byId(a.key, b.key),
    )
    .slice(0, Math.max(0, limit));
}
