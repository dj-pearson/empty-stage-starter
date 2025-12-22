import { queryLocalDb } from './local-db';
import { queryOpenFoodFacts } from './open-food-facts';
import { queryUsda } from './usda';
import { queryFoodRepo } from './food-repo'; // New import

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

  const foodRepoResult = await queryFoodRepo(barcode); // New query
  if (foodRepoResult) {
    return foodRepoResult;
  }

  return null;
}
