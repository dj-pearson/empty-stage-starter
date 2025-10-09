import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// USDA FoodData Central API key (optional, will use if available)
const USDA_API_KEY = Deno.env.get('USDA_API_KEY');

interface FoodNutrition {
  name: string;
  category: string;
  serving_size?: string;
  package_quantity?: string;
  servings_per_container?: number;
  ingredients?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  allergens?: string[];
  source: string;
}

// Common allergens to detect in ingredients
const COMMON_ALLERGENS = [
  { name: 'peanuts', keywords: ['peanut', 'groundnut', 'arachis'] },
  { name: 'tree nuts', keywords: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia'] },
  { name: 'milk', keywords: ['milk', 'dairy', 'lactose', 'whey', 'casein', 'butter', 'cream', 'cheese'] },
  { name: 'eggs', keywords: ['egg', 'albumin', 'mayonnaise'] },
  { name: 'fish', keywords: ['fish', 'anchovy', 'bass', 'catfish', 'cod', 'flounder', 'salmon', 'tuna'] },
  { name: 'shellfish', keywords: ['crab', 'lobster', 'shrimp', 'prawn', 'crayfish', 'clam', 'oyster', 'scallop', 'mussel'] },
  { name: 'soy', keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso'] },
  { name: 'wheat', keywords: ['wheat', 'gluten', 'flour', 'bread', 'pasta'] },
  { name: 'sesame', keywords: ['sesame', 'tahini'] }
];

function detectAllergensFromText(text: string): string[] {
  if (!text) return [];
  
  const lowerText = text.toLowerCase();
  const foundAllergens = new Set<string>();
  
  for (const allergen of COMMON_ALLERGENS) {
    for (const keyword of allergen.keywords) {
      if (lowerText.includes(keyword)) {
        foundAllergens.add(allergen.name);
        break;
      }
    }
  }
  
  return Array.from(foundAllergens);
}

async function lookupOpenFoodFacts(barcode: string): Promise<FoodNutrition | null> {
  console.log(`Looking up barcode ${barcode} in Open Food Facts...`);
  
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    const data = await response.json();
    
    if (data.status === 1 && data.product) {
      const product = data.product;
      const nutriments = product.nutriments || {};
      
      // Determine category from OFF categories
      let category = "Snack";
      if (product.categories_tags) {
        const tags = product.categories_tags.join(",").toLowerCase();
        if (tags.includes("meat") || tags.includes("fish") || tags.includes("protein")) category = "Protein";
        else if (tags.includes("pasta") || tags.includes("bread") || tags.includes("rice")) category = "Carb";
        else if (tags.includes("dairy") || tags.includes("cheese") || tags.includes("yogurt")) category = "Dairy";
        else if (tags.includes("fruit")) category = "Fruit";
        else if (tags.includes("vegetable")) category = "Veg";
      }
      
      // Extract allergens from tags (primary source)
      let allergens: string[] = [];
      if (product.allergens_tags && product.allergens_tags.length > 0) {
        allergens = product.allergens_tags.map((a: string) => 
          a.replace('en:', '').replace(/-/g, ' ')
        );
      }
      
      // Fallback: detect allergens from ingredients text
      if (allergens.length === 0 && product.ingredients_text) {
        allergens = detectAllergensFromText(product.ingredients_text);
      }
      
      // Also check allergens field
      if (product.allergens) {
        const detectedFromAllergens = detectAllergensFromText(product.allergens);
        allergens = [...new Set([...allergens, ...detectedFromAllergens])];
      }
      
      // Extract servings per container from product data
      let servingsPerContainer: number | undefined;
      if (product.nutriments?.['nutrition-score-fr_serving']) {
        servingsPerContainer = product.nutriments['nutrition-score-fr_serving'];
      } else if (product.product_quantity && product.serving_quantity) {
        // Calculate servings if we have both values
        servingsPerContainer = Math.floor(product.product_quantity / product.serving_quantity);
      }
      
      const brand = (product.brands || product.brand_owner || "").split(",")[0]?.trim();
      const displayName = [brand, product.product_name || product.generic_name].filter(Boolean).join(" ");
      
      return {
        name: displayName || "Unknown Product",
        category,
        serving_size: product.serving_size || product.quantity || undefined,
        package_quantity: product.quantity || product.product_quantity_unit || undefined,
        servings_per_container: servingsPerContainer,
        ingredients: product.ingredients_text || undefined,
        calories: nutriments.energy_value || nutriments['energy-kcal_100g'] || undefined,
        protein_g: nutriments.proteins_100g || nutriments.proteins || undefined,
        carbs_g: nutriments.carbohydrates_100g || nutriments.carbohydrates || undefined,
        fat_g: nutriments.fat_100g || nutriments.fat || undefined,
        allergens: allergens.length > 0 ? allergens : undefined,
        source: "Open Food Facts"
      };
    }
  } catch (error) {
    console.error("Open Food Facts lookup error:", error);
  }
  
  return null;
}

async function lookupUSDA(barcode: string): Promise<FoodNutrition | null> {
  if (!USDA_API_KEY) {
    console.log("USDA API key not configured, skipping...");
    return null;
  }
  
  console.log(`Looking up barcode ${barcode} in USDA FoodData Central...`);
  
  try {
    // Search by GTIN (barcode)
    const searchUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${barcode}&api_key=${USDA_API_KEY}`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.foods && data.foods.length > 0) {
      const food = data.foods[0];
      const nutrients = food.foodNutrients || [];
      
      const getNutrient = (name: string) => {
        const nutrient = nutrients.find((n: any) => n.nutrientName.toLowerCase().includes(name));
        return nutrient?.value;
      };
      
      return {
        name: food.description || "Unknown Product",
        category: food.foodCategory || "Snack",
        serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || ''}` : undefined,
        ingredients: food.ingredients || undefined,
        calories: getNutrient('energy'),
        protein_g: getNutrient('protein'),
        carbs_g: getNutrient('carbohydrate'),
        fat_g: getNutrient('fat'),
        allergens: undefined,
        source: "USDA FoodData Central"
      };
    }
  } catch (error) {
    console.error("USDA lookup error:", error);
  }
  
  return null;
}

