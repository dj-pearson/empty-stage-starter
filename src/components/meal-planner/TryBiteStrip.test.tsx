import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import "@/i18n";
import type { Food, Kid, PlanEntry } from "@/types";
import { isoDay } from "@/lib/mobilePlannerDay";
import { TryBiteStrip, TRY_BITE_STRIP_OPEN_KEY } from "./TryBiteStrip";

const KIDS: Kid[] = [
  { id: "sam", name: "Sam" },
  { id: "ada", name: "Ada" },
];
const FOODS: Food[] = [
  { id: "peas", name: "Peas", category: "vegetable", is_safe: false, is_try_bite: true },
  { id: "kiwi", name: "Kiwi", category: "fruit", is_safe: false, is_try_bite: false },
];

const now = new Date();
const today = isoDay(now);
const weekStartIso = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));

const ENTRIES: PlanEntry[] = [
  { id: "1", kid_id: "sam", date: today, meal_slot: "try_bite", food_id: "peas", result: "tasted" },
  { id: "2", kid_id: "ada", date: today, meal_slot: "try_bite", food_id: "kiwi", result: null },
];

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function renderStrip(props: Partial<Parameters<typeof TryBiteStrip>[0]> = {}) {
  const onOpenKid = vi.fn();
  render(
    <MemoryRouter initialEntries={["/dashboard/planner"]}>
      <Routes>
        <Route
          path="/dashboard/planner"
          element={
            <TryBiteStrip
              weekStartIso={weekStartIso}
              planEntries={ENTRIES}
              foods={FOODS}
              kids={KIDS}
              onOpenKid={onOpenKid}
              {...props}
            />
          }
        />
        <Route path="/dashboard/food-tracker" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenKid };
}

beforeEach(() => localStorage.clear());

describe("TryBiteStrip (item 4)", () => {
  it("lists each kid's try bites with this month's exposures", () => {
    renderStrip();
    const sam = screen.getByTestId("try-bite-sam-peas");
    expect(sam).toHaveTextContent("Peas");
    expect(sam).toHaveTextContent("1 try this month");
    expect(sam).toHaveTextContent("last: tasted");
    expect(screen.getByTestId("try-bite-ada-kiwi")).toHaveTextContent("Not tried this month");
  });

  it("shows only the active kid in single-kid mode", () => {
    renderStrip({ activeKidId: "ada" });
    expect(screen.queryByTestId("try-bite-sam-peas")).toBeNull();
    expect(screen.getByTestId("try-bite-ada-kiwi")).toBeInTheDocument();
  });

  it("links to the Food Tracker row and switches to that kid first", async () => {
    const user = userEvent.setup();
    const { onOpenKid } = renderStrip();
    await user.click(screen.getByTestId("try-bite-ada-kiwi"));
    expect(onOpenKid).toHaveBeenCalledWith("ada");
    expect(screen.getByTestId("where")).toHaveTextContent("/dashboard/food-tracker?food=kiwi");
  });

  it("collapses and remembers it for this viewer", async () => {
    const user = userEvent.setup();
    renderStrip();
    await user.click(screen.getByRole("button", { name: /Try bites this week/ }));
    expect(screen.queryByTestId("try-bite-sam-peas")).toBeNull();
    expect(localStorage.getItem(TRY_BITE_STRIP_OPEN_KEY)).toBe("0");
  });

  it("renders nothing when no try bite is planned", () => {
    renderStrip({ planEntries: [] });
    expect(screen.queryByTestId("try-bite-strip")).toBeNull();
  });
});
