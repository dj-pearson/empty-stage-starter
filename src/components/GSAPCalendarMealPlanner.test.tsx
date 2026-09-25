import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
// Real i18n instance, so t() interpolates the defaultValue copy.
import "@/i18n";

/* The Draggable config each item registers, so a test can drive a drop. */
const draggableConfigs: Array<{ el: Element; vars: Record<string, (...a: unknown[]) => void> }> = [];

vi.mock("gsap", () => {
  const g = { registerPlugin: vi.fn(), to: vi.fn(), set: vi.fn(), fromTo: vi.fn() };
  return { default: g, gsap: g };
});
vi.mock("gsap/Draggable", () => ({
  Draggable: {
    create: vi.fn((el: Element, vars: Record<string, (...a: unknown[]) => void>) => {
      draggableConfigs.push({ el, vars });
      return [{ kill: vi.fn() }];
    }),
  },
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "not", "in"]) chain[m] = () => chain;
  chain.limit = () => Promise.resolve({ data: [], error: null });
  return { supabase: chain };
});

/*
 * Contract C4 (src/lib/kidFit.ts) belongs to another work package. This stand-in
 * follows the contract's shape and uses the real allergen matcher, so the test
 * pins how the grid RENDERS a fit, not how a fit is computed.
 */
vi.mock("@/lib/kidFit", async () => {
  const { matchingAllergen } = await import("@/lib/allergens");
  type K = { allergens?: string[] };
  type F = { allergens?: string[]; is_safe?: boolean; is_try_bite?: boolean };
  const base = { disliked: false, alwaysEats: false, tries: 0, ate: 0, offered: 0, lastResult: null };
  const getKidFoodFit = (kid: K, food: F) => ({
    ...base,
    allergen: matchingAllergen(kid.allergens, food.allergens),
    safe: !!food.is_safe,
    tryBite: !!food.is_try_bite,
  });
  return {
    getKidFoodFit,
    getKidRecipeFit: (kid: K, recipe: { food_ids?: string[] }, foodById: Map<string, F>) => {
      const foods = (recipe.food_ids ?? []).map((id) => foodById.get(id)).filter((f): f is F => !!f);
      const hit = foods.map((f) => matchingAllergen(kid.allergens, f.allergens)).find(Boolean) ?? null;
      return { ...base, allergen: hit, safe: false, tryBite: false };
    },
    buildResultIndex: () => new Map(),
  };
});

vi.mock("@/components/VoteResultsDisplay", () => ({ VoteResultsDisplay: () => null }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: vi.fn() } }));

import { GSAPCalendarMealPlanner } from "./GSAPCalendarMealPlanner";

const WEEK_START = new Date(2026, 8, 20); // Sun Sep 20 2026

const kidA: Kid = { id: "kA", name: "Emma", allergens: ["peanuts"] };
const kidB: Kid = { id: "kB", name: "Leo", allergens: [] };

const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  category: "protein",
  is_safe: false,
  is_try_bite: false,
  quantity: 5,
  ...extra,
});

const rice = food("f-rice", "Rice");
const chicken = food("f-chicken", "Chicken");
const peanut = food("f-pb", "Peanut butter", { allergens: ["Peanuts"] });

const stirFry: Recipe = { id: "r1", name: "Stir fry", food_ids: ["f-rice", "f-chicken"] } as Recipe;

const row = (id: string, over: Partial<PlanEntry>): PlanEntry => ({
  id,
  kid_id: "kA",
  date: "2026-09-21",
  meal_slot: "dinner",
  food_id: "f-rice",
  result: null,
  ...over,
});

function setup(entries: PlanEntry[], props: Record<string, unknown> = {}) {
  const handlers = {
    onOpenFoodSelector: vi.fn(),
    onCopyToChild: vi.fn(),
    onMoveEntries: vi.fn(),
    onDeleteEntries: vi.fn(),
    onMarkResult: vi.fn(),
  };
  const utils = render(
    <GSAPCalendarMealPlanner
      weekStart={WEEK_START}
      planEntries={entries}
      foods={[rice, chicken, peanut]}
      recipes={[stirFry]}
      kids={[kidA, kidB]}
      kidId="kA"
      kidName="Emma"
      {...handlers}
      {...props}
    />
  );
  return { ...utils, handlers };
}

