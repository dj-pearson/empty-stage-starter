export type FoodCategory = "protein" | "carb" | "dairy" | "fruit" | "vegetable" | "snack";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack1" | "snack2" | "try_bite";

export type MealResult = "ate" | "tasted" | "refused" | null;

/** How much of a food the child ate. Stored in plan_entries.amount_eaten. */
export type AmountEaten = "a_lot" | "some" | "nibbles";

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  is_safe: boolean;
  is_try_bite: boolean;
  /** US-793/US-795: nullable link to the shared `grocery_product_catalog` row
   * this food resolves against (see `src/lib/effectiveFood.ts`). Absent for a
   * food that hasn't been matched yet — most households, until US-796's
   * matcher runs. */
  canonical_id?: string | null;
  /** The scanned product barcode, when the food was added by scan. Carried
   * through by normalizeFoodFromDB's spread; lets a second scan of the same
   * product stack onto this row instead of duplicating it. */
  barcode?: string | null;
  allergens?: string[];
  aisle?: string;
  quantity?: number;
  unit?: string;
  servings_per_container?: number;
  package_quantity?: string;
  nutrition_info?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    calcium_mg?: number;
    iron_mg?: number;
  };
}

export interface Kid {
  id: string;
  name: string;
  age?: number;
  date_of_birth?: string;
  notes?: string;
  /**
   * Nullable in the DB. `undefined` here means "not recorded" (unknown), and
   * `[]` means the parent confirmed no known allergies. normalizeKidFromDB
   * keeps that distinction; never default one into the other.
   */
  allergens?: string[];
  /** Per-allergen severity, keyed by the allergen string in `allergens`. */
  allergen_severity?: Partial<Record<string, 'mild' | 'moderate' | 'severe'>>;
  cross_contamination_sensitive?: boolean;
  profile_picture_url?: string;
  favorite_foods?: string[];
  /**
   * Intake answers, saved to kids since item 25 (20260925000004). The web
   * writes pickiness_level as one of PICKINESS_LEVELS (computed from the
   * eating-behavior answers); iOS builds may have written their own labels.
   */
  pickiness_level?: string;
  texture_sensitivity_level?: string;
  preferred_preparations?: string[];
  profile_completed?: boolean;
  profile_last_reviewed?: string;
  texture_preferences?: string[];
  texture_dislikes?: string[];
  flavor_preferences?: string[];
  dietary_restrictions?: string[];
  health_goals?: string[];
  new_food_willingness?: string;
  eating_behavior?: string;
  helpful_strategies?: string[];
  disliked_foods?: string[];
  always_eats_foods?: string[];
  weight_kg?: number;
  height_cm?: number;
  gender?: string;
  nutrition_concerns?: string[];
  behavioral_notes?: string;
  household_id?: string;
}

export interface PlanEntry {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: MealSlot;
  food_id: string;
  result: MealResult;
  /** Null or absent when nobody recorded it. Only meaningful for ate/tasted. */
  amount_eaten?: AmountEaten | null;
  notes?: string;
  food_attempt_id?: string;
  /** Nullable column: a plain food row carries null, a recipe row its id. */
  recipe_id?: string | null;
  is_primary_dish?: boolean;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  source_plan_entry_id?: string;
  category: FoodCategory;
  aisle?: string;
  // Phase 1 additions
  grocery_list_id?: string;
  photo_url?: string;
  notes?: string | null;
  brand_preference?: string;
  barcode?: string;
  source_recipe_id?: string;
  added_by_user_id?: string;
  added_via?: string;
  priority?: 'low' | 'medium' | 'high';
  // Surfaced for client-side velocity-based forecasting (US-299). The DB
  // column has always been populated; we only just started reading it.
  created_at?: string;
  restock_reason?: string;
  auto_generated?: boolean;
  /** Item 16: set when a receipt credited this row's stock; checkout skips it. */
  pantry_credited_at?: string | null;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  food_ids: string[];
  category?: FoodCategory;
  instructions?: string;
  prepTime?: string;
  cookTime?: string;
  servings?: string;
  additionalIngredients?: string;
  tips?: string;
  assigned_kid_ids?: string[]; // Multi-child assignment
  // Phase 1 additions
  image_url?: string;
  source_url?: string;
  source_type?: 'website' | 'photo' | 'manual' | 'imported';
  tags?: string[];
  rating?: number;
  times_made?: number;
  last_made_date?: string;
  total_time_minutes?: number;
  difficulty_level?: 'easy' | 'medium' | 'hard';
  kid_friendly_score?: number;
  is_favorite?: boolean;
  created_at?: string;
  // Variant linkage (US-297 hidden-veggies, future variant kinds reuse the column)
  parent_recipe_id?: string;
  variant_kind?: string;
  recipe_ingredients?: RecipeIngredient[];
  /**
   * US-721: structured ingredient rows on their way TO the database. Write-only
   * transport from the builder to RecipesContext -- it is never a column on
   * `recipes`, and it is stripped before the recipes insert. Read them back
   * from `recipe_ingredients`.
   */
  recipe_ingredient_rows?: IngredientRowPayload[];
  nutrition_info?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    calcium_mg?: number;
    iron_mg?: number;
  };
}

export interface GroceryList {
  id: string;
  user_id: string;
  household_id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default: boolean;
  store_name?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * US-721: one recipe_ingredients row on its way to the database. `id` present
 * means the row already exists and should be updated rather than inserted.
 * Declared here rather than in lib/ so `Recipe` does not have to import from a
 * module that imports `Recipe` back.
 */
export interface IngredientRowPayload {
  id?: string;
  food_id: string | null;
  sort_order: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  group_label: string | null;
  optional_notes: string | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  food_id?: string | null;
  sort_order: number;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  group_label?: string | null;
  optional_notes?: string | null;
  created_at?: string;
}

export interface RecipeCollection {
  id: string;
  user_id: string;
  household_id?: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShoppingSession {
  id: string;
  household_id: string;
  user_id: string;
  grocery_list_id?: string;
  store_name?: string;
  store_location?: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  total_items?: number;
  checked_items?: number;
  estimated_total?: number;
  actual_total?: number;
  created_at: string;
}

/**
 * A nutrition row as the canonical catalog stores it: PER 100g (US-799).
 *
 * This used to describe the `nutrition` table, whose figures are per SERVING.
 * Nothing about the shape said which, and the two are not interchangeable --
 * put one where the other is expected and a screen shows a parent a number
 * four times too large. The column names now say it, and
 * `perServingFromCatalog` in src/lib/catalogNutrition.ts is the only sanctioned
 * way back to a per-serving figure -- and the only place US-797's verification
 * rule is applied, which is why `verification` is part of the shape rather
 * than something a caller may leave out of its select().
 */
export interface NutritionData {
  name: string;
  name_normalized?: string;
  /**
   * 'verified' | 'unverified' | 'rejected' (gpc_verification_check). A barcode
   * scan promotes itself into the shared catalog as 'unverified': US-797 keeps
   * those figures out of totals and out of the ladder.
   */
  verification?: string | null;
  calories_kcal_100: number | string | null;
  protein_g_100: number | string | null;
  carbs_g_100: number | string | null;
  fat_g_100: number | string | null;
  fiber_g_100?: number | string | null;
  sodium_mg_100?: number | string | null;
  /** NULL when the serving could not be read without guessing. */
  serving_size_g: number | string | null;
  serving_size_text?: string | null;
  ingredients?: string | null;
}
