/**
 * One allergen comparison for the web planner and the edge functions.
 *
 * Kid allergens come from the profile pickers ("peanuts", "tree nuts"). Food
 * allergens come from manual entry, USDA, OpenFoodFacts ("en:peanuts") and the
 * shared catalog, so the same allergen arrives as "Peanuts", "peanut",
 * "en:tree-nuts" or "tree_nuts". An exact string compare let every one of those
 * variants through, which is how a plan generator could schedule a child's
 * allergen. Both sides go through normalizeAllergen and the synonym map
 * (canonicalAllergen) before comparing.
 *
 * Pure TypeScript with no Deno or browser imports: the web app re-exports it
 * from src/lib/allergens.ts and vitest covers it there.
 */

/** Lowercase, drop a language prefix ("en:"), unify separators, singularize. */
export function normalizeAllergen(value: unknown): string {
  let s = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]{2}:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "peanuts" -> "peanut", "tree nuts" -> "tree nut", "eggs" -> "egg".
  // "shellfish" and "fish" end in "h"; "sesame", "soy", "milk" are unaffected.
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}

/**
 * Spellings that name the same allergen once normalized. The kid pickers store
 * the left-hand canonical word ("sesame", "soy", "tree nut"), while
 * OpenFoodFacts tags the same thing "en:sesame-seeds", "en:soybeans" or
 * "en:nuts", and a parent typing by hand writes "dairy" or "gluten". Without
 * this map every one of those was a miss, which is a food the child reacts to
 * reading as safe.
 *
 * Only synonyms that are unambiguous for an allergy check belong here. "nut"
 * maps to "tree nut" because OpenFoodFacts' "en:nuts" is the tree-nut tag;
 * peanut stays separate. Gluten maps to wheat because wheat is the picker
 * value; a child with a barley-only reaction still needs "barley" entered.
 */
const ALLERGEN_SYNONYMS: Readonly<Record<string, string>> = {
  'sesame seed': 'sesame',
  soybean: 'soy',
  soya: 'soy',
  gluten: 'wheat',
  nut: 'tree nut',
  crustacean: 'shellfish',
  mollusc: 'shellfish',
  mollusk: 'shellfish',
  dairy: 'milk',
  lactose: 'milk',
};

/** normalizeAllergen, then fold known synonyms onto the picker's word. */
export function canonicalAllergen(value: unknown): string {
  const n = normalizeAllergen(value);
  return ALLERGEN_SYNONYMS[n] ?? n;
}

/** The first allergen the food carries that the child reacts to, or null. */
export function matchingAllergen(
  kidAllergens: readonly unknown[] | null | undefined,
  foodAllergens: readonly unknown[] | null | undefined,
): string | null {
  const kid = new Set((kidAllergens ?? []).map(canonicalAllergen).filter(Boolean));
  if (kid.size === 0) return null;
  for (const a of foodAllergens ?? []) {
    const n = canonicalAllergen(a);
    if (n && kid.has(n)) return n;
  }
  return null;
}

/** True when the food is safe to schedule for the child as far as allergens go. */
export function isAllergenSafeFor(
  kid: { allergens?: readonly unknown[] | null },
  food: { allergens?: readonly unknown[] | null },
): boolean {
  return matchingAllergen(kid.allergens, food.allergens) === null;
}
