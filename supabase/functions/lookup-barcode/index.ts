import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import {
  toCatalogRow,
  type BarcodeLookupResult,
} from '../_shared/catalogPromotion.ts';

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

/**
 * What a provider lookup returns: the client-facing shape (unchanged from
 * before US-797, bug-for-bug -- `food.calories` still conflates kJ and kcal
 * where it always did, see the module-level note on lookupOpenFoodFacts)
 * alongside a separate, deliberately stricter shape for catalog promotion.
 * catalogInput is never spread into a response; it exists only so
 * toCatalogRow (supabase/functions/_shared/catalogPromotion.ts) can make a
 * sound decision without inheriting the client shape's unit ambiguity.
 */
interface LookupResult {
  food: FoodNutrition;
  catalogInput: BarcodeLookupResult;
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

async function lookupOpenFoodFacts(barcode: string): Promise<LookupResult | null> {
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

      // catalog promotion (US-797) reads the same nutriments object but keeps
      // the confirmed-kcal field (`energy-kcal_100g`) separate from the
      // unconfirmed-unit one (`energy_value`, frequently kJ) -- see
      // catalogPromotion.ts's module comment. The client-facing `calories`
      // field above is left exactly as it was; this is deliberately not a
      // fix for that field.
      const numberOrNull = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;

      return {
        food: {
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
        },
        catalogInput: {
          source: 'openfoodfacts',
          name: displayName || null,
          brand: brand || null,
          allergens: allergens.length > 0 ? allergens : null,
          caloriesKcal100: numberOrNull(nutriments['energy-kcal_100g']),
          energyValueUnconfirmedUnit: numberOrNull(nutriments.energy_value),
          proteinG100: numberOrNull(nutriments.proteins_100g),
          carbsG100: numberOrNull(nutriments.carbohydrates_100g),
          fatG100: numberOrNull(nutriments.fat_100g),
          fiberG100: numberOrNull(nutriments.fiber_100g),
          sugarG100: numberOrNull(nutriments.sugars_100g),
          // OFF reports sodium_100g in grams per 100g; the catalog column is
          // milligrams per 100g.
          sodiumMg100:
            numberOrNull(nutriments.sodium_100g) !== null
              ? (nutriments.sodium_100g as number) * 1000
              : null,
        },
      };
    }
  } catch (error) {
    console.error("Open Food Facts lookup error:", error);
  }

  return null;
}

async function lookupUSDA(barcode: string): Promise<LookupResult | null> {
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

      // catalog promotion (US-797): only trust a value as confirmed kcal
      // when USDA itself labels the unit KCAL -- `getNutrient('energy')`
      // above matches the first nutrient whose name merely contains
      // "energy", which can be a kJ variant. The client-facing `calories`
      // field is left exactly as it was.
      const getKcalNutrient = (name: string): number | null => {
        const nutrient = nutrients.find(
          (n: any) =>
            n.nutrientName?.toLowerCase().includes(name) &&
            n.unitName?.toUpperCase() === 'KCAL'
        );
        return typeof nutrient?.value === 'number' ? nutrient.value : null;
      };
      // USDA's per-100g nutrients are already in the unit the catalog wants
      // (g for macros, mg for sodium) -- unlike energy, there is no
      // kcal-vs-kJ-style ambiguity to guard against here.
      const getNumericNutrient = (name: string): number | null => {
        const value = getNutrient(name);
        return typeof value === 'number' ? value : null;
      };

      return {
        food: {
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
        },
        catalogInput: {
          source: 'usda',
          name: food.description || null,
          brand: food.brandOwner || food.brandName || null,
          allergens: null,
          caloriesKcal100: getKcalNutrient('energy'),
          energyValueUnconfirmedUnit: null,
          proteinG100: getNumericNutrient('protein'),
          carbsG100: getNumericNutrient('carbohydrate'),
          fatG100: getNumericNutrient('fat'),
          fiberG100: getNumericNutrient('fiber'),
          sugarG100: getNumericNutrient('sugars'),
          sodiumMg100: getNumericNutrient('sodium'),
        },
      };
    }
  } catch (error) {
    console.error("USDA lookup error:", error);
  }

  return null;
}

