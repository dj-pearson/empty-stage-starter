/**
 * pSEO (Programmatic SEO) type definitions for EatPal.
 *
 * This file is the single source of truth for the entire pSEO system.
 * It covers:
 *   - Phase 2: Page Type Definitions (9 page types, dimension enums, URL/title templates)
 *   - Phase 3: JSON Schemas (per-page-type content schemas with AI-FILL / DETERMINISTIC / FROM-DB markers)
 *
 * Field markers:
 *   AI-FILL       = populated by the AI generation step
 *   DETERMINISTIC = computed from taxonomy / template logic (no AI needed)
 *   FROM-DB       = read from a Supabase table at runtime
 *
 * Total planned pages: 889
 *   52 + 88 + 70 + 28 + 520 + 110 + 10 + 4 + 7
 */

// ---------------------------------------------------------------------------
// 1. Page Type Enum
// ---------------------------------------------------------------------------

export type PseoPageType =
  | 'FOOD_CHAINING_GUIDE'
  | 'FOOD_CHAINING_AGE_COMBO'
  | 'CHALLENGE_MEAL_OCCASION'
  | 'AGE_MEAL_OCCASION'
  | 'FOOD_CHALLENGE_COMBO'
  | 'FOOD_DIETARY_RESTRICTION'
  | 'CHALLENGE_LANDING'
  | 'AGE_GROUP_LANDING'
  | 'MEAL_OCCASION_LANDING';

// ---------------------------------------------------------------------------
// 2. Dimension Enums (string literal unions)
// ---------------------------------------------------------------------------

// -- 2a. Safe Foods ----------------------------------------------------------

/** Tier 1: Highest-volume foods with broadest chaining potential (22 foods). */
export type SafeFoodTier1 =
  | 'chicken-nuggets'
  | 'french-fries'
  | 'mac-and-cheese'
  | 'pizza'
  | 'white-rice'
  | 'plain-pasta'
  | 'bread'
  | 'crackers'
  | 'bananas'
  | 'apples'
  | 'grapes'
  | 'strawberries'
  | 'peanut-butter'
  | 'cheese'
  | 'yogurt'
  | 'milk'
  | 'eggs'
  | 'butter-noodles'
  | 'pancakes'
  | 'waffles'
  | 'cereal'
  | 'goldfish-crackers';

/** Tier 2: Secondary safe foods with good search volume (30 foods). */
export type SafeFoodTier2 =
  | 'toast'
  | 'bagels'
  | 'pretzels'
  | 'popcorn'
  | 'graham-crackers'
  | 'animal-crackers'
  | 'cheese-quesadilla'
  | 'grilled-cheese'
  | 'hot-dogs'
  | 'corn'
  | 'carrots'
  | 'potatoes'
  | 'sweet-potatoes'
  | 'peas'
  | 'applesauce'
  | 'watermelon'
  | 'blueberries'
  | 'oranges'
  | 'raisins'
  | 'dried-mango'
  | 'string-cheese'
  | 'cottage-cheese'
  | 'cream-cheese'
  | 'chocolate-milk'
  | 'smoothies'
  | 'oatmeal'
  | 'granola-bars'
  | 'tortilla-chips'
  | 'ranch-dressing'
  | 'ketchup';

/** All 52 safe food slugs used across the pSEO system. */
export type SafeFoodSlug = SafeFoodTier1 | SafeFoodTier2;

// -- 2b. Age Groups ----------------------------------------------------------

/** 4 age groups covering core picky-eating demographics. */
export type AgeGroupSlug =
  | 'toddler'       // 1-3 years
  | 'preschooler'   // 3-5 years
  | 'school-age'    // 5-10 years
  | 'preteen';      // 10-13 years

/** Human-readable metadata for an age group. */
export interface AgeGroupMeta {
  slug: AgeGroupSlug;
  label: string;        // e.g. "Toddler (1-3)"
  displayName: string;  // e.g. "Toddler"
  ageRange: string;     // e.g. "1-3 years"
  minAge: number;
  maxAge: number;
}

// -- 2c. Feeding Challenges --------------------------------------------------

/** 10 feeding challenges / picky-eating conditions. */
export type FeedingChallengeSlug =
  | 'sensory-sensitivity'
  | 'texture-aversion'
  | 'arfid'
  | 'food-neophobia'
  | 'autism-spectrum'
  | 'adhd'
  | 'oral-motor-delay'
  | 'gag-reflex'
  | 'mealtime-anxiety'
  | 'limited-diet';

export interface FeedingChallengeMeta {
  slug: FeedingChallengeSlug;
  label: string;            // e.g. "Sensory Sensitivity"
  shortDescription: string;
  /** Whether this challenge qualifies as a medical condition for schema purposes. */
  isMedicalCondition: boolean;
}

// -- 2d. Meal Occasions ------------------------------------------------------

/** 7 meal occasions. */
export type MealOccasionSlug =
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'snacks'
  | 'school-lunch'
  | 'travel-meals'
  | 'party-food';

export interface MealOccasionMeta {
  slug: MealOccasionSlug;
  label: string;        // e.g. "Breakfast"
  displayName: string;  // e.g. "Breakfast"
}

// -- 2e. Dietary Restrictions ------------------------------------------------

/** 6 dietary restrictions (5 active + 1 no-restrictions baseline). */
export type DietaryRestrictionSlug =
  | 'dairy-free'
  | 'gluten-free'
  | 'nut-free'
  | 'egg-free'
  | 'vegan'
  | 'no-restrictions';

/** The 5 restrictions that actually produce pSEO pages (excludes no-restrictions). */
export type ActiveDietaryRestrictionSlug = Exclude<DietaryRestrictionSlug, 'no-restrictions'>;

export interface DietaryRestrictionMeta {
  slug: DietaryRestrictionSlug;
  label: string;            // e.g. "Dairy-Free"
  /** Allergens / ingredients to avoid; empty array for no-restrictions. */
  avoidIngredients: string[];
}

// -- 2f. Taxonomy Dimension (for generic dimension references) ---------------

export type TaxonomyDimension =
  | 'safe_food'
  | 'age_group'
  | 'feeding_challenge'
  | 'meal_occasion'
  | 'dietary_restriction';

export type SearchVolumeTier = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// 3. Dimension Context Objects (passed into AI generation prompts)
// ---------------------------------------------------------------------------

