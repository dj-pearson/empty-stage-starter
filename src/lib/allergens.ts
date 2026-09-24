// The allergen matcher is shared with the edge functions; see the source for why.
import { canonicalAllergen } from "../../supabase/functions/_shared/allergens";

export {
  normalizeAllergen,
  canonicalAllergen,
  matchingAllergen,
  isAllergenSafeFor,
} from "../../supabase/functions/_shared/allergens";

export type AllergenSeverity = "mild" | "moderate" | "severe";

export const ALLERGEN_SEVERITIES: readonly AllergenSeverity[] = ["mild", "moderate", "severe"];

/**
 * The allergens a parent can tick on a child's profile. `value` is what gets
 * stored in kids.allergens; canonicalAllergen() of each is the word the
 * synonym map folds other spellings onto, so "dairy" or "Peanut" typed by hand
 * land on the same check as the tickbox.
 */
export const KID_ALLERGEN_PICKER: readonly { value: string; labelKey: string }[] = [
  "peanuts",
  "tree nuts",
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "soy",
  "wheat",
  "sesame",
].map((value) => ({ value, labelKey: `allergens.${value.replace(/\s+/g, "_")}` }));

const MAX_ALLERGEN_LENGTH = 50;

/**
 * Clean a list of allergens before it is saved on a child.
 *
 * Trims, drops blanks, caps each entry at 50 characters and removes entries
 * that name the same allergen twice ("Milk" after "dairy"). An entry whose
 * canonical form matches a picker value is stored as that picker value, so the
 * profile tickbox shows it checked. Anything else keeps the parent's own
 * spelling: canonicalAllergen() singularizes, and "Citrus" saved as "citru"
 * would be a word nobody typed.
 */
export function normalizeKidAllergenInput(list: readonly string[]): string[] {
  const pickerByCanonical = new Map(
    KID_ALLERGEN_PICKER.map((p) => [canonicalAllergen(p.value), p.value] as const),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const text = raw.trim().slice(0, MAX_ALLERGEN_LENGTH).trim();
    if (!text) continue;
    const key = canonicalAllergen(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(pickerByCanonical.get(key) ?? text);
  }
  return out;
}

function asSeverity(value: unknown): AllergenSeverity | null {
  return value === "mild" || value === "moderate" || value === "severe" ? value : null;
}

/**
 * Keep only the severities that belong to an allergen still on the list.
 *
 * Keys are compared canonically ("Peanuts" matches "peanuts") and rewritten to
 * the list's spelling, so a reader doing a plain lookup by allergen finds it.
 * A key for an allergen that was unticked, and any value that is not a known
 * severity, is dropped.
 */
export function pruneAllergenSeverity(
  allergens: readonly string[] | null | undefined,
  severity: Readonly<Record<string, unknown>> | null | undefined,
): Partial<Record<string, AllergenSeverity>> {
  const out: Partial<Record<string, AllergenSeverity>> = {};
  if (!allergens || !severity) return out;
  const byCanonical = new Map<string, string>();
  for (const a of allergens) {
    const key = canonicalAllergen(a);
    if (key && !byCanonical.has(key)) byCanonical.set(key, a);
  }
  for (const [key, value] of Object.entries(severity)) {
    const level = asSeverity(value);
    const target = byCanonical.get(canonicalAllergen(key));
    if (!level || target === undefined || out[target] !== undefined) continue;
    out[target] = level;
  }
  return out;
}
