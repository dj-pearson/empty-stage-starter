export function harmonizeFoodData(results: any[]): any {
  if (!results || results.length === 0) {
    return null;
  }

  let harmonized: any = {
    name: '',
    calories: 0,
    nutrients: [],
  };

  const nutrientMap: Map<string, { value: number; unit: string }> = new Map();

  // Prioritize local data
  const localResult = results.find(r => r.source === 'local');
  if (localResult) {
    harmonized.name = localResult.name;
    harmonized.calories = localResult.calories;
    localResult.nutrients.forEach((n: any) => nutrientMap.set(n.name, { value: n.value, unit: n.unit }));
  }

  // Process Open Food Facts data
  const openFoodFactsResult = results.find(r => r.source === 'openfoodfacts');
  if (openFoodFactsResult) {
    if (!harmonized.name && openFoodFactsResult.product_name) {
      harmonized.name = openFoodFactsResult.product_name;
    }
    if (openFoodFactsResult.nutriments) {
      // Convert energy from kJ to kcal (1 kJ = 0.239006 kcal)
      if (openFoodFactsResult.nutriments.energy_value && !nutrientMap.has('Energy')) {
        const kcal = openFoodFactsResult.nutriments.energy_value * 0.239006;
        nutrientMap.set('Energy', { value: parseFloat(kcal.toFixed(1)), unit: 'kcal' });
      }
      if (openFoodFactsResult.nutriments.fiber_g && !nutrientMap.has('Fiber')) {
        nutrientMap.set('Fiber', { value: openFoodFactsResult.nutriments.fiber_g, unit: 'g' });
      }
      // Add other relevant nutrients from Open Food Facts
    }
  }

  // Process USDA data
  const usdaResult = results.find(r => r.source === 'usda');
  if (usdaResult && usdaResult.foodNutrients) {
    if (!harmonized.name && usdaResult.description) {
      harmonized.name = usdaResult.description;
    }
    usdaResult.foodNutrients.forEach((n: any) => {
      const nutrientName = n.nutrientName;
      const normalizedNutrientName = nutrientName === 'Fiber, total dietary' ? 'Fiber' : nutrientName;
      if (!nutrientMap.has(normalizedNutrientName)) {
        let unit = n.unitName.toLowerCase();
        let value = n.value;

        if (normalizedNutrientName === 'Fiber') {
          nutrientMap.set('Fiber', { value: value, unit: 'g' });
        }
        // Example: Convert KCAL to kcal
        else if (unit === 'kcal') {
          nutrientMap.set('Energy', { value: value, unit: 'kcal' });
        } else if (unit === 'g') {
          nutrientMap.set(normalizedNutrientName, { value: value, unit: 'g' });
        }
        // Add more unit conversions as needed
      }
    });
  }

  // Convert nutrient map back to array
  harmonized.nutrients = Array.from(nutrientMap.entries()).map(([name, data]) => ({ name, ...data }));

  return harmonized;
}
