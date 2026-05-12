#!/usr/bin/env node
/**
 * US-302 seed builder.
 *
 * The canonical source is the inline data in this script (categorized
 * arrays - easy to edit, reorder, add to). Running this regenerates:
 *
 *   1. supabase/seed/ingredients.json        - human/tool-readable
 *   2. supabase/migrations/<ts>_seed_ingredients.sql - applied seed
 *
 * Rerun whenever you add or rename ingredients. The migration uses
 * ON CONFLICT (slug) DO NOTHING so re-applying is safe; renames that
 * also change the slug create a new row and orphan the old one (use
 * US-306 admin tooling to merge if you need that).
 *
 * Slug rules (enforced by validation below):
 *   - kebab-case, [a-z0-9-]
 *   - immutable once published (slug is the stable identifier)
 *   - no leading/trailing dashes, no double-dashes
 */
const fs = require('fs');
const path = require('path');

// Default units per category - overridable per-ingredient.
const DEFAULT_UNIT = {
  produce: 'piece',
  protein: 'pound',
  dairy: 'container',
  grain: 'bag',
  pantry: 'bottle',
  spice: 'jar',
  baking: 'bag',
  frozen: 'bag',
  canned: 'can',
  beverage: 'bottle',
  snack: 'bag',
};

// `unit` is omitted unless it differs from DEFAULT_UNIT[category].
const ingredients = [
  // ============ produce ============
  { c: 'produce', name: 'Apple', slug: 'apple' },
  { c: 'produce', name: 'Banana', slug: 'banana', unit: 'bunch' },
  { c: 'produce', name: 'Orange', slug: 'orange' },
  { c: 'produce', name: 'Lemon', slug: 'lemon' },
  { c: 'produce', name: 'Lime', slug: 'lime' },
  { c: 'produce', name: 'Grape', slug: 'grape', unit: 'pound' },
  { c: 'produce', name: 'Strawberry', slug: 'strawberry', unit: 'pint' },
  { c: 'produce', name: 'Blueberry', slug: 'blueberry', unit: 'pint' },
  { c: 'produce', name: 'Raspberry', slug: 'raspberry', unit: 'pint' },
  { c: 'produce', name: 'Blackberry', slug: 'blackberry', unit: 'pint' },
  { c: 'produce', name: 'Pineapple', slug: 'pineapple' },
  { c: 'produce', name: 'Mango', slug: 'mango' },
  { c: 'produce', name: 'Peach', slug: 'peach' },
  { c: 'produce', name: 'Pear', slug: 'pear' },
  { c: 'produce', name: 'Plum', slug: 'plum' },
  { c: 'produce', name: 'Cherry', slug: 'cherry', unit: 'pound' },
  { c: 'produce', name: 'Kiwi', slug: 'kiwi' },
  { c: 'produce', name: 'Watermelon', slug: 'watermelon' },
  { c: 'produce', name: 'Cantaloupe', slug: 'cantaloupe' },
  { c: 'produce', name: 'Honeydew', slug: 'honeydew' },
  { c: 'produce', name: 'Avocado', slug: 'avocado' },
  { c: 'produce', name: 'Tomato', slug: 'tomato' },
  { c: 'produce', name: 'Cherry Tomato', slug: 'cherry-tomato', unit: 'pint' },
  { c: 'produce', name: 'Roma Tomato', slug: 'roma-tomato' },
  { c: 'produce', name: 'Cucumber', slug: 'cucumber' },
  { c: 'produce', name: 'Bell Pepper', slug: 'bell-pepper' },
  { c: 'produce', name: 'Jalapeno', slug: 'jalapeno' },
  { c: 'produce', name: 'Onion', slug: 'onion' },
  { c: 'produce', name: 'Red Onion', slug: 'red-onion' },
  { c: 'produce', name: 'Shallot', slug: 'shallot' },
  { c: 'produce', name: 'Garlic', slug: 'garlic', unit: 'head' },
  { c: 'produce', name: 'Ginger', slug: 'ginger', unit: 'piece' },
  { c: 'produce', name: 'Carrot', slug: 'carrot', unit: 'pound' },
  { c: 'produce', name: 'Celery', slug: 'celery', unit: 'bunch' },
  { c: 'produce', name: 'Lettuce', slug: 'lettuce', unit: 'head' },
  { c: 'produce', name: 'Romaine', slug: 'romaine', unit: 'head' },
  { c: 'produce', name: 'Spinach', slug: 'spinach', unit: 'bag' },
  { c: 'produce', name: 'Kale', slug: 'kale', unit: 'bunch' },
  { c: 'produce', name: 'Arugula', slug: 'arugula', unit: 'bag' },
  { c: 'produce', name: 'Cabbage', slug: 'cabbage', unit: 'head' },
  { c: 'produce', name: 'Broccoli', slug: 'broccoli', unit: 'head' },
  { c: 'produce', name: 'Cauliflower', slug: 'cauliflower', unit: 'head' },
  { c: 'produce', name: 'Brussels Sprouts', slug: 'brussels-sprout', unit: 'pound' },
  { c: 'produce', name: 'Asparagus', slug: 'asparagus', unit: 'bunch' },
  { c: 'produce', name: 'Green Beans', slug: 'green-bean', unit: 'pound' },
  { c: 'produce', name: 'Snap Peas', slug: 'snap-pea', unit: 'pound' },
  { c: 'produce', name: 'Sweet Corn', slug: 'sweet-corn', unit: 'piece' },
  { c: 'produce', name: 'Potato', slug: 'potato', unit: 'pound' },
  { c: 'produce', name: 'Sweet Potato', slug: 'sweet-potato', unit: 'pound' },
  { c: 'produce', name: 'Zucchini', slug: 'zucchini' },
  { c: 'produce', name: 'Yellow Squash', slug: 'yellow-squash' },
  { c: 'produce', name: 'Butternut Squash', slug: 'butternut-squash' },
  { c: 'produce', name: 'Mushroom', slug: 'mushroom', unit: 'package' },
  { c: 'produce', name: 'Eggplant', slug: 'eggplant' },
  { c: 'produce', name: 'Radish', slug: 'radish', unit: 'bunch' },
  { c: 'produce', name: 'Beet', slug: 'beet', unit: 'bunch' },
  { c: 'produce', name: 'Turnip', slug: 'turnip', unit: 'pound' },

  // ============ protein ============
  { c: 'protein', name: 'Chicken Breast', slug: 'chicken-breast' },
  { c: 'protein', name: 'Chicken Thigh', slug: 'chicken-thigh' },
  { c: 'protein', name: 'Whole Chicken', slug: 'whole-chicken', unit: 'piece' },
  { c: 'protein', name: 'Ground Beef', slug: 'ground-beef' },
  { c: 'protein', name: 'Beef Steak', slug: 'beef-steak' },
  { c: 'protein', name: 'Pork Chop', slug: 'pork-chop' },
  { c: 'protein', name: 'Pork Loin', slug: 'pork-loin' },
  { c: 'protein', name: 'Bacon', slug: 'bacon', unit: 'package' },
  { c: 'protein', name: 'Sausage', slug: 'sausage', unit: 'package' },
  { c: 'protein', name: 'Ham', slug: 'ham' },
  { c: 'protein', name: 'Turkey Breast', slug: 'turkey-breast' },
  { c: 'protein', name: 'Ground Turkey', slug: 'ground-turkey' },
  { c: 'protein', name: 'Salmon', slug: 'salmon' },
  { c: 'protein', name: 'Tuna', slug: 'tuna' },
  { c: 'protein', name: 'Shrimp', slug: 'shrimp' },
  { c: 'protein', name: 'Cod', slug: 'cod' },
  { c: 'protein', name: 'Tilapia', slug: 'tilapia' },
  { c: 'protein', name: 'Scallop', slug: 'scallop' },
  { c: 'protein', name: 'Crab', slug: 'crab' },
  { c: 'protein', name: 'Eggs', slug: 'egg', unit: 'dozen' },
  { c: 'protein', name: 'Tofu', slug: 'tofu', unit: 'package' },
  { c: 'protein', name: 'Tempeh', slug: 'tempeh', unit: 'package' },
  { c: 'protein', name: 'Black Beans', slug: 'beans-black', unit: 'can' },
  { c: 'protein', name: 'Pinto Beans', slug: 'beans-pinto', unit: 'can' },
  { c: 'protein', name: 'Kidney Beans', slug: 'beans-kidney', unit: 'can' },
  { c: 'protein', name: 'Lentils', slug: 'lentil', unit: 'bag' },
  { c: 'protein', name: 'Chickpeas', slug: 'chickpea', unit: 'can' },

  // ============ dairy ============
  { c: 'dairy', name: 'Milk', slug: 'milk', unit: 'gallon' },
  { c: 'dairy', name: 'Skim Milk', slug: 'milk-skim', unit: 'gallon' },
  { c: 'dairy', name: 'Whole Milk', slug: 'milk-whole', unit: 'gallon' },
  { c: 'dairy', name: 'Almond Milk', slug: 'almond-milk', unit: 'carton' },
  { c: 'dairy', name: 'Oat Milk', slug: 'oat-milk', unit: 'carton' },
  { c: 'dairy', name: 'Soy Milk', slug: 'soy-milk', unit: 'carton' },
  { c: 'dairy', name: 'Cheddar Cheese', slug: 'cheese-cheddar', unit: 'block' },
  { c: 'dairy', name: 'Mozzarella Cheese', slug: 'cheese-mozzarella', unit: 'bag' },
  { c: 'dairy', name: 'Parmesan Cheese', slug: 'cheese-parmesan', unit: 'container' },
  { c: 'dairy', name: 'Cream Cheese', slug: 'cheese-cream', unit: 'block' },
  { c: 'dairy', name: 'Feta Cheese', slug: 'cheese-feta', unit: 'container' },
  { c: 'dairy', name: 'Yogurt', slug: 'yogurt', unit: 'container' },
  { c: 'dairy', name: 'Greek Yogurt', slug: 'greek-yogurt', unit: 'container' },
  { c: 'dairy', name: 'Butter', slug: 'butter', unit: 'pound' },
  { c: 'dairy', name: 'Sour Cream', slug: 'sour-cream', unit: 'container' },
  { c: 'dairy', name: 'Heavy Cream', slug: 'heavy-cream', unit: 'carton' },
  { c: 'dairy', name: 'Half and Half', slug: 'half-and-half', unit: 'carton' },
  { c: 'dairy', name: 'Cottage Cheese', slug: 'cottage-cheese', unit: 'container' },

  // ============ grain ============
  { c: 'grain', name: 'White Rice', slug: 'rice-white' },
  { c: 'grain', name: 'Brown Rice', slug: 'rice-brown' },
  { c: 'grain', name: 'Jasmine Rice', slug: 'rice-jasmine' },
  { c: 'grain', name: 'Basmati Rice', slug: 'rice-basmati' },
  { c: 'grain', name: 'Pasta', slug: 'pasta', unit: 'box' },
  { c: 'grain', name: 'Spaghetti', slug: 'spaghetti', unit: 'box' },
  { c: 'grain', name: 'Penne', slug: 'penne', unit: 'box' },
  { c: 'grain', name: 'Macaroni', slug: 'macaroni', unit: 'box' },
  { c: 'grain', name: 'Linguine', slug: 'linguine', unit: 'box' },
  { c: 'grain', name: 'Lasagna Noodles', slug: 'lasagna-noodles', unit: 'box' },
  { c: 'grain', name: 'Bread', slug: 'bread', unit: 'loaf' },
  { c: 'grain', name: 'Whole Wheat Bread', slug: 'bread-whole-wheat', unit: 'loaf' },
  { c: 'grain', name: 'Bagels', slug: 'bagel', unit: 'pack' },
  { c: 'grain', name: 'English Muffins', slug: 'english-muffin', unit: 'pack' },
  { c: 'grain', name: 'Flour Tortillas', slug: 'tortilla-flour', unit: 'pack' },
  { c: 'grain', name: 'Corn Tortillas', slug: 'tortilla-corn', unit: 'pack' },
  { c: 'grain', name: 'Quinoa', slug: 'quinoa' },
  { c: 'grain', name: 'Oats', slug: 'oats', unit: 'container' },
  { c: 'grain', name: 'Cereal', slug: 'cereal', unit: 'box' },
  { c: 'grain', name: 'Granola', slug: 'granola', unit: 'bag' },
  { c: 'grain', name: 'Breadcrumbs', slug: 'breadcrumbs', unit: 'container' },
  { c: 'grain', name: 'Couscous', slug: 'couscous', unit: 'box' },

  // ============ pantry ============
  { c: 'pantry', name: 'Olive Oil', slug: 'olive-oil' },
  { c: 'pantry', name: 'Vegetable Oil', slug: 'vegetable-oil' },
  { c: 'pantry', name: 'Canola Oil', slug: 'canola-oil' },
  { c: 'pantry', name: 'Coconut Oil', slug: 'coconut-oil', unit: 'jar' },
  { c: 'pantry', name: 'Sesame Oil', slug: 'sesame-oil' },
  { c: 'pantry', name: 'White Vinegar', slug: 'vinegar-white' },
  { c: 'pantry', name: 'Apple Cider Vinegar', slug: 'vinegar-apple-cider' },
  { c: 'pantry', name: 'Balsamic Vinegar', slug: 'vinegar-balsamic' },
  { c: 'pantry', name: 'Rice Vinegar', slug: 'vinegar-rice' },
  { c: 'pantry', name: 'Soy Sauce', slug: 'soy-sauce' },
  { c: 'pantry', name: 'Fish Sauce', slug: 'fish-sauce' },
  { c: 'pantry', name: 'Worcestershire Sauce', slug: 'worcestershire-sauce' },
  { c: 'pantry', name: 'Hot Sauce', slug: 'hot-sauce' },
  { c: 'pantry', name: 'Ketchup', slug: 'ketchup' },
  { c: 'pantry', name: 'Mustard', slug: 'mustard' },
  { c: 'pantry', name: 'Dijon Mustard', slug: 'mustard-dijon' },
  { c: 'pantry', name: 'Mayonnaise', slug: 'mayonnaise', unit: 'jar' },
  { c: 'pantry', name: 'Ranch Dressing', slug: 'ranch-dressing' },
  { c: 'pantry', name: 'BBQ Sauce', slug: 'bbq-sauce' },
  { c: 'pantry', name: 'Sriracha', slug: 'sriracha' },
  { c: 'pantry', name: 'Tomato Sauce', slug: 'tomato-sauce', unit: 'can' },
  { c: 'pantry', name: 'Tomato Paste', slug: 'tomato-paste', unit: 'can' },
  { c: 'pantry', name: 'Marinara Sauce', slug: 'marinara', unit: 'jar' },
  { c: 'pantry', name: 'Pesto', slug: 'pesto', unit: 'jar' },
  { c: 'pantry', name: 'Salsa', slug: 'salsa', unit: 'jar' },
  { c: 'pantry', name: 'Peanut Butter', slug: 'peanut-butter', unit: 'jar' },
  { c: 'pantry', name: 'Almond Butter', slug: 'almond-butter', unit: 'jar' },
  { c: 'pantry', name: 'Jam', slug: 'jam', unit: 'jar' },
  { c: 'pantry', name: 'Honey', slug: 'honey', unit: 'jar' },
  { c: 'pantry', name: 'Maple Syrup', slug: 'maple-syrup' },
  { c: 'pantry', name: 'Chicken Broth', slug: 'broth-chicken', unit: 'carton' },
  { c: 'pantry', name: 'Vegetable Broth', slug: 'broth-vegetable', unit: 'carton' },
  { c: 'pantry', name: 'Beef Broth', slug: 'broth-beef', unit: 'carton' },

  // ============ spice ============
  { c: 'spice', name: 'Salt', slug: 'salt', unit: 'container' },
  { c: 'spice', name: 'Black Pepper', slug: 'pepper-black' },
  { c: 'spice', name: 'Garlic Powder', slug: 'garlic-powder' },
  { c: 'spice', name: 'Onion Powder', slug: 'onion-powder' },
  { c: 'spice', name: 'Paprika', slug: 'paprika' },
  { c: 'spice', name: 'Smoked Paprika', slug: 'paprika-smoked' },
  { c: 'spice', name: 'Cumin', slug: 'cumin' },
  { c: 'spice', name: 'Chili Powder', slug: 'chili-powder' },
  { c: 'spice', name: 'Cayenne', slug: 'cayenne' },
  { c: 'spice', name: 'Dried Oregano', slug: 'oregano-dried' },
  { c: 'spice', name: 'Dried Basil', slug: 'basil-dried' },
  { c: 'spice', name: 'Dried Thyme', slug: 'thyme-dried' },
  { c: 'spice', name: 'Dried Rosemary', slug: 'rosemary-dried' },
  { c: 'spice', name: 'Sage', slug: 'sage' },
  { c: 'spice', name: 'Bay Leaf', slug: 'bay-leaf' },
  { c: 'spice', name: 'Cinnamon', slug: 'cinnamon' },
  { c: 'spice', name: 'Nutmeg', slug: 'nutmeg' },
  { c: 'spice', name: 'Ground Ginger', slug: 'ginger-ground' },
  { c: 'spice', name: 'Cloves', slug: 'cloves' },
  { c: 'spice', name: 'Cardamom', slug: 'cardamom' },
  { c: 'spice', name: 'Allspice', slug: 'allspice' },
  { c: 'spice', name: 'Italian Seasoning', slug: 'italian-seasoning' },
  { c: 'spice', name: 'Taco Seasoning', slug: 'taco-seasoning', unit: 'packet' },
  { c: 'spice', name: 'Ranch Seasoning', slug: 'ranch-seasoning', unit: 'packet' },
  { c: 'spice', name: 'Dill', slug: 'dill' },
  { c: 'spice', name: 'Turmeric', slug: 'turmeric' },
  { c: 'spice', name: 'Ground Coriander', slug: 'coriander' },
  { c: 'spice', name: 'Red Pepper Flakes', slug: 'red-pepper-flakes' },
  { c: 'spice', name: 'Dried Parsley', slug: 'parsley-dried' },
  { c: 'spice', name: 'Fresh Basil', slug: 'basil-fresh', unit: 'bunch' },
  { c: 'spice', name: 'Fresh Parsley', slug: 'parsley-fresh', unit: 'bunch' },
  { c: 'spice', name: 'Fresh Cilantro', slug: 'cilantro-fresh', unit: 'bunch' },
  { c: 'spice', name: 'Fresh Mint', slug: 'mint-fresh', unit: 'bunch' },
  { c: 'spice', name: 'Vanilla Extract', slug: 'vanilla-extract', unit: 'bottle' },

  // ============ baking ============
  { c: 'baking', name: 'All-Purpose Flour', slug: 'flour-all-purpose' },
  { c: 'baking', name: 'Bread Flour', slug: 'flour-bread' },
  { c: 'baking', name: 'Whole Wheat Flour', slug: 'flour-whole-wheat' },
  { c: 'baking', name: 'Almond Flour', slug: 'flour-almond' },
  { c: 'baking', name: 'White Sugar', slug: 'sugar-white' },
  { c: 'baking', name: 'Brown Sugar', slug: 'sugar-brown' },
  { c: 'baking', name: 'Powdered Sugar', slug: 'sugar-powdered' },
  { c: 'baking', name: 'Baking Powder', slug: 'baking-powder', unit: 'container' },
  { c: 'baking', name: 'Baking Soda', slug: 'baking-soda', unit: 'box' },
  { c: 'baking', name: 'Active Dry Yeast', slug: 'yeast', unit: 'packet' },
  { c: 'baking', name: 'Chocolate Chips', slug: 'chocolate-chips' },
  { c: 'baking', name: 'Cocoa Powder', slug: 'cocoa-powder', unit: 'container' },
  { c: 'baking', name: 'Cornstarch', slug: 'cornstarch', unit: 'box' },
  { c: 'baking', name: 'Sweetened Condensed Milk', slug: 'milk-condensed', unit: 'can' },
  { c: 'baking', name: 'Evaporated Milk', slug: 'milk-evaporated', unit: 'can' },

  // ============ frozen ============
  { c: 'frozen', name: 'Frozen Peas', slug: 'frozen-peas' },
  { c: 'frozen', name: 'Frozen Corn', slug: 'frozen-corn' },
  { c: 'frozen', name: 'Frozen Broccoli', slug: 'frozen-broccoli' },
  { c: 'frozen', name: 'Frozen Spinach', slug: 'frozen-spinach' },
  { c: 'frozen', name: 'Frozen Mixed Vegetables', slug: 'frozen-mixed-vegetables' },
  { c: 'frozen', name: 'Frozen Berries', slug: 'frozen-berries' },
  { c: 'frozen', name: 'Frozen Pizza', slug: 'frozen-pizza', unit: 'box' },
  { c: 'frozen', name: 'Frozen French Fries', slug: 'frozen-french-fries' },
  { c: 'frozen', name: 'Ice Cream', slug: 'ice-cream', unit: 'container' },
  { c: 'frozen', name: 'Frozen Chicken Nuggets', slug: 'frozen-chicken-nuggets' },
  { c: 'frozen', name: 'Frozen Meatballs', slug: 'frozen-meatballs' },
  { c: 'frozen', name: 'Frozen Waffles', slug: 'frozen-waffles', unit: 'box' },

  // ============ canned ============
  { c: 'canned', name: 'Canned Diced Tomatoes', slug: 'canned-tomatoes-diced' },
  { c: 'canned', name: 'Canned Crushed Tomatoes', slug: 'canned-tomatoes-crushed' },
  { c: 'canned', name: 'Canned Tuna', slug: 'canned-tuna' },
  { c: 'canned', name: 'Canned Chicken', slug: 'canned-chicken' },
  { c: 'canned', name: 'Canned Soup', slug: 'canned-soup' },
  { c: 'canned', name: 'Canned Pumpkin', slug: 'canned-pumpkin' },
  { c: 'canned', name: 'Canned Coconut Milk', slug: 'canned-coconut-milk' },
  { c: 'canned', name: 'Canned Pineapple', slug: 'canned-pineapple' },
  { c: 'canned', name: 'Canned Corn', slug: 'canned-corn' },
  { c: 'canned', name: 'Canned Green Beans', slug: 'canned-green-beans' },
  { c: 'canned', name: 'Olives', slug: 'olives', unit: 'jar' },

  // ============ beverage ============
  { c: 'beverage', name: 'Coffee', slug: 'coffee', unit: 'bag' },
  { c: 'beverage', name: 'Tea', slug: 'tea', unit: 'box' },
  { c: 'beverage', name: 'Orange Juice', slug: 'juice-orange', unit: 'carton' },
  { c: 'beverage', name: 'Apple Juice', slug: 'juice-apple', unit: 'carton' },
  { c: 'beverage', name: 'Soda', slug: 'soda' },
  { c: 'beverage', name: 'Sparkling Water', slug: 'sparkling-water', unit: 'pack' },

  // ============ snack ============
  { c: 'snack', name: 'Crackers', slug: 'crackers', unit: 'box' },
  { c: 'snack', name: 'Potato Chips', slug: 'chips-potato' },
  { c: 'snack', name: 'Tortilla Chips', slug: 'chips-tortilla' },
  { c: 'snack', name: 'Pretzels', slug: 'pretzels' },
  { c: 'snack', name: 'Popcorn', slug: 'popcorn', unit: 'box' },
  { c: 'snack', name: 'Almonds', slug: 'nuts-almond' },
  { c: 'snack', name: 'Cashews', slug: 'nuts-cashew' },
  { c: 'snack', name: 'Peanuts', slug: 'nuts-peanut' },
  { c: 'snack', name: 'Walnuts', slug: 'nuts-walnut' },
  { c: 'snack', name: 'Raisins', slug: 'raisin', unit: 'container' },
  { c: 'snack', name: 'Granola Bars', slug: 'granola-bars', unit: 'box' },
  { c: 'snack', name: 'Trail Mix', slug: 'trail-mix' },
];

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------
const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const seenSlugs = new Set();
const errors = [];

