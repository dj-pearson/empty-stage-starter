/**
 * Item 20: the pantry's kid-aware starter list.
 *
 * A checklist of common foods a new household can tick into its pantry. Three
 * rules make it safe to offer:
 *
 *   - Every row is scored against every kid (kidFit), and a row that carries
 *     any kid's allergen cannot be ticked. The reason is shown, and a severe
 *     allergy says so. Allergens here are listed honestly per food rather than
 *     left to the name scan, because "Crackers" says nothing about wheat.
 *   - Nothing arrives marked safe or as a try bite (US-803). Ticking "Pasta"
 *     says the household has pasta, not that a child eats it.
 *   - Quantity 1, nothing pre-ticked, and a food already in the pantry is
 *     shown as there rather than offered twice.
 *
 * Pure: no React.
 */
import type { Food, FoodCategory, Kid, PlanEntry } from "@/types";
import {
  buildResultIndex,
  getKidFoodFit,
  isFitSeverityRecorded,
  isSevereFit,
  summarizeKidFits,
  type ItemFit,
} from "@/lib/kidFit";
import type { AllergenSeverity } from "@/lib/allergens";
import { findExistingFood } from "@/lib/findExistingFood";
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from "@/lib/foodSafetyDefault";

export interface StarterFood {
  /** Stable key; also the i18n key under pantry.starter.food. */
  key: string;
  name: string;
  category: FoodCategory;
  /** Canonical allergen words (see supabase/functions/_shared/allergens.ts). */
  allergens: string[];
}

export const PANTRY_STARTER_FOODS: readonly StarterFood[] = [
  { key: "chickenBreast", name: "Chicken breast", category: "protein", allergens: [] },
  { key: "eggs", name: "Eggs", category: "protein", allergens: ["egg"] },
  { key: "peanutButter", name: "Peanut butter", category: "protein", allergens: ["peanut"] },
  { key: "turkeySlices", name: "Turkey slices", category: "protein", allergens: [] },
  { key: "blackBeans", name: "Black beans", category: "protein", allergens: [] },
  { key: "fishSticks", name: "Fish sticks", category: "protein", allergens: ["fish", "wheat"] },
  { key: "bread", name: "Bread", category: "carb", allergens: ["wheat", "soy"] },
  { key: "pasta", name: "Pasta", category: "carb", allergens: ["wheat"] },
  { key: "rice", name: "Rice", category: "carb", allergens: [] },
  { key: "oatmeal", name: "Oatmeal", category: "carb", allergens: [] },
  { key: "tortillas", name: "Tortillas", category: "carb", allergens: ["wheat"] },
  { key: "crackers", name: "Crackers", category: "carb", allergens: ["wheat", "soy"] },
  { key: "milk", name: "Milk", category: "dairy", allergens: ["milk"] },
  { key: "cheese", name: "Cheese", category: "dairy", allergens: ["milk"] },
  { key: "yogurt", name: "Yogurt", category: "dairy", allergens: ["milk"] },
  { key: "bananas", name: "Bananas", category: "fruit", allergens: [] },
  { key: "apples", name: "Apples", category: "fruit", allergens: [] },
  { key: "strawberries", name: "Strawberries", category: "fruit", allergens: [] },
  { key: "blueberries", name: "Blueberries", category: "fruit", allergens: [] },
  { key: "grapes", name: "Grapes", category: "fruit", allergens: [] },
  { key: "carrots", name: "Carrots", category: "vegetable", allergens: [] },
  { key: "cucumber", name: "Cucumber", category: "vegetable", allergens: [] },
  { key: "broccoli", name: "Broccoli", category: "vegetable", allergens: [] },
  { key: "peas", name: "Peas", category: "vegetable", allergens: [] },
  { key: "sweetPotatoes", name: "Sweet potatoes", category: "vegetable", allergens: [] },
  { key: "pretzels", name: "Pretzels", category: "snack", allergens: ["wheat"] },
  { key: "grahamCrackers", name: "Graham crackers", category: "snack", allergens: ["wheat", "soy"] },
  { key: "popcorn", name: "Popcorn", category: "snack", allergens: [] },
  { key: "hummus", name: "Hummus", category: "snack", allergens: ["sesame"] },
];

/** A pantry this small still gets the starter list offered. */
export const STARTER_OFFER_MAX_FOODS = 10;

export interface StarterBlock {
  kid: Kid;
  allergen: string;
  /** Severity the decision uses: unrated allergies are "severe" (owner decision 2026-09-24). */
  severity: AllergenSeverity | null;
  /** False when `severity` defaulted to severe because the parent recorded none. */
  severityRecorded: boolean;
}

export interface StarterRow {
  food: StarterFood;
  fit: ItemFit | undefined;
  /** One entry per kid whose allergen this food carries. Non-empty: cannot be ticked. */
  blocks: StarterBlock[];
  /** Any block is severe, recorded or unrated. */
  severe: boolean;
  /** Already in the pantry under this name. */
  inPantry: boolean;
}

/** Score every starter food against every kid. `name` is the display name used. */
export function buildStarterRows(input: {
  kids: readonly Kid[];
  pantryFoods: readonly Food[];
  planEntries?: readonly PlanEntry[];
  starter?: readonly StarterFood[];
  nameOf?: (food: StarterFood) => string;
}): StarterRow[] {
  const { kids, pantryFoods } = input;
  const starter = input.starter ?? PANTRY_STARTER_FOODS;
  const nameOf = input.nameOf ?? ((f: StarterFood) => f.name);
  const indexByKid = new Map(kids.map((k) => [k.id, buildResultIndex(input.planEntries ?? [], k.id)]));
  return starter.map((food) => {
    const name = nameOf(food);
    const probe = {
      id: `starter:${food.key}`,
      name,
      allergens: food.allergens,
      // US-803: scored as what it will be once added, a food nobody has judged.
      is_safe: ACQUIRED_FOOD_IS_SAFE,
      is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
    };
    const perKid = kids.map((kid) => ({
      kid,
      fit: getKidFoodFit(kid, probe, indexByKid.get(kid.id) ?? []),
    }));
    const fit = kids.length > 0 ? summarizeKidFits(perKid) : undefined;
    const blocks: StarterBlock[] = perKid
      .filter((h) => h.fit.allergen)
      .map((h) => ({
        kid: h.kid,
        allergen: h.fit.allergen as string,
        severity: isSevereFit(h.fit) ? "severe" : (h.fit.allergenSeverity ?? null),
        severityRecorded: isFitSeverityRecorded(h.fit),
      }));
    return {
      food,
      fit,
      blocks,
      severe: blocks.some((b) => b.severity === "severe"),
      inPantry: Boolean(findExistingFood(pantryFoods, { name })),
    };
  });
}

/** True when the row may be ticked. */
export function isStarterSelectable(row: StarterRow): boolean {
  return row.blocks.length === 0 && !row.inPantry;
}

/**
 * The foods to insert for the ticked rows. Rows that cannot be ticked are
 * dropped here too, so a stale selection cannot slip an allergen through.
 */
export function starterSelectionToFoods(
  rows: readonly StarterRow[],
  selected: ReadonlySet<string>,
  nameOf: (food: StarterFood) => string = (f) => f.name,
): Omit<Food, "id">[] {
  return rows
    .filter((r) => selected.has(r.food.key) && isStarterSelectable(r))
    .map((r) => ({
      name: nameOf(r.food),
      category: r.food.category,
      allergens: [...r.food.allergens],
      quantity: 1,
      is_safe: ACQUIRED_FOOD_IS_SAFE,
      is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
    }));
}
