/**
 * Answer lists for the child profile editor. `value` is what is stored on the
 * kids row, so it must not change; `labelKey`/`label` are only what is shown.
 * Keys reuse the ones the old intake questionnaire shipped with.
 */
export interface KidOption {
  value: string;
  labelKey: string;
  label: string;
}

export const DIETARY_RESTRICTIONS: readonly KidOption[] = [
  { value: "vegetarian", labelKey: "kids.intake.restrictions.vegetarian", label: "Vegetarian" },
  { value: "vegan", labelKey: "kids.intake.restrictions.vegan", label: "Vegan" },
  { value: "halal", labelKey: "kids.intake.restrictions.halal", label: "Halal" },
  { value: "kosher", labelKey: "kids.intake.restrictions.kosher", label: "Kosher" },
  { value: "gluten-free", labelKey: "kids.intake.restrictions.glutenFree", label: "Gluten-free" },
  { value: "dairy-free", labelKey: "kids.intake.restrictions.dairyFree", label: "Dairy-free" },
];

export const NUTRITION_CONCERNS: readonly KidOption[] = [
  { value: "Underweight", labelKey: "kids.intake.concerns.underweight", label: "Underweight" },
  { value: "Overweight", labelKey: "kids.intake.concerns.overweight", label: "Overweight" },
  { value: "Iron deficiency", labelKey: "kids.intake.concerns.iron", label: "Iron deficiency" },
  { value: "Constipation", labelKey: "kids.intake.concerns.constipation", label: "Constipation" },
  { value: "Diabetes", labelKey: "kids.intake.concerns.diabetes", label: "Diabetes" },
  { value: "ADHD", labelKey: "kids.intake.concerns.adhd", label: "ADHD" },
];

export const HEALTH_GOALS: readonly KidOption[] = [
  { value: "Increase vegetable intake", labelKey: "kids.intake.goals.vegetables", label: "Increase vegetable intake" },
  { value: "More protein", labelKey: "kids.intake.goals.protein", label: "More protein" },
  { value: "Gain weight", labelKey: "kids.intake.goals.gainWeight", label: "Gain weight" },
  { value: "Better nutrition", labelKey: "kids.intake.goals.nutrition", label: "Better nutrition" },
  { value: "Reduce sugar", labelKey: "kids.intake.goals.sugar", label: "Reduce sugar" },
];

export const EATING_BEHAVIOR: readonly KidOption[] = [
  { value: "wide_variety", labelKey: "kids.intake.behavior.variety.wide", label: "Eats a wide variety (30+ different foods regularly)" },
  { value: "moderate", labelKey: "kids.intake.behavior.variety.moderate", label: "Eats moderately (15-30 foods)" },
  { value: "limited", labelKey: "kids.intake.behavior.variety.limited", label: "Limited variety (10-15 foods)" },
  { value: "very_limited", labelKey: "kids.intake.behavior.variety.veryLimited", label: "Very limited (fewer than 10 foods)" },
];

export const EATING_HABITS: readonly KidOption[] = [
  { value: "Eats the same foods every day", labelKey: "kids.intake.behavior.habits.sameFoods", label: "Eats the same foods every day" },
  { value: "Refuses to try new foods", labelKey: "kids.intake.behavior.habits.refusesNew", label: "Refuses to try new foods" },
  { value: "Gets upset when new foods are presented", labelKey: "kids.intake.behavior.habits.upset", label: "Gets upset when new foods are presented" },
  { value: "Only eats specific brands", labelKey: "kids.intake.behavior.habits.brands", label: "Only eats specific brands" },
  { value: "Food must be prepared a certain way", labelKey: "kids.intake.behavior.habits.prepared", label: "Food must be prepared a certain way" },
  { value: "Refuses mixed foods (foods touching)", labelKey: "kids.intake.behavior.habits.mixed", label: "Refuses mixed foods (foods touching)" },
];

export const WILLINGNESS: readonly KidOption[] = [
  { value: "willing", labelKey: "kids.intake.behavior.willingness.willing", label: "Willing and curious about new foods" },
  { value: "hesitant", labelKey: "kids.intake.behavior.willingness.hesitant", label: "Hesitant but will sometimes try" },
  { value: "very_hesitant", labelKey: "kids.intake.behavior.willingness.veryHesitant", label: "Very hesitant, rarely tries new foods" },
  { value: "refuses", labelKey: "kids.intake.behavior.willingness.refuses", label: "Refuses to try new foods entirely" },
];

export const TEXTURE_LEVELS: readonly KidOption[] = [
  { value: "none", labelKey: "kids.intake.texture.levels.none", label: "No texture issues, eats all textures" },
  { value: "mild", labelKey: "kids.intake.texture.levels.mild", label: "Mild, dislikes 1-2 specific textures" },
  { value: "strong", labelKey: "kids.intake.texture.levels.strong", label: "Strong, avoids several textures" },
  { value: "severe", labelKey: "kids.intake.texture.levels.severe", label: "Severe, texture aversions limit the diet a lot" },
];

