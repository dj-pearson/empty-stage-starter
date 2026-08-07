/**
 * One pan, four plates — per-kid plating (US-613).
 *
 * Pure module. Given a recipe that has been broken into components (US-612)
 * and the children eating tonight, it decides for each child which parts go on
 * the plate, which are held back, which need a gap around them, and which part
 * is doing double duty as that child's due ladder exposure.
 *
 * This COMPOSES with the sibling constraint solver rather than replacing it.
 * `evaluateKidConstraint` already knows what an allergen is, what a dietary
 * restriction excludes and what this child dislikes; that verdict is taken as
 * given and mapped onto components. A second opinion about whether a child can
 * eat something is the last thing this feature should introduce.
 *
 * Two rules are worth stating outright.
 *
 * A hard violation always wins. If a component carries an allergen or breaks a
 * dietary restriction it comes off the plate, and if it is the kind of
 * component that cannot come off — the pasta in a pasta bake — then the plate
 * is marked blocked rather than quietly served anyway. Plating must never be
 * the thing that talks a parent past an allergy.
 *
 * And an exposure is never forced. A component only gets plated as a ladder
 * exposure if it is otherwise fine for that child; a due exposure does not
 * override a dislike, a texture the child cannot tolerate, or anything the
 * solver hard-blocked. The ladder's whole premise is that pressure goes down,
 * not up.
 *
 * Nothing here reads the clock — `today` is injected.
 */

import {
  evaluateKidConstraint,
  type ConstraintViolation,
  type SolverKid,
  type SolverRecipe,
} from './siblingConstraintSolver';
import type { RecipeComponent } from './recipeComponents';
import type { Rung } from './exposureLadder';

/**
 * The texture_dislikes entry that means "nothing may touch". Written by the
 * intake questionnaire's TEXTURE_OPTIONS; matched case-insensitively so a
 * hand-edited value still works.
 */
export const NO_TOUCHING_DISLIKE = 'foods touching each other';

export type PlacementKind =
  /** Goes on the plate as normal. */
  | 'on_plate'
  /** Goes on, but needs a gap or its own bowl. */
  | 'separated'
  /** Kept off this child's plate. */
  | 'held_back'
  /** On the plate, and it is this child's due ladder step for the meal. */
  | 'exposure';

export type PlatingReason =
  | { kind: 'allergen'; foodName: string; detail: string }
  | { kind: 'dietary'; foodName: string; detail: string }
  | { kind: 'disliked'; foodName: string }
  | { kind: 'texture'; texture: string }
  | { kind: 'no_touching' }
  | { kind: 'component_separate' }
  | { kind: 'due_exposure'; rung: Rung }
  | { kind: 'safe_food'; foodName: string }
  /** Would have been held back, but it IS the dish. Surfaced, never hidden. */
  | { kind: 'cannot_hold_back' };

export interface ComponentPlacement {
  componentId: string;
  componentName: string;
  placement: PlacementKind;
  reasons: PlatingReason[];
}

export interface KidPlate {
  kidId: string;
  kidName: string;
  /** Every component, in recipe order, with its decision for this child. */
  placements: ComponentPlacement[];
  onPlate: ComponentPlacement[];
  separated: ComponentPlacement[];
  heldBack: ComponentPlacement[];
  /** The component plated as this child's ladder exposure, if any. */
  exposure: ComponentPlacement | null;
  /**
   * True when something unsafe for this child cannot be taken off the dish.
   * The caller must offer this child something else, not this plate.
   */
  blocked: boolean;
  /** True when nothing is left to serve. */
  isEmpty: boolean;
}

export interface PlatingKid extends SolverKid {
  /** `kids.texture_dislikes`. Same vocabulary as `recipe_components.textures`. */
  textureDislikes?: string[] | null;
  /**
   * Food ids this child treats as safe. Defaults to `alwaysEatsFoods`, which
   * is the per-kid safe list the solver already reads.
   */
  safeFoodIds?: string[] | null;
}

/** A ladder row, narrowed to what plating needs. */
export interface PlatingLadderRow {
  kidId: string;
  foodId: string;
  currentRung: Rung;
  status: string;
  /** ISO 'YYYY-MM-DD', or null when nothing is scheduled. */
  nextDueOn: string | null;
}

export interface PlatingInput {
  /** Passed straight to the solver, so both agree on what the recipe contains. */
  recipe: SolverRecipe;
  components: RecipeComponent[];
  /**
   * Which foods each component contributes, beyond `component.foodId`. Built
   * from the grouped ingredients (US-612).
   */
  componentFoods?: { componentId: string; foodId: string }[];
  kids: PlatingKid[];
  ladder?: PlatingLadderRow[];
  /** ISO 'YYYY-MM-DD' treated as today, for "is this exposure due". */
  today: string;
}

function lowerSet(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
}

function foodIdsOfComponent(
  component: RecipeComponent,
  extras: Map<string, string[]>
): Set<string> {
  const ids = new Set(extras.get(component.id) ?? []);
  if (component.foodId) ids.add(component.foodId);
  return ids;
}

/**
 * Plan one plate per child.
 *
 * Components are evaluated in recipe order and every component appears on
 * every plate with an explicit decision — including the ones held back, so the
 * UI can say what was taken off rather than silently showing a shorter list.
 */
