import { describe, it, expect } from 'vitest';
import { harmonizeFoodData } from './data-harmonization';

describe('harmonizeFoodData', () => {
  it('should harmonize data from different sources into a consistent format', () => {
    const localResult = {
      source: 'local',
      name: 'Apple',
      calories: 95,
      nutrients: [{ name: 'Fiber', value: 4, unit: 'g' }],
    };

    const openFoodFactsResult = {
      source: 'openfoodfacts',
      product_name: 'Apple Gala',
      nutriments: {
        energy_value: 220, // kJ
        fiber_g: 5,
      },
    };

    const usdaResult = {
      source: 'usda',
      description: 'Apples, raw, with skin',
      foodNutrients: [
        { nutrientName: 'Energy', unitName: 'KCAL', value: 52 },
        { nutrientName: 'Fiber, total dietary', unitName: 'G', value: 2.4 },
      ],
    };

    const results = [localResult, openFoodFactsResult, usdaResult];

    const expectedHarmonizedData = {
      name: 'Apple',
      calories: 95, // Prioritize local
      nutrients: [
        { name: 'Fiber', value: 4, unit: 'g' }, // Prioritize local
        // Harmonized from OpenFoodFacts
        { name: 'Energy', value: 52.6, unit: 'kcal' }, // 220 kJ / 4.184 = 52.58 kcal
        // Harmonized from USDA
        // { name: 'Fiber, total dietary', value: 2.4, unit: 'g' }, // Should be combined or prioritized
      ],
    };

    const harmonizedData = harmonizeFoodData(results);

    // This test will fail because harmonizeFoodData is not yet implemented.
    expect(harmonizedData).toEqual(expectedHarmonizedData);
  });
});