export interface SafeFoodContext {
  slug: SafeFoodSlug;
  displayName: string;                     // DETERMINISTIC
  tier: 1 | 2;                             // DETERMINISTIC
  category: 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'snack'; // DETERMINISTIC
  /** Common textures of this food (e.g. ["crunchy", "salty"]). Min: 1, Max: 4. */
  textures: string[];                      // DETERMINISTIC
  /** Common flavors (e.g. ["savory", "mild"]). Min: 1, Max: 4. */
  flavors: string[];                       // DETERMINISTIC
  /** Default nutrition info per typical serving. */
  nutritionPerServing?: {                  // FROM-DB (optional: include when nutrition data is available in foods table)
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  /** Common allergens present in this food. Min: 0, Max: 5. */
  allergens: string[];                     // DETERMINISTIC
}

export interface AgeGroupContext {
  slug: AgeGroupSlug;
  label: string;                           // DETERMINISTIC
  ageRange: string;                        // DETERMINISTIC
  /** Developmental eating considerations for this age group. */
  developmentalNotes: string;              // DETERMINISTIC
  /** Typical caloric needs range. */
  caloricRange: { min: number; max: number }; // DETERMINISTIC
}

export interface FeedingChallengeContext {
  slug: FeedingChallengeSlug;
  label: string;                           // DETERMINISTIC
  description: string;                     // DETERMINISTIC
  isMedicalCondition: boolean;             // DETERMINISTIC
  /** Key therapeutic approaches. Min: 1, Max: 5. */
  therapeuticApproaches: string[];         // DETERMINISTIC
  /** Signs/symptoms parents can look for. Min: 2, Max: 6. */
  commonSigns: string[];                   // DETERMINISTIC
}

export interface MealOccasionContext {
  slug: MealOccasionSlug;
  label: string;                           // DETERMINISTIC
  /** Typical time window (e.g. "6:30-8:30 AM"). */
  timeWindow: string;                      // DETERMINISTIC
  /** Constraints specific to this occasion (e.g. "must be portable" for travel). Min: 0, Max: 4. */
  constraints: string[];                   // DETERMINISTIC
}

export interface DietaryRestrictionContext {
  slug: DietaryRestrictionSlug;
  label: string;                           // DETERMINISTIC
  /** Ingredients to avoid. Min: 0, Max: 10. */
  avoidIngredients: string[];              // DETERMINISTIC
  /** Common substitution strategies (original -> replacement). */
  substitutions: Record<string, string>;   // DETERMINISTIC
}

/** Generic dimension combination for page generation routing. */
export interface DimensionCombination {
  safe_food?: SafeFoodSlug;
  age_group?: AgeGroupSlug;
  feeding_challenge?: FeedingChallengeSlug;
  meal_occasion?: MealOccasionSlug;
  dietary_restriction?: DietaryRestrictionSlug;
}

// ---------------------------------------------------------------------------
// 4. Shared Interfaces (PseoPageMeta, PseoPageSeo)
// ---------------------------------------------------------------------------

/** Metadata shared by every pSEO page regardless of type. */
export interface PseoPageMeta {
  /** Unique deterministic page ID: `{pageType}:{dimensionKey1}:{dimensionKey2}`. */
  pageId: string;                          // DETERMINISTIC
  pageType: PseoPageType;                 // DETERMINISTIC
  /** Canonical URL path (no domain, leading slash). */
  urlPath: string;                         // DETERMINISTIC
  /** Full page title as it appears in <title> and <h1>. */
  title: string;                           // DETERMINISTIC
  /** Content generation timestamp (ISO 8601). */
  generatedAt: string;                     // DETERMINISTIC
  /** Semantic version of the generation template that produced this page. */
  templateVersion: string;                 // DETERMINISTIC
  /** Prompt template ID used for AI generation. */
  promptTemplateId: string;                // DETERMINISTIC
}

/** SEO fields shared by every pSEO page. */
export interface PseoPageSeo {
  /**
   * Meta description.
   * Min: 120 chars, Max: 160 chars.
   */
  metaDescription: string;                 // AI-FILL
  /** Open Graph title. */
  ogTitle?: string;                        // AI-FILL (optional: include when it should differ from the page title)
  /** Open Graph description. */
  ogDescription?: string;                  // AI-FILL (optional: include when it should differ from metaDescription)
  /** Open Graph image URL path. */
  ogImage?: string;                        // DETERMINISTIC (optional: include when a custom image exists for this page)
  /** Canonical URL (full, with domain). */
  canonicalUrl: string;                    // DETERMINISTIC
  /** JSON-LD schema type names applied to this page. Min: 1, Max: 3. */
  schemaTypes: string[];                   // DETERMINISTIC
  /**
   * Primary target keyword for this page.
   * Min: 2 words, Max: 6 words.
   */
  primaryKeyword: string;                  // DETERMINISTIC
  /**
   * Secondary keywords.
   * Min: 2, Max: 5 keywords.
   */
  secondaryKeywords: string[];             // DETERMINISTIC
  /**
   * Internal links to related pSEO pages.
   * Min: 3, Max: 8 links.
   */
  internalLinks: PseoInternalLink[];       // DETERMINISTIC
  /**
   * Breadcrumb trail for this page.
   * Min: 2, Max: 5 crumbs (always starts with Home).
   */
  breadcrumbs: PseoBreadcrumb[];           // DETERMINISTIC
}

export interface PseoInternalLink {
  /** URL path (no domain, leading slash). */
  href: string;                            // DETERMINISTIC
  /** Anchor text for the link. */
  anchorText: string;                      // DETERMINISTIC
  /** Relationship of the linked page to this page. */
  relationship: 'parent' | 'child' | 'sibling' | 'related'; // DETERMINISTIC
}

export interface PseoBreadcrumb {
  label: string;                           // DETERMINISTIC
  href: string;                            // DETERMINISTIC
}

// ---------------------------------------------------------------------------
// 5. Shared Content Building Blocks
// ---------------------------------------------------------------------------

export interface PseoFaqItem {
  /** The question, phrased as a natural search query. */
  question: string;                        // AI-FILL
  /**
   * The answer in plain text (no markdown).
   * Min: 40 words, Max: 120 words.
   */
  answer: string;                          // AI-FILL
}

export interface PseoHowToStep {
  /** Short step title. Min: 3 words, Max: 8 words. */
  name: string;                            // AI-FILL
  /**
   * Step instructions in plain text.
   * Min: 20 words, Max: 80 words.
   */
  text: string;                            // AI-FILL
  /** Practical tip for this step. */
  tip?: string;                            // AI-FILL (optional: include when there is a non-obvious practical tip)
}

export interface PseoBridgeFood {
  /** Food name as it would appear in a grocery store. */
  name: string;                            // AI-FILL
  /** Why this food works as a bridge from the safe food. */
  reason: string;                          // AI-FILL
  /** Texture similarity to the safe food (0.0-1.0). */
  textureSimilarity: number;               // AI-FILL
  /** Flavor similarity to the safe food (0.0-1.0). */
  flavorSimilarity: number;                // AI-FILL
  /** Food category. */
  category: 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'snack'; // AI-FILL
}

export interface PseoMealIdea {
  /** Short meal name. Min: 2 words, Max: 6 words. */
  name: string;                            // AI-FILL
  /**
   * Brief description of the meal.
   * Min: 10 words, Max: 40 words.
   */
  description: string;                     // AI-FILL
  /** Approximate preparation time in minutes. */
  prepTimeMinutes: number;                 // AI-FILL
  /** Key ingredients. Min: 3, Max: 8 items. */
  keyIngredients: string[];                // AI-FILL
  /** Nutritional highlights. Min: 1, Max: 3 items (e.g. "high protein", "good source of iron"). */
  nutritionHighlights: string[];           // AI-FILL
  /** Why this meal works for the target audience. */
  whyItWorks: string;                      // AI-FILL
}

export interface PseoSubstitution {
  /** The restricted ingredient being replaced. */
  original: string;                        // AI-FILL
  /** The compliant replacement ingredient. */
  replacement: string;                     // AI-FILL
  /** Brief note on taste/texture differences. */
  note: string;                            // AI-FILL
}

export interface PseoStrategy {
  /** Short strategy title. Min: 3 words, Max: 8 words. */
  title: string;                           // AI-FILL
  /**
   * Detailed explanation of the strategy.
   * Min: 30 words, Max: 80 words.
   */
  description: string;                     // AI-FILL
}

export interface PseoScenario {
  /** The scenario description (e.g. "Child refuses everything on the plate"). */
  scenario: string;                        // AI-FILL
  /** Recommended parental response. */
  response: string;                        // AI-FILL
}

export interface PseoRelatedPage {
  title: string;                           // DETERMINISTIC
  slug: string;                            // DETERMINISTIC
  description: string;                     // DETERMINISTIC
}

// ---------------------------------------------------------------------------
// 6. Page Type Schemas (one interface per page type)
// ---------------------------------------------------------------------------

// -- 6.1 FOOD_CHAINING_GUIDE ------------------------------------------------
// URL: /food-chaining/[safe-food]
// 52 pages (one per safe food) | Schema: HowToSchema + ItemList

export interface FoodChainingGuideSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed DETERMINISTIC + AI-FILL
  dimensions: {
    safeFood: SafeFoodContext;             // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline displayed on the page (may differ from meta title).
     * Max: 80 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introductory paragraph explaining food chaining from this food.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Why this food is a great starting point for food chaining.
     * Min: 40 words, Max: 100 words.
     */
    whyThisFood: string;                   // AI-FILL
    /**
     * Step-by-step food chaining expansion steps.
     * Min: 5 steps, Max: 8 steps.
     */
    steps: PseoHowToStep[];               // AI-FILL
    /**
     * Bridge foods that connect to the safe food.
     * Min: 6, Max: 12 bridge foods.
     */
    bridgeFoods: PseoBridgeFood[];         // AI-FILL
    /**
     * Practical parent tips for food chaining success.
     * Min: 3, Max: 6 tips.
     */
    parentTips: string[];                  // AI-FILL
    /**
     * Signs that food chaining is working.
     * Min: 3, Max: 5 items.
     */
    progressSigns: string[];               // AI-FILL
    /**
     * When to seek professional help.
     * Min: 30 words, Max: 80 words.
     */
    whenToSeekHelp: string;                // AI-FILL
    /**
     * FAQ items for FAQPage schema.
     * Min: 4, Max: 6 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Estimated total time for the chaining process (ISO 8601 duration, e.g. "P2W"). */
  estimatedDuration: string;               // AI-FILL
}

// -- 6.2 FOOD_CHAINING_AGE_COMBO -------------------------------------------
// URL: /food-chaining/[safe-food]/[age-group]
// 88 pages (22 Tier 1 foods x 4 age groups) | Schema: HowToSchema

export interface FoodChainingAgeComboSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    safeFood: SafeFoodContext;             // DETERMINISTIC
    ageGroup: AgeGroupContext;             // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 90 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introduction tailored to this age group.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Age-specific developmental considerations for food chaining.
     * Min: 40 words, Max: 100 words.
     */
    ageConsiderations: string;             // AI-FILL
    /**
     * Age-appropriate food chaining steps.
     * Min: 5 steps, Max: 8 steps.
     */
    steps: PseoHowToStep[];               // AI-FILL
    /**
     * Bridge foods appropriate for this age group.
     * Min: 5, Max: 10 bridge foods.
     */
    bridgeFoods: PseoBridgeFood[];         // AI-FILL
    /**
     * Portion size guidance for this age group.
     * Min: 2, Max: 4 items.
     */
    portionGuidance: string[];             // AI-FILL
    /**
     * Age-specific parent tips.
     * Min: 3, Max: 5 tips.
     */
    parentTips: string[];                  // AI-FILL
    /**
     * Common mistakes parents make with this age group.
     * Min: 2, Max: 4 items.
     */
    commonMistakes: string[];              // AI-FILL
    /**
     * FAQ items.
     * Min: 3, Max: 5 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Estimated total time for the chaining process (ISO 8601 duration). */
  estimatedDuration: string;               // AI-FILL
}

