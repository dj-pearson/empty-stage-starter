import { queryLocalDb } from './local-db';
import { queryOpenFoodFacts } from './open-food-facts';
import { queryUsda } from './usda';

export async function queryDatabases(barcode: string): Promise<any> {
  const result = await queryLocalDb(barcode);
  if (result) {
    return result;
  }

  const openFoodFactsResult = await queryOpenFoodFacts(barcode);
  if (openFoodFactsResult) {
    return openFoodFactsResult;
  }

  const usdaResult = await queryUsda(barcode);
  if (usdaResult) {
    return usdaResult;
  }

  return null;
}
