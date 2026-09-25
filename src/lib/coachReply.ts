/**
 * What the client does with a coach reply once it arrives.
 *
 * The model is told about the child's allergens, but the reply is still
 * checked here with the canonical matcher, because a model that ignores its
 * instructions must not be the last line of defence. The same goes for the
 * one-tap actions under a reply: each resolves to a real household food and
 * goes through the planner's allergen guard before it is offered.
 *
 * Pure: no React, no Supabase.
 */

import { matchingFoodAllergen, isAllergenSafeFor } from '@/lib/allergens';
import { kidAllergenChips, type KidAllergyFields } from '@/lib/kidAllergenChips';
import type { KidFitKid } from '@/lib/kidFit';
import { manualAddPrompt, type GuardKid } from '@/lib/planAllergenGuard';
import { addIsoDays, toISODate } from '@/lib/date-utils';
import type { Food, MealSlot, PlanEntry } from '@/types';

export type CoachWarningSeverity = 'mild' | 'moderate' | 'severe' | 'unrecorded';

export interface CoachAllergenWarning {
  key: string;
  severity: CoachWarningSeverity;
}

// An unrecorded severity is treated as severe everywhere else, so it sorts
// straight after the recorded severe ones.
const WARNING_RANK: Record<CoachWarningSeverity, number> = {
  severe: 0,
  unrecorded: 1,
  moderate: 2,
  mild: 3,
};

/**
 * The kid's allergens a reply names, by the canonical matcher: whole words,
 * synonyms and families, so "almond butter" is a tree-nut hit and "butternut
 * squash" is not. Severe first.
 */