for (const item of ingredients) {
  if (!slugPattern.test(item.slug)) {
    errors.push(`Bad slug shape: ${item.slug}`);
  }
  if (seenSlugs.has(item.slug)) {
    errors.push(`Duplicate slug: ${item.slug}`);
  }
  seenSlugs.add(item.slug);
  if (!DEFAULT_UNIT[item.c]) {
    errors.push(`Unknown category for ${item.slug}: ${item.c}`);
  }
}

if (errors.length > 0) {
  console.error('Validation errors:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build outputs
// ---------------------------------------------------------------------------
const json = ingredients.map(i => ({
  slug: i.slug,
  name: i.name,
  category: i.c,
  default_unit: i.unit ?? DEFAULT_UNIT[i.c],
}));

// Sort: by category, then by slug, for deterministic diffs.
json.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.slug.localeCompare(b.slug);
});

const ROOT = path.resolve(__dirname, '..');
const jsonPath = path.join(ROOT, 'supabase', 'seed', 'ingredients.json');
const sqlPath = path.join(ROOT, 'supabase', 'migrations', '20260516000001_seed_ingredients.sql');

fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n');

function sqlEscape(s) {
  return "'" + s.replace(/'/g, "''") + "'";
}

const valuesLines = json.map(
  (i) =>
    `  (${sqlEscape(i.slug)}, ${sqlEscape(i.name)}, ${sqlEscape(i.category)}, ${sqlEscape(i.default_unit)})`
).join(',\n');

const sql = `-- US-302 seed: canonical ingredient catalog (${json.length} entries).
--
-- Generated from supabase/seed/ingredients.json via
-- scripts/build-ingredients-seed.cjs. To add or edit ingredients, modify
-- the array in the build script and re-run; do NOT edit this file by hand.
--
-- ON CONFLICT (slug) DO NOTHING makes re-application safe.
INSERT INTO public.ingredients (slug, name, category, default_unit) VALUES
${valuesLines}
ON CONFLICT (slug) DO NOTHING;
`;

fs.writeFileSync(sqlPath, sql);

console.log(`Wrote ${json.length} ingredients to:`);
console.log('  ' + path.relative(ROOT, jsonPath));
console.log('  ' + path.relative(ROOT, sqlPath));

const byCategory = json.reduce((acc, i) => {
  acc[i.category] = (acc[i.category] ?? 0) + 1;
  return acc;
}, {});
console.log('');
console.log('By category:');
Object.entries(byCategory)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, n]) => console.log(`  ${cat.padEnd(10)} ${n}`));