// -- 6.3 CHALLENGE_MEAL_OCCASION --------------------------------------------
// URL: /[challenge]/[meal-occasion]
// 70 pages (10 challenges x 7 occasions) | Schema: ItemList + FAQPage

export interface ChallengeMealOccasionSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    challenge: FeedingChallengeContext;     // DETERMINISTIC
    mealOccasion: MealOccasionContext;      // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline including the count of ideas.
     * Max: 90 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introduction addressing the challenge during this meal occasion.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Explanation of how the challenge affects this meal occasion specifically.
     * Min: 40 words, Max: 100 words.
     */
    challengeImpact: string;               // AI-FILL
    /**
     * Concrete meal ideas that work for this combination.
     * Min: 7, Max: 12 meal ideas.
     */
    mealIdeas: PseoMealIdea[];            // AI-FILL
    /**
     * Strategies for making this meal occasion easier.
     * Min: 3, Max: 6 strategies.
     */
    strategies: string[];                  // AI-FILL
    /**
     * Foods to avoid for this challenge at this occasion.
     * Min: 2, Max: 5 items.
     */
    foodsToAvoid: string[];                // AI-FILL
    /**
     * Environmental / setup tips (seating, plates, timing, etc.).
     * Min: 2, Max: 4 tips.
     */
    environmentTips: string[];             // AI-FILL
    /**
     * FAQ items.
     * Min: 4, Max: 6 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
}

// -- 6.4 AGE_MEAL_OCCASION --------------------------------------------------
// URL: /[age-group]/[meal-occasion]-ideas
// 28 pages (4 ages x 7 occasions) | Schema: ItemList + FAQPage

export interface AgeMealOccasionSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    ageGroup: AgeGroupContext;             // DETERMINISTIC
    mealOccasion: MealOccasionContext;      // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline with idea count.
     * Max: 90 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introduction for age-specific meal occasion ideas.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Age-specific nutritional needs for this meal occasion.
     * Min: 40 words, Max: 100 words.
     */
    nutritionalContext: string;            // AI-FILL
    /**
     * Meal ideas appropriate for this age and occasion.
     * Min: 8, Max: 15 meal ideas.
     */
    mealIdeas: PseoMealIdea[];            // AI-FILL
    /**
     * Quick-win ideas for busy parents (< 10 min prep).
     * Min: 3, Max: 5 items.
     */
    quickWins: PseoMealIdea[];            // AI-FILL
    /**
     * Age-appropriate involvement tips (cooking together, choices, etc.).
     * Min: 2, Max: 4 tips.
     */
    kidInvolvementTips: string[];          // AI-FILL
    /**
     * Common picky-eating patterns at this age for this meal.
     * Min: 2, Max: 4 patterns.
     */
    commonPatterns: string[];              // AI-FILL
    /**
     * FAQ items.
     * Min: 4, Max: 6 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
}

// -- 6.5 FOOD_CHALLENGE_COMBO -----------------------------------------------
// URL: /food-chaining/[safe-food]/[challenge]
// 520 pages (52 foods x 10 challenges) | Schema: HowToSchema + FAQPage

export interface FoodChallengeComboSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    safeFood: SafeFoodContext;             // DETERMINISTIC
    challenge: FeedingChallengeContext;     // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 100 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introduction addressing food chaining from this food for this challenge.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * How this challenge specifically affects eating this food.
     * Min: 40 words, Max: 100 words.
     */
    challengeFoodInteraction: string;      // AI-FILL
    /**
     * Adapted food chaining steps for this challenge.
     * Min: 5 steps, Max: 8 steps.
     */
    steps: PseoHowToStep[];               // AI-FILL
    /**
     * Bridge foods that are appropriate for this challenge.
     * Min: 5, Max: 10 bridge foods.
     */
    bridgeFoods: PseoBridgeFood[];         // AI-FILL
    /**
     * Challenge-specific adaptations and accommodations.
     * Min: 3, Max: 6 items.
     */
    adaptations: string[];                 // AI-FILL
    /**
     * Red flags indicating need for professional evaluation.
     * Min: 2, Max: 4 items.
     */
    redFlags: string[];                    // AI-FILL
    /**
     * Therapeutic strategies specific to this food + challenge combination.
     * Min: 2, Max: 5 strategies.
     */
    therapeuticStrategies: string[];        // AI-FILL
    /**
     * FAQ items.
     * Min: 4, Max: 6 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Estimated total time for the chaining process (ISO 8601 duration). */
  estimatedDuration: string;               // AI-FILL
}

