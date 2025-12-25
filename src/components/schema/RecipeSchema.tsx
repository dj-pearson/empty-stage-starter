/**
 * Recipe Schema Component
 *
 * Implements schema.org Recipe for food/meal content SEO.
 * Enables rich recipe cards in Google Search with:
 * - Recipe image
 * - Star ratings
 * - Preparation/cook time
 * - Calories
 * - Ingredients list
 * - Step-by-step instructions
 *
 * Reference: https://schema.org/Recipe
 * Google Docs: https://developers.google.com/search/docs/appearance/structured-data/recipe
 *
 * Usage:
 * ```tsx
 * <RecipeSchema
 *   name="Kid-Friendly Mac & Cheese Bites"
 *   description="Easy bite-sized mac and cheese perfect for picky eaters"
 *   image="https://tryeatpal.com/recipes/mac-cheese-bites.jpg"
 *   prepTime="PT15M"
 *   cookTime="PT20M"
 *   totalTime="PT35M"
 *   recipeYield="24 bites"
 *   recipeCategory="Snack"
 *   recipeCuisine="American"
 *   calories={120}
 *   ingredients={[
 *     "2 cups cooked macaroni",
 *     "1 cup shredded cheddar cheese",
 *     "1/2 cup breadcrumbs"
 *   ]}
 *   instructions={[
 *     { text: "Preheat oven to 350°F" },
 *     { text: "Mix macaroni with cheese" },
 *     { text: "Form into bite-sized balls" },
 *     { text: "Bake for 20 minutes" }
 *   ]}
 *   rating={{ value: 4.8, count: 127 }}
 * />
 * ```
 */

import { useEffect } from 'react';

export interface RecipeInstruction {
  /** The instruction text (e.g., "Mix all ingredients together") */
  text: string;
  /** Optional name for this step (e.g., "Mix dry ingredients") */
  name?: string;
  /** Optional image URL for this step */
  image?: string;
  /** Optional URL to a video for this step */
  url?: string;
}

export interface RecipeNutrition {
  /** Calories per serving */
  calories?: number;
  /** Protein in grams */
  proteinContent?: number;
  /** Carbohydrates in grams */
  carbohydrateContent?: number;
  /** Fat in grams */
  fatContent?: number;
  /** Saturated fat in grams */
  saturatedFatContent?: number;
  /** Sodium in milligrams */
  sodiumContent?: number;
  /** Fiber in grams */
  fiberContent?: number;
  /** Sugar in grams */
  sugarContent?: number;
  /** Cholesterol in milligrams */
  cholesterolContent?: number;
  /** Serving size (e.g., "1 cup", "2 pieces") */
  servingSize?: string;
}

export interface RecipeRating {
  /** Average rating value (1-5) */
  value: number;
  /** Number of ratings */
  count: number;
  /** Best possible rating (default: 5) */
  bestRating?: number;
  /** Worst possible rating (default: 1) */
  worstRating?: number;
}

export interface RecipeSchemaProps {
  /** The name of the recipe */
  name: string;
  /** A description of the recipe */
  description: string;
  /** URL(s) to the recipe image(s). Single URL or array of URLs */
  image: string | string[];
  /** The time it takes to prepare the recipe in ISO 8601 format (e.g., PT15M) */
  prepTime?: string;
  /** The time it takes to cook the recipe in ISO 8601 format (e.g., PT30M) */
  cookTime?: string;
  /** The total time required for the recipe in ISO 8601 format (e.g., PT45M) */
  totalTime?: string;
  /** The quantity produced by the recipe (e.g., "4 servings", "12 cookies") */
  recipeYield?: string | number;
  /** The category of the recipe (e.g., "Dinner", "Snack", "Dessert") */
  recipeCategory?: string;
  /** The cuisine of the recipe (e.g., "American", "Italian", "Mexican") */
  recipeCuisine?: string;
  /** The keywords/tags for the recipe (e.g., "picky eater friendly", "gluten-free") */
  keywords?: string | string[];
  /** List of ingredients */
  ingredients: string[];
  /** Step-by-step cooking instructions */
  instructions: RecipeInstruction[] | string[];
  /** Optional nutrition information */
  nutrition?: RecipeNutrition;
  /** Optional aggregate rating */
  rating?: RecipeRating;
  /** Optional author information */
  author?: {
    name: string;
    url?: string;
  };
  /** Optional date the recipe was published in ISO 8601 format */
  datePublished?: string;
  /** Optional suitability for special diets (e.g., "GlutenFreeDiet", "VeganDiet") */
  suitableForDiet?: string[];
  /** Optional allergen warnings (e.g., "Dairy", "Nuts") */
  allergens?: string[];
  /** Optional video for the recipe */
  video?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    contentUrl?: string;
    embedUrl?: string;
    uploadDate: string;
    duration?: string;
  };
}

