import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  ingredients?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  allergens?: string[];
  source: string;
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
      
      return {
        name: product.product_name || "Unknown Product",
        category,
        serving_size: product.serving_size || product.quantity || undefined,
        ingredients: product.ingredients_text || undefined,
        calories: nutriments.energy_value || nutriments['energy-kcal_100g'] || undefined,
        protein_g: nutriments.proteins_100g || nutriments.proteins || undefined,
        carbs_g: nutriments.carbohydrates_100g || nutriments.carbohydrates || undefined,
        fat_g: nutriments.fat_100g || nutriments.fat || undefined,
        allergens: product.allergens_tags?.map((a: string) => a.replace('en:', '')) || undefined,
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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();
    
    if (!barcode) {
      return new Response(
        JSON.stringify({ error: "Barcode is required" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up barcode: ${barcode}`);
    
    // Try Open Food Facts first (primary source)
    let result = await lookupOpenFoodFacts(barcode);
    
    // Fallback to USDA if OFF returns nothing
    if (!result) {
      result = await lookupUSDA(barcode);
    }
    
    // Final fallback to FoodRepo
    if (!result) {
      result = await lookupFoodRepo(barcode);
    }
    
    if (result) {
      console.log(`Found food: ${result.name} from ${result.source}`);
      return new Response(
        JSON.stringify({ success: true, food: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log(`No food found for barcode: ${barcode}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Product not found in any database. Please add manually." 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in lookup-barcode function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