// -- 6.6 FOOD_DIETARY_RESTRICTION -------------------------------------------
// URL: /[dietary-restriction]/food-chaining/[safe-food]
// 110 pages (22 T1 foods x 5 restrictions excl. no-restrictions) | Schema: ItemList + HowToSchema

export interface FoodDietaryRestrictionSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    safeFood: SafeFoodContext;             // DETERMINISTIC
    dietaryRestriction: DietaryRestrictionContext; // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 90 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Introduction addressing food chaining under this dietary restriction.
     * Min: 60 words, Max: 150 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * How the dietary restriction impacts chaining from this food.
     * Min: 40 words, Max: 100 words.
     */
    restrictionImpact: string;             // AI-FILL
    /**
     * Safe bridge foods that comply with this dietary restriction.
     * Min: 6, Max: 12 bridge foods.
     */
    bridgeFoods: PseoBridgeFood[];         // AI-FILL
    /**
     * Substitution strategies for restricted ingredients.
     * Min: 3, Max: 6 items.
     */
    substitutions: PseoSubstitution[];     // AI-FILL
    /**
     * Chaining steps adapted for the restriction.
     * Min: 5 steps, Max: 8 steps.
     */
    steps: PseoHowToStep[];               // AI-FILL
    /**
     * Nutritional gaps to watch out for under this restriction.
     * Min: 1, Max: 4 items.
     */
    nutritionalGaps: string[];             // AI-FILL
    /**
     * Recommended brands / products that are compliant.
     * Min: 2, Max: 5 items.
     */
    recommendedProducts: string[];         // AI-FILL
    /**
     * FAQ items.
     * Min: 4, Max: 6 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Estimated total time for the chaining process (ISO 8601 duration). */
  estimatedDuration: string;               // AI-FILL
}

// -- 6.7 CHALLENGE_LANDING --------------------------------------------------
// URL: /guides/[challenge]
// 10 pages | Schema: MedicalWebPageSchema + FAQPage

export interface ChallengeLandingSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    challenge: FeedingChallengeContext;     // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 80 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Comprehensive introduction to this feeding challenge.
     * Min: 100 words, Max: 250 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * What this challenge is (definition section).
     * Min: 60 words, Max: 150 words.
     */
    definition: string;                    // AI-FILL
    /**
     * Signs and symptoms parents should watch for.
     * Min: 4, Max: 8 items.
     */
    signsAndSymptoms: string[];            // AI-FILL
    /**
     * Possible causes or contributing factors.
     * Min: 3, Max: 6 items.
     */
    causes: string[];                      // AI-FILL
    /**
     * Evidence-based strategies for parents.
     * Min: 4, Max: 8 strategies.
     */
    strategies: PseoStrategy[];            // AI-FILL
    /**
     * When to seek professional help.
     * Min: 40 words, Max: 100 words.
     */
    whenToSeekHelp: string;                // AI-FILL
    /**
     * Types of professionals who can help.
     * Min: 2, Max: 5 items.
     */
    professionalResources: string[];       // AI-FILL
    /**
     * FAQ items.
     * Min: 5, Max: 8 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Medical review metadata for MedicalWebPageSchema. */
  medicalReview: {
    /** Name and credentials of the reviewer (e.g. "Dr. Jane Smith, RD"). */
    reviewedBy: string;                    // DETERMINISTIC
    /** Date of last medical review (ISO 8601 date, e.g. "2026-03-01"). */
    lastReviewed: string;                  // DETERMINISTIC
    /** Medical specialty (e.g. "Pediatric Nutrition"). */
    specialty: string;                     // DETERMINISTIC
  };
}

// -- 6.8 AGE_GROUP_LANDING --------------------------------------------------
// URL: /guides/[age-group]-picky-eater
// 4 pages | Schema: MedicalWebPageSchema + FAQPage

export interface AgeGroupLandingSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    ageGroup: AgeGroupContext;             // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 80 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Comprehensive introduction to picky eating at this age.
     * Min: 100 words, Max: 250 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Developmental context for picky eating at this age.
     * Min: 60 words, Max: 150 words.
     */
    developmentalContext: string;           // AI-FILL
    /**
     * What is normal vs. concerning at this age.
     * Min: 40 words, Max: 100 words.
     */
    normalVsConcerning: string;            // AI-FILL
    /**
     * Age-specific feeding strategies.
     * Min: 4, Max: 8 strategies.
     */
    strategies: PseoStrategy[];            // AI-FILL
    /**
     * Nutritional priorities for this age group.
     * Min: 3, Max: 6 items.
     */
    nutritionalPriorities: string[];       // AI-FILL
    /**
     * Sample day of meals for a picky eater at this age.
     * All 5 fields are required.
     */
    sampleMealDay: {
      breakfast: string;                   // AI-FILL
      morningSnack: string;                // AI-FILL
      lunch: string;                       // AI-FILL
      afternoonSnack: string;              // AI-FILL
      dinner: string;                      // AI-FILL
    };
    /**
     * Red flags that warrant professional evaluation.
     * Min: 3, Max: 5 items.
     */
    redFlags: string[];                    // AI-FILL
    /**
     * FAQ items.
     * Min: 5, Max: 8 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
  /** Medical review metadata for MedicalWebPageSchema. */
  medicalReview: {
    reviewedBy: string;                    // DETERMINISTIC
    lastReviewed: string;                  // DETERMINISTIC
    specialty: string;                     // DETERMINISTIC
  };
}

// -- 6.9 MEAL_OCCASION_LANDING ----------------------------------------------
// URL: /guides/[meal-occasion]-picky-eater
// 7 pages | Schema: ItemList + FAQPage

export interface MealOccasionLandingSchema {
  meta: PseoPageMeta;                      // DETERMINISTIC
  seo: PseoPageSeo;                        // mixed
  dimensions: {
    mealOccasion: MealOccasionContext;      // DETERMINISTIC
  };
  content: {
    /**
     * Hero headline.
     * Max: 80 chars.
     */
    headline: string;                      // AI-FILL
    /**
     * Comprehensive introduction to this meal occasion for picky eaters.
     * Min: 80 words, Max: 200 words.
     */
    introduction: string;                  // AI-FILL
    /**
     * Why this meal occasion is particularly challenging for picky eaters.
     * Min: 40 words, Max: 100 words.
     */
    whyItsChallenging: string;             // AI-FILL
    /**
     * Top meal ideas for this occasion.
     * Min: 8, Max: 15 meal ideas.
     */
    mealIdeas: PseoMealIdea[];            // AI-FILL
    /**
     * General strategies for this meal occasion.
     * Min: 4, Max: 6 strategies.
     */
    strategies: string[];                  // AI-FILL
    /**
     * Meal-prep and time-saving tips.
     * Min: 3, Max: 5 tips.
     */
    mealPrepTips: string[];                // AI-FILL
    /**
     * How to handle specific picky-eater scenarios at this meal.
     * Min: 2, Max: 4 scenarios.
     */
    scenarioHandling: PseoScenario[];      // AI-FILL
    /**
     * FAQ items.
     * Min: 5, Max: 8 FAQs.
     */
    faqs: PseoFaqItem[];                  // AI-FILL
  };
}

