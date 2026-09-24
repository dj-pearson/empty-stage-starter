import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import "@/i18n";
import type { Food, Kid, Recipe } from "@/types";
import type { ScheduleRecipeResult } from "@/contexts/PlanContext";
import { AddToPlannerPopover } from "./AddToPlannerPopover";

const FOODS: Food[] = [
  { id: "f-pb", name: "Peanut butter", category: "protein", is_safe: true, is_try_bite: false, allergens: ["peanuts"] },
  { id: "f-bread", name: "Bread", category: "carb", is_safe: true, is_try_bite: false, allergens: [] },
];
const KIDS: Kid[] = [
  { id: "k-ava", name: "Ava", allergens: ["peanut"] },
  { id: "k-ben", name: "Ben", allergens: [] },
];
const RECIPE: Recipe = { id: "r1", name: "PB Toast", food_ids: ["f-pb", "f-bread"] };

function ok(kidIds: string[]): ScheduleRecipeResult {
  return { error: null, succeeded: kidIds, failed: [], rows: [] };
}

function renderOpen(onSchedule: ReturnType<typeof vi.fn>) {
  return render(
    <AddToPlannerPopover
      recipe={RECIPE}
      kids={KIDS}
      foods={FOODS}
      onSchedule={onSchedule}
      open
      onOpenChange={() => {}}
    />,
  );
}

const submitButton = () => screen.getByRole("button", { name: /^Plan for/ });

describe("AddToPlannerPopover", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("leaves an allergic kid unchecked by default and names the allergen", () => {
    renderOpen(vi.fn());
    expect(screen.getByRole("checkbox", { name: /Ava/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ben/ })).toBeChecked();
    expect(screen.getByText(/Allergy: peanut/)).toBeInTheDocument();
  });

  it("asks for confirmation when an allergic kid is checked", async () => {
    const onSchedule = vi.fn(async (_r: Recipe, _d: string, _s: string, kidIds: string[]) => ok(kidIds));
    renderOpen(onSchedule);
    fireEvent.click(screen.getByRole("checkbox", { name: /Ava/ }));
    fireEvent.click(submitButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Peanut butter contains peanut, which Ava is allergic to/)).toBeInTheDocument();
    expect(onSchedule).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Add anyway" }));
    });
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(onSchedule.mock.calls[0][3]).toEqual(["k-ben", "k-ava"]);
  });

  it("awaits onSchedule, disables the button meanwhile, and schedules once on a double click", async () => {
    let resolve!: (v: ScheduleRecipeResult) => void;
    const onSchedule = vi.fn(
      () =>
        new Promise<ScheduleRecipeResult>((r) => {
          resolve = r;
        }),
    );
    renderOpen(onSchedule);
    const button = submitButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSchedule).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => {
      resolve(ok(["k-ben"]));
    });
    expect(button).not.toBeDisabled();
    // Slot and date are real values, not labels.
    const [, dateISO, slot] = onSchedule.mock.calls[0] as unknown as [Recipe, string, string];
    expect(dateISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(["lunch", "dinner"]).toContain(slot);
  });

  it("does not offer past dates", () => {
    renderOpen(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }));
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const grid = screen.getByRole("grid");
    // Every day cell before today is disabled.
    const cells = within(grid).getAllByRole("gridcell");
    const disabledDays = cells
      .map((c) => c.querySelector("button") ?? c)
      .filter((b) => b.hasAttribute("disabled") || b.getAttribute("aria-disabled") === "true");
    if (yesterday.getMonth() === new Date().getMonth()) {
      expect(disabledDays.length).toBeGreaterThanOrEqual(yesterday.getDate());
    }
    // The first chip is today; there is no chip for an earlier day.
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });
});
