import type { Food, FoodCategory, GroceryItem, PlanEntry } from '@/types';
import { resolveFood, type CatalogEntry, type EffectiveFood } from '@/lib/effectiveFood';

/**
 * Pure derivations for the Grocery page (US-553 AC2) — extracted out of the JSX
 * so the data logic is unit-tested and the heavy list subtree can memoize on
 * stable outputs. Mirrors the `computeInsights` (US-540) extraction style.
 */

export type GroupBy = 'category' | 'aisle';

/**
 * US-795 fix round: an index that matches a grocery item's name back to a
 * pantry food by EITHER its resolved (catalog) name or its raw household
 * name.
 *
 * US-796's matcher links a food to a catalog row on an exact normalized name
 * OR a barcode match; the barcode arm puts no constraint on the name at all,
 * so a linked food's catalog name can differ from what the household typed.
 * A grocery row can now show the catalog name (that's the visible point of
 * the resolver in `src/lib/effectiveFood.ts`) -- matching on the household
 * name alone would then miss the food entirely when a shopper checks that
 * row off, create a SECOND pantry row under the catalog name with `is_safe:
 * true` hardcoded (the unlinked-food default in `handleToggleItem`), and
 * orphan the parent's original row, which might be `is_safe: false`. A food
 * a parent marked unsafe must never reappear as safe because its catalog
 * spelling didn't match. Indexing both names is what keeps a row written
 * before this fix (or an unlinked food) matching exactly as before.
 */
export function buildFoodByDisplayNameIndex(
  foods: Food[],
  catalogById: Record<string, CatalogEntry>,
): Map<string, Food> {
  const map = new Map<string, Food>();
  for (const food of foods) {
    map.set(food.name.toLowerCase(), food);
    const catalog = food.canonical_id ? catalogById[food.canonical_id] : undefined;
    if (catalog) {
      const effectiveName = resolveFood(food, catalog).name;
      map.set(effectiveName.toLowerCase(), food);
    }
  }
  return map;
}

export const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: 'Protein',
  carb: 'Carbs',
  dairy: 'Dairy',
  fruit: 'Fruits',
  vegetable: 'Vegetables',
  snack: 'Snacks',
};

export const CATEGORY_ICONS: Record<FoodCategory, string> = {
  protein: '🥩',
  carb: '🍞',
  dairy: '🧀',
  fruit: '🍎',
  vegetable: '🥦',
  snack: '🍿',
};

export const OTHER_CATEGORY_LABEL = 'Other';

// Grocery item categories are now free-text (grocery_items.category was relaxed
// to allow values like "other" / aisle-derived labels), so a direct
// CATEGORY_LABELS[item.category] lookup can be undefined and crash the render.
// Resolve to the friendly label when known, otherwise fall back to "Other".
export function categoryLabel(category: string | null | undefined): string {
  if (category && category in CATEGORY_LABELS) {
    return CATEGORY_LABELS[category as FoodCategory];
  }
  return OTHER_CATEGORY_LABEL;
}

/**
 * Restrict items to a selected list, or return all when none is selected.
 *
 * US-714: a null grocery_list_id is not "on no list" -- it is the household's
 * default list. Rows added before named lists existed, and rows from any add
 * path that forgot to stamp one, all carry null, and a strict equality filter
 * hid every one of them the moment a list was selected. When the selected list
 * IS the default, those rows belong to it.
 */
export function filterItemsByList(
  items: GroceryItem[],
  selectedListId: string | null,
  defaultListId?: string | null
): GroceryItem[] {
  if (!selectedListId) return items;
  const selectedIsDefault = defaultListId != null && selectedListId === defaultListId;
  return items.filter((item) =>
    item.grocery_list_id == null
      ? selectedIsDefault
      : item.grocery_list_id === selectedListId
  );
}

export interface SplitItems {
  active: GroceryItem[];
  purchased: GroceryItem[];
}

/** Split into active (unchecked) and purchased (checked) items. */
export function splitByChecked(items: GroceryItem[]): SplitItems {
  return {
    active: items.filter((i) => !i.checked),
    purchased: items.filter((i) => i.checked),
  };
}

/**
 * Percent of items purchased, floored; 0 when the list is empty.
 *
 * Floored, not rounded: 199 of 200 rounded to 100, so the bar read "complete"
 * with one item still in the trolley's future.
 */
export function computeProgressPercent(total: number, purchased: number): number {
  return total > 0 ? Math.floor((purchased / total) * 100) : 0;
}

export type MilestoneKey =
  | 'grocery.progress.milestone.start'
  | 'grocery.progress.milestone.halfway'
  | 'grocery.progress.milestone.almost'
  | 'grocery.progress.milestone.complete';

