import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, Kid } from "@/types";
import { PantryStarterSheet } from "./PantryStarterSheet";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const ava = { id: "k1", name: "Ava", allergens: ["peanuts"], allergen_severity: { peanuts: "severe" } } as Kid;
const ben = { id: "k2", name: "Ben", allergens: ["dairy"], allergen_severity: { dairy: "mild" } } as Kid;
/** Dairy allergy recorded with no severity (item 3a). */
const cal = { id: "k3", name: "Cal", allergens: ["dairy"] } as Kid;

function renderSheet(foods: Food[] = [], kids: Kid[] = [ava, ben]) {
  const onAdd = vi.fn(async () => true);
  const onOpenChange = vi.fn();
  render(<PantryStarterSheet open onOpenChange={onOpenChange} kids={kids} foods={foods} onAdd={onAdd} />);
  return { onAdd, onOpenChange };
}

describe("PantryStarterSheet", () => {
  it("starts with nothing ticked", () => {
    renderSheet();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThan(20);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Tick foods to add" })).toBeDisabled();
  });

  it("disables a row that hits a kid's allergen and says why, severe ones as severe", () => {
    renderSheet();
    const pb = screen.getByRole("checkbox", { name: "Peanut butter" });
    expect(pb).toBeDisabled();
    expect(pb).toHaveAccessibleDescription(/Severe allergy, not for Ava: peanut/);
    const cheese = screen.getByRole("checkbox", { name: "Cheese" });
    expect(cheese).toBeDisabled();
    expect(cheese).toHaveAccessibleDescription("Not for Ben: milk");
  });

  it("blocks an allergy with no recorded severity like a severe one, and says it was not recorded (item 3a)", () => {
    renderSheet([], [cal]);
    const cheese = screen.getByRole("checkbox", { name: "Cheese" });
    expect(cheese).toBeDisabled();
    expect(cheese).toHaveAccessibleDescription(
      "Allergy (severity not recorded, treated as severe), not for Cal: milk",
    );
  });

  it("shows each open row's fit for the kids", () => {
    renderSheet();
    const rice = screen.getByRole("checkbox", { name: "Rice" }).closest("li") as HTMLElement;
    expect(within(rice).getByText("No allergens")).toBeInTheDocument();
  });

  it("adds ticked foods at 1 each, not marked safe", async () => {
    const { onAdd } = renderSheet();
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Rice" }));
    await user.click(screen.getByRole("checkbox", { name: "Bananas" }));
    await user.click(screen.getByRole("button", { name: "Add 2 foods" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const [foods] = onAdd.mock.calls[0] as unknown as [Omit<Food, "id">[]];
    expect(foods.map((f) => f.name).sort()).toEqual(["Bananas", "Rice"]);
    for (const f of foods) {
      expect(f).toMatchObject({ quantity: 1, is_safe: false, is_try_bite: false });
    }
  });

  it("does not offer what the pantry already has", () => {
    renderSheet([{ id: "f1", name: "Rice", category: "carb", is_safe: false, is_try_bite: false }]);
    const rice = screen.getByRole("checkbox", { name: "Rice" });
    expect(rice).toBeDisabled();
    expect(rice).toHaveAccessibleDescription("Already in your pantry");
  });
});
