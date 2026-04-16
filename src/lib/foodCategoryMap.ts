import type { FoodCategory } from "@/types";

const PROTEIN_KEYWORDS = [
  "beef", "chicken", "turkey", "pork", "lamb", "steak", "ground beef", "ground turkey",
  "sausage", "bacon", "ham", "salami", "pepperoni", "hot dog", "meatball",
  "salmon", "tuna", "shrimp", "cod", "tilapia", "fish", "crab", "lobster", "scallop",
  "egg", "eggs", "tofu", "tempeh", "seitan",
  "bean", "beans", "lentil", "lentils", "chickpea", "chickpeas", "edamame",
  "peanut butter", "almond butter", "protein",
];

const DAIRY_KEYWORDS = [
  "milk", "cheese", "yogurt", "butter", "cream", "sour cream", "cream cheese",
  "mozzarella", "cheddar", "parmesan", "ricotta", "cottage cheese", "feta",
  "whipped cream", "half and half", "ice cream", "kefir",
];

const FRUIT_KEYWORDS = [
  "apple", "banana", "orange", "grape", "strawberry", "blueberry", "raspberry",
  "blackberry", "mango", "pineapple", "watermelon", "cantaloupe", "honeydew",
  "peach", "pear", "plum", "cherry", "kiwi", "lemon", "lime", "grapefruit",
  "avocado", "coconut", "fig", "date", "pomegranate", "tangerine", "clementine",
  "nectarine", "apricot", "papaya", "passion fruit", "guava", "dragonfruit",
  "cranberry", "raisin", "dried fruit",
];

const VEGETABLE_KEYWORDS = [
  "broccoli", "carrot", "spinach", "kale", "lettuce", "tomato", "cucumber",
  "pepper", "bell pepper", "onion", "garlic", "potato", "sweet potato",
  "corn", "pea", "peas", "green bean", "celery", "cauliflower", "zucchini",
  "squash", "mushroom", "asparagus", "artichoke", "brussels sprout",
  "cabbage", "bok choy", "eggplant", "beet", "radish", "turnip", "parsnip",
  "leek", "shallot", "chive", "cilantro", "parsley", "basil", "dill",
  "arugula", "romaine", "mixed greens", "salad", "coleslaw",
];

const CARB_KEYWORDS = [
  "bread", "rice", "pasta", "noodle", "tortilla", "wrap", "pita", "naan",
  "bagel", "muffin", "roll", "bun", "croissant", "biscuit",
  "cereal", "oat", "oatmeal", "granola", "pancake", "waffle", "french toast",
  "cracker", "pretzel", "chip", "chips", "popcorn",
  "flour", "cornmeal", "breadcrumb",
  "quinoa", "couscous", "barley", "farro",
  "mac and cheese", "macaroni",
];

const SNACK_KEYWORDS = [
  "cookie", "brownie", "cake", "cupcake", "donut", "candy", "chocolate",
  "gummy", "fruit snack", "granola bar", "energy bar", "trail mix",
  "pudding", "jello", "gelatin", "popsicle",
  "juice", "juice box", "applesauce", "fruit cup",
  "goldfish", "animal cracker", "graham cracker",
];

const CATEGORY_MAP: [string[], FoodCategory][] = [
  [PROTEIN_KEYWORDS, "protein"],
  [DAIRY_KEYWORDS, "dairy"],
  [FRUIT_KEYWORDS, "fruit"],
  [VEGETABLE_KEYWORDS, "vegetable"],
  [CARB_KEYWORDS, "carb"],
  [SNACK_KEYWORDS, "snack"],
];

export function inferFoodCategory(name: string): FoodCategory {
  const lower = name.toLowerCase().trim();

  for (const [keywords, category] of CATEGORY_MAP) {
    for (const keyword of keywords) {
      if (lower === keyword || lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "snack";
}
