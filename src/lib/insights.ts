/**
 * Per-kid derivations for the Insights page: food-group balance, the
 * upcoming-plan allergy check, easy adds for a thin group, and repeats.
 *
 * Every function here is pure and scoped to one child. Claims come from
 * logged results only: a planned-but-unlogged dinner, or tomorrow's plan, is
 * never counted as eaten. The past window is [today - (days - 1), today], so
 * it stays inside the plan window the app loads from the server.
 *
 * The household-wide `computeInsights` this file used to hold counted future
 * plans as "tried" and matched allergens by raw string; it is gone.
 */
import type { Food, FoodCategory, Kid, PlanEntry, Recipe } from '@/types';
import { toDisplayCategory, getStockStatus } from '@/components/pantry/pantryConstants';
import { addIsoDays } from '@/lib/date-utils';
import { windowStartIso } from '@/lib/kidProgress';
import { canonicalAllergen } from '@/lib/allergens';
import { isOnList } from '@/lib/pantryGrocery';
import {
  findAllergenConflicts,
  getKidFoodFit,
  isAllergyUnknown,
  type ResultIndex,
} from '@/lib/kidFit';
import { computeVarietyFatigue, type FatigueItem, type FatigueTier } from '@/lib/varietyFatigue';

/** The food groups a plate is balanced across. Snacks are a slot, not a group. */
export type BalanceGroup = Exclude<FoodCategory, 'snack'>;

export const BALANCE_GROUPS: readonly BalanceGroup[] = ['protein', 'carb', 'dairy', 'fruit', 'vegetable'];

/** Default look-back for the page, in days (today included). */
export const INSIGHTS_WINDOW_DAYS = 28;

/** A group with nothing eaten or tasted in this many days reads as thin. */
export const THIN_GROUP_DAYS = 14;

/** Default look-ahead for the allergy check, in days (today included). */
export const ALLERGY_LOOKAHEAD_DAYS = 14;

const BALANCE_SET: ReadonlySet<string> = new Set(BALANCE_GROUPS);

export function isBalanceGroup(value: string): value is BalanceGroup {
  return BALANCE_SET.has(value);
}

export function buildFoodById(foods: readonly Food[]): Map<string, Food> {
  const map = new Map<string, Food>();
  for (const f of foods) if (f?.id) map.set(f.id, f);
  return map;
}

const dayOf = (date: string | null | undefined): string =>
  typeof date === 'string' ? date.slice(0, 10) : '';

type KidRef = Pick<Kid, 'id'>;

/**
 * This kid's plan entries dated in [windowStart, today], logged or not.
 * Sections memoize this once and hand it to the functions below.
 */
