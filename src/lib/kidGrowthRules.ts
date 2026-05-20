/**
 * US-301: Kid-grew-up auto-adapter rules.
 *
 * Pure rule helpers. Given a kid record and today's date, emit the
 * suggested changes (portion-size update, foods worth retrying, optional
 * allergen reintro prompts) the dashboard birthday card should surface.
 *
 * Safety contracts:
 *   - Allergen reintro is informational only. We never auto-remove an
 *     item from `kid.allergens` — the card hands the parent a prompt to
 *     speak to a pediatrician. The companion `allergen_change_log`
 *     write only happens after an explicit, audited confirmation.
 *   - Aversion retries are seeded against `disliked_foods` (which is
 *     reset over time by user feedback). We surface foods at most once
 *     per birthday so a chronic refusal doesn't spam the parent.
 *
 * No DB writes here. Callers compose these outputs into the
 * `KidBirthdayCard` UI; the actual mutation paths live in AppContext.
 */
import type { Food, Kid } from '@/types';

export interface KidGrowthSuggestions {
  /** Total years today; 0..18+ */
  ageYears: number;
  /** Portion scaler relative to age 5 baseline (1.0). >1 = bigger portions. */
  portionScaler: number;
  /** Foods worth retrying this birthday, ranked. Up to 5. */
  retryFoods: Array<Pick<Food, 'id' | 'name' | 'category'>>;
  /** Informational prompts; never auto-acted. */
  allergenReintroPrompts: string[];
  /** Coarse stage tag for the headline ("toddler → preschool" etc.). */
  ageMilestone: AgeMilestone;
}

export type AgeMilestone =
  | 'infant'
  | 'toddler'
  | 'preschool'
  | 'school_age'
  | 'tween'
  | 'teen';

const ALLERGEN_REINTRO_RULES: Record<string, string> = {
  peanut:
    'Many pediatricians revisit peanut tolerance around now. Bring it up at the next well-visit before reintroducing.',
  'tree nut':
    'Tree-nut tolerance can change with age. Ask your pediatrician about a structured rechallenge.',
  tree_nut:
    'Tree-nut tolerance can change with age. Ask your pediatrician about a structured rechallenge.',
  egg:
    'Egg allergy often outgrows in childhood. Don\'t reintroduce at home without confirming with your pediatrician.',
  dairy:
    'Dairy tolerance often shifts. Talk with your pediatrician about whether a milk-ladder is appropriate.',
  milk:
    'Dairy tolerance often shifts. Talk with your pediatrician about whether a milk-ladder is appropriate.',
};

/**
 * Calendar age in whole years. Identical to the helper in src/lib/utils.ts
 * but standalone so this module stays pure.
 */