export const TEXTURE_DISLIKES: readonly KidOption[] = [
  { value: "Soft/mushy", labelKey: "kids.intake.texture.avoid.mushy", label: "Soft/mushy" },
  { value: "Slimy", labelKey: "kids.intake.texture.avoid.slimy", label: "Slimy" },
  { value: "Crunchy", labelKey: "kids.intake.texture.avoid.crunchy", label: "Crunchy" },
  { value: "Chewy", labelKey: "kids.intake.texture.avoid.chewy", label: "Chewy" },
  { value: "Lumpy", labelKey: "kids.intake.texture.avoid.lumpy", label: "Lumpy" },
  { value: "Wet", labelKey: "kids.intake.texture.avoid.wet", label: "Wet" },
  { value: "Foods touching each other", labelKey: "kids.intake.texture.avoid.touching", label: "Foods touching each other" },
];

export const TEXTURE_LIKES: readonly KidOption[] = [
  { value: "Crunchy", labelKey: "kids.intake.texture.like.crunchy", label: "Crunchy" },
  { value: "Soft", labelKey: "kids.intake.texture.like.soft", label: "Soft" },
  { value: "Smooth", labelKey: "kids.intake.texture.like.smooth", label: "Smooth" },
  { value: "Chewy", labelKey: "kids.intake.texture.like.chewy", label: "Chewy" },
  { value: "Crispy", labelKey: "kids.intake.texture.like.crispy", label: "Crispy" },
];

/** Offered as the parent types a preparation; anything else can be typed too. */
export const PREPARATION_SUGGESTIONS: readonly string[] = [
  "Baked",
  "Roasted",
  "Steamed",
  "Raw",
  "Mashed",
  "Pureed",
  "Grilled",
  "Fried",
  "Plain, no sauce",
  "Sauce on the side",
  "Cut small",
  "Served cold",
];

export const ALLERGY_STATUSES: readonly KidOption[] = [
  { value: "has", labelKey: "kids.intake.allergies.status.has", label: "Has allergies" },
  { value: "none", labelKey: "kids.intake.allergies.status.none", label: "No known allergies" },
  { value: "unsure", labelKey: "kids.intake.allergies.status.unsure", label: "Not sure yet" },
];

export const SEVERITIES: readonly KidOption[] = [
  { value: "mild", labelKey: "kids.intake.allergies.severity.mild", label: "Mild" },
  { value: "moderate", labelKey: "kids.intake.allergies.severity.moderate", label: "Moderate" },
  { value: "severe", labelKey: "kids.intake.allergies.severity.severe", label: "Severe" },
];

export const PICKINESS_LABELS: readonly KidOption[] = [
  { value: "not_picky", labelKey: "kids.intake.pickiness.not_picky", label: "Not picky" },
  { value: "somewhat_picky", labelKey: "kids.intake.pickiness.somewhat_picky", label: "Somewhat picky" },
  { value: "very_picky", labelKey: "kids.intake.pickiness.very_picky", label: "Very picky" },
  { value: "extremely_picky", labelKey: "kids.intake.pickiness.extremely_picky", label: "Extremely picky" },
];

export const GENDERS: readonly KidOption[] = [
  { value: "male", labelKey: "kids.intake.basics.genders.male", label: "Male" },
  { value: "female", labelKey: "kids.intake.basics.genders.female", label: "Female" },
  { value: "other", labelKey: "kids.intake.basics.genders.other", label: "Other" },
  { value: "prefer_not_to_say", labelKey: "kids.intake.basics.genders.preferNot", label: "Prefer not to say" },
];

/**
 * Common foods kids enjoy, tagged with the picker allergens they usually
 * contain, offered as one-tap adds to Safe foods. A tagged food is disabled
 * while the child is allergic to it, so the list cannot contradict the
 * allergy answers.
 */
export const COMMON_FOODS: readonly { name: string; allergens?: readonly string[] }[] = [
  { name: "Apple" }, { name: "Banana" }, { name: "Grapes" }, { name: "Strawberries" },
  { name: "Blueberries" }, { name: "Watermelon" }, { name: "Carrots" }, { name: "Broccoli" },
  { name: "Cucumber" }, { name: "Sweet Potato" }, { name: "Corn" }, { name: "Peas" },
  { name: "Chicken" }, { name: "Turkey" }, { name: "Fish", allergens: ["fish"] },
  { name: "Eggs", allergens: ["eggs"] }, { name: "Beef" }, { name: "Pork" },
  { name: "Pasta", allergens: ["wheat"] }, { name: "Rice" }, { name: "Bread", allergens: ["wheat"] },
  { name: "Oatmeal" }, { name: "Pancakes", allergens: ["eggs"] }, { name: "Waffles" },
  { name: "Cheese", allergens: ["milk"] }, { name: "Yogurt", allergens: ["milk"] },
  { name: "Milk", allergens: ["milk"] }, { name: "Ice Cream", allergens: ["milk"] },
  { name: "Pizza" }, { name: "Nuggets" }, { name: "Mac & Cheese", allergens: ["milk"] },
  { name: "Sandwiches" }, { name: "Burgers" }, { name: "Hot Dogs" },
  { name: "Crackers", allergens: ["wheat"] }, { name: "Pretzels" }, { name: "Cookies" },
  { name: "Fruit Snacks" },
];