export function RecipeSchema({
  name,
  description,
  image,
  prepTime,
  cookTime,
  totalTime,
  recipeYield,
  recipeCategory,
  recipeCuisine,
  keywords,
  ingredients,
  instructions,
  nutrition,
  rating,
  author,
  datePublished,
  suitableForDiet,
  allergens,
  video,
}: RecipeSchemaProps) {
  useEffect(() => {
    // Format instructions
    const formattedInstructions = instructions.map((instruction, index) => {
      if (typeof instruction === 'string') {
        return {
          '@type': 'HowToStep',
          position: index + 1,
          text: instruction,
        };
      }
      return {
        '@type': 'HowToStep',
        position: index + 1,
        text: instruction.text,
        ...(instruction.name && { name: instruction.name }),
        ...(instruction.image && { image: instruction.image }),
        ...(instruction.url && { url: instruction.url }),
      };
    });

    const schema: any = {
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name,
      description,
      image: Array.isArray(image) ? image : [image],
      ...(prepTime && { prepTime }),
      ...(cookTime && { cookTime }),
      ...(totalTime && { totalTime }),
      ...(recipeYield && { recipeYield }),
      ...(recipeCategory && { recipeCategory }),
      ...(recipeCuisine && { recipeCuisine }),
      ...(keywords && {
        keywords: Array.isArray(keywords) ? keywords.join(', ') : keywords,
      }),
      recipeIngredient: ingredients,
      recipeInstructions: formattedInstructions,
    };

    // Add nutrition if provided
    if (nutrition) {
      const nutritionSchema: any = {
        '@type': 'NutritionInformation',
      };

      if (nutrition.calories !== undefined) {
        nutritionSchema.calories = `${nutrition.calories} calories`;
      }
      if (nutrition.proteinContent !== undefined) {
        nutritionSchema.proteinContent = `${nutrition.proteinContent}g`;
      }
      if (nutrition.carbohydrateContent !== undefined) {
        nutritionSchema.carbohydrateContent = `${nutrition.carbohydrateContent}g`;
      }
      if (nutrition.fatContent !== undefined) {
        nutritionSchema.fatContent = `${nutrition.fatContent}g`;
      }
      if (nutrition.saturatedFatContent !== undefined) {
        nutritionSchema.saturatedFatContent = `${nutrition.saturatedFatContent}g`;
      }
      if (nutrition.sodiumContent !== undefined) {
        nutritionSchema.sodiumContent = `${nutrition.sodiumContent}mg`;
      }
      if (nutrition.fiberContent !== undefined) {
        nutritionSchema.fiberContent = `${nutrition.fiberContent}g`;
      }
      if (nutrition.sugarContent !== undefined) {
        nutritionSchema.sugarContent = `${nutrition.sugarContent}g`;
      }
      if (nutrition.cholesterolContent !== undefined) {
        nutritionSchema.cholesterolContent = `${nutrition.cholesterolContent}mg`;
      }
      if (nutrition.servingSize) {
        nutritionSchema.servingSize = nutrition.servingSize;
      }

      schema.nutrition = nutritionSchema;
    }

    // Add rating if provided
    if (rating) {
      schema.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: rating.value,
        ratingCount: rating.count,
        bestRating: rating.bestRating || 5,
        worstRating: rating.worstRating || 1,
      };
    }

    // Add author if provided
    if (author) {
      schema.author = {
        '@type': 'Person',
        name: author.name,
        ...(author.url && { url: author.url }),
      };
    }

    // Add published date if provided
    if (datePublished) {
      schema.datePublished = datePublished;
    }

    // Add dietary suitability if provided
    if (suitableForDiet && suitableForDiet.length > 0) {
      schema.suitableForDiet = suitableForDiet.map((diet) => ({
        '@type': 'Diet',
        name: diet,
      }));
    }

    // Add allergen warnings if provided
    if (allergens && allergens.length > 0) {
      schema.allergens = allergens;
    }

    // Add video if provided
    if (video) {
      schema.video = {
        '@type': 'VideoObject',
        name: video.name,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        ...(video.contentUrl && { contentUrl: video.contentUrl }),
        ...(video.embedUrl && { embedUrl: video.embedUrl }),
        uploadDate: video.uploadDate,
        ...(video.duration && { duration: video.duration }),
      };
    }

    const scriptId = 'recipe-schema';
    let scriptTag = document.getElementById(scriptId);

    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = scriptId;
      scriptTag.type = 'application/ld+json';
      document.head.appendChild(scriptTag);
    }

    scriptTag.textContent = JSON.stringify(schema);

    return () => {
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [
    name,
    description,
    image,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    recipeCategory,
    recipeCuisine,
    keywords,
    ingredients,
    instructions,
    nutrition,
    rating,
    author,
    datePublished,
    suitableForDiet,
    allergens,
    video,
  ]);

  return null;
}