export function calcAgeYears(birthdate: string, asOf: Date = new Date()): number {
  const dob = new Date(`${birthdate}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) return 0;
  let years = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    asOf.getUTCMonth() < dob.getUTCMonth() ||
    (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  return Math.max(0, years);
}

/**
 * True when today (UTC) matches the kid's birthday (month + day).
 * Year-agnostic so the card fires every year on the right day.
 */
export function isBirthdayToday(birthdate: string, asOf: Date = new Date()): boolean {
  const dob = new Date(`${birthdate}T12:00:00Z`);
  if (Number.isNaN(dob.getTime())) return false;
  return (
    dob.getUTCMonth() === asOf.getUTCMonth() &&
    dob.getUTCDate() === asOf.getUTCDate()
  );
}

/**
 * Coarse age-milestone bands per AAP nutrition stages. Used for headline
 * copy and to bound the portion-scaler curve.
 */
export function ageMilestoneFor(years: number): AgeMilestone {
  if (years < 1) return 'infant';
  if (years < 3) return 'toddler';
  if (years < 6) return 'preschool';
  if (years < 10) return 'school_age';
  if (years < 13) return 'tween';
  return 'teen';
}

/**
 * Portion-size scaler relative to a 5-year-old baseline (1.0). The curve
 * is intentionally gentle — we don't want a parent to over-feed a single
 * meal in response to a birthday nudge. AC describes it as "DRI-based"
 * which here means: roughly the ratio of daily kcal recommendation by
 * age (USDA DGA 2020-2025 medical-activity tables), normalised to age 5.
 */
export function portionScalerForAge(years: number): number {
  // Anchor points (kcal/day, USDA 2020 DGA "moderately active" girl values
  // — boys run ~5-10% higher; we use a midpoint so the scaler is gender-
  // neutral).
  // Ages picked so the linear segments roughly match the AAP curve.
  const points: Array<[number, number]> = [
    [1, 900],
    [3, 1200],
    [5, 1400],
    [8, 1600],
    [12, 1900],
    [16, 2100],
  ];
  const baseline = 1400; // age 5
  if (years <= points[0][0]) return points[0][1] / baseline;
  if (years >= points[points.length - 1][0]) {
    return points[points.length - 1][1] / baseline;
  }
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (years >= x0 && years <= x1) {
      const t = (years - x0) / (x1 - x0);
      const kcal = y0 + t * (y1 - y0);
      return kcal / baseline;
    }
  }
  return 1.0;
}

export interface BuildSuggestionsOptions {
  /** Override "now" for tests. */
  asOf?: Date;
  /** Max foods to surface for retry. AC default = 5. */
  maxRetryFoods?: number;
}

/**
 * Build the full set of birthday suggestions for a kid. Returns null
 * when the kid has no parseable birthdate (the card should prompt the
 * parent to fill it in instead — handled separately).
 */
export function buildKidGrowthSuggestions(
  kid: Pick<Kid, 'id' | 'name' | 'date_of_birth' | 'allergens' | 'disliked_foods'>,
  foods: ReadonlyArray<Pick<Food, 'id' | 'name' | 'category'>>,
  opts: BuildSuggestionsOptions = {}
): KidGrowthSuggestions | null {
  if (!kid.date_of_birth) return null;
  const asOf = opts.asOf ?? new Date();
  const maxRetry = opts.maxRetryFoods ?? 5;

  const ageYears = calcAgeYears(kid.date_of_birth, asOf);
  const portionScaler = portionScalerForAge(ageYears);
  const ageMilestone = ageMilestoneFor(ageYears);

  // Retry candidates: foods on the disliked list that we still know about
  // (i.e., still exist in the pantry/library). Cap at maxRetry.
  const dislikedIds = new Set(kid.disliked_foods ?? []);
  const retryFoods = foods
    .filter((f) => dislikedIds.has(f.id))
    .slice(0, maxRetry)
    .map((f) => ({ id: f.id, name: f.name, category: f.category }));

  // Allergen reintro prompts — informational only.
  const allergenReintroPrompts: string[] = [];
  for (const allergen of kid.allergens ?? []) {
    const key = allergen.trim().toLowerCase();
    const message = ALLERGEN_REINTRO_RULES[key];
    if (message && !allergenReintroPrompts.includes(message)) {
      allergenReintroPrompts.push(message);
    }
  }

  return {
    ageYears,
    portionScaler,
    retryFoods,
    allergenReintroPrompts,
    ageMilestone,
  };
}

/**
 * Safety helper: returns a redacted suggestions object guaranteeing
 * `kid.allergens` is never mutated. Used by the dashboard card so a
 * future refactor of the card path can't accidentally pass an
 * auto-removal payload. Pure assertion: returns the input untouched.
 */
export function assertNoAllergenAutoRemoval(
  prevAllergens: ReadonlyArray<string> | undefined,
  proposedAllergens: ReadonlyArray<string> | undefined
): true {
  if (!prevAllergens || prevAllergens.length === 0) return true;
  const prevSet = new Set(prevAllergens.map((s) => s.trim().toLowerCase()));
  const proposedSet = new Set(
    (proposedAllergens ?? []).map((s) => s.trim().toLowerCase())
  );
  for (const a of prevSet) {
    if (!proposedSet.has(a)) {
      throw new Error(
        `assertNoAllergenAutoRemoval: refusing to drop allergen "${a}" — confirmed pediatrician review required.`
      );
    }
  }
  return true;
}