async function lookupFoodRepo(barcode: string): Promise<FoodNutrition | null> {
  console.log(`Looking up barcode ${barcode} in FoodRepo...`);
  
  try {
    // FoodRepo API endpoint (may need adjustment based on actual API)
    const response = await fetch(`https://www.foodrepo.org/api/v3/products/${barcode}`);
    
    if (response.ok) {
      const data = await response.json();
      
      return {
        name: data.display_name || "Unknown Product",
        category: "Snack",
        serving_size: data.portion_quantity ? `${data.portion_quantity}${data.portion_unit || ''}` : undefined,
        ingredients: undefined,
        calories: data.nutrients?.energy_kcal || undefined,
        protein_g: data.nutrients?.proteins || undefined,
        carbs_g: data.nutrients?.carbohydrates || undefined,
        fat_g: data.nutrients?.fat || undefined,
        allergens: undefined,
        source: "FoodRepo"
      };
    }
  } catch (error) {
    console.error("FoodRepo lookup error:", error);
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();
    
    if (!barcode) {
      return new Response(
        JSON.stringify({ success: false, error: 'No barcode provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Looking up barcode:', barcode);

    // Create Supabase client for database lookups
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // STEP 1: Check user's pantry first (foods table) - fastest lookup
    console.log('Checking user pantry for barcode...');
    const { data: pantryFood, error: pantryError } = await supabaseClient
      .from('foods')
      .select('*')
      .eq('barcode', barcode)
      .limit(1)
      .single();

    if (pantryFood && !pantryError) {
      console.log('Found in user pantry:', pantryFood.name);
      return new Response(
        JSON.stringify({
          success: true,
          food: {
            name: pantryFood.name,
            category: pantryFood.category,
            package_quantity: pantryFood.package_quantity,
            servings_per_container: pantryFood.servings_per_container,
            allergens: pantryFood.allergens,
            source: 'Your Pantry',
            existing_quantity: pantryFood.quantity,
            existing_unit: pantryFood.unit,
            in_pantry: true,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 2: Check community nutrition database - second fastest
    console.log('Checking nutrition database for barcode...');
    const { data: nutritionFood, error: nutritionError } = await supabaseClient
      .from('nutrition')
      .select('*')
      .eq('barcode', barcode)
      .limit(1)
      .single();

    if (nutritionFood && !nutritionError) {
      console.log('Found in nutrition database:', nutritionFood.name);
      return new Response(
        JSON.stringify({
          success: true,
          food: {
            name: nutritionFood.name,
            category: nutritionFood.category,
            serving_size: nutritionFood.serving_size,
            package_quantity: nutritionFood.package_quantity,
            servings_per_container: nutritionFood.servings_per_container,
            ingredients: nutritionFood.ingredients,
            calories: nutritionFood.calories,
            protein_g: nutritionFood.protein_g,
            carbs_g: nutritionFood.carbs_g,
            fat_g: nutritionFood.fat_g,
            allergens: nutritionFood.allergens,
            source: 'Nutrition Database',
            in_pantry: false,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 3: Search external APIs (Open Food Facts -> USDA -> FoodRepo)
    console.log('Searching external APIs...');
    let food = await lookupOpenFoodFacts(barcode);
    
    if (!food) {
      food = await lookupUSDA(barcode);
    }
    
    if (!food) {
      food = await lookupFoodRepo(barcode);
    }

    if (food) {
      console.log(`Found food: ${food.name} from ${food.source}`);
      
      // Store in nutrition database for future quick lookups
      try {
        await supabaseClient
          .from('nutrition')
          .insert({
            name: food.name,
            category: food.category,
            barcode: barcode,
            serving_size: food.serving_size,
            package_quantity: food.package_quantity,
            servings_per_container: food.servings_per_container,
            ingredients: food.ingredients,
            calories: food.calories,
            protein_g: food.protein_g,
            carbs_g: food.carbs_g,
            fat_g: food.fat_g,
            allergens: food.allergens,
          });
        console.log('Cached in nutrition database for future lookups');
      } catch (cacheError) {
        console.error('Failed to cache in nutrition database:', cacheError);
        // Continue anyway - the lookup succeeded
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          food: { ...food, in_pantry: false }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Product not found in any database' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
    );
  } catch (error) {
    console.error('Error looking up barcode:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
