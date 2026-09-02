/**
 * groceryMerge — shared logic for moving recipe ingredients onto the grocery
 * list so duplicates STACK instead of piling up as separate rows.
 *
 * Solves three user-reported problems:
 *  1. "ground beef" + "ground beef 80/20" should collapse to one line
 *     ("2 lbs ground beef"), not two — via a qualifier-stripping match key.
 *  2. A recipe whose ingredients arrive as one free-text blob should be split
 *     into individual lines — via `splitIngredientBlock`.
 *  3. Quantities should add up unit-aware ("1 lb" + "1 lb" = "2 lb") — via the
 *     US-287 `unitNormalize` layer, which until now was unused in production.
 *
 * Pure + dependency-light so both the web grocery flows and the test suite can
 * use it, and so iOS can mirror the same canonical behaviour.
 */
import { normalize, convert } from '@/lib/unitNormalize';
import {
  UNIT_NOISE,
  isNumericToken,
  singularize,
} from '@/lib/itemNormalize';

/**
 * US-593: how much of `required` still needs buying, given pantry stock.
 *
 * Lives here rather than inline in the mobile modal so it is unit-testable —
 * `vitest.config.ts` only collects `src/**`, and there is no React Native
 * preset for rendering the modal itself.
 *
 * The inline version this replaces was
 * `Math.max(1, qty * servings - inStockQty)`, which had two defects:
 *   1. it floored every amount at 1, so a needed 0.5 tsp became 1 tsp;
 *   2. it subtracted the pantry quantity regardless of unit (2 cup − 1 bag = 1).
 *
 * Stock is only subtracted when the units genuinely convert; otherwise we fail
 * safe toward buying the full amount rather than under-buying.
 */
export function requiredAfterStock(
  required: number,
  requiredUnit: string,
  stocked: number,
  stockedUnit: string
): number {
  if (!Number.isFinite(required)) return 0;
  if (!(stocked > 0)) return required;
  const stockedInRequiredUnit = convert(
    stocked,
    stockedUnit || requiredUnit,
    requiredUnit || stockedUnit
  );
  if (stockedInRequiredUnit == null) return required;
  return Math.max(0, required - stockedInRequiredUnit);
}

export interface GroceryAddInput {
  name: string;
  quantity: number;
  unit?: string | null;
  category?: string;
  aisle?: string | null;
  added_via?: string;
  source_recipe_id?: string;
  notes?: string | null;
  /** US-713: the list the row belongs to. Without it a generated row is
   *  invisible under every named list, since filterItemsByList matches on it. */
  grocery_list_id?: string | null;
  /** US-713: true for rows a plan sync created, so a later sync may retire
   *  them. Hand-added rows leave it unset and are never swept. */
  auto_generated?: boolean;
  /** US-713: the plan entry that put this row on the list. */
  source_plan_entry_id?: string | null;
  /** US-714: collected by the add dialog and previously dropped on this path. */
  brand_preference?: string;
  barcode?: string;
  priority?: string;
  price_per_unit?: number | null;
  added_by_user_id?: string | null;
}

export interface ExistingGroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string | null;
  checked?: boolean;
  /** US-714: which list the row is on. null/undefined means the default list. */
  grocery_list_id?: string | null;
}

export interface GroceryMergeScope {
  /** The list the incoming items are being added to. */
  targetListId?: string | null;
  /** The household's default list, which owns every row with a null list id. */
  defaultListId?: string | null;
}

export interface GroceryMergePlan {
  /** Brand-new rows to insert (already merged among themselves). */
  inserts: GroceryAddInput[];
  /** Existing unchecked rows whose quantity (and unit/name) should be bumped. */
  updates: { id: string; quantity: number; unit: string; name: string }[];
}




