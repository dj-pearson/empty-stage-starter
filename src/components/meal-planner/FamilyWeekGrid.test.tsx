import type React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { isoDay } from "@/lib/mobilePlannerDay";
import { FamilyWeekGrid } from "./FamilyWeekGrid";
import { PLAN_IDS_MIME, readDraggedIds } from "@/lib/familyWeekGrid";

vi.mock("@/components/ui/drawer", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children?: React.ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  };
});

const KIDS: Kid[] = [
  { id: "sam", name: "Sam", allergens: [] },
  { id: "ada", name: "Ada", allergens: ["peanut"] },
];
const FOODS: Food[] = [
  { id: "pasta", name: "Pasta", category: "carb", is_safe: true, is_try_bite: false, quantity: 2 },
  { id: "toast", name: "Toast", category: "carb", is_safe: true, is_try_bite: false, quantity: 2 },
  { id: "pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanut"] },
];
const RECIPES: Recipe[] = [{ id: "mac", name: "Mac and cheese", food_ids: ["pasta"] }];

// Monday of the week containing today, so today's column accepts outcomes.
const now = new Date();
const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
const today = isoDay(now);
const nextWeekDay = (i: number) => isoDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));

function setup(planEntries: PlanEntry[]) {
  const props = {
    onAddEntry: vi.fn(),
    onSelectRecipeForKids: vi.fn(),
    onReplaceSlot: vi.fn(),
    onDeleteEntries: vi.fn(),
    onMoveEntries: vi.fn(),
    onMarkResult: vi.fn(),
    onViewKid: vi.fn(),
    onCopyWeek: vi.fn(),
    onClearWeek: vi.fn(),
  };
  render(
    <FamilyWeekGrid weekStart={weekStart} planEntries={planEntries} foods={FOODS} recipes={RECIPES} kids={KIDS} {...props} />,
  );
  return props;
}

const dinnerForBoth: PlanEntry[] = [
  { id: "1", kid_id: "sam", date: today, meal_slot: "dinner", food_id: "pasta", recipe_id: "mac", is_primary_dish: true, result: null },
  { id: "2", kid_id: "ada", date: today, meal_slot: "dinner", food_id: "toast", result: null },
];

const cell = (date: string, slot: string) =>
  document.querySelector<HTMLElement>(`[data-cell-date="${date}"][data-cell-slot="${slot}"]`)!;