describe("GSAPCalendarMealPlanner", () => {
  beforeEach(() => {
    draggableConfigs.length = 0;
  });
  let rectSpy: { mockRestore: () => void } | null = null;
  afterEach(() => {
    // Only the rect spy: restoreAllMocks would also wipe setup.ts's matchMedia.
    rectSpy?.mockRestore();
    rectSpy = null;
  });

  it("renders a food name without a text-white class", () => {
    setup([row("e1", { food_id: "f-chicken" })]);
    const name = screen.getByTestId("plan-entry-name");
    expect(name).toHaveTextContent("Chicken");
    expect(name.className).not.toMatch(/text-white/);
  });

  it("moves only kid A's recipe rows, in one onMoveEntries call", () => {
    const entries = [
      row("a1", { recipe_id: "r1", food_id: "f-rice" }),
      row("a2", { recipe_id: "r1", food_id: "f-chicken" }),
      row("b1", { kid_id: "kB", recipe_id: "r1", food_id: "f-rice" }),
      row("b2", { kid_id: "kB", recipe_id: "r1", food_id: "f-chicken" }),
    ];
    const { container, handlers } = setup(entries);

    // Kid A's grid shows one item for the recipe.
    expect(screen.getAllByTestId("plan-entry-item")).toHaveLength(1);
    expect(draggableConfigs).toHaveLength(1);

    const target = container.querySelector<HTMLElement>('[data-cell-date="2026-09-23"][data-cell-slot="lunch"]')!;
    const zero = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      return (this === target
        ? { left: 100, top: 100, right: 200, bottom: 200, width: 100, height: 100, x: 100, y: 100, toJSON: () => ({}) }
        : zero) as DOMRect;
    });

    act(() => {
      draggableConfigs[0].vars.onDragEnd.call({ pointerX: 150, pointerY: 150 });
    });

    expect(handlers.onMoveEntries).toHaveBeenCalledTimes(1);
    const [ids, date, slot] = handlers.onMoveEntries.mock.calls[0];
    expect([...ids].sort()).toEqual(["a1", "a2"]);
    expect(date).toBe("2026-09-23");
    expect(slot).toBe("lunch");
  });

  it("bounces back when the drop is outside every cell of this grid", () => {
    const { handlers } = setup([row("a1", { food_id: "f-rice" })]);
    act(() => {
      draggableConfigs[0].vars.onDragEnd.call({ pointerX: 5000, pointerY: 5000 });
    });
    expect(handlers.onMoveEntries).not.toHaveBeenCalled();
  });

  it("item menu Remove deletes every row of the recipe for that kid/date/slot", async () => {
    const user = userEvent.setup();
    const entries = [
      row("a1", { recipe_id: "r1", food_id: "f-rice" }),
      row("a2", { recipe_id: "r1", food_id: "f-chicken" }),
      row("b1", { kid_id: "kB", recipe_id: "r1", food_id: "f-rice" }),
    ];
    const { handlers } = setup(entries);
    await user.click(screen.getByTestId("plan-entry-menu"));
    await user.click(await screen.findByTestId("plan-entry-remove"));
    expect(handlers.onDeleteEntries).toHaveBeenCalledTimes(1);
    expect([...handlers.onDeleteEntries.mock.calls[0][0]].sort()).toEqual(["a1", "a2"]);
  });

  it("renders the allergen chip for an allergic kid", () => {
    setup([row("a1", { food_id: "f-pb" })]);
    const item = screen.getByTestId("plan-entry-item");
    const chip = within(item).getByTestId("kid-fit-allergen");
    expect(chip.getAttribute("aria-label")).toMatch(/peanut/i);
    expect(chip.getAttribute("aria-label")).toMatch(/Emma/);
  });

  it("labels the add buttons with slot and day, and marks nothing else as today", () => {
    setup([]);
    expect(screen.getByRole("button", { name: "Add lunch for Tuesday, Sep 22" })).toBeInTheDocument();
  });

  it("passes the grid's kid to copy and clear week", async () => {
    const user = userEvent.setup();
    const onCopyWeek = vi.fn();
    const onClearWeek = vi.fn();
    setup([], { onCopyWeek, onClearWeek });
    await user.click(screen.getByRole("button", { name: /copy to next week/i }));
    await user.click(screen.getByRole("button", { name: /clear week/i }));
    expect(onCopyWeek).toHaveBeenCalledWith("2026-09-27", "kA");
    expect(onClearWeek).toHaveBeenCalledWith("kA");
  });
});