export function planPlates(input: PlatingInput): KidPlate[] {
  const { recipe, components, kids, today } = input;

  const extras = new Map<string, string[]>();
  for (const link of input.componentFoods ?? []) {
    const list = extras.get(link.componentId);
    if (list) list.push(link.foodId);
    else extras.set(link.componentId, [link.foodId]);
  }

  const ordered = [...components].sort((a, b) =>
    a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder
  );

  return kids.map((kid) => planOnePlate(kid));

  function planOnePlate(kid: PlatingKid): KidPlate {
    // The solver's verdict, taken as given rather than recomputed.
    const verdict = evaluateKidConstraint(recipe, kid);
    const hardByFood = indexViolations(verdict.hardViolations);
    const softByFood = indexViolations(verdict.softViolations);

    const textureDislikes = lowerSet(kid.textureDislikes);
    const dislikesTouching = textureDislikes.has(NO_TOUCHING_DISLIKE);
    const safeIds = new Set(kid.safeFoodIds ?? kid.alwaysEatsFoods ?? []);

    // At most one exposure per meal: a plate is not a test.
    const dueExposure = findDueExposure(kid.id);
    let exposureTaken = false;

    let blocked = false;

    const placements: ComponentPlacement[] = ordered.map((component) => {
      const foodIds = foodIdsOfComponent(component, extras);
      const reasons: PlatingReason[] = [];

      // 1. Hard violations. These end the decision.
      for (const foodId of foodIds) {
        const hard = hardByFood.get(foodId);
        if (!hard) continue;
        reasons.push(
          hard.reason.startsWith('allergen')
            ? { kind: 'allergen', foodName: hard.foodName, detail: hard.reason }
            : { kind: 'dietary', foodName: hard.foodName, detail: hard.reason }
        );
      }
      if (reasons.length > 0) {
        if (!component.canBeHeldBack) {
          // Unsafe and inseparable: this dish is not for this child tonight.
          blocked = true;
          reasons.push({ kind: 'cannot_hold_back' });
        }
        return place(component, 'held_back', reasons);
      }

      // 2. A texture this child cannot tolerate. Separation does not help —
      // the problem is the food itself — so this is hold-back or nothing.
      const clashingTexture = component.textures.find((texture) =>
        textureDislikes.has(texture.trim().toLowerCase())
      );
      if (clashingTexture) {
        reasons.push({ kind: 'texture', texture: clashingTexture });
      }

      // 3. A disliked food, per the solver.
      for (const foodId of foodIds) {
        const soft = softByFood.get(foodId);
        if (soft) reasons.push({ kind: 'disliked', foodName: soft.foodName });
      }

      // 4. A sauce stirred through makes everything touch, so for a child who
      // cannot have foods touching it comes off rather than going on.
      if (dislikesTouching && component.isMixedIn) {
        reasons.push({ kind: 'no_touching' });
      }

      if (reasons.length > 0) {
        if (component.canBeHeldBack) return place(component, 'held_back', reasons);
        // It is the dish. Serve it, but say what the parent is up against.
        reasons.push({ kind: 'cannot_hold_back' });
        return place(component, separationFor(component), reasons);
      }

      // 5. Nothing against it. Is it this child's due ladder step?
      if (!exposureTaken && dueExposure && foodIds.has(dueExposure.foodId)) {
        exposureTaken = true;
        return place(component, 'exposure', [
          { kind: 'due_exposure', rung: dueExposure.currentRung },
        ]);
      }

      // 6. A safe food is worth naming — it is the anchor the rest sits beside.
      for (const foodId of foodIds) {
        if (safeIds.has(foodId)) {
          const food = recipe.foods.find((f) => f.id === foodId);
          reasons.push({ kind: 'safe_food', foodName: food?.name ?? component.name });
          break;
        }
      }

      const placement = separationFor(component);
      if (placement === 'separated') {
        reasons.push(
          component.canTouchOtherFoods ? { kind: 'no_touching' } : { kind: 'component_separate' }
        );
      }
      return place(component, placement, reasons);
    });

    const onPlate = placements.filter((p) => p.placement === 'on_plate');
    const separated = placements.filter((p) => p.placement === 'separated');
    const heldBack = placements.filter((p) => p.placement === 'held_back');
    const exposure = placements.find((p) => p.placement === 'exposure') ?? null;

    return {
      kidId: kid.id,
      kidName: kid.name,
      placements,
      onPlate,
      separated,
      heldBack,
      exposure,
      blocked,
      isEmpty: onPlate.length + separated.length + (exposure ? 1 : 0) === 0,
    };

    function separationFor(component: RecipeComponent): PlacementKind {
      // Either the child needs everything kept apart, or this component says
      // it needs a gap regardless of who is eating it.
      return dislikesTouching || !component.canTouchOtherFoods ? 'separated' : 'on_plate';
    }
  }

  function findDueExposure(kidId: string): PlatingLadderRow | null {
    const due = (input.ladder ?? []).filter(
      (row) =>
        row.kidId === kidId &&
        row.status === 'active' &&
        row.nextDueOn !== null &&
        row.nextDueOn <= today
    );
    if (due.length === 0) return null;
    // Longest overdue first, so a step that has been waiting is not skipped.
    return [...due].sort((a, b) => (a.nextDueOn ?? '').localeCompare(b.nextDueOn ?? ''))[0];
  }
}

function indexViolations(violations: ConstraintViolation[]): Map<string, ConstraintViolation> {
  const byFood = new Map<string, ConstraintViolation>();
  for (const violation of violations) {
    if (!byFood.has(violation.foodId)) byFood.set(violation.foodId, violation);
  }
  return byFood;
}

function place(
  component: RecipeComponent,
  placement: PlacementKind,
  reasons: PlatingReason[]
): ComponentPlacement {
  return {
    componentId: component.id,
    componentName: component.name,
    placement,
    reasons,
  };
}
