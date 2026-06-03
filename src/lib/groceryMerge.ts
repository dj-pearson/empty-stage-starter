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
import { normalize, convert } from "@/lib/unitNormalize";

export interface GroceryAddInput {
  name: string;
  quantity: number;
  unit?: string | null;
  category?: string;
  aisle?: string | null;
  added_via?: string;
  source_recipe_id?: string;
  notes?: string | null;
}

export interface ExistingGroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string | null;
  checked?: boolean;
}

export interface GroceryMergePlan {
  /** Brand-new rows to insert (already merged among themselves). */
  inserts: GroceryAddInput[];
  /** Existing unchecked rows whose quantity (and unit/name) should be bumped. */
  updates: { id: string; quantity: number; unit: string; name: string }[];
}

/** Unit / packaging words that shouldn't influence what an item *is*. */
const UNIT_NOISE = new Set<string>([
  "lb", "lbs", "pound", "pounds", "oz", "ounce", "ounces",
  "g", "gram", "grams", "kg", "kilo", "kilogram", "kilograms",
  "ml", "l", "liter", "litre", "liters", "litres",
  "tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons",
  "cup", "cups", "pt", "pint", "pints", "qt", "quart", "quarts", "gal", "gallon",
  "clove", "cloves", "can", "cans", "jar", "jars", "bag", "bags", "box", "boxes",
  "package", "packages", "pkg", "piece", "pieces", "pc", "pcs", "slice", "slices",
  "bunch", "bunches", "head", "heads", "stick", "sticks", "dozen", "pack", "packs",
  "container", "containers", "bottle", "bottles", "stalk", "stalks", "sprig", "sprigs",
]);

/** True for pure numbers, fractions, ratios ("80/20"), and percentages. */
function isNumericToken(tok: string): boolean {
  return /^\d+([./]\d+)?%?$/.test(tok) || /^\d*[¼½¾⅓⅔⅛]+$/.test(tok);
}

/** Crude singulariser — enough to align "eggs"/"egg", "tomatoes"/"tomato". */
function singularize(word: string): string {
  if (word.length <= 3 || word.endsWith("ss")) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
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
  const cleaned = (name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // strip parentheticals
    .replace(/[.,;]/g, " ");
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !isNumericToken(t))
    .filter((t) => !UNIT_NOISE.has(t))
    .map(singularize);
  return tokens.sort().join(" ");
}

/** Render a quantity without trailing zeros: 2 → "2", 1.5 → "1.5", 0.25 → "0.25". */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty)) return "0";
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
    const u = (p.unit ?? "").trim();
    counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [u, c] of counts) {
    // Prefer a real unit over the empty/placeholder one on ties.
    if (c > bestCount || (c === bestCount && u !== "" && best === "")) {
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
export function sumQuantities(
  parts: { quantity: number; unit?: string | null }[]
): { quantity: number; unit: string } {
  const cleaned = parts.filter((p) => Number.isFinite(p.quantity));
  if (cleaned.length === 0) return { quantity: 0, unit: "" };
  if (cleaned.length === 1) {
    return { quantity: round2(cleaned[0].quantity), unit: (cleaned[0].unit ?? "").trim() };
  }

  const target = dominantUnit(cleaned);
  const norms = cleaned.map((p) => normalize(p.quantity, p.unit));
  const families = new Set(norms.map((n) => n.family));

  if (families.size === 1 && !families.has("unknown")) {
    const canonicalTotal = norms.reduce((s, n) => s + n.qty, 0);
    const canonicalUnit = norms[0].canonicalUnit;
    const converted = convert(canonicalTotal, canonicalUnit, target || canonicalUnit);
    if (converted != null) {
      return { quantity: round2(converted), unit: target };
    }
    return { quantity: round2(canonicalTotal), unit: canonicalUnit === "piece" ? target : canonicalUnit };
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
    const tokenCount = ingredientMatchKey(n).split(" ").filter(Boolean).length;
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
    .flatMap((l) => (l.includes("\n") ? l.split("\n") : [l]))
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const QTY = "(\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?|[¼½¾⅓⅔⅛])";
  const UNIT = Array.from(UNIT_NOISE).join("|");
  const re = new RegExp(`^\\s*(${QTY})?\\s*(${UNIT})?\\s+(.*)$`, "i");

  const out: GroceryAddInput[] = [];
  for (const line of lines) {
    const m = line.match(re);
    if (m && m[4]) {
      const qty = m[1] ? parseFraction(m[1]) : 1;
      out.push({ name: m[4].trim(), quantity: qty, unit: (m[3] ?? "").trim() });
    } else {
      out.push({ name: line, quantity: 1, unit: "" });
    }
  }
  return out;
}

function parseFraction(s: string): number {
  const t = s.trim();
  const glyphs: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };
  if (glyphs[t] != null) return glyphs[t];
  if (t.includes("/")) {
    const [a, b] = t.split("/").map((x) => parseFloat(x));
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
export function planGroceryMerge(
  newItems: GroceryAddInput[],
  existing: ExistingGroceryItem[]
): GroceryMergePlan {
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

  // Index existing UNCHECKED rows by key (first wins).
  const existingByKey = new Map<string, ExistingGroceryItem>();
  for (const e of existing) {
    if (e.checked) continue;
    const key = ingredientMatchKey(e.name);
    if (!existingByKey.has(key)) existingByKey.set(key, e);
  }

  const inserts: GroceryAddInput[] = [];
  const updates: GroceryMergePlan["updates"] = [];

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
      inserts.push({
        name: displayName,
        quantity: summed.quantity,
        unit: summed.unit,
        category: meta.category,
        aisle: meta.aisle,
        added_via: meta.added_via,
        source_recipe_id: meta.source_recipe_id,
        notes: meta.notes,
      });
    }
  }

  return { inserts, updates };
}