async function lookupFoodRepo(barcode: string): Promise<LookupResult | null> {
  console.log(`Looking up barcode ${barcode} in FoodRepo...`);

  try {
    // FoodRepo API endpoint (may need adjustment based on actual API)
    const response = await fetch(`https://www.foodrepo.org/api/v3/products/${barcode}`);

    if (response.ok) {
      const data = await response.json();

      const numberOrNull = (value: unknown): number | null =>
        typeof value === 'number' && Number.isFinite(value) ? value : null;

      return {
        food: {
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
        },
        catalogInput: {
          source: 'foodrepo',
          name: data.display_name || null,
          brand: data.brand || null,
          allergens: null,
          // FoodRepo names this field for the unit -- already confirmed kcal.
          caloriesKcal100: numberOrNull(data.nutrients?.energy_kcal),
          energyValueUnconfirmedUnit: null,
          proteinG100: numberOrNull(data.nutrients?.proteins),
          carbsG100: numberOrNull(data.nutrients?.carbohydrates),
          fatG100: numberOrNull(data.nutrients?.fat),
          fiberG100: numberOrNull(data.nutrients?.fibers),
          sugarG100: numberOrNull(data.nutrients?.sugars),
          sodiumMg100:
            numberOrNull(data.nutrients?.sodium) !== null
              ? (data.nutrients.sodium as number) * 1000
              : null,
        },
      };
    }
  } catch (error) {
    console.error("FoodRepo lookup error:", error);
  }

  return null;
}

export default async (req: Request) => {
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

    // STEP 2: Check the shared catalog (US-797) - a product any family
    // already promoted from a provider lookup is found here without a third
    // party call. Checked before the legacy `nutrition` table because it is
    // the table iOS actually reads (see 20260906000000_canonical_food_catalog.sql).
    console.log('Checking shared catalog for barcode...');
    const { data: catalogFood, error: catalogError } = await supabaseClient
      .from('grocery_product_catalog')
      .select('*')
      .eq('barcode', barcode)
      .limit(1)
      .single();

    if (catalogFood && !catalogError) {
      console.log('Found in shared catalog:', catalogFood.name);
      return new Response(
        JSON.stringify({
          success: true,
          food: {
            name: catalogFood.name,
            category: catalogFood.default_category || 'Snack',
            package_quantity: catalogFood.package_size
              ? `${catalogFood.package_size}${catalogFood.package_unit || ''}`
              : undefined,
            calories: catalogFood.calories_kcal_100 ?? undefined,
            protein_g: catalogFood.protein_g_100 ?? undefined,
            carbs_g: catalogFood.carbs_g_100 ?? undefined,
            fat_g: catalogFood.fat_g_100 ?? undefined,
            allergens: catalogFood.allergens ?? undefined,
            source: 'Community Catalog',
            in_pantry: false,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // STEP 3: Check community nutrition database - second fastest
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

    // STEP 4: Search external APIs (Open Food Facts -> USDA -> FoodRepo)
    console.log('Searching external APIs...');
    let result = await lookupOpenFoodFacts(barcode);

    if (!result) {
      result = await lookupUSDA(barcode);
    }

    if (!result) {
      result = await lookupFoodRepo(barcode);
    }

    if (result) {
      const { food, catalogInput } = result;
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

      // US-797: best-effort promotion to the shared catalog. THE RULE THAT
      // OUTRANKS EVERYTHING ELSE HERE -- the caller is a parent standing in
      // a shop adding a food, and this whole block must never change the
      // response they get, however it fails. Everything below is
      // try/caught and its result is logged, never returned or thrown.
      try {
        const catalogRow = toCatalogRow(catalogInput, barcode);

        if (catalogRow) {
          // Link to a generic parent when the normalized name matches one
          // exactly -- no fuzzy matching. No match is a fine outcome; the
          // row is inserted with parent_food_id left null.
          const { data: parentRow } = await supabaseClient
            .from('grocery_product_catalog')
            .select('id')
            .eq('kind', 'generic')
            .eq('name_normalized', catalogRow.name_normalized)
            .limit(1)
            .maybeSingle();

          // Plain insert, not an upsert targeting ON CONFLICT (barcode).
          // grocery_product_catalog_barcode_uq is a PARTIAL unique index
          // (WHERE barcode IS NOT NULL) -- PostgREST's on_conflict target
          // has no way to carry that predicate, so `ON CONFLICT (barcode)`
          // through the client would fail to infer an arbiter index and
          // error on every insert, not just real duplicates. A concurrent
          // second promotion of the same barcode instead hits the unique
          // index as an ordinary 23505 error on this plain insert, which is
          // treated below as "another family already promoted it" rather
          // than a failure worth logging as one.
          const { error: insertError } = await supabaseClient
            .from('grocery_product_catalog')
            .insert({
              ...catalogRow,
              parent_food_id: parentRow?.id ?? null,
            });

          if (insertError && insertError.code !== '23505') {
            console.error('Catalog promotion insert failed (non-fatal):', insertError);
          }
        }
      } catch (promotionError) {
        console.error('Catalog promotion failed (non-fatal):', promotionError);
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
}
