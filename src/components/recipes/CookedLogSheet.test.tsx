import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/i18n";
import type { Kid, PlanEntry, Recipe } from "@/types";
import type { CookLogGate } from "@/lib/recipeCookLog";

const toastSuccess = vi.fn((..._a: unknown[]) => undefined);
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
    info: vi.fn(),
  }),
}));

const ava: Kid = { id: "k-ava", name: "Ava", allergens: ["peanut"] };
const ben: Kid = { id: "k-ben", name: "Ben", allergens: [] };
const entry: PlanEntry = {
  id: "p1",
  kid_id: "k-ben",
  date: "2026-09-24",
  meal_slot: "dinner",
  food_id: "f",
  result: null,
  recipe_id: "r1",
};

const undo = vi.fn(async () => undefined);
const logCooked = vi.fn(async (_recipe: Recipe, _choices: unknown[]) => ({
  logged: ["k-ben"] as string[],
  blocked: [] as string[],
  failed: [] as string[],
  createdIds: [] as string[],
  undo,
}));
const preview = vi.fn(
  (): Array<{ kid: Kid; entry: PlanEntry | undefined; gate: CookLogGate | null }> => [
    { kid: ava, entry: undefined, gate: { reason: "allergen", allergen: "peanut", severe: false } },
    { kid: ben, entry, gate: null },
  ],
);
vi.mock("@/hooks/useRecipeCookLog", () => ({ useRecipeCookLog: () => ({ preview, logCooked }) }));

import { CookedLogSheet } from "./CookedLogSheet";

const RECIPE: Recipe = { id: "r1", name: "PB toast", food_ids: ["f"] };

beforeEach(() => {
  logCooked.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe("CookedLogSheet", () => {
  it("asks per kid, explains a gated kid, and saves the choices through the plan", async () => {
    const onOpenChange = vi.fn();
    render(<CookedLogSheet recipe={RECIPE} open onOpenChange={onOpenChange} />);

    expect(screen.getByTestId("cooked-gate-k-ava")).toHaveTextContent("Allergy: peanut");
    expect(screen.getByText("On today's Dinner")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    const group = screen.getByRole("radiogroup", { name: "What Ben did" });
    fireEvent.click(group.querySelector('[role="radio"]:nth-child(2)') as HTMLElement);
    expect(screen.getByRole("radio", { name: "Tasted" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(save);
    await waitFor(() => expect(logCooked).toHaveBeenCalledTimes(1));
    expect(logCooked.mock.calls[0][1]).toEqual([{ kidId: "k-ben", result: "tasted" }]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // Undo is offered on the success toast and runs the outcome's undo.
    const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
    opts.action.onClick();
    expect(undo).toHaveBeenCalled();
  });

  it("says an allergy with no recorded severity is treated as severe, without calling it severe (item 3a)", () => {
    const original = preview.getMockImplementation();
    preview.mockImplementation(() => [
      {
        kid: ava,
        entry: undefined,
        gate: { reason: "allergen", allergen: "peanut", severe: true, severityRecorded: false },
      },
      { kid: ben, entry, gate: null },
    ]);
    try {
      render(<CookedLogSheet recipe={RECIPE} open onOpenChange={vi.fn()} />);
      const gate = screen.getByTestId("cooked-gate-k-ava");
      expect(gate).toHaveTextContent("peanut allergy, severity not recorded (treated as severe). Not added to the plan.");
      expect(gate).not.toHaveTextContent(/Severe peanut allergy/);
    } finally {
      if (original) preview.mockImplementation(original);
    }
  });

  it("tapping the chosen result again clears it", () => {
    render(<CookedLogSheet recipe={RECIPE} open onOpenChange={vi.fn()} />);
    const ate = screen.getByRole("radio", { name: "Ate" });
    fireEvent.click(ate);
    expect(ate).toHaveAttribute("aria-checked", "true");
    fireEvent.click(ate);
    expect(ate).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("after a partial failure, Save again retries only the kids that failed", async () => {
    const cal: Kid = { id: "k-cal", name: "Cal", allergens: [] };
    preview.mockReturnValueOnce([
      { kid: ben, entry, gate: null },
      { kid: cal, entry: undefined, gate: null },
    ]);
    logCooked.mockResolvedValueOnce({ logged: ["k-ben"], blocked: [], failed: ["k-cal"], createdIds: [], undo });
    const onOpenChange = vi.fn();
    render(<CookedLogSheet recipe={RECIPE} open onOpenChange={onOpenChange} />);
    const pick = (group: string) =>
      fireEvent.click(
        screen.getByRole("radiogroup", { name: group }).querySelector('[role="radio"]') as HTMLElement,
      );
    pick("What Ben did");
    pick("What Cal did");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(logCooked).toHaveBeenCalledTimes(2));
    expect(logCooked.mock.calls[1][1]).toEqual([{ kidId: "k-cal", result: "ate" }]);
  });
});