/** The i18n key for the encouragement line at this progress, or null for none. */
export function milestoneKey(progressPercent: number): MilestoneKey | null {
  if (progressPercent >= 100) return 'grocery.progress.milestone.complete';
  if (progressPercent >= 75) return 'grocery.progress.milestone.almost';
  if (progressPercent >= 50) return 'grocery.progress.milestone.halfway';
  if (progressPercent >= 25) return 'grocery.progress.milestone.start';
  return null;
}

/**
 * @deprecated English-only; use milestoneKey with t(). Kept so the page keeps
 * compiling until it moves over.
 */
export function milestoneMessage(progressPercent: number): string {
  if (progressPercent >= 100) return 'Shopping complete!';
  if (progressPercent >= 75) return 'Almost done!';
  if (progressPercent >= 50) return 'Halfway there!';
  if (progressPercent >= 25) return 'Great start!';
  return '';
}

/**
 * Bucket items by friendly category label or by aisle. Free-text/unknown
 * categories fall into "Other"; missing aisles fall into "Uncategorized".
 */
export function groupItems(items: GroceryItem[], groupBy: GroupBy): Record<string, GroceryItem[]> {
  const groups: Record<string, GroceryItem[]> = {};
  if (groupBy === 'category') {
    items.forEach((item) => {
      const label = categoryLabel(item.category);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });
  } else {
    items.forEach((item) => {
      const aisle = item.aisle || 'Uncategorized';
      if (!groups[aisle]) groups[aisle] = [];
      groups[aisle].push(item);
    });
  }
  return groups;
}

/** Group names that always sort last: the bucket for rows with no home. */
const LEFTOVER_GROUPS = new Set(['uncategorized', 'other']);

/**
 * The order groups render in: alphabetical (numeric-aware, so "Aisle 2" comes
 * before "Aisle 12"), with Uncategorized / Other last whatever the grouping.
 * A leftover bucket first would put the rows nobody sorted at the top of the
 * shop, which is the one place they are never needed.
 */