// ---------------------------------------------------------------------------
// 7. Discriminated Union of All Page Schemas
// ---------------------------------------------------------------------------

export type PseoPageSchema =
  | FoodChainingGuideSchema
  | FoodChainingAgeComboSchema
  | ChallengeMealOccasionSchema
  | AgeMealOccasionSchema
  | FoodChallengeComboSchema
  | FoodDietaryRestrictionSchema
  | ChallengeLandingSchema
  | AgeGroupLandingSchema
  | MealOccasionLandingSchema;

// ---------------------------------------------------------------------------
// 8. Generation Status & Supabase Record
// ---------------------------------------------------------------------------

export type PseoGenerationStatus =
  | 'pending'           // Queued for generation
  | 'generating'        // AI generation in progress
  | 'validating'        // JSON schema validation in progress
  | 'review'            // Awaiting human review
  | 'approved'          // Approved and ready to publish
  | 'published'         // Live on site
  | 'failed'            // Generation or validation failed
  | 'archived';         // Removed from site but retained in DB

export interface PseoGenerationError {
  /** Error code for programmatic handling (e.g. "SCHEMA_VALIDATION_FAILED"). */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** The field or section that caused the error. */
  field?: string;                          // optional: include when the error is field-specific
  /** Timestamp of the error (ISO 8601). */
  timestamp: string;
}

/** Row shape for the `pseo_pages` Supabase table. */
export interface PseoPageRecord {
  /** UUID primary key. */
  id: string;                              // FROM-DB
  /** Deterministic page ID: `{pageType}:{dimensionKey1}:{dimensionKey2}`. */
  page_id: string;                         // DETERMINISTIC
  /** Page type discriminator. */
  page_type: PseoPageType;                // DETERMINISTIC
  /** URL path (no domain, leading slash). */
  url_path: string;                        // DETERMINISTIC
  /** Full page title. */
  title: string;                           // DETERMINISTIC
  /** Current generation / publication status. */
  status: PseoGenerationStatus;           // FROM-DB
  /**
   * The complete page schema JSON (stored as JSONB in Supabase).
   * Shape depends on page_type.
   */
  schema_data: PseoPageSchema;            // AI-FILL + DETERMINISTIC (mixed)
  /** Prompt template ID used for generation. */
  prompt_template_id: string | null;       // DETERMINISTIC (optional: null before first generation)
  /** Prompt template version used for generation. */
  prompt_template_version: string | null;  // DETERMINISTIC (optional: null before first generation)
  /** AI model used for generation (e.g. "gpt-4o", "claude-opus-4-20250514"). */
  ai_model: string | null;                // DETERMINISTIC (optional: null before first generation)
  /** Total tokens consumed during generation. */
  tokens_used: number | null;              // FROM-DB (optional: null before first generation)
  /** Generation cost in USD. */
  generation_cost_usd: number | null;      // FROM-DB (optional: null before first generation)
  /** Generation latency in milliseconds. */
  generation_latency_ms: number | null;    // FROM-DB (optional: null before first generation)
  /** Errors encountered during generation, if any. */
  generation_errors: PseoGenerationError[] | null; // FROM-DB (optional: null when no errors)
  /** Number of times this page has been regenerated. */
  generation_count: number;                // FROM-DB
  /** ID of the user who last approved this page. */
  approved_by: string | null;              // FROM-DB (optional: null until approved)
  /** Timestamp of approval (ISO 8601). */
  approved_at: string | null;              // FROM-DB (optional: null until approved)
  /** Timestamp of publication (ISO 8601). */
  published_at: string | null;             // FROM-DB (optional: null until published)
  /** Row creation timestamp (ISO 8601). */
  created_at: string;                      // FROM-DB
  /** Row last-updated timestamp (ISO 8601). */
  updated_at: string;                      // FROM-DB
  /** Owning user ID (for RLS). */
  user_id: string;                         // FROM-DB
}

/**
 * Legacy alias for backward compatibility with existing code.
 * @deprecated Use PseoPageRecord instead.
 */
export type PseoPageRow = PseoPageRecord;

// ---------------------------------------------------------------------------
// 9. Page Type Definition (configuration for each page type)
// ---------------------------------------------------------------------------

/** Schema type names that can be applied to pSEO pages. */
export type PseoSchemaType =
  | 'HowToSchema'
  | 'ItemList'
  | 'FAQPage'
  | 'MedicalWebPageSchema';

export interface PageTypeDimension {
  /** Name of the dimension (e.g. "safeFood", "ageGroup"). */
  name: string;
  /** The TypeScript type this dimension draws from. */
  enumType:
    | 'SafeFoodSlug'
    | 'SafeFoodTier1'
    | 'AgeGroupSlug'
    | 'FeedingChallengeSlug'
    | 'MealOccasionSlug'
    | 'DietaryRestrictionSlug'
    | 'ActiveDietaryRestrictionSlug';
  /** URL placeholder token (e.g. "[safe-food]"). */
  urlToken: string;
}

