// @vitest-environment node
// Vitest coverage for supabase/functions/_shared/aiSuggestionParsers.ts, the
// parsers suggest-foods, calculate-food-similarity and
// suggest-recipes-from-pantry apply to AIServiceV2's AIResponse.content.
import { describe, expect, it } from 'vitest';
import {
  matchPantryFoodIds,
  parseFoodChains,
  parseFoodIdentification,
  parseFoodSuggestions,
  parsePantryRecipeSuggestions,
} from '../../supabase/functions/_shared/aiSuggestionParsers';

describe('parseFoodSuggestions', () => {
  const reply = JSON.stringify({
    suggestions: [
      { name: 'Turkey Slices', category: 'protein', reason: 'Mild' },
      { name: 'Mango', category: 'Fruit', reason: 'Sweet' },
      { name: 'Pretzels', category: 'grain', reason: 'Crunchy' },
      { category: 'dairy', reason: 'no name' },
      'not an object',
    ],
  });

  it('reads the suggestions array, normalizes category and drops nameless entries', () => {
    expect(parseFoodSuggestions(reply)).toEqual([
      { name: 'Turkey Slices', category: 'protein', reason: 'Mild' },
      { name: 'Mango', category: 'fruit', reason: 'Sweet' },
      { name: 'Pretzels', category: 'snack', reason: 'Crunchy' },
    ]);
  });

  it('reads a fenced reply and a bare array', () => {
    expect(parseFoodSuggestions('```json\n' + reply + '\n```')).toHaveLength(3);
    expect(parseFoodSuggestions('[{"name": "Pear", "category": "fruit", "reason": "r"}]')).toEqual([
      { name: 'Pear', category: 'fruit', reason: 'r' },
    ]);
  });

  it('returns null when nothing usable came back, so the handler serves defaults', () => {
    expect(parseFoodSuggestions('I cannot help with that.')).toBeNull();
    expect(parseFoodSuggestions('{"suggestions": []}')).toBeNull();
    expect(parseFoodSuggestions('{"foods": [{"name": 1}]}')).toBeNull();
    expect(parseFoodSuggestions(undefined)).toBeNull();
    // The old call site treated the AIResponse object itself as the text.
    expect(parseFoodSuggestions({ content: reply })).toBeNull();
  });
});

describe('parseFoodChains', () => {
  it('reads chains out of prose, dropping chains with no steps', () => {
    const content = `Here are the chains:
{
  "chains": [
    { "chain_name": "Sweet Fruit Progression", "steps": ["apple slices", "pear slices", 3], "rationale": "Similar crunch" },
    { "chain_name": "Empty", "steps": [] },
    { "steps": ["toast", "bagel"] }
  ]
}`;
    expect(parseFoodChains(content)).toEqual([
      { chain_name: 'Sweet Fruit Progression', steps: ['apple slices', 'pear slices'], rationale: 'Similar crunch' },
      { chain_name: 'Food chain', steps: ['toast', 'bagel'], rationale: '' },
    ]);
  });

  it('returns an empty list for unusable output, matching the no-AI answer', () => {
    expect(parseFoodChains('nope')).toEqual([]);
    expect(parseFoodChains('{"chains": "none"}')).toEqual([]);
    expect(parseFoodChains(null)).toEqual([]);
  });
});