export function orderGroupNames(names: readonly string[], groupBy: GroupBy): string[] {
  const leftover = (name: string) =>
    LEFTOVER_GROUPS.has(name.trim().toLowerCase()) ||
    (groupBy === 'category' && name === OTHER_CATEGORY_LABEL);
  return [...names].sort((a, b) => {
    const la = leftover(a);
    const lb = leftover(b);
    if (la !== lb) return la ? 1 : -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/**
 * Which groups start expanded on the grocery list (US-767).
 *
 * At phone width the By Aisle view is the shopping view: a parent standing in
 * an aisle holding a phone in one hand wants the aisle they are IN, not eleven
 * headers they have to scroll past to reach it. So one group is open and the
 * rest are a tap away.
 *
 * WHICH ONE. The first group with items left to buy. `groupItems` preserves
 * the order the list is rendered in, and a shopper works down it, so the first
 * unfinished group is the one they are standing in. Anything cleverer -- a
 * store layout, the last aisle they checked something off in -- is a guess
 * dressed as help, and guessing wrong costs a tap on a phone they are holding
 * over a trolley.
 *
 * On a desktop there is room for all of it, so nothing collapses and the view
 * is exactly what it was. That asymmetry is the point: this is a phone-width
 * affordance, not a new interaction everyone has to learn.
 */
/**
 * A DOM-id-safe form of a group name, for aria-controls.
 *
 * Aisle names are operator-typed ("Meat & Deli", "Frozen / Freezer"), so they
 * carry spaces, ampersands and slashes. An id with those in it is legal in
 * HTML5 but a minefield for anything that later needs to select it, and two
 * aisles differing only in punctuation must not collide -- hence the fallback
 * on an empty result rather than an id of "".
 */
export function slugifyGroupId(group: string): string {
  const slug = group
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `g${[...group].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7)}`;
}

export function initialExpandedGroups(
  groupNames: readonly string[],
  isPhoneWidth: boolean,
  order?: readonly string[],
): Set<string> {
  if (!isPhoneWidth) return new Set(groupNames);
  // With a render order (store walk order, or orderGroupNames), the first
  // group is the first one the shopper reaches, not the first one inserted.
  const present = new Set(groupNames);
  const first = order ? order.find((name) => present.has(name)) ?? groupNames[0] : groupNames[0];
  return first === undefined ? new Set() : new Set([first]);
}

/**
 * Carry the open/closed state across a re-group.
 *
 * Checking the last item off an aisle removes that group, and adding an item
 * can introduce one. Recomputing from scratch would slam shut a group the
 * shopper had deliberately opened, so what they have already chosen is kept
 * and only genuinely new groups take the default.
 *
 * A group that has gone is dropped rather than remembered: if it comes back it
 * is a new aisle to them, and a set that only ever grows is a leak.
 */
export function reconcileExpandedGroups(
  previous: ReadonlySet<string>,
  groupNames: readonly string[],
  isPhoneWidth: boolean,
): ReadonlySet<string> {
  const known = new Set(groupNames);
  const kept = [...previous].filter((name) => known.has(name));

  const next = !isPhoneWidth
    ? new Set(groupNames)
    // Nothing survived -- a fresh list, or every open group was finished. Fall
    // back to the default so the shopper is never left with everything shut.
    : kept.length === 0
      ? initialExpandedGroups(groupNames, true)
      : new Set(kept);

  // IDENTITY-STABLE WHEN NOTHING CHANGED, and this is not a micro-optimisation.
  // The caller runs this in an effect keyed on the grouped items, and
  // `groupItems` returns a fresh object on every render -- so returning a new
  // Set each time sets state, re-renders, re-groups and runs the effect again,
  // forever. It does not look like an infinite loop in review; it looks like a
  // vitest worker dying with "Ineffective mark-compacts near heap limit", which
  // is how this was found.
  if (next.size === previous.size && [...next].every((name) => previous.has(name))) {
    return previous;
  }
  return next;
}

export type VirtualRow =
  | { type: 'header'; group: string; count: number }
  | { type: 'item'; item: GroceryItem; group: string };

/**
 * Flatten grouped items into virtualizable rows.
 *
 * Every non-empty group gets a header row; its item rows follow only when the
 * group is expanded, so a folded aisle costs one row however long it is, and
 * the fold works at any list size rather than only below the virtualization
 * threshold. `expanded` omitted means every group is open.
 *
 * `order` sets the group order. Groups it does not name follow in their
 * object order, so a new aisle is never dropped for missing from a layout.
 */
export function flattenGroupedRows(
  grouped: Record<string, GroceryItem[]>,
  opts: { expanded?: ReadonlySet<string>; order?: readonly string[] } = {},
): VirtualRow[] {
  const names = Object.keys(grouped);
  let ordered = names;
  if (opts.order) {
    const present = new Set(names);
    const named = opts.order.filter((name, i) => present.has(name) && opts.order!.indexOf(name) === i);
    const namedSet = new Set(named);
    ordered = [...named, ...names.filter((name) => !namedSet.has(name))];
  }

  const rows: VirtualRow[] = [];
  for (const group of ordered) {
    const items = grouped[group];
    if (!items || items.length === 0) continue;
    rows.push({ type: 'header', group, count: items.length });
    if (opts.expanded && !opts.expanded.has(group)) continue;
    for (const item of items) {
      rows.push({ type: 'item', item, group });
    }
  }
  return rows;
}

/**
 * Keep just-checked rows in the active list for a moment.
 *
 * A checked row that jumps out from under the thumb puts the next row where
 * the finger is, so a second tap checks the wrong item. The page holds the
 * ids it wants to linger; this moves those rows back into `active` (crossed
 * out, since they are still checked) and out of `purchased`.
 *
 * `order` is the full list the two halves were split from. Given, lingering
 * rows sit exactly where they were; omitted, they are appended.
 */
export function withLingering(
  active: GroceryItem[],
  purchased: GroceryItem[],
  lingerIds: ReadonlySet<string>,
  order?: readonly GroceryItem[],
): SplitItems {
  if (lingerIds.size === 0) return { active, purchased };
  const lingering = purchased.filter((item) => lingerIds.has(item.id));
  if (lingering.length === 0) return { active, purchased };
  const rest = purchased.filter((item) => !lingerIds.has(item.id));

  if (!order) return { active: [...active, ...lingering], purchased: rest };

  const keep = new Set<string>([...active, ...lingering].map((item) => item.id));
  const byId = new Map<string, GroceryItem>([...active, ...lingering].map((item) => [item.id, item]));
  const placed = order.filter((item) => keep.has(item.id)).map((item) => byId.get(item.id) as GroceryItem);
  // Anything the order did not know about still shows.
  const placedIds = new Set(placed.map((item) => item.id));
  for (const item of [...active, ...lingering]) if (!placedIds.has(item.id)) placed.push(item);
  return { active: placed, purchased: rest };
}

/**
 * One tap on the row stepper.
 *
 * Quarters below 1 (a quarter pound of ham, half a bag of spinach) and whole
 * units from 1 up. Going down from above 1 stops at 1 before it starts taking
 * quarters, so 1.5 steps to 1 and then 0.75, never straight to 0.5. The floor
 * is 0.25: removing a row is the delete button's job, not the minus button's.
 *
 * `delta` is a count of taps; its sign is the direction.
 */
export function stepQuantity(qty: number, delta: number): number {
  const MIN = 0.25;
  let next = Number.isFinite(qty) && qty > 0 ? qty : MIN;
  const steps = Math.abs(Math.trunc(delta));
  for (let i = 0; i < steps; i++) {
    if (delta > 0) next = next < 1 ? Math.min(1, next + 0.25) : next + 1;
    else next = next > 1 ? Math.max(1, next - 1) : next - 0.25;
    next = Math.max(MIN, Math.round(next * 100) / 100);
  }
  return next;
}

// --- Which kid an item is for -----------------------------------------------

/** The key buildGroceryKidIndex files a name under. Use it to look a row up. */
export function groceryKidKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Which kids each grocery name is for, from the plan.
 *
 * Built from EVERY in-window entry, not from a row's source_plan_entry_id:
 * that column names only the first entry that put the food on the list, so
 * milk planned for Ava on Monday and Sam on Tuesday would read "For Ava" and
 * a parent would shop for one child. A food is filed under its resolved
 * (catalog) name, which is what a plan-sync row is called, and under the
 * household's own spelling, which is what a hand-added row is likely called.
 *
 * Kid ids come back in first-seen order, without repeats.
 */
export function buildGroceryKidIndex(
  entries: readonly PlanEntry[],
  foods: readonly Food[],
  effectiveFoodById: Record<string, EffectiveFood>,
  window: { from: string; to: string },
): Map<string, string[]> {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const index = new Map<string, string[]>();
  const file = (name: string | undefined, kidId: string) => {
    if (!name) return;
    const key = groceryKidKey(name);
    if (!key) return;
    const kids = index.get(key);
    if (!kids) index.set(key, [kidId]);
    else if (!kids.includes(kidId)) kids.push(kidId);
  };
  for (const entry of entries) {
    if (typeof entry.date !== 'string') continue;
    const day = entry.date.slice(0, 10);
    if (day < window.from || day > window.to) continue;
    if (!entry.kid_id) continue;
    const food = foodById.get(entry.food_id);
    if (!food) continue;
    file(effectiveFoodById[food.id]?.name, entry.kid_id);
    file(food.name, entry.kid_id);
  }
  return index;
}

// --- Plan sync (US-713) -----------------------------------------------------

/** Stamped on every row a meal-plan sync creates, so a later sync can find
 *  its own rows and leave everyone else's alone. */
export const MEAL_PLAN_SYNC = 'meal_plan_sync' as const;

/** The subset of a generated row this planner needs. */
export interface GeneratedRow {
  name: string;
  quantity: number;
  unit?: string;
  category?: string;
  aisle?: string;
  source_plan_entry_id?: string;
}

export interface RegenerationPlan {
  /** Auto-generated, unchecked rows the plan no longer calls for. */
  retireIds: string[];
  /** Rows to hand to addGroceryItemsMerged, already stamped for the list. */
  additions: Array<{
    name: string;
    quantity: number;
    unit?: string;
    category?: string;
    aisle?: string;
    grocery_list_id?: string | null;
    auto_generated: true;
    source_plan_entry_id?: string | null;
    added_via: typeof MEAL_PLAN_SYNC;
  }>;
  /** Rows left exactly as they are: hand-added, or already bought. */
  preservedCount: number;
  /**
   * Kept plan-sync rows the plan now needs more of: same unit, unchecked, and
   * below the generated quantity. `quantity` is the absolute target and
   * `delta` what to add to reach it, which is what a merge bump takes.
   */
  updates: Array<{ id: string; name: string; unit: string; quantity: number; delta: number }>;
}

/**
 * Work out what a "sync from meal plan" should change, without touching state.
 *
 * The shape that makes this idempotent: a generated row already sitting on the
 * list as an unchecked auto-generated row is neither new nor stale, so it is
 * left alone rather than deleted and re-inserted. Running the sync twice for
 * the same week is therefore a no-op -- no duplicate rows, no doubled
 * quantities, and no realtime churn on a partner's phone.
 *
 * US-713 also replaces the old `is_manual` filter. `is_manual` was never a
 * column: it existed only on a local interface, so it was undefined on every
 * row loaded from the server and the filter preserved nothing but checked rows.
 * Hand-added items were being swept away on every sync. `auto_generated` is
 * persisted, so the inverse test is the one that actually holds.
 *
 * `auto_generated` alone is NOT enough to decide what a sync may retire. The
 * smart-restock RPC (20251010221000) sets the same flag -- its column comment
 * still reads "True if item was auto-added by restock system" -- so retiring on
 * that flag alone would sweep away a user's restock suggestions on every sync.
 * A row is regenerable only when it also carries a plan-sync fingerprint:
 * source_plan_entry_id, or added_via = 'meal_plan_sync'.
 */
/** True only for rows a previous meal-plan sync created. */
function isPlanSyncRow(item: GroceryItem): boolean {
  return Boolean(item.source_plan_entry_id) || item.added_via === MEAL_PLAN_SYNC;
}

export function planRegenerationFromPlan(args: {
  existing: GroceryItem[];
  generated: GeneratedRow[];
  selectedListId: string | null;
  /** US-714: the list that owns rows with a null grocery_list_id. */
  defaultListId?: string | null;
  /**
   * The plan entries the sync covers (one week, possibly one kid). When given,
   * a stale plan-sync row is retired only if its source_plan_entry_id is in
   * this set, so syncing next week from the planner cannot delete this week's
   * rows, and a row with no recorded source is left alone. Omitted, every
   * stale plan-sync row on the list is a candidate, as before.
   */
  windowEntryIds?: Iterable<string>;
}): RegenerationPlan {
  const { existing, generated, selectedListId, defaultListId } = args;
  const scope = args.windowEntryIds ? new Set(args.windowEntryIds) : null;
  const inScope = (item: GroceryItem) =>
    scope === null || (item.source_plan_entry_id != null && scope.has(item.source_plan_entry_id));
  const key = (name: string) => name.trim().toLowerCase();

  const target = selectedListId ?? defaultListId ?? null;
  const sameList = (item: GroceryItem) =>
    (item.grocery_list_id ?? defaultListId ?? null) === target;
  const inSelectedList = existing.filter(sameList);

  // Hand-added rows, restock suggestions and anything already bought are
  // untouchable. Only rows this sync itself created may be retired.
  const preserved = inSelectedList.filter(
    (item) => !item.auto_generated || item.checked || !isPlanSyncRow(item),
  );
  const preservedNames = new Set(preserved.map((item) => key(item.name)));

  const generatedNames = new Set(generated.map((row) => key(row.name)));

  const regenerable = inSelectedList.filter(
    (item) => item.auto_generated && !item.checked && isPlanSyncRow(item),
  );
  const retireIds = regenerable
    .filter((item) => !generatedNames.has(key(item.name)) && inScope(item))
    .map((item) => item.id);
  const kept = regenerable.filter((item) => generatedNames.has(key(item.name)));
  const keptNames = new Set(kept.map((item) => key(item.name)));

  // A week that grew (two more pasta dinners) used to leave the kept row at
  // last week's count, because a kept row was "neither new nor stale". Only
  // grow, never shrink: a parent who bumped it by hand meant it. And only when
  // this row is the one unchecked row by that name on the list, since a merge
  // bump lands on the first match and would otherwise hit a hand-added twin.
  const unitKey = (unit: string | undefined | null) => (unit ?? '').trim().toLowerCase();
  const uncheckedByName = new Map<string, number>();
  for (const item of inSelectedList) {
    if (item.checked) continue;
    uncheckedByName.set(key(item.name), (uncheckedByName.get(key(item.name)) ?? 0) + 1);
  }
  const generatedByName = new Map<string, GeneratedRow>();
  for (const row of generated) if (!generatedByName.has(key(row.name))) generatedByName.set(key(row.name), row);
  const bumped = new Set<string>();
  const updates: RegenerationPlan['updates'] = [];
  for (const item of kept) {
    const name = key(item.name);
    if (bumped.has(name) || uncheckedByName.get(name) !== 1) continue;
    const row = generatedByName.get(name);
    if (!row || unitKey(row.unit) !== unitKey(item.unit)) continue;
    const have = Number(item.quantity) || 0;
    if (!(have < row.quantity)) continue;
    bumped.add(name);
    updates.push({
      id: item.id,
      name: item.name,
      unit: item.unit ?? '',
      quantity: row.quantity,
      delta: Math.round((row.quantity - have) * 100) / 100,
    });
  }

  const additions = generated
    .filter((row) => !preservedNames.has(key(row.name)) && !keptNames.has(key(row.name)))
    .map((row) => ({
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      category: row.category,
      aisle: row.aisle,
      grocery_list_id: selectedListId ?? undefined,
      auto_generated: true as const,
      source_plan_entry_id: row.source_plan_entry_id ?? undefined,
      added_via: MEAL_PLAN_SYNC,
    }));

  return { retireIds, additions, preservedCount: preserved.length, updates };
}
