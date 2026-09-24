import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from './foodSafetyDefault';

/**
 * US-803: whether a child eats a food is one question with three answers,
 * not two independent switches. "none" is where every new food starts; two
 * switches allowed "safe" and "try bite" at once, and AddFoodDialog defaulted
 * safe on.
 */
export type SafetyChoice = 'none' | 'safe' | 'try';

export function safetyFromFlags(isSafe: boolean, isTryBite: boolean): SafetyChoice {
  if (isSafe) return 'safe';
  if (isTryBite) return 'try';
  return 'none';
}

/** The answer a brand-new food opens with in AddFoodDialog. */
export const NEW_FOOD_SAFETY: SafetyChoice = safetyFromFlags(ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE);
