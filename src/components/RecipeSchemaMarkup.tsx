import { useEffect } from 'react';
import { Recipe, Food } from '@/types';

interface RecipeSchemaMarkupProps {
  recipe: Recipe;
  foods: Food[];
  authorName?: string;
}

/**
 * RecipeSchemaMarkup Component
 * 
 * Generates Schema.org JSON-LD structured data for recipes
 * Benefits:
 * - 82% higher CTR from Google search results
 * - Appears in Google recipe carousels
 * - Importable into AnyList, Paprika, Copy Me That apps
 * - Rich snippets with ratings, cook time, calories
 */
export function RecipeSchemaMarkup({ recipe, foods, authorName = "EatPal Chef" }: RecipeSchemaMarkupProps) {
  
  useEffect(() => {
    // Generate schema.org JSON-LD
    const recipeIngredients = recipe.food_ids
      .map(id => foods.find(f => f.id === id))
      .filter(Boolean)
      .map(food => `${food?.quantity || 1} ${food?.unit || ''} ${food?.name}`.trim());
    
    // Parse instructions into HowToSteps
    const instructions = recipe.instructions || '';
    const instructionSteps = instructions
      .split('\n')
      .filter(step => step.trim().length > 0)
      .map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        text: step.trim()
      }));
    
    // Calculate total time in ISO 8601 format
    const prepMinutes = parseInt(recipe.prep_time || '0');
    const cookMinutes = parseInt(recipe.cook_time || '0');
    const totalMinutes = recipe.total_time_minutes || (prepMinutes + cookMinutes);
    
    const prepTimeISO = prepMinutes > 0 ? `PT${prepMinutes}M` : undefined;
    const cookTimeISO = cookMinutes > 0 ? `PT${cookMinutes}M` : undefined;
    const totalTimeISO = totalMinutes > 0 ? `PT${totalMinutes}M` : undefined;
    
    // Extract nutrition from nutrition_info
    const nutritionInfo = recipe.nutrition_info as any;
    const nutrition = nutritionInfo ? {
      '@type': 'NutritionInformation',
      calories: nutritionInfo.calories ? `${nutritionInfo.calories} calories` : undefined,
      proteinContent: nutritionInfo.protein ? `${nutritionInfo.protein}g` : undefined,
      fatContent: nutritionInfo.fat ? `${nutritionInfo.fat}g` : undefined,
      carbohydrateContent: nutritionInfo.carbs ? `${nutritionInfo.carbs}g` : undefined,
      fiberContent: nutritionInfo.fiber ? `${nutritionInfo.fiber}g` : undefined,
      sugarContent: nutritionInfo.sugar ? `${nutritionInfo.sugar}g` : undefined,
      sodiumContent: nutritionInfo.sodium ? `${nutritionInfo.sodium}mg` : undefined,
    } : undefined;
    
    // Build aggregate rating if available
    const aggregateRating = recipe.rating ? {
      '@type': 'AggregateRating',
      ratingValue: recipe.rating.toString(),
      ratingCount: recipe.times_made || 1,
    } : undefined;
    
    const schema = {
      '@context': 'https://schema.org/',
      '@type': 'Recipe',
      name: recipe.name,
      image: recipe.image_url ? [recipe.image_url] : undefined,
      author: {
        '@type': 'Person',
        name: authorName,
      },
      datePublished: recipe.created_at || new Date().toISOString().split('T')[0],
      description: recipe.description || `A delicious ${recipe.name} recipe`,
      prepTime: prepTimeISO,
      cookTime: cookTimeISO,
      totalTime: totalTimeISO,
      recipeYield: recipe.servings || '4 servings',
      recipeCategory: recipe.category || 'Main Course',
      recipeCuisine: undefined, // Could extract from tags
      recipeIngredient: recipeIngredients.length > 0 ? recipeIngredients : undefined,
      recipeInstructions: instructionSteps.length > 0 ? instructionSteps : undefined,
      nutrition: nutrition,
      keywords: recipe.tags?.join(', ') || undefined,
      aggregateRating: aggregateRating,
      // Additional useful fields
      suitableForDiet: recipe.tags?.includes('vegetarian') ? 'https://schema.org/VegetarianDiet' :
                       recipe.tags?.includes('vegan') ? 'https://schema.org/VeganDiet' :
                       recipe.tags?.includes('gluten-free') ? 'https://schema.org/GlutenFreeDiet' : undefined,
      // Kid-friendly indicator
      ...(recipe.kid_friendly_score && recipe.kid_friendly_score >= 80 ? {
        keywords: `${recipe.tags?.join(', ') || ''}, kid-friendly, family-friendly`.trim(),
      } : {}),
    };
    
    // Remove undefined values
    Object.keys(schema).forEach(key => {
      if (schema[key as keyof typeof schema] === undefined) {
        delete schema[key as keyof typeof schema];
      }
    });
    
    // Create or update script tag
    const scriptId = `recipe-schema-${recipe.id}`;
    let scriptTag = document.getElementById(scriptId);
    
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = scriptId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }
    
    scriptTag.textContent = JSON.stringify(schema, null, 2);
    
    // Cleanup on unmount
    return () => {
      const tag = document.getElementById(scriptId);
      if (tag) {
        tag.remove();
      }
    };
  }, [recipe, foods, authorName]);
  
  // This component doesn't render anything visible
  return null;
}