describe('parsePantryRecipeSuggestions', () => {
  const recipe = {
    name: 'Cheesy Pasta Bites',
    description: 'Pasta with cheese.',
    food_names: ['Pasta', 'Cheddar', 7],
    reason: 'Always eats pasta',
    difficulty: 'easy',
    prepTime: '5 minutes',
    cookTime: '10 minutes',
  };

  it('reads a fenced array and coerces fields to strings', () => {
    const out = parsePantryRecipeSuggestions('```json\n' + JSON.stringify([recipe, { description: 'nameless' }]) + '\n```');
    expect(out).toEqual([{ ...recipe, food_names: ['Pasta', 'Cheddar'] }]);
  });

  it('finds the array inside a wrapper object', () => {
    expect(parsePantryRecipeSuggestions(JSON.stringify({ recipes: [recipe] }))).toHaveLength(1);
  });

  it('defaults a missing food_names to an empty list so the id lookup cannot throw', () => {
    expect(parsePantryRecipeSuggestions('[{"name": "Toast"}]')).toEqual([
      { name: 'Toast', description: '', food_names: [], reason: '', difficulty: 'easy', prepTime: '', cookTime: '' },
    ]);
  });

  it('returns null for unusable output', () => {
    expect(parsePantryRecipeSuggestions('Sorry, no recipes.')).toBeNull();
    expect(parsePantryRecipeSuggestions('[]')).toBeNull();
    expect(parsePantryRecipeSuggestions('[{"description": "x"}]')).toBeNull();
    expect(parsePantryRecipeSuggestions('')).toBeNull();
  });
});

describe('matchPantryFoodIds', () => {
  it('matches names case-insensitively and skips unknown or malformed foods', () => {
    const pantry = [
      { id: 'f1', name: 'Pasta' },
      { id: 'f2', name: 'Cheddar' },
      { id: 3, name: 'Milk' },
      { id: 'f4' },
    ];
    expect(matchPantryFoodIds(['pasta', 'CHEDDAR', 'milk', 'bread'], pantry)).toEqual(['f1', 'f2']);
  });
});

describe('parseFoodIdentification', () => {
  const object = {
    name: 'Apple',
    variety: 'Gala',
    varietyOptions: ['Gala', 'Fuji', 3],
    category: 'Fruit',
    confidence: 92,
    description: 'Two red apples',
    servingSize: '1 medium',
    quantity: 2,
    servingSizeOptions: ['1 small', '1 medium', '1 large'],
  };
  const expected = {
    name: 'Apple',
    variety: 'Gala',
    varietyOptions: ['Gala', 'Fuji'],
    category: 'fruit',
    confidence: 92,
    description: 'Two red apples',
    servingSize: '1 medium',
    quantity: 2,
    servingSizeOptions: ['1 small', '1 medium', '1 large'],
  };

  it('reads a bare object and normalizes category and list entries', () => {
    expect(parseFoodIdentification(JSON.stringify(object))).toEqual(expected);
  });

  // The bug: the handler stripped fences and JSON.parse'd the whole string,
  // so a sentence before or after the object threw.
  it('reads the object out of prose, with or without a fence', () => {
    const json = JSON.stringify(object);
    expect(parseFoodIdentification(`Here is what I see:\n${json}\nHope that helps.`)).toEqual(expected);
    expect(parseFoodIdentification(`Sure!\n\`\`\`json\n${json}\n\`\`\`\nLet me know.`)).toEqual(expected);
  });

  it('fills defaults for missing or malformed fields', () => {
    expect(
      parseFoodIdentification('{"name": " Carrot ", "category": "root veg", "confidence": "0.8", "quantity": 0}'),
    ).toEqual({
      name: 'Carrot',
      variety: '',
      varietyOptions: [],
      category: 'snack',
      confidence: 80,
      description: '',
      servingSize: '',
      quantity: 1,
      servingSizeOptions: [],
    });
  });

  it('clamps confidence to 0-100 and rounds quantity', () => {
    const got = parseFoodIdentification('{"name": "Egg", "confidence": 140, "quantity": "3.4"}');
    expect(got?.confidence).toBe(100);
    expect(got?.quantity).toBe(3);
    expect(parseFoodIdentification('{"name": "Egg", "confidence": "85%"}')?.confidence).toBe(85);
  });

  it('reads a single object the model wrapped in an array', () => {
    expect(parseFoodIdentification('[{"name": "Apple", "category": "fruit"}]')?.name).toBe('Apple');
  });

  it('returns null when there is no object with a name', () => {
    expect(parseFoodIdentification("I can't tell what this is.")).toBeNull();
    expect(parseFoodIdentification('{"category": "fruit"}')).toBeNull();
    expect(parseFoodIdentification('')).toBeNull();
    expect(parseFoodIdentification(undefined)).toBeNull();
  });
});