export interface PageTypeDefinition {
  /** The page type discriminator. */
  pageType: PseoPageType;
  /** Human-readable name for admin UI. */
  displayName: string;
  /** Short description of what this page type covers. */
  description: string;
  /** URL pattern with dimension placeholders. */
  urlPattern: string;
  /** Title template with dimension placeholders. */
  titleTemplate: string;
  /** Structured data schema types applied to this page type. Min: 1, Max: 3. */
  schemaTypes: PseoSchemaType[];
  /** Dimensions that parameterize this page type. Min: 1, Max: 2. */
  dimensions: PageTypeDimension[];
  /** Total number of pages this type produces. */
  estimatedPageCount: number;
  /** Priority tier for generation ordering (1 = highest priority, 3 = lowest). */
  priority: 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// 10. PAGE_TYPE_DEFINITIONS Constant
// ---------------------------------------------------------------------------

export const PAGE_TYPE_DEFINITIONS: PageTypeDefinition[] = [
  // -- Priority 1: Landing pages + core guides (low count, high value) ------
  {
    pageType: 'CHALLENGE_LANDING',
    displayName: 'Challenge Landing Page',
    description: 'Comprehensive parent guides for each feeding challenge. Uses MedicalWebPage schema for YMYL trust signals.',
    urlPattern: '/guides/[challenge]',
    titleTemplate: '[Challenge Type] in Children: Complete Parent\'s Guide to Picky Eating',
    schemaTypes: ['MedicalWebPageSchema', 'FAQPage'],
    dimensions: [
      { name: 'challenge', enumType: 'FeedingChallengeSlug', urlToken: '[challenge]' },
    ],
    estimatedPageCount: 10,
    priority: 1,
  },
  {
    pageType: 'AGE_GROUP_LANDING',
    displayName: 'Age Group Landing Page',
    description: 'Age-specific guides to understanding and managing picky eating. Uses MedicalWebPage schema for YMYL trust.',
    urlPattern: '/guides/[age-group]-picky-eater',
    titleTemplate: 'Picky Eating in [Age Group]s: What to Know and What to Do',
    schemaTypes: ['MedicalWebPageSchema', 'FAQPage'],
    dimensions: [
      { name: 'ageGroup', enumType: 'AgeGroupSlug', urlToken: '[age-group]' },
    ],
    estimatedPageCount: 4,
    priority: 1,
  },
  {
    pageType: 'MEAL_OCCASION_LANDING',
    displayName: 'Meal Occasion Landing Page',
    description: 'Meal-occasion hub pages with ideas, strategies, and meal plans for picky eaters.',
    urlPattern: '/guides/[meal-occasion]-picky-eater',
    titleTemplate: '[Meal Occasion] for Picky Eaters: Ideas, Strategies & Meal Plans',
    schemaTypes: ['ItemList', 'FAQPage'],
    dimensions: [
      { name: 'mealOccasion', enumType: 'MealOccasionSlug', urlToken: '[meal-occasion]' },
    ],
    estimatedPageCount: 7,
    priority: 1,
  },
  {
    pageType: 'FOOD_CHAINING_GUIDE',
    displayName: 'Food Chaining Guide',
    description: 'Step-by-step food chaining expansion guides starting from a single safe food.',
    urlPattern: '/food-chaining/[safe-food]',
    titleTemplate: 'Food Chaining from [Food]: Step-by-Step Expansion Guide for Picky Eaters',
    schemaTypes: ['HowToSchema', 'ItemList'],
    dimensions: [
      { name: 'safeFood', enumType: 'SafeFoodSlug', urlToken: '[safe-food]' },
    ],
    estimatedPageCount: 52,
    priority: 1,
  },

  // -- Priority 2: Medium-count combo pages ---------------------------------
  {
    pageType: 'FOOD_CHAINING_AGE_COMBO',
    displayName: 'Food Chaining + Age Group',
    description: 'Age-specific food chaining guides for Tier 1 safe foods.',
    urlPattern: '/food-chaining/[safe-food]/[age-group]',
    titleTemplate: 'Food Chaining from [Food] for [Age Group]s: Age-Specific Tips',
    schemaTypes: ['HowToSchema'],
    dimensions: [
      { name: 'safeFood', enumType: 'SafeFoodTier1', urlToken: '[safe-food]' },
      { name: 'ageGroup', enumType: 'AgeGroupSlug', urlToken: '[age-group]' },
    ],
    estimatedPageCount: 88,
    priority: 2,
  },
  {
    pageType: 'CHALLENGE_MEAL_OCCASION',
    displayName: 'Challenge + Meal Occasion',
    description: 'Meal ideas tailored to specific feeding challenges and meal occasions.',
    urlPattern: '/[challenge]/[meal-occasion]',
    titleTemplate: '[Meal Occasion] Ideas for [Challenge Type] Kids: [N] Options That Work',
    schemaTypes: ['ItemList', 'FAQPage'],
    dimensions: [
      { name: 'challenge', enumType: 'FeedingChallengeSlug', urlToken: '[challenge]' },
      { name: 'mealOccasion', enumType: 'MealOccasionSlug', urlToken: '[meal-occasion]' },
    ],
    estimatedPageCount: 70,
    priority: 2,
  },
  {
    pageType: 'AGE_MEAL_OCCASION',
    displayName: 'Age Group + Meal Occasion',
    description: 'Age-appropriate meal ideas for each meal occasion.',
    urlPattern: '/[age-group]/[meal-occasion]-ideas',
    titleTemplate: '[N] [Meal Occasion] Ideas for [Age Group] Picky Eaters (That Actually Work)',
    schemaTypes: ['ItemList', 'FAQPage'],
    dimensions: [
      { name: 'ageGroup', enumType: 'AgeGroupSlug', urlToken: '[age-group]' },
      { name: 'mealOccasion', enumType: 'MealOccasionSlug', urlToken: '[meal-occasion]' },
    ],
    estimatedPageCount: 28,
    priority: 2,
  },

  // -- Priority 3: High-count combo pages -----------------------------------
  {
    pageType: 'FOOD_CHALLENGE_COMBO',
    displayName: 'Food Chaining + Challenge',
    description: 'Food chaining guides adapted for specific feeding challenges.',
    urlPattern: '/food-chaining/[safe-food]/[challenge]',
    titleTemplate: 'Food Chaining from [Food] for Kids with [Challenge]: A Parent\'s Guide',
    schemaTypes: ['HowToSchema', 'FAQPage'],
    dimensions: [
      { name: 'safeFood', enumType: 'SafeFoodSlug', urlToken: '[safe-food]' },
      { name: 'challenge', enumType: 'FeedingChallengeSlug', urlToken: '[challenge]' },
    ],
    estimatedPageCount: 520,
    priority: 3,
  },
  {
    pageType: 'FOOD_DIETARY_RESTRICTION',
    displayName: 'Food Chaining + Dietary Restriction',
    description: 'Dietary-restriction-compliant food chaining guides for Tier 1 foods.',
    urlPattern: '/[dietary-restriction]/food-chaining/[safe-food]',
    titleTemplate: '[Dietary Restriction] Food Chaining from [Food]: Safe Bridge Foods',
    schemaTypes: ['ItemList', 'HowToSchema'],
    dimensions: [
      { name: 'dietaryRestriction', enumType: 'ActiveDietaryRestrictionSlug', urlToken: '[dietary-restriction]' },
      { name: 'safeFood', enumType: 'SafeFoodTier1', urlToken: '[safe-food]' },
    ],
    estimatedPageCount: 110,
    priority: 3,
  },
];

// ---------------------------------------------------------------------------
// 11. Prompt Configuration
// ---------------------------------------------------------------------------

export interface PseoPromptConfig {
  /** System prompt establishing AI role and constraints. */
  systemPrompt: string;
  /** Template for taxonomy context injection. Uses {{placeholder}} syntax. */
  contextTemplate: string;
  /** Template for database record injection. Uses {{placeholder}} syntax. */
  dataTemplate: string;
  /** Instructions describing the JSON schema the model must fill. */
  schemaInstructions: string;
  /** Rules governing output format (JSON-only, no markdown, etc.). Min: 1, Max: 10 rules. */
  outputRules: string[];
  /** Quality checks the output must satisfy before being accepted. Min: 1, Max: 10 checks. */
  qualityChecks: string[];
  /** Phrases banned from generated content. Min: 0, Max: 50 phrases. */
  bannedPhrases: string[];
}

/** Taxonomy seed record for populating the taxonomy tables. */
export interface TaxonomySeedItem {
  dimension: TaxonomyDimension;
  slug: string;
  display_name: string;
  tier: SearchVolumeTier;
  category?: string;                       // optional: include when the dimension has sub-categories
  sort_order: number;
  context?: Record<string, unknown>;       // optional: include for dimension-specific extra data
}

// ---------------------------------------------------------------------------
// 12. Utility Types
// ---------------------------------------------------------------------------

/** Map from page type to its corresponding schema interface. */
export interface PseoPageSchemaMap {
  FOOD_CHAINING_GUIDE: FoodChainingGuideSchema;
  FOOD_CHAINING_AGE_COMBO: FoodChainingAgeComboSchema;
  CHALLENGE_MEAL_OCCASION: ChallengeMealOccasionSchema;
  AGE_MEAL_OCCASION: AgeMealOccasionSchema;
  FOOD_CHALLENGE_COMBO: FoodChallengeComboSchema;
  FOOD_DIETARY_RESTRICTION: FoodDietaryRestrictionSchema;
  CHALLENGE_LANDING: ChallengeLandingSchema;
  AGE_GROUP_LANDING: AgeGroupLandingSchema;
  MEAL_OCCASION_LANDING: MealOccasionLandingSchema;
}

/** Type-safe accessor: given a page type string, get the corresponding schema. */
export type PseoSchemaForType<T extends PseoPageType> = PseoPageSchemaMap[T];

/** Extract the dimension slug requirements for a given page type. */
export type DimensionSlugsForPageType<T extends PseoPageType> =
  T extends 'FOOD_CHAINING_GUIDE' ? { safeFood: SafeFoodSlug }
  : T extends 'FOOD_CHAINING_AGE_COMBO' ? { safeFood: SafeFoodTier1; ageGroup: AgeGroupSlug }
  : T extends 'CHALLENGE_MEAL_OCCASION' ? { challenge: FeedingChallengeSlug; mealOccasion: MealOccasionSlug }
  : T extends 'AGE_MEAL_OCCASION' ? { ageGroup: AgeGroupSlug; mealOccasion: MealOccasionSlug }
  : T extends 'FOOD_CHALLENGE_COMBO' ? { safeFood: SafeFoodSlug; challenge: FeedingChallengeSlug }
  : T extends 'FOOD_DIETARY_RESTRICTION' ? { dietaryRestriction: ActiveDietaryRestrictionSlug; safeFood: SafeFoodTier1 }
  : T extends 'CHALLENGE_LANDING' ? { challenge: FeedingChallengeSlug }
  : T extends 'AGE_GROUP_LANDING' ? { ageGroup: AgeGroupSlug }
  : T extends 'MEAL_OCCASION_LANDING' ? { mealOccasion: MealOccasionSlug }
  : never;

// ---------------------------------------------------------------------------
// 13. Dimension Value Constants
// ---------------------------------------------------------------------------

export const SAFE_FOODS_TIER1: SafeFoodTier1[] = [
  'chicken-nuggets', 'french-fries', 'mac-and-cheese', 'pizza',
  'white-rice', 'plain-pasta', 'bread', 'crackers',
  'bananas', 'apples', 'grapes', 'strawberries',
  'peanut-butter', 'cheese', 'yogurt', 'milk',
  'eggs', 'butter-noodles', 'pancakes', 'waffles',
  'cereal', 'goldfish-crackers',
];

export const SAFE_FOODS_TIER2: SafeFoodTier2[] = [
  'toast', 'bagels', 'pretzels', 'popcorn',
  'graham-crackers', 'animal-crackers', 'cheese-quesadilla', 'grilled-cheese',
  'hot-dogs', 'corn', 'carrots', 'potatoes',
  'sweet-potatoes', 'peas', 'applesauce', 'watermelon',
  'blueberries', 'oranges', 'raisins', 'dried-mango',
  'string-cheese', 'cottage-cheese', 'cream-cheese', 'chocolate-milk',
  'smoothies', 'oatmeal', 'granola-bars', 'tortilla-chips',
  'ranch-dressing', 'ketchup',
];

export const ALL_SAFE_FOODS: SafeFoodSlug[] = [
  ...SAFE_FOODS_TIER1,
  ...SAFE_FOODS_TIER2,
];

export const AGE_GROUPS: AgeGroupSlug[] = [
  'toddler', 'preschooler', 'school-age', 'preteen',
];

export const FEEDING_CHALLENGES: FeedingChallengeSlug[] = [
  'sensory-sensitivity', 'texture-aversion', 'arfid',
  'food-neophobia', 'autism-spectrum', 'adhd',
  'oral-motor-delay', 'gag-reflex', 'mealtime-anxiety',
  'limited-diet',
];

export const MEAL_OCCASIONS: MealOccasionSlug[] = [
  'breakfast', 'lunch', 'dinner', 'snacks',
  'school-lunch', 'travel-meals', 'party-food',
];

export const DIETARY_RESTRICTIONS: DietaryRestrictionSlug[] = [
  'dairy-free', 'gluten-free', 'nut-free', 'egg-free', 'vegan', 'no-restrictions',
];

/** Dietary restrictions that produce pSEO pages (excludes no-restrictions). */
export const ACTIVE_DIETARY_RESTRICTIONS: ActiveDietaryRestrictionSlug[] = [
  'dairy-free', 'gluten-free', 'nut-free', 'egg-free', 'vegan',
];

// ---------------------------------------------------------------------------
// 14. Human-Readable Label Maps
// ---------------------------------------------------------------------------

export const SAFE_FOOD_LABELS: Record<SafeFoodSlug, string> = {
  'chicken-nuggets': 'Chicken Nuggets',
  'french-fries': 'French Fries',
  'mac-and-cheese': 'Mac and Cheese',
  'pizza': 'Pizza',
  'white-rice': 'White Rice',
  'plain-pasta': 'Plain Pasta',
  'bread': 'Bread',
  'crackers': 'Crackers',
  'bananas': 'Bananas',
  'apples': 'Apples',
  'grapes': 'Grapes',
  'strawberries': 'Strawberries',
  'peanut-butter': 'Peanut Butter',
  'cheese': 'Cheese',
  'yogurt': 'Yogurt',
  'milk': 'Milk',
  'eggs': 'Eggs',
  'butter-noodles': 'Butter Noodles',
  'pancakes': 'Pancakes',
  'waffles': 'Waffles',
  'cereal': 'Cereal',
  'goldfish-crackers': 'Goldfish Crackers',
  'toast': 'Toast',
  'bagels': 'Bagels',
  'pretzels': 'Pretzels',
  'popcorn': 'Popcorn',
  'graham-crackers': 'Graham Crackers',
  'animal-crackers': 'Animal Crackers',
  'cheese-quesadilla': 'Cheese Quesadilla',
  'grilled-cheese': 'Grilled Cheese',
  'hot-dogs': 'Hot Dogs',
  'corn': 'Corn',
  'carrots': 'Carrots',
  'potatoes': 'Potatoes',
  'sweet-potatoes': 'Sweet Potatoes',
  'peas': 'Peas',
  'applesauce': 'Applesauce',
  'watermelon': 'Watermelon',
  'blueberries': 'Blueberries',
  'oranges': 'Oranges',
  'raisins': 'Raisins',
  'dried-mango': 'Dried Mango',
  'string-cheese': 'String Cheese',
  'cottage-cheese': 'Cottage Cheese',
  'cream-cheese': 'Cream Cheese',
  'chocolate-milk': 'Chocolate Milk',
  'smoothies': 'Smoothies',
  'oatmeal': 'Oatmeal',
  'granola-bars': 'Granola Bars',
  'tortilla-chips': 'Tortilla Chips',
  'ranch-dressing': 'Ranch Dressing',
  'ketchup': 'Ketchup',
};

export const AGE_GROUP_LABELS: Record<AgeGroupSlug, string> = {
  'toddler': 'Toddler (1-3)',
  'preschooler': 'Preschooler (3-5)',
  'school-age': 'School-Age (5-10)',
  'preteen': 'Preteen (10-13)',
};

export const FEEDING_CHALLENGE_LABELS: Record<FeedingChallengeSlug, string> = {
  'sensory-sensitivity': 'Sensory Sensitivity',
  'texture-aversion': 'Texture Aversion',
  'arfid': 'ARFID',
  'food-neophobia': 'Food Neophobia',
  'autism-spectrum': 'Autism Spectrum',
  'adhd': 'ADHD',
  'oral-motor-delay': 'Oral Motor Delay',
  'gag-reflex': 'Gag Reflex',
  'mealtime-anxiety': 'Mealtime Anxiety',
  'limited-diet': 'Limited Diet',
};

export const MEAL_OCCASION_LABELS: Record<MealOccasionSlug, string> = {
  'breakfast': 'Breakfast',
  'lunch': 'Lunch',
  'dinner': 'Dinner',
  'snacks': 'Snacks',
  'school-lunch': 'School Lunch',
  'travel-meals': 'Travel Meals',
  'party-food': 'Party Food',
};

export const DIETARY_RESTRICTION_LABELS: Record<DietaryRestrictionSlug, string> = {
  'dairy-free': 'Dairy-Free',
  'gluten-free': 'Gluten-Free',
  'nut-free': 'Nut-Free',
  'egg-free': 'Egg-Free',
  'vegan': 'Vegan',
  'no-restrictions': 'No Restrictions',
};

// ---------------------------------------------------------------------------
// 15. Validation Constraints
// ---------------------------------------------------------------------------

/**
 * Min/max array length constraints for every array field in the pSEO schemas.
 * Keyed by `{SchemaName}.{fieldPath}` for programmatic validation.
 */
export const PSEO_ARRAY_CONSTRAINTS: Record<string, { min: number; max: number }> = {
  // FoodChainingGuideSchema
  'FoodChainingGuide.content.steps': { min: 5, max: 8 },
  'FoodChainingGuide.content.bridgeFoods': { min: 6, max: 12 },
  'FoodChainingGuide.content.parentTips': { min: 3, max: 6 },
  'FoodChainingGuide.content.progressSigns': { min: 3, max: 5 },
  'FoodChainingGuide.content.faqs': { min: 4, max: 6 },

  // FoodChainingAgeComboSchema
  'FoodChainingAgeCombo.content.steps': { min: 5, max: 8 },
  'FoodChainingAgeCombo.content.bridgeFoods': { min: 5, max: 10 },
  'FoodChainingAgeCombo.content.portionGuidance': { min: 2, max: 4 },
  'FoodChainingAgeCombo.content.parentTips': { min: 3, max: 5 },
  'FoodChainingAgeCombo.content.commonMistakes': { min: 2, max: 4 },
  'FoodChainingAgeCombo.content.faqs': { min: 3, max: 5 },

  // ChallengeMealOccasionSchema
  'ChallengeMealOccasion.content.mealIdeas': { min: 7, max: 12 },
  'ChallengeMealOccasion.content.strategies': { min: 3, max: 6 },
  'ChallengeMealOccasion.content.foodsToAvoid': { min: 2, max: 5 },
  'ChallengeMealOccasion.content.environmentTips': { min: 2, max: 4 },
  'ChallengeMealOccasion.content.faqs': { min: 4, max: 6 },

  // AgeMealOccasionSchema
  'AgeMealOccasion.content.mealIdeas': { min: 8, max: 15 },
  'AgeMealOccasion.content.quickWins': { min: 3, max: 5 },
  'AgeMealOccasion.content.kidInvolvementTips': { min: 2, max: 4 },
  'AgeMealOccasion.content.commonPatterns': { min: 2, max: 4 },
  'AgeMealOccasion.content.faqs': { min: 4, max: 6 },

  // FoodChallengeComboSchema
  'FoodChallengeCombo.content.steps': { min: 5, max: 8 },
  'FoodChallengeCombo.content.bridgeFoods': { min: 5, max: 10 },
  'FoodChallengeCombo.content.adaptations': { min: 3, max: 6 },
  'FoodChallengeCombo.content.redFlags': { min: 2, max: 4 },
  'FoodChallengeCombo.content.therapeuticStrategies': { min: 2, max: 5 },
  'FoodChallengeCombo.content.faqs': { min: 4, max: 6 },

  // FoodDietaryRestrictionSchema
  'FoodDietaryRestriction.content.bridgeFoods': { min: 6, max: 12 },
  'FoodDietaryRestriction.content.substitutions': { min: 3, max: 6 },
  'FoodDietaryRestriction.content.steps': { min: 5, max: 8 },
  'FoodDietaryRestriction.content.nutritionalGaps': { min: 1, max: 4 },
  'FoodDietaryRestriction.content.recommendedProducts': { min: 2, max: 5 },
  'FoodDietaryRestriction.content.faqs': { min: 4, max: 6 },

  // ChallengeLandingSchema
  'ChallengeLanding.content.signsAndSymptoms': { min: 4, max: 8 },
  'ChallengeLanding.content.causes': { min: 3, max: 6 },
  'ChallengeLanding.content.strategies': { min: 4, max: 8 },
  'ChallengeLanding.content.professionalResources': { min: 2, max: 5 },
  'ChallengeLanding.content.faqs': { min: 5, max: 8 },

  // AgeGroupLandingSchema
  'AgeGroupLanding.content.strategies': { min: 4, max: 8 },
  'AgeGroupLanding.content.nutritionalPriorities': { min: 3, max: 6 },
  'AgeGroupLanding.content.redFlags': { min: 3, max: 5 },
  'AgeGroupLanding.content.faqs': { min: 5, max: 8 },

  // MealOccasionLandingSchema
  'MealOccasionLanding.content.mealIdeas': { min: 8, max: 15 },
  'MealOccasionLanding.content.strategies': { min: 4, max: 6 },
  'MealOccasionLanding.content.mealPrepTips': { min: 3, max: 5 },
  'MealOccasionLanding.content.scenarioHandling': { min: 2, max: 4 },
  'MealOccasionLanding.content.faqs': { min: 5, max: 8 },

  // Shared SEO constraints
  'seo.secondaryKeywords': { min: 2, max: 5 },
  'seo.internalLinks': { min: 3, max: 8 },
  'seo.breadcrumbs': { min: 2, max: 5 },
  'seo.schemaTypes': { min: 1, max: 3 },

  // Shared building block constraints
  'PseoMealIdea.keyIngredients': { min: 3, max: 8 },
  'PseoMealIdea.nutritionHighlights': { min: 1, max: 3 },
};

/** String length constraints for text fields. Keyed by field path. */
export const PSEO_STRING_CONSTRAINTS: Record<string, { minChars?: number; maxChars?: number; minWords?: number; maxWords?: number }> = {
  'seo.metaDescription': { minChars: 120, maxChars: 160 },
  'seo.primaryKeyword': { minWords: 2, maxWords: 6 },
  'PseoFaqItem.answer': { minWords: 40, maxWords: 120 },
  'PseoHowToStep.name': { minWords: 3, maxWords: 8 },
  'PseoHowToStep.text': { minWords: 20, maxWords: 80 },
  'PseoMealIdea.name': { minWords: 2, maxWords: 6 },
  'PseoMealIdea.description': { minWords: 10, maxWords: 40 },
  'PseoStrategy.title': { minWords: 3, maxWords: 8 },
  'PseoStrategy.description': { minWords: 30, maxWords: 80 },
};
