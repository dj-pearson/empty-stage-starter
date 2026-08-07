/**
 * US-613: per-kid plating from one recipe.
 *
 * The three cases the story names are covered first: a component held back for
 * the one child who dislikes it, separation honoured for a child who cannot
 * have foods touching, and a due ladder step plated as the exposure. The rest
 * guard the two rules that matter most — a hard violation always wins, and an
 * exposure is never forced onto a plate the child has a reason to refuse.
 */

import { describe, it, expect } from 'vitest';
import { planPlates, type PlatingInput, type PlatingKid } from './platePlanner';
import type { RecipeComponent } from './recipeComponents';
import type { SolverRecipe } from './siblingConstraintSolver';

const TODAY = '2026-08-06';

const FOODS = [
  { id: 'pasta', name: 'Pasta', category: 'grain', allergens: ['gluten'] },
  { id: 'sauce', name: 'Tomato sauce', category: 'vegetable', allergens: [] },
  { id: 'peas', name: 'Peas', category: 'vegetable', allergens: [] },
  { id: 'cheese', name: 'Cheese', category: 'dairy', allergens: ['dairy'] },
];

const RECIPE: SolverRecipe = {
  id: 'recipe-1',
  name: 'Pasta bake',
  foodIds: FOODS.map((f) => f.id),
  foods: FOODS,
};

function component(over: Partial<RecipeComponent> & { id: string }): RecipeComponent {
  return {
    recipeId: 'recipe-1',
    name: over.id,
    sortOrder: 0,
    canTouchOtherFoods: true,
    isMixedIn: false,
    canBeHeldBack: true,
    textures: [],
    foodId: null,
    notes: null,
    ...over,
  };
}

const COMPONENTS: RecipeComponent[] = [
  component({ id: 'c-pasta', name: 'Pasta', sortOrder: 0, foodId: 'pasta', canBeHeldBack: false }),
  component({
    id: 'c-sauce',
    name: 'Tomato sauce',
    sortOrder: 1,
    foodId: 'sauce',
    isMixedIn: true,
    textures: ['Wet'],
  }),
  component({ id: 'c-peas', name: 'Peas', sortOrder: 2, foodId: 'peas', textures: ['Soft/mushy'] }),
  component({ id: 'c-cheese', name: 'Cheese', sortOrder: 3, foodId: 'cheese' }),
];

function kid(over: Partial<PlatingKid> & { id: string }): PlatingKid {
  return { name: over.id, ...over };
}

function plan(over: Partial<PlatingInput> = {}) {
  return planPlates({
    recipe: RECIPE,
    components: COMPONENTS,
    kids: [],
    today: TODAY,
    ...over,
  });
}

function placementOf(
  plate: { placements: { componentId: string; placement: string }[] },
  id: string
) {
  return plate.placements.find((p) => p.componentId === id)?.placement;
}