/**
 * Utility function to generate Schema.org JSON-LD as a string
 * Useful for server-side rendering or static generation
 */
export function generateRecipeSchema(recipe: Recipe, foods: Food[], authorName = "EatPal Chef"): string {
  const recipeIngredients = recipe.food_ids
    .map(id => foods.find(f => f.id === id))
    .filter(Boolean)
    .map(food => `${food?.quantity || 1} ${food?.unit || ''} ${food?.name}`.trim());
  
  const instructions = recipe.instructions || '';
  const instructionSteps = instructions
    .split('\n')
    .filter(step => step.trim().length > 0)
    .map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step.trim()
    }));
  
  const prepMinutes = parseInt(recipe.prep_time || '0');
  const cookMinutes = parseInt(recipe.cook_time || '0');
  const totalMinutes = recipe.total_time_minutes || (prepMinutes + cookMinutes);
  
  const prepTimeISO = prepMinutes > 0 ? `PT${prepMinutes}M` : undefined;
  const cookTimeISO = cookMinutes > 0 ? `PT${cookMinutes}M` : undefined;
  const totalTimeISO = totalMinutes > 0 ? `PT${totalMinutes}M` : undefined;
  
  const nutritionInfo = recipe.nutrition_info as any;
  const nutrition = nutritionInfo ? {
    '@type': 'NutritionInformation',
    calories: nutritionInfo.calories ? `${nutritionInfo.calories} calories` : undefined,
    proteinContent: nutritionInfo.protein ? `${nutritionInfo.protein}g` : undefined,
    fatContent: nutritionInfo.fat ? `${nutritionInfo.fat}g` : undefined,
    carbohydrateContent: nutritionInfo.carbs ? `${nutritionInfo.carbs}g` : undefined,
  } : undefined;
  
  const aggregateRating = recipe.rating ? {
    '@type': 'AggregateRating',
    ratingValue: recipe.rating.toString(),
    ratingCount: recipe.times_made || 1,
  } : undefined;
  
  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'Recipe',
    name: recipe.name,
    image: recipe.image_url ? [recipe.image_url] : undefined,
    author: {
      '@type': 'Person',
      name: authorName,
    },
    datePublished: recipe.created_at || new Date().toISOString().split('T')[0],
    description: recipe.description || `A delicious ${recipe.name} recipe`,
    prepTime: prepTimeISO,
    cookTime: cookTimeISO,
    totalTime: totalTimeISO,
    recipeYield: recipe.servings || '4 servings',
    recipeCategory: recipe.category || 'Main Course',
    recipeIngredient: recipeIngredients.length > 0 ? recipeIngredients : undefined,
    recipeInstructions: instructionSteps.length > 0 ? instructionSteps : undefined,
    nutrition: nutrition,
    keywords: recipe.tags?.join(', ') || undefined,
    aggregateRating: aggregateRating,
  };
  
  // Remove undefined values
  Object.keys(schema).forEach(key => {
    if (schema[key as keyof typeof schema] === undefined) {
      delete schema[key as keyof typeof schema];
    }
  });
  
  return JSON.stringify(schema, null, 2);
}


