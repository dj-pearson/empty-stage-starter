/**
 * What a plan includes, read from the columns get_usage_stats returns for the
 * plan the server enforces (stats.plan). Nothing here comes from the plan's
 * marketing `features` JSON: a row appears as included only when the column
 * that the server gates on says so.
 */
import type { UsageStats } from '@/hooks/useUsageStats';

export type UsageMeterId = 'children' | 'pantry_foods' | 'ai_coach' | 'food_tracker';

export interface UsageMeterDef {
  id: UsageMeterId;
  /** count: a standing total (kids, pantry). quota: resets on a schedule. */
  kind: 'count' | 'quota';
  reset: 'daily' | 'monthly' | null;
  labelKey: string;
  defaultLabel: string;
  route: string;
}

/** The four rows the usage card shows, in the order a parent reads them. */
export const USAGE_METERS: readonly UsageMeterDef[] = [
  {
    id: 'children',
    kind: 'count',
    reset: null,
    labelKey: 'billing.usage.rows.children',
    defaultLabel: 'Children in your household',
    route: '/dashboard/kids',
  },
  {
    id: 'pantry_foods',
    kind: 'count',
    reset: null,
    labelKey: 'billing.usage.rows.pantryFoods',
    defaultLabel: 'Pantry foods',
    route: '/dashboard/pantry',
  },
  {
    id: 'ai_coach',
    kind: 'quota',
    reset: 'daily',
    labelKey: 'billing.usage.rows.aiCoach',
    defaultLabel: 'AI coach questions today',
    route: '/dashboard/ai-coach',
  },
  {
    id: 'food_tracker',
    kind: 'quota',
    reset: 'monthly',
    labelKey: 'billing.usage.rows.foodTracker',
    defaultLabel: 'Food tracker entries this month',
    route: '/dashboard/food-tracker',
  },
];

type PlanRow = UsageStats['plan'];
type FeatureFlag = 'has_food_chaining' | 'has_meal_builder' | 'has_nutrition_tracking';
type LimitColumn = 'max_children' | 'max_pantry_foods' | 'ai_coach_daily_limit' | 'food_tracker_monthly_limit';

export type PlanInclusion =
  | { id: string; type: 'feature'; column: FeatureFlag; labelKey: string; defaultLabel: string; route: string }
  | { id: string; type: 'limit'; column: LimitColumn; labelKey: string; defaultLabel: string; route: string };

export const PLAN_INCLUSIONS: readonly PlanInclusion[] = [
  {
    id: 'children',
    type: 'limit',
    column: 'max_children',
    labelKey: 'billing.inclusions.rows.children',
    defaultLabel: 'Child profiles',
    route: '/dashboard/kids',
  },
  {
    id: 'pantry',
    type: 'limit',
    column: 'max_pantry_foods',
    labelKey: 'billing.inclusions.rows.pantry',
    defaultLabel: 'Pantry foods',
    route: '/dashboard/pantry',
  },
  {
    id: 'aiCoach',
    type: 'limit',
    column: 'ai_coach_daily_limit',
    labelKey: 'billing.inclusions.rows.aiCoach',
    defaultLabel: 'AI coach questions a day',
    route: '/dashboard/ai-coach',
  },
  {
    id: 'foodTracker',
    type: 'limit',
    column: 'food_tracker_monthly_limit',
    labelKey: 'billing.inclusions.rows.foodTracker',
    defaultLabel: 'Food tracker entries a month',
    route: '/dashboard/food-tracker',
  },
  {
    id: 'foodChaining',
    type: 'feature',
    column: 'has_food_chaining',
    labelKey: 'billing.inclusions.rows.foodChaining',
    defaultLabel: 'Food chaining',
    route: '/dashboard/food-chaining',
  },
  {
    id: 'mealBuilder',
    type: 'feature',
    column: 'has_meal_builder',
    labelKey: 'billing.inclusions.rows.mealBuilder',
    defaultLabel: 'Meal builder',
    route: '/dashboard/meal-builder',
  },
  {
    id: 'nutrition',
    type: 'feature',
    column: 'has_nutrition_tracking',
    labelKey: 'billing.inclusions.rows.nutrition',
    defaultLabel: 'Nutrition tracking',
    route: '/dashboard/insights',
  },
];

export interface ResolvedInclusion {
  id: string;
  labelKey: string;
  defaultLabel: string;
  route: string;
  included: boolean;
  /** For limit rows: null is unlimited, a number is the cap. Absent for feature rows. */
  limit?: number | null;
}

/**
 * A limit of 0 means the plan does not include the feature at all (the
 * server's check_feature_limit treats 0 as "not allowed"), so it is reported as
 * not included rather than as "0".
 */
export function resolveInclusions(plan: PlanRow): ResolvedInclusion[] {
  return PLAN_INCLUSIONS.map((row) => {
    if (row.type === 'feature') {
      return { id: row.id, labelKey: row.labelKey, defaultLabel: row.defaultLabel, route: row.route, included: plan[row.column] === true };
    }
    const limit = plan[row.column];
    return {
      id: row.id,
      labelKey: row.labelKey,
      defaultLabel: row.defaultLabel,
      route: row.route,
      included: limit !== 0,
      limit: limit ?? null,
    };
  });
}

/**
 * The Free plan's count caps, as seeded by
 * supabase/migrations/20251008202537_abaf0cfc-6afd-4141-89db-1fbde08a0be0.sql
 * and enforced by enforce_plan_row_limit. The cancel dialog uses them to say
 * which of a household's things will sit above the Free cap after a downgrade;
 * nothing is deleted when that happens, which the dialog also says.
 */
export const FREE_PLAN_COUNT_LIMITS: Readonly<Record<'children' | 'pantry_foods', number>> = {
  children: 1,
  pantry_foods: 50,
};
