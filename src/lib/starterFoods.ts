import { FoodCategory } from "@/types";

export const starterFoods = [
  // Safe Foods - Proteins
  { name: "Chicken Nuggets", category: "protein" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Hot Dog", category: "protein" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Mac & Cheese", category: "protein" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Peanut Butter", category: "protein" as FoodCategory, is_safe: true, is_try_bite: false, allergens: ["peanuts"] },
  
  // Safe Foods - Carbs
  { name: "White Bread", category: "carb" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Pasta", category: "carb" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Crackers", category: "carb" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "French Fries", category: "carb" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Rice", category: "carb" as FoodCategory, is_safe: true, is_try_bite: false },
  
  // Safe Foods - Dairy
  { name: "Milk", category: "dairy" as FoodCategory, is_safe: true, is_try_bite: false, allergens: ["dairy"] },
  { name: "Cheese", category: "dairy" as FoodCategory, is_safe: true, is_try_bite: false, allergens: ["dairy"] },
  { name: "Yogurt", category: "dairy" as FoodCategory, is_safe: true, is_try_bite: false, allergens: ["dairy"] },
  
  // Safe Foods - Fruits
  { name: "Applesauce", category: "fruit" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Banana", category: "fruit" as FoodCategory, is_safe: true, is_try_bite: false },
  
  // Safe Foods - Snacks
  { name: "Goldfish Crackers", category: "snack" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Pretzels", category: "snack" as FoodCategory, is_safe: true, is_try_bite: false },
  { name: "Graham Crackers", category: "snack" as FoodCategory, is_safe: true, is_try_bite: false },
  
  // Try Bites - Vegetables
  { name: "Carrot Sticks", category: "vegetable" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Cucumber Slices", category: "vegetable" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Cherry Tomatoes", category: "vegetable" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Bell Pepper Strips", category: "vegetable" as FoodCategory, is_safe: false, is_try_bite: true },
  
  // Try Bites - Fruits
  { name: "Strawberries", category: "fruit" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Blueberries", category: "fruit" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Apple Slices", category: "fruit" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Grapes", category: "fruit" as FoodCategory, is_safe: false, is_try_bite: true },
  
  // Try Bites - Proteins
  { name: "Grilled Chicken", category: "protein" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Turkey Slices", category: "protein" as FoodCategory, is_safe: false, is_try_bite: true },
  { name: "Hard Boiled Egg", category: "protein" as FoodCategory, is_safe: false, is_try_bite: true, allergens: ["eggs"] },
];