/**
 * Canonical match key: lower-cases, drops parentheticals, numeric/ratio tokens
 * (fat ratios, percentages) and unit/packaging noise, singularises, and sorts
 * the remaining significant tokens. Two names with the same key are treated as
 * the same grocery item.
 *
 *   "Ground Beef 80/20"  → "beef ground"
 *   "ground beef"        → "beef ground"   (match → stack)
 *   "red onion"          → "onion red"     (distinct from "onion" — kept apart)
 */
export function ingredientMatchKey(name: string): string {
  const cleaned = (name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // strip parentheticals
    .replace(/[.,;]/g, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !isNumericToken(t))
    .filter((t) => !UNIT_NOISE.has(t))
    .map(singularize);
  return tokens.sort().join(' ');
}

/** Render a quantity without trailing zeros: 2 → "2", 1.5 → "1.5", 0.25 → "0.25". */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 100) / 100;
  return String(rounded);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Most-common original unit string across the parts (for display target). */
function dominantUnit(parts: { unit?: string | null }[]): string {
  const counts = new Map<string, number>();
  for (const p of parts) {
    const u = (p.unit ?? '').trim();
    counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  let best = '';
  let bestCount = -1;
  for (const [u, c] of counts) {
    // Prefer a real unit over the empty/placeholder one on ties.
    if (c > bestCount || (c === bestCount && u !== '' && best === '')) {
      best = u;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Unit-aware sum. When every part shares a comparable unit family the total is
 * computed in canonical units and presented back in the most common original
 * unit ("1 lb" + "1 lb" → 2 "lb"). Mixed/unknown families fall back to a raw
 * numeric sum keeping the dominant unit label.
 */
export function sumQuantities(parts: { quantity: number; unit?: string | null }[]): {
  quantity: number;
  unit: string;
} {
  const cleaned = parts.filter((p) => Number.isFinite(p.quantity));
  if (cleaned.length === 0) return { quantity: 0, unit: '' };
  if (cleaned.length === 1) {
    return { quantity: round2(cleaned[0].quantity), unit: (cleaned[0].unit ?? '').trim() };
  }

  const target = dominantUnit(cleaned);
  const norms = cleaned.map((p) => normalize(p.quantity, p.unit));
  const families = new Set(norms.map((n) => n.family));

  if (families.size === 1 && !families.has('unknown')) {
    const canonicalTotal = norms.reduce((s, n) => s + n.qty, 0);
    const canonicalUnit = norms[0].canonicalUnit;
    const converted = convert(canonicalTotal, canonicalUnit, target || canonicalUnit);
    if (converted != null) {
      return { quantity: round2(converted), unit: target };
    }
    return {
      quantity: round2(canonicalTotal),
      unit: canonicalUnit === 'piece' ? target : canonicalUnit,
    };
  }

  // Mixed or unknown families — best-effort raw sum.
  const rawTotal = cleaned.reduce((s, p) => s + p.quantity, 0);
  return { quantity: round2(rawTotal), unit: target };
}

/** Pick the most generic display name in a group (fewest significant tokens). */
function pickDisplayName(names: string[]): string {
  let best = names[0];
  let bestScore = Infinity;
  for (const n of names) {
    const tokenCount = ingredientMatchKey(n).split(' ').filter(Boolean).length;
    const score = tokenCount * 1000 + n.length; // fewer tokens, then shorter
    if (score < bestScore) {
      best = n;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Split a free-text ingredient blob into individual lines, parsing a leading
 * quantity + unit when present. Handles the "everything arrived as one item"
 * case (issue #2).
 *
 *   "2 lbs ground beef\n1 onion, diced" → [{2,lb,"ground beef"},{1,"","onion diced"}]
 */
export function splitIngredientBlock(text: string): GroceryAddInput[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n|·|•|;/)
    .flatMap((l) => (l.includes('\n') ? l.split('\n') : [l]))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const QTY = '(\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛])';
  const UNIT = Array.from(UNIT_NOISE).join('|');
  const re = new RegExp(`^\\s*(${QTY})?\\s*(${UNIT})?\\s+(.*)$`, 'i');

  const out: GroceryAddInput[] = [];
  for (const line of lines) {
    const m = line.match(re);
    if (m && m[4]) {
      const qty = m[1] ? parseFraction(m[1]) : 1;
      out.push({ name: m[4].trim(), quantity: qty, unit: (m[3] ?? '').trim() });
    } else {
      out.push({ name: line, quantity: 1, unit: '' });
    }
  }
  return out;
}

function parseFraction(s: string): number {
  const t = s.trim();
  const glyphs: Record<string, number> = {
    '¼': 0.25,
    '½': 0.5,
    '¾': 0.75,
    '⅓': 1 / 3,
    '⅔': 2 / 3,
    '⅛': 0.125,
  };
  if (glyphs[t] != null) return glyphs[t];
  if (t.includes('/')) {
    const [a, b] = t.split('/').map((x) => parseFloat(x));
    if (b) return a / b;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Build a merge plan: collapse `newItems` among themselves by match key, then
 * fold each group into an existing *unchecked* grocery row when one matches,
 * otherwise emit an insert. The caller applies inserts + updates.
 */
/**
 * Resolve a row's list. A null grocery_list_id is not "no list" -- it is the
 * household's default list, which is what a row gets when it was added before
 * named lists existed or by a path that never stamped one.
 */
const effectiveList = (
  listId: string | null | undefined,
  defaultListId: string | null | undefined,
): string | null => listId ?? defaultListId ?? null;

/**
 * US-714: merging is scoped to one list.
 *
 * Without the scope, adding milk to list B bumped the milk already on list A:
 * the merge indexed every unchecked row the client held, whatever list it was
 * on, so the new row was never inserted and the quantity landed somewhere the
 * shopper was not looking.
 */
export function planGroceryMerge(
  newItems: GroceryAddInput[],
  existing: ExistingGroceryItem[],
  scope: GroceryMergeScope = {}
): GroceryMergePlan {
  const target = effectiveList(scope.targetListId, scope.defaultListId);
  // Group incoming items by canonical key, preserving first-seen order.
  const groups = new Map<string, GroceryAddInput[]>();
  const order: string[] = [];
  for (const item of newItems) {
    const key = ingredientMatchKey(item.name);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(item);
  }

  // Index existing UNCHECKED rows ON THE TARGET LIST by key (first wins).
  const existingByKey = new Map<string, ExistingGroceryItem>();
  for (const e of existing) {
    if (e.checked) continue;
    if (effectiveList(e.grocery_list_id, scope.defaultListId) !== target) continue;
    const key = ingredientMatchKey(e.name);
    if (!existingByKey.has(key)) existingByKey.set(key, e);
  }

  const inserts: GroceryAddInput[] = [];
  const updates: GroceryMergePlan['updates'] = [];

  for (const key of order) {
    const group = groups.get(key)!;
    const summed = sumQuantities(group.map((g) => ({ quantity: g.quantity, unit: g.unit })));
    const displayName = pickDisplayName(group.map((g) => g.name));
    const meta = group.find((g) => g.category) ?? group[0];

    const match = existingByKey.get(key);
    if (match) {
      const merged = sumQuantities([
        { quantity: match.quantity ?? 0, unit: match.unit },
        { quantity: summed.quantity, unit: summed.unit },
      ]);
      // Keep the existing (often more generic) name unless it's empty.
      const name = match.name?.trim() ? match.name : displayName;
      updates.push({ id: match.id, quantity: merged.quantity, unit: merged.unit, name });
    } else {
      // US-714: spread rather than re-listing fields. This was a hand-written
      // allowlist of six columns, so every other field on the input was
      // silently dropped on the way to the insert -- grocery_list_id and the
      // US-713 plan-sync stamps among them, which is why a row could be
      // stamped by its caller and still reach the database with none of it.
      // Spreading means a new GroceryAddInput field survives by default.
      inserts.push({
        ...meta,
        name: displayName,
        quantity: summed.quantity,
        unit: summed.unit,
      });
    }
  }

  return { inserts, updates };
}