export function kidWindowEntries(params: {
  kid: KidRef;
  planEntries: readonly PlanEntry[];
  todayIso: string;
  days?: number;
}): PlanEntry[] {
  const { kid, planEntries, todayIso, days = INSIGHTS_WINDOW_DAYS } = params;
  const start = windowStartIso(todayIso, days);
  const out: PlanEntry[] = [];
  for (const e of planEntries) {
    if (e.kid_id !== kid.id) continue;
    const d = dayOf(e.date);
    if (d && d >= start && d <= todayIso) out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Group balance
// ---------------------------------------------------------------------------

export interface GroupBalanceRow {
  group: BalanceGroup;
  /** Distinct foods in this group with a logged result in the window. */
  offered: number;
  /** Distinct foods in this group the kid ate or tasted. */
  accepted: number;
  /** The last day a food in this group was eaten or tasted, or null. */
  lastAcceptedIso: string | null;
}

export interface GroupBalance {
  groups: GroupBalanceRow[];
  /** Distinct logged foods with no food group (free-text or missing category). */
  otherCount: number;
  /** Groups with nothing eaten or tasted in the last 14 days; never-offered first. */
  thinGroups: BalanceGroup[];
  /** Logged results counted in the window. */
  loggedCount: number;
  windowStartIso: string;
}

export function computeGroupBalance(params: {
  kid: KidRef;
  foods: readonly Food[];
  planEntries: readonly PlanEntry[];
  todayIso: string;
  days?: number;
  /** Pass a prebuilt map when the caller already has one. */
  foodById?: ReadonlyMap<string, Food>;
}): GroupBalance {
  const { kid, foods, planEntries, todayIso, days = INSIGHTS_WINDOW_DAYS } = params;
  const foodById = params.foodById ?? buildFoodById(foods);
  const start = windowStartIso(todayIso, days);
  const thinSince = windowStartIso(todayIso, THIN_GROUP_DAYS);

  const offered = new Map<BalanceGroup, Set<string>>();
  const accepted = new Map<BalanceGroup, Set<string>>();
  const lastAccepted = new Map<BalanceGroup, string>();
  const other = new Set<string>();
  for (const g of BALANCE_GROUPS) {
    offered.set(g, new Set());
    accepted.set(g, new Set());
  }

  let loggedCount = 0;
  for (const e of planEntries) {
    if (e.kid_id !== kid.id || e.result == null || !e.food_id) continue;
    const d = dayOf(e.date);
    if (!d || d < start || d > todayIso) continue;
    const food = foodById.get(e.food_id);
    if (!food) continue;
    loggedCount++;
    const cat = toDisplayCategory(food.category);
    if (cat === 'other') {
      other.add(food.id);
      continue;
    }
    if (!isBalanceGroup(cat)) continue; // snack: a slot, not a group
    offered.get(cat)?.add(food.id);
    if (e.result === 'ate' || e.result === 'tasted') {
      accepted.get(cat)?.add(food.id);
      const prev = lastAccepted.get(cat);
      if (!prev || d > prev) lastAccepted.set(cat, d);
    }
  }

  const groups: GroupBalanceRow[] = BALANCE_GROUPS.map((group) => ({
    group,
    offered: offered.get(group)?.size ?? 0,
    accepted: accepted.get(group)?.size ?? 0,
    lastAcceptedIso: lastAccepted.get(group) ?? null,
  }));

  const thinGroups = groups
    .filter((r) => r.lastAcceptedIso === null || r.lastAcceptedIso < thinSince)
    .sort((a, b) => {
      const never = Number(a.offered > 0) - Number(b.offered > 0);
      if (never !== 0) return never;
      return (a.lastAcceptedIso ?? '').localeCompare(b.lastAcceptedIso ?? '');
    })
    .map((r) => r.group);

  return { groups, otherCount: other.size, thinGroups, loggedCount, windowStartIso: start };
}

// ---------------------------------------------------------------------------
// Upcoming allergy check
// ---------------------------------------------------------------------------

export type AllergyCheckStatus = 'unknown-list' | 'none-recorded' | 'clear' | 'hits' | 'partial';

export interface AllergenHit {
  foodId: string;
  foodName: string;
  date: string;
  mealSlot: PlanEntry['meal_slot'];
  /** The kid's own spelling of the allergen (e.g. "peanuts"), for labelling. */
  allergen: string;
}

export interface AllergyCheck {
  status: AllergyCheckStatus;
  hits: AllergenHit[];
  /** Planned items whose food could not be resolved, so were not checked. */
  uncheckedCount: number;
  /** Planned items in the look-ahead window. */
  plannedCount: number;
}

const SLOT_ORDER: Record<string, number> = {
  breakfast: 0,
  snack1: 1,
  lunch: 2,
  snack2: 3,
  dinner: 4,
  try_bite: 5,
};

export function checkUpcomingAllergens(params: {
  kid: Pick<Kid, 'id' | 'allergens'>;
  foodById: ReadonlyMap<string, Food>;
  planEntries: readonly PlanEntry[];
  todayIso: string;
  days?: number;
}): AllergyCheck {
  const { kid, foodById, planEntries, todayIso, days = ALLERGY_LOOKAHEAD_DAYS } = params;
  const end = addIsoDays(todayIso, Math.max(1, Math.floor(days)) - 1);

  const planned: PlanEntry[] = [];
  for (const e of planEntries) {
    if (e.kid_id !== kid.id || !e.food_id) continue;
    const d = dayOf(e.date);
    if (d && d >= todayIso && d <= end) planned.push(e);
  }
  let uncheckedCount = 0;
  for (const e of planned) if (!foodById.has(e.food_id)) uncheckedCount++;
  const base = { hits: [] as AllergenHit[], uncheckedCount, plannedCount: planned.length };

  if (isAllergyUnknown(kid)) return { status: 'unknown-list', ...base };
  if (!kid.allergens || kid.allergens.length === 0) return { status: 'none-recorded', ...base };

  const conflicts = findAllergenConflicts(
    [kid],
    planned.map((e) => e.food_id),
    foodById,
  );
  const spellingByCanonical = new Map<string, string>();
  for (const a of kid.allergens) {
    const key = canonicalAllergen(a);
    if (key && !spellingByCanonical.has(key)) spellingByCanonical.set(key, a);
  }
  const allergenByFood = new Map<string, string>();
  for (const c of conflicts) {
    if (!allergenByFood.has(c.food.id)) {
      allergenByFood.set(c.food.id, spellingByCanonical.get(c.allergen) ?? c.allergen);
    }
  }

  const seen = new Set<string>();
  const hits: AllergenHit[] = [];
  for (const e of planned) {
    const allergen = allergenByFood.get(e.food_id);
    if (!allergen) continue;
    const date = dayOf(e.date);
    const key = `${date}|${e.meal_slot}|${e.food_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      foodId: e.food_id,
      foodName: foodById.get(e.food_id)?.name ?? '',
      date,
      mealSlot: e.meal_slot,
      allergen,
    });
  }
  hits.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || (SLOT_ORDER[a.mealSlot] ?? 9) - (SLOT_ORDER[b.mealSlot] ?? 9),
  );

  const status: AllergyCheckStatus = hits.length > 0 ? 'hits' : uncheckedCount > 0 ? 'partial' : 'clear';
  return { status, ...base, hits };
}

// ---------------------------------------------------------------------------
// Easy adds for a thin group
// ---------------------------------------------------------------------------

export type EasyAddAvailability = 'pantry' | 'onList' | 'none';

export interface EasyAdd {
  food: Food;
  availability: EasyAddAvailability;
  acceptedBefore: boolean;
}

export function rankEasyAdds(params: {
  kid: Pick<Kid, 'id' | 'allergens' | 'disliked_foods' | 'always_eats_foods'>;
  group: BalanceGroup;
  foods: readonly Food[];
  /** buildResultIndex(windowedEntries, kid.id, addIsoDays(todayIso, 1)). */
  resultIndex: ResultIndex;
  /** Quantity on hand by food id; falls back to food.quantity. */
  stockById?: ReadonlyMap<string, number | undefined>;
  /** buildOnListKeySet(groceryItems). */
  onListKeys: ReadonlySet<string>;
  limit?: number;
}): EasyAdd[] {
  const { kid, group, foods, resultIndex, stockById, onListKeys, limit = 3 } = params;
  const ranked: { add: EasyAdd; tryBite: boolean; inStock: boolean }[] = [];
  for (const food of foods) {
    if (toDisplayCategory(food.category) !== group) continue;
    const fit = getKidFoodFit(kid, food, resultIndex);
    if (fit.allergen !== null || fit.disliked) continue;
    const qty = stockById?.has(food.id) ? stockById.get(food.id) : food.quantity;
    const inStock = getStockStatus(qty) !== 'out';
    const acceptedBefore = fit.ate + (fit.tasted ?? 0) > 0;
    const availability: EasyAddAvailability = inStock ? 'pantry' : isOnList(onListKeys, food) ? 'onList' : 'none';
    ranked.push({ add: { food, availability, acceptedBefore }, tryBite: Boolean(food.is_try_bite), inStock });
  }
  ranked.sort(
    (a, b) =>
      Number(b.add.acceptedBefore) - Number(a.add.acceptedBefore) ||
      Number(b.tryBite) - Number(a.tryBite) ||
      Number(b.inStock) - Number(a.inStock) ||
      a.add.food.name.localeCompare(b.add.food.name),
  );
  return ranked.slice(0, Math.max(0, limit)).map((r) => r.add);
}

// ---------------------------------------------------------------------------
// Repeats
// ---------------------------------------------------------------------------

export interface RepeatItem {
  id: string;
  name: string;
  /** Servings in the last week. */
  shortWindowCount: number;
  /** Servings in the last 4 weeks. */
  longWindowCount: number;
  tier: Exclude<FatigueTier, 'none'>;
}

export interface KidRepeats {
  meals: RepeatItem[];
  ingredients: RepeatItem[];
}

const EMPTY_INDEX: ResultIndex = new Map();

function toRepeatItems(items: readonly FatigueItem[]): RepeatItem[] {
  const out: RepeatItem[] = [];
  for (const it of items) {
    if (it.tier === 'none' || !it.name) continue;
    out.push({
      id: it.id,
      name: it.name,
      shortWindowCount: it.shortWindowCount,
      longWindowCount: it.longWindowCount,
      tier: it.tier,
    });
  }
  return out;
}

/**
 * What this kid has been served over and over. Uses computeVarietyFatigue on
 * the kid's own rows, so a sibling's dinners never count, and treats a food as
 * "safe" (left out) only when it is safe for this kid: flagged safe with no
 * allergen and no dislike, or on the kid's always-eats list.
 */
export function computeKidRepeats(params: {
  kid: Pick<Kid, 'id' | 'allergens' | 'disliked_foods' | 'always_eats_foods'>;
  planEntries: readonly PlanEntry[];
  recipes: readonly Pick<Recipe, 'id' | 'name'>[];
  foods: readonly Food[];
  todayIso: string;
}): KidRepeats {
  const { kid, planEntries, recipes, foods, todayIso } = params;
  const safeFoodIds = new Set<string>();
  const foodNameById = new Map<string, string>();
  for (const food of foods) {
    foodNameById.set(food.id, food.name);
    const fit = getKidFoodFit(kid, food, EMPTY_INDEX);
    if ((food.is_safe && fit.allergen === null && !fit.disliked) || fit.alwaysEats) safeFoodIds.add(food.id);
  }
  const kidEntries = [];
  for (const e of planEntries) {
    if (e.kid_id !== kid.id) continue;
    kidEntries.push({
      recipeId: e.recipe_id ?? null,
      foodId: e.food_id ?? null,
      date: e.date,
      mealSlot: e.meal_slot ?? null,
    });
  }
  const result = computeVarietyFatigue(
    {
      planEntries: kidEntries,
      recipeNameById: new Map(recipes.map((r) => [r.id, r.name])),
      foodNameById,
      safeFoodIds,
    },
    { asOf: todayIso, limit: 20 },
  );
  return { meals: toRepeatItems(result.recipes), ingredients: toRepeatItems(result.ingredients) };
}
