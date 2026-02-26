import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { RecipeSchema, formatRecipeTime, validateRecipeSchema } from './RecipeSchema';

describe('RecipeSchema', () => {
  beforeEach(() => {
    // Clean up any script tags from previous tests
    const existing = document.getElementById('recipe-schema');
    if (existing) existing.remove();
  });

  it('renders without crashing', () => {
    render(
      <RecipeSchema
        name="Test Recipe"
        description="A test recipe"
        image="https://example.com/image.jpg"
        ingredients={['1 cup flour', '2 eggs']}
        instructions={[{ text: 'Mix ingredients' }]}
      />
    );
    expect(document.body).toBeTruthy();
  });

  it('creates a script tag with JSON-LD in document head', () => {
    render(
      <RecipeSchema
        name="Test Recipe"
        description="A test recipe"
        image="https://example.com/image.jpg"
        ingredients={['1 cup flour']}
        instructions={['Mix ingredients']}
      />
    );

    const scriptTag = document.getElementById('recipe-schema');
    expect(scriptTag).toBeTruthy();
    expect(scriptTag?.type).toBe('application/ld+json');
  });

  it('generates valid JSON-LD with Recipe type', () => {
    render(
      <RecipeSchema
        name="Mac & Cheese"
        description="Kid-friendly mac and cheese"
        image="https://example.com/mac.jpg"
        ingredients={['2 cups macaroni', '1 cup cheese']}
        instructions={[{ text: 'Cook pasta' }, { text: 'Add cheese' }]}
      />
    );

    const scriptTag = document.getElementById('recipe-schema');
    const parsed = JSON.parse(scriptTag?.textContent || '{}');

    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('Recipe');
    expect(parsed.name).toBe('Mac & Cheese');
    expect(parsed.description).toBe('Kid-friendly mac and cheese');
  });

  it('includes ingredients as recipeIngredient', () => {
    const ingredients = ['2 cups macaroni', '1 cup cheese', '1/2 cup milk'];

    render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={ingredients}
        instructions={[{ text: 'Cook' }]}
      />
    );

    const parsed = JSON.parse(document.getElementById('recipe-schema')?.textContent || '{}');
    expect(parsed.recipeIngredient).toEqual(ingredients);
  });

  it('formats instructions as HowToStep', () => {
    render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={['1 item']}
        instructions={[{ text: 'Step 1' }, { text: 'Step 2' }]}
      />
    );

    const parsed = JSON.parse(document.getElementById('recipe-schema')?.textContent || '{}');
    expect(parsed.recipeInstructions).toHaveLength(2);
    expect(parsed.recipeInstructions[0]['@type']).toBe('HowToStep');
    expect(parsed.recipeInstructions[0].position).toBe(1);
    expect(parsed.recipeInstructions[0].text).toBe('Step 1');
  });

  it('handles string instructions', () => {
    render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={['1 item']}
        instructions={['Mix together', 'Bake for 30 min']}
      />
    );

    const parsed = JSON.parse(document.getElementById('recipe-schema')?.textContent || '{}');
    expect(parsed.recipeInstructions[0].text).toBe('Mix together');
    expect(parsed.recipeInstructions[1].text).toBe('Bake for 30 min');
  });

  it('includes nutrition info when provided', () => {
    render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={['1 item']}
        instructions={['Cook']}
        nutrition={{ calories: 250, proteinContent: 12 }}
      />
    );

    const parsed = JSON.parse(document.getElementById('recipe-schema')?.textContent || '{}');
    expect(parsed.nutrition['@type']).toBe('NutritionInformation');
    expect(parsed.nutrition.calories).toBe('250 calories');
    expect(parsed.nutrition.proteinContent).toBe('12g');
  });

  it('includes rating when provided', () => {
    render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={['1 item']}
        instructions={['Cook']}
        rating={{ value: 4.5, count: 100 }}
      />
    );

    const parsed = JSON.parse(document.getElementById('recipe-schema')?.textContent || '{}');
    expect(parsed.aggregateRating['@type']).toBe('AggregateRating');
    expect(parsed.aggregateRating.ratingValue).toBe(4.5);
    expect(parsed.aggregateRating.ratingCount).toBe(100);
  });

  it('cleans up script tag on unmount', () => {
    const { unmount } = render(
      <RecipeSchema
        name="Test"
        description="Test"
        image="https://example.com/img.jpg"
        ingredients={['1 item']}
        instructions={['Cook']}
      />
    );

    expect(document.getElementById('recipe-schema')).toBeTruthy();

    unmount();

    expect(document.getElementById('recipe-schema')).toBeNull();
  });
});

describe('formatRecipeTime', () => {
  it('formats minutes only', () => {
    expect(formatRecipeTime(15)).toBe('PT15M');
    expect(formatRecipeTime(30)).toBe('PT30M');
  });

  it('formats hours and minutes', () => {
    expect(formatRecipeTime(90)).toBe('PT1H30M');
    expect(formatRecipeTime(150)).toBe('PT2H30M');
  });

  it('formats hours only', () => {
    // When minutes is 0 and hours > 0, the function returns just PTxH
    expect(formatRecipeTime(60)).toBe('PT1H');
    expect(formatRecipeTime(120)).toBe('PT2H');
  });

  it('formats zero minutes', () => {
    expect(formatRecipeTime(0)).toBe('PT0M');
  });
});

describe('validateRecipeSchema', () => {
  const validProps = {
    name: 'Test Recipe',
    description: 'A test recipe',
    image: 'https://example.com/image.jpg',
    ingredients: ['1 cup flour'],
    instructions: [{ text: 'Mix' }],
  };

  it('returns empty array for valid data', () => {
    const errors = validateRecipeSchema(validProps);
    expect(errors).toEqual([]);
  });

  it('validates required name', () => {
    const errors = validateRecipeSchema({ ...validProps, name: '' });
    expect(errors).toContain('Recipe name is required');
  });

  it('validates required description', () => {
    const errors = validateRecipeSchema({ ...validProps, description: '' });
    expect(errors).toContain('Recipe description is required');
  });

  it('validates required image', () => {
    const errors = validateRecipeSchema({ ...validProps, image: '' });
    expect(errors).toContain('At least one recipe image is required');
  });

  it('validates required ingredients', () => {
    const errors = validateRecipeSchema({ ...validProps, ingredients: [] });
    expect(errors).toContain('At least one ingredient is required');
  });

  it('validates required instructions', () => {
    const errors = validateRecipeSchema({ ...validProps, instructions: [] });
    expect(errors).toContain('At least one instruction step is required');
  });

  it('validates ISO 8601 time format', () => {
    const errors = validateRecipeSchema({ ...validProps, prepTime: 'invalid' });
    expect(errors).toContain('Prep time must be in ISO 8601 format (e.g., PT15M)');
  });

  it('accepts valid ISO 8601 time', () => {
    const errors = validateRecipeSchema({ ...validProps, prepTime: 'PT15M', cookTime: 'PT30M' });
    expect(errors).toEqual([]);
  });

  it('validates rating range', () => {
    const errors = validateRecipeSchema({ ...validProps, rating: { value: 6, count: 10 } });
    expect(errors).toContain('Rating value must be between 0 and 5');
  });

  it('validates rating count', () => {
    const errors = validateRecipeSchema({ ...validProps, rating: { value: 4, count: 0 } });
    expect(errors).toContain('Rating count must be at least 1');
  });
});
