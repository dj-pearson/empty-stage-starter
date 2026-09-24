import type { Kid } from '@/types';

export type ProfileGap = 'allergies' | 'birthday' | 'safeFoods' | 'preferences' | 'goals';

export interface ProfileCompleteness {
  percent: number;
  /** What is still missing, most important first. */
  missing: ProfileGap[];
}

type CompletenessFields = Pick<
  Kid,
  | 'allergens'
  | 'date_of_birth'
  | 'age'
  | 'always_eats_foods'
  | 'disliked_foods'
  | 'texture_dislikes'
  | 'eating_behavior'
  | 'health_goals'
  | 'helpful_strategies'
>;

/** Enough go-to foods that the planner has something to build a meal around. */
export const MIN_SAFE_FOODS = 3;

const nonEmpty = (list: readonly unknown[] | null | undefined) =>
  Array.isArray(list) && list.some((v) => typeof v === 'string' && v.trim() !== '');

/**
 * How much of a child's profile the rest of the app can use, weighted by what
 * matters for safety and planning. Allergies are first and heaviest because
 * every screen that filters food reads them; an explicit "no allergies" ([])
 * counts as recorded, while undefined (never asked) does not.
 *
 * The name is not scored (a profile cannot exist without one) and household
 * counts are not either, since siblings share those and they said nothing
 * about this child.
 */
export function computeProfileCompleteness(kid: CompletenessFields): ProfileCompleteness {
  const checks: ReadonlyArray<{ gap: ProfileGap; weight: number; done: boolean }> = [
    { gap: 'allergies', weight: 30, done: Array.isArray(kid.allergens) },
    {
      gap: 'birthday',
      weight: 20,
      done: Boolean(kid.date_of_birth) || (typeof kid.age === 'number' && kid.age >= 0),
    },
    {
      gap: 'safeFoods',
      weight: 20,
      done: (kid.always_eats_foods ?? []).filter((f) => typeof f === 'string' && f.trim() !== '').length >= MIN_SAFE_FOODS,
    },
    {
      gap: 'preferences',
      weight: 15,
      done:
        nonEmpty(kid.disliked_foods) ||
        nonEmpty(kid.texture_dislikes) ||
        (typeof kid.eating_behavior === 'string' && kid.eating_behavior.trim() !== ''),
    },
    { gap: 'goals', weight: 15, done: nonEmpty(kid.health_goals) || nonEmpty(kid.helpful_strategies) },
  ];

  let percent = 0;
  const missing: ProfileGap[] = [];
  for (const c of checks) {
    if (c.done) percent += c.weight;
    else missing.push(c.gap);
  }
  return { percent, missing };
}