/**
 * Helper function to convert time in minutes to ISO 8601 format
 *
 * Usage:
 * ```tsx
 * const prepTime = formatRecipeTime(15); // Returns "PT15M"
 * const cookTime = formatRecipeTime(90); // Returns "PT1H30M"
 * ```
 */
export function formatRecipeTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let duration = 'PT';

  if (hours > 0) {
    duration += `${hours}H`;
  }
  if (mins > 0 || hours === 0) {
    duration += `${mins}M`;
  }

  return duration;
}

/**
 * Helper function to validate recipe schema data
 *
 * Returns validation errors if any, empty array if valid
 */
export function validateRecipeSchema(props: RecipeSchemaProps): string[] {
  const errors: string[] = [];

  if (!props.name || props.name.length === 0) {
    errors.push('Recipe name is required');
  }

  if (!props.description || props.description.length === 0) {
    errors.push('Recipe description is required');
  }

  if (!props.image || (Array.isArray(props.image) && props.image.length === 0)) {
    errors.push('At least one recipe image is required');
  }

  if (!props.ingredients || props.ingredients.length === 0) {
    errors.push('At least one ingredient is required');
  }

  if (!props.instructions || props.instructions.length === 0) {
    errors.push('At least one instruction step is required');
  }

  // Validate ISO 8601 time formats if provided
  const timePattern = /^PT(\d+H)?(\d+M)?(\d+S)?$/;

  if (props.prepTime && !timePattern.test(props.prepTime)) {
    errors.push('Prep time must be in ISO 8601 format (e.g., PT15M)');
  }

  if (props.cookTime && !timePattern.test(props.cookTime)) {
    errors.push('Cook time must be in ISO 8601 format (e.g., PT30M)');
  }

  if (props.totalTime && !timePattern.test(props.totalTime)) {
    errors.push('Total time must be in ISO 8601 format (e.g., PT45M)');
  }

  // Validate rating if provided
  if (props.rating) {
    if (props.rating.value < 0 || props.rating.value > 5) {
      errors.push('Rating value must be between 0 and 5');
    }
    if (props.rating.count < 1) {
      errors.push('Rating count must be at least 1');
    }
  }

  return errors;
}

/**
 * Common diet types for suitableForDiet property
 */
export const DIET_TYPES = {
  DIABETIC: 'DiabeticDiet',
  GLUTEN_FREE: 'GlutenFreeDiet',
  HALAL: 'HalalDiet',
  HINDU: 'HinduDiet',
  KOSHER: 'KosherDiet',
  LOW_CALORIE: 'LowCalorieDiet',
  LOW_FAT: 'LowFatDiet',
  LOW_LACTOSE: 'LowLactoseDiet',
  LOW_SALT: 'LowSaltDiet',
  VEGAN: 'VeganDiet',
  VEGETARIAN: 'VegetarianDiet',
} as const;