export function replyAllergenWarnings(text: string, kid: KidAllergyFields): CoachAllergenWarning[] {
  if (!text) return [];
  const out: { warning: CoachAllergenWarning; index: number }[] = [];
  kidAllergenChips(kid).forEach((chip, index) => {
    if (matchingFoodAllergen([chip.key], { name: text }) === null) return;
    out.push({ warning: { key: chip.key, severity: chip.severity ?? 'unrecorded' }, index });
  });
  return out
    .sort((a, b) => WARNING_RANK[a.warning.severity] - WARNING_RANK[b.warning.severity] || a.index - b.index)
    .map((o) => o.warning);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Household foods a reply mentions by name, in order of first appearance.
 * Whole words, any case, names of three or more characters. Longer names
 * claim their span first, so "peanut butter" is one food and the "butter"
 * inside it is not a second.
 */
export function extractMentionedFoods(text: string, foods: Food[], max = 3): Food[] {
  if (!text || max <= 0) return [];
  const candidates = foods
    .map((food) => ({ food, name: String(food.name ?? '').trim().replace(/\s+/g, ' ') }))
    .filter((c) => c.name.length >= 3)
    .sort((a, b) => b.name.length - a.name.length || a.food.id.localeCompare(b.food.id));

  const taken: [number, number][] = [];
  const overlaps = (start: number, end: number) => taken.some(([s, e]) => start < e && end > s);
  const hits: { food: Food; at: number }[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const { food, name } of candidates) {
    const key = name.toLowerCase();
    if (seenIds.has(food.id) || seenNames.has(key)) continue;
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(name).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}_])`,
      'giu',
    );
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      taken.push([start, end]);
      hits.push({ food, at: start });
      seenIds.add(food.id);
      seenNames.add(key);
      break;
    }
  }
  return hits
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((h) => h.food);
}

export type CoachActionType = 'try_bite' | 'ladder' | 'grocery';

export interface CoachAction {
  key: string;
  type: CoachActionType;
  food: Food;
  status: 'ok' | 'confirm' | 'blocked';
  reason?: { allergen: string; severity: string };
}

export interface ResolveCoachActionsInput {
  kid: GuardKid & KidFitKid;
  mentioned: Food[];
  foodById: Map<string, Food>;
  ladderFoodIds: Set<string>;
  /** Foods already on this kid's plan in the next 7 days. */
  plannedFoodIds: Set<string>;
  allergyState: 'unknown' | 'none' | 'listed';
}

export const MAX_COACH_ACTIONS = 3;

/**
 * Up to three chips for the foods a reply mentions. Try bite and Add to
 * ladder put the food in front of this child, so any allergen conflict
 * blocks them, and a child whose allergies were never recorded gets a
 * confirm step. Add to grocery only buys it for the household, so a hit asks
 * first. A food already on the ladder gets no ladder chip, and one already
 * planned this week gets no try-bite chip.
 *
 * Chips are handed out round-robin across foods (each food's first chip,
 * then each food's second), so three mentioned foods get one chip each
 * rather than the first food taking all three.
 */
export function resolveCoachActions(input: ResolveCoachActionsInput): CoachAction[] {
  const { kid, mentioned, foodById, ladderFoodIds, plannedFoodIds, allergyState } = input;
  const severityByKey = new Map(kidAllergenChips(kid).map((c) => [c.key, c.severity ?? 'unrecorded']));

  const perFood: CoachAction[][] = [];
  const seen = new Set<string>();
  for (const food of mentioned) {
    if (seen.has(food.id)) continue;
    seen.add(food.id);
    const lookup = foodById.has(food.id) ? foodById : new Map([...foodById, [food.id, food]]);
    const prompt = manualAddPrompt([kid], [food.id], lookup);
    const conflict = prompt ? (prompt.lead ?? prompt.conflicts[0]) : null;
    const planStatus: CoachAction['status'] = conflict ? 'blocked' : allergyState === 'unknown' ? 'confirm' : 'ok';
    const planReason = conflict
      ? { allergen: conflict.allergen, severity: conflict.severity ?? 'unrecorded' }
      : undefined;

    const actions: CoachAction[] = [];
    const push = (type: CoachActionType, status: CoachAction['status'], reason?: CoachAction['reason']) => {
      actions.push({ key: `${type}:${food.id}`, type, food, status, ...(reason ? { reason } : {}) });
    };
    if (!plannedFoodIds.has(food.id)) push('try_bite', planStatus, planReason);
    if (!ladderFoodIds.has(food.id)) push('ladder', planStatus, planReason);

    const groceryFood = { name: food.name, allergens: food.allergens ?? [] };
    if (isAllergenSafeFor(kid, groceryFood)) {
      push('grocery', 'ok');
    } else {
      const allergen = matchingFoodAllergen(kid.allergens, groceryFood) ?? '';
      push('grocery', 'confirm', { allergen, severity: severityByKey.get(allergen) ?? 'unrecorded' });
    }
    perFood.push(actions);
  }

  const out: CoachAction[] = [];
  for (let round = 0; out.length < MAX_COACH_ACTIONS; round++) {
    let any = false;
    for (const actions of perFood) {
      if (round >= actions.length) continue;
      any = true;
      out.push(actions[round]);
      if (out.length >= MAX_COACH_ACTIONS) break;
    }
    if (!any) break;
  }
  return out;
}

const DINNER_CUTOFF_HOUR = 17;

/**
 * Where a try bite goes: today's dinner when it is free and it is before
 * 17:00 local, otherwise tomorrow's snack, then tomorrow's dinner. If all of
 * those are taken it still returns tomorrow's dinner; the planner allows a
 * second item in a slot. Day keys are local calendar days.
 */
export function pickNextOpenSlot(
  kidId: string,
  planEntries: PlanEntry[],
  now: Date,
): { date: string; meal_slot: MealSlot } {
  const taken = new Set<string>();
  for (const e of planEntries) {
    if (e.kid_id !== kidId) continue;
    taken.add(`${String(e.date).slice(0, 10)}|${e.meal_slot}`);
  }
  const today = toISODate(now);
  const tomorrow = addIsoDays(today, 1);
  const free = (date: string, slot: MealSlot) => !taken.has(`${date}|${slot}`);

  if (now.getHours() < DINNER_CUTOFF_HOUR && free(today, 'dinner')) {
    return { date: today, meal_slot: 'dinner' };
  }
  if (free(tomorrow, 'snack1')) return { date: tomorrow, meal_slot: 'snack1' };
  return { date: tomorrow, meal_slot: 'dinner' };
}