describe("FamilyWeekGrid (item 2)", () => {
  it("is one grid with the family dish once and a line per kid", () => {
    setup(dinnerForBoth);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const c = cell(today, "dinner");
    // A tie between a recipe and a food goes to the recipe.
    expect(within(c).getByRole("button", { name: /Change family Dinner .*Mac and cheese/ })).toBeInTheDocument();
    const sam = within(c).getByTestId(`family-line-${today}-dinner-sam`);
    const ada = within(c).getByTestId(`family-line-${today}-dinner-ada`);
    expect(sam).toHaveTextContent("Family meal");
    expect(ada).toHaveTextContent("Toast");
  });

  it("shows a per-kid fit chip from kidFit", () => {
    setup([
      { id: "1", kid_id: "sam", date: today, meal_slot: "snack1", food_id: "pb", result: null },
      { id: "2", kid_id: "ada", date: today, meal_slot: "snack1", food_id: "pb", result: null },
    ]);
    const c = cell(today, "snack1");
    expect(within(within(c).getByTestId(`family-line-${today}-snack1-ada`)).getByText(/Not for Ada: peanut/)).toBeInTheDocument();
    expect(within(within(c).getByTestId(`family-line-${today}-snack1-sam`)).queryByText(/Not for/)).toBeNull();
  });

  it("adds a family meal for every kid in one call", async () => {
    const user = userEvent.setup();
    const p = setup([]);
    await user.click(within(cell(today, "dinner")).getByRole("button", { name: /Add family Dinner/ }));
    await user.click(screen.getByRole("tab", { name: /Recipes/ }));
    const rows = screen.getAllByRole("button", { name: /Mac and cheese/ });
    await user.click(rows[rows.length - 1]);
    expect(p.onSelectRecipeForKids).toHaveBeenCalledWith("mac", today, "dinner", ["sam", "ada"]);
  });

  it("adds for one kid who has nothing in a slot the others share", async () => {
    const user = userEvent.setup();
    const p = setup([dinnerForBoth[0]]);
    await user.click(within(cell(today, "dinner")).getByRole("button", { name: /Add Dinner for Ada/ }));
    await user.click(screen.getByRole("button", { name: /Toast/ }));
    expect(p.onAddEntry).toHaveBeenCalledWith("ada", today, "dinner", "toast");
  });

  it("logs an outcome per kid on the kid's primary row", async () => {
    const user = userEvent.setup();
    const p = setup(dinnerForBoth);
    const ada = within(cell(today, "dinner")).getByTestId(`family-line-${today}-dinner-ada`);
    await user.click(within(ada).getByRole("button", { name: "Refused" }));
    expect(p.onMarkResult).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }), "refused");
  });

  it("removes one kid's meal without touching the other's", async () => {
    const user = userEvent.setup();
    const p = setup(dinnerForBoth);
    await user.click(screen.getByRole("button", { name: /Ada's Dinner options/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Remove Ada's Dinner/ }));
    expect(p.onDeleteEntries).toHaveBeenCalledWith(["2"]);
  });

  it("moves one kid's meal to another day from the menu (the keyboard path)", async () => {
    const user = userEvent.setup();
    const p = setup(dinnerForBoth);
    await user.click(screen.getByRole("button", { name: /Ada's Dinner options/ }));
    const trigger = await screen.findByRole("menuitem", { name: /Move to/ });
    trigger.focus();
    await user.keyboard("{ArrowRight}");
    const otherDay = nextWeekDay(0) === today ? nextWeekDay(1) : nextWeekDay(0);
    const [y, m, d] = otherDay.split("-").map(Number);
    const label = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date(y, m - 1, d));
    await user.click(await screen.findByRole("menuitem", { name: label }));
    expect(p.onMoveEntries).toHaveBeenCalledTimes(1);
    const [ids, date, slot] = p.onMoveEntries.mock.calls[0];
    expect(ids).toEqual(["2"]);
    expect(date).toBe(otherDay);
    expect(slot).toBe("dinner");
  });

  it("logs everyone at once when they all share the dish", async () => {
    const user = userEvent.setup();
    const p = setup([
      { id: "1", kid_id: "sam", date: today, meal_slot: "lunch", food_id: "pasta", result: null },
      { id: "2", kid_id: "ada", date: today, meal_slot: "lunch", food_id: "pasta", result: "ate" },
    ]);
    await user.click(screen.getByRole("button", { name: /Family Lunch options/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Everyone ate it/ }));
    expect(p.onMarkResult).toHaveBeenCalledTimes(1);
    expect(p.onMarkResult).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }), "ate");
  });

  it("moves one kid's meal by drag and drop", () => {
    const p = setup(dinnerForBoth);
    const store = new Map<string, string>();
    const dataTransfer = {
      types: [PLAN_IDS_MIME],
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
    fireEvent.dragStart(screen.getByTestId(`family-line-${today}-dinner-ada`), { dataTransfer });
    const target = cell(nextWeekDay(0) === today ? nextWeekDay(1) : nextWeekDay(0), "lunch");
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(p.onMoveEntries).toHaveBeenCalledWith(["2"], target.dataset.cellDate, "lunch");
  });

  it("moves the family dish for the kids on it, and not a kid on a substitute", () => {
    const p = setup(dinnerForBoth);
    const store = new Map<string, string>();
    const dataTransfer = {
      types: [PLAN_IDS_MIME],
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? "",
    };
    fireEvent.dragStart(screen.getByTestId(`family-dish-${today}-dinner`), { dataTransfer });
    const target = cell(today, "lunch");
    fireEvent.drop(target, { dataTransfer });
    expect(p.onMoveEntries).toHaveBeenCalledWith(["1"], today, "lunch");
  });

  it("a drop back on the cell the drag started from moves nothing", () => {
    const p = setup(dinnerForBoth);
    const store = new Map<string, string>();
    const dataTransfer = {
      types: [PLAN_IDS_MIME],
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? "",
    };
    fireEvent.dragStart(screen.getByTestId(`family-line-${today}-dinner-ada`), { dataTransfer });
    fireEvent.drop(cell(today, "dinner"), { dataTransfer });
    expect(p.onMoveEntries).not.toHaveBeenCalled();
  });

  it("switches to one kid's detailed week", async () => {
    const user = userEvent.setup();
    const p = setup([]);
    await user.click(screen.getByRole("button", { name: "Ada" }));
    expect(p.onViewKid).toHaveBeenCalledWith("ada");
  });

  it("does not offer outcomes on a day that has not happened", () => {
    const future = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8));
    render(
      <FamilyWeekGrid
        weekStart={new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)}
        planEntries={[{ id: "9", kid_id: "sam", date: future, meal_slot: "lunch", food_id: "pasta", result: null }]}
        foods={FOODS}
        recipes={RECIPES}
        kids={KIDS}
        onAddEntry={vi.fn()}
        onSelectRecipeForKids={vi.fn()}
        onReplaceSlot={vi.fn()}
        onDeleteEntries={vi.fn()}
        onMoveEntries={vi.fn()}
        onMarkResult={vi.fn()}
      />,
    );
    expect(within(cell(future, "lunch")).queryByRole("button", { name: "Ate" })).toBeNull();
  });
});

describe("readDraggedIds", () => {
  it("accepts a non-empty list of id strings only", () => {
    expect(readDraggedIds(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(readDraggedIds("[]")).toBeNull();
    expect(readDraggedIds(JSON.stringify([1]))).toBeNull();
    expect(readDraggedIds("nope")).toBeNull();
  });
});