describe('planPlates', () => {
  it('holds a disliked component back for that kid only', () => {
    const [picky, easy] = plan({
      kids: [
        kid({ id: 'picky', name: 'Sam', dislikedFoods: ['peas'] }),
        kid({ id: 'easy', name: 'Alex' }),
      ],
    });

    expect(placementOf(picky, 'c-peas')).toBe('held_back');
    expect(picky.heldBack.map((p) => p.componentName)).toEqual(['Peas']);
    expect(picky.heldBack[0].reasons).toEqual([{ kind: 'disliked', foodName: 'Peas' }]);

    // The sibling's plate is untouched.
    expect(placementOf(easy, 'c-peas')).toBe('on_plate');
    expect(easy.heldBack).toEqual([]);
  });

  it('separates everything for a kid who cannot have foods touching, and holds the sauce', () => {
    const [plate] = plan({
      kids: [
        kid({
          id: 'sep',
          name: 'Rowan',
          textureDislikes: ['Foods touching each other'],
        }),
      ],
    });

    // A sauce stirred through makes everything touch, so it comes off.
    expect(placementOf(plate, 'c-sauce')).toBe('held_back');
    expect(plate.heldBack[0].reasons).toContainEqual({ kind: 'no_touching' });

    // Everything that stays goes on with a gap around it.
    expect(placementOf(plate, 'c-pasta')).toBe('separated');
    expect(placementOf(plate, 'c-peas')).toBe('separated');
    expect(placementOf(plate, 'c-cheese')).toBe('separated');
    expect(plate.onPlate).toEqual([]);
  });

  it('plates a due ladder step as that kid’s exposure', () => {
    const [plate] = plan({
      kids: [kid({ id: 'k1', name: 'Emma' })],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'peas',
          currentRung: 'touching',
          status: 'active',
          nextDueOn: '2026-08-05',
        },
      ],
    });

    expect(placementOf(plate, 'c-peas')).toBe('exposure');
    expect(plate.exposure?.componentName).toBe('Peas');
    expect(plate.exposure?.reasons).toEqual([{ kind: 'due_exposure', rung: 'touching' }]);
  });

  it('does not plate an exposure that is not due yet, or one that is paused', () => {
    const notDue = plan({
      kids: [kid({ id: 'k1' })],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'peas',
          currentRung: 'touching',
          status: 'active',
          nextDueOn: '2026-08-09',
        },
      ],
    })[0];
    expect(notDue.exposure).toBeNull();

    const paused = plan({
      kids: [kid({ id: 'k1' })],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'peas',
          currentRung: 'touching',
          status: 'paused',
          nextDueOn: '2026-08-01',
        },
      ],
    })[0];
    expect(paused.exposure).toBeNull();
  });

  it('never forces an exposure the kid has a reason to refuse', () => {
    const [plate] = plan({
      kids: [kid({ id: 'k1', dislikedFoods: ['peas'] })],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'peas',
          currentRung: 'touching',
          status: 'active',
          nextDueOn: '2026-08-01',
        },
      ],
    });

    expect(placementOf(plate, 'c-peas')).toBe('held_back');
    expect(plate.exposure).toBeNull();
  });

  it('plates at most one exposure, taking the longest overdue first', () => {
    const [plate] = plan({
      kids: [kid({ id: 'k1' })],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'cheese',
          currentRung: 'licking',
          status: 'active',
          nextDueOn: '2026-08-05',
        },
        {
          kidId: 'k1',
          foodId: 'peas',
          currentRung: 'touching',
          status: 'active',
          nextDueOn: '2026-08-01',
        },
      ],
    });

    expect(plate.exposure?.componentName).toBe('Peas');
    expect(plate.placements.filter((p) => p.placement === 'exposure')).toHaveLength(1);
    expect(placementOf(plate, 'c-cheese')).toBe('on_plate');
  });

  it('an allergen always comes off, whatever else the component is', () => {
    const [plate] = plan({
      kids: [
        kid({
          id: 'k1',
          allergens: ['dairy'],
          // Even with cheese due as an exposure, it comes off.
        }),
      ],
      ladder: [
        {
          kidId: 'k1',
          foodId: 'cheese',
          currentRung: 'licking',
          status: 'active',
          nextDueOn: '2026-08-01',
        },
      ],
    });

    expect(placementOf(plate, 'c-cheese')).toBe('held_back');
    expect(plate.heldBack[0].reasons[0]).toMatchObject({ kind: 'allergen', foodName: 'Cheese' });
    expect(plate.exposure).toBeNull();
    expect(plate.blocked).toBe(false);
  });

  it('blocks the plate when something unsafe cannot be taken off the dish', () => {
    // Pasta is the dish (canBeHeldBack false) and carries gluten.
    const [plate] = plan({
      kids: [kid({ id: 'k1', allergens: ['gluten'] })],
    });

    expect(placementOf(plate, 'c-pasta')).toBe('held_back');
    expect(plate.blocked).toBe(true);
    expect(plate.heldBack[0].reasons).toContainEqual({ kind: 'cannot_hold_back' });
  });

  it('surfaces a component that cannot be held back rather than hiding the clash', () => {
    // Pasta is the dish, and this child dislikes it.
    const [plate] = plan({
      kids: [kid({ id: 'k1', dislikedFoods: ['pasta'] })],
    });

    const pasta = plate.placements.find((p) => p.componentId === 'c-pasta')!;
    expect(pasta.placement).toBe('on_plate');
    expect(pasta.reasons).toContainEqual({ kind: 'cannot_hold_back' });
    expect(pasta.reasons).toContainEqual({ kind: 'disliked', foodName: 'Pasta' });
    // A soft clash is not a block — the parent decides.
    expect(plate.blocked).toBe(false);
  });

  it('holds back a component whose texture the kid cannot tolerate', () => {
    const [plate] = plan({
      kids: [kid({ id: 'k1', textureDislikes: ['Soft/mushy'] })],
    });

    expect(placementOf(plate, 'c-peas')).toBe('held_back');
    expect(plate.heldBack[0].reasons).toContainEqual({ kind: 'texture', texture: 'Soft/mushy' });
    // Only the clashing component; the rest is unaffected.
    expect(plate.heldBack).toHaveLength(1);
  });

  it('gives a component that cannot touch its own space, for every kid', () => {
    const components = [
      component({ id: 'c-peas', name: 'Peas', foodId: 'peas', canTouchOtherFoods: false }),
    ];

    const [plate] = plan({ components, kids: [kid({ id: 'k1' })] });

    expect(placementOf(plate, 'c-peas')).toBe('separated');
    expect(plate.separated[0].reasons).toContainEqual({ kind: 'component_separate' });
  });

  it('names a safe food so the anchor on the plate is visible', () => {
    const [plate] = plan({
      kids: [kid({ id: 'k1', alwaysEatsFoods: ['pasta'] })],
    });

    const pasta = plate.placements.find((p) => p.componentId === 'c-pasta')!;
    expect(pasta.reasons).toContainEqual({ kind: 'safe_food', foodName: 'Pasta' });
  });

  it('accounts for foods a component contributes through its ingredients', () => {
    const components = [component({ id: 'c-topping', name: 'Topping', sortOrder: 0 })];

    const [plate] = plan({
      components,
      componentFoods: [{ componentId: 'c-topping', foodId: 'cheese' }],
      kids: [kid({ id: 'k1', allergens: ['dairy'] })],
    });

    expect(placementOf(plate, 'c-topping')).toBe('held_back');
    expect(plate.heldBack[0].reasons[0]).toMatchObject({ kind: 'allergen' });
  });

  it('reports an empty plate rather than pretending there is a meal', () => {
    const components = [
      component({ id: 'c-peas', name: 'Peas', foodId: 'peas' }),
      component({ id: 'c-cheese', name: 'Cheese', foodId: 'cheese' }),
    ];

    const [plate] = plan({
      components,
      kids: [kid({ id: 'k1', dislikedFoods: ['peas', 'cheese'] })],
    });

    expect(plate.isEmpty).toBe(true);
    expect(plate.blocked).toBe(false);
    expect(plate.heldBack).toHaveLength(2);
  });

  it('gives every component a decision on every plate', () => {
    const plates = plan({
      kids: [kid({ id: 'a' }), kid({ id: 'b', dislikedFoods: ['peas'] })],
    });

    for (const plate of plates) {
      expect(plate.placements.map((p) => p.componentId)).toEqual([
        'c-pasta',
        'c-sauce',
        'c-peas',
        'c-cheese',
      ]);
    }
  });
});
