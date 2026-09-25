import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  birthday: false,
  fatigue: false,
  ladder: false,
  safeContent: false,
  seasonalCandidate: null as null | { recipeId: string },
  seasonalEnabledCalls: [] as boolean[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1", householdId: "hh-1" }),
}));
vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({ kids: [{ id: "kid-a", name: "Ava" }], activeKidId: "kid-a" }),
  useFoods: () => ({ foods: [{ id: "f1", name: "Nuggets", is_safe: true }] }),
  usePlan: () => ({ planEntries: [] }),
  useRecipes: () => ({ recipes: [] }),
}));
vi.mock("@/hooks/useFeatureFlag", () => ({ useFeatureFlag: () => h.ladder }));
vi.mock("@/hooks/useVarietyNudgePref", () => ({
  useVarietyNudgePref: () => ({ enabled: true, setEnabled: vi.fn() }),
}));
vi.mock("@/components/KidBirthdayCard", () => ({
  hasBirthdayToday: () => h.birthday,
  KidBirthdayCard: () => <div data-testid="birthday-card" />,
}));
vi.mock("@/components/VarietyFatigueBanner", () => ({
  VarietyFatigueBanner: () => <div data-testid="fatigue-card" />,
  readFatigueDismissal: () => null,
}));
vi.mock("@/components/SafeFoodInsuranceSection", async () => {
  const { useEffect } = await import("react");
  return {
    // Reports like the real one: whether it has alerts, once mounted.
    SafeFoodInsuranceSection: ({ onAvailabilityChange }: { onAvailabilityChange?: (has: boolean) => void }) => {
      useEffect(() => {
        onAvailabilityChange?.(h.safeContent);
      }, [onAvailabilityChange]);
      return null;
    },
  };
});
vi.mock("@/components/SeasonalRecallCard", () => ({
  useSeasonalRecall: (enabled: boolean) => {
    h.seasonalEnabledCalls.push(enabled);
    return {
      priorEntries: enabled ? [] : null,
      topCandidate: enabled ? h.seasonalCandidate : null,
      refreshDismissals: () => {},
    };
  },
  SeasonalRecallCard: () => <div data-testid="seasonal-card" />,
}));
vi.mock("@/lib/varietyFatigue", () => ({
  selectVarietyFatigue: () => ({ recipes: [], ingredients: [], worstTier: "none", computedFor: "" }),
  hasFatigue: () => h.fatigue,
}));

import { InsightSlot } from "./InsightSlot";

function renderSlot() {
  return render(
    <MemoryRouter>
      <InsightSlot />
    </MemoryRouter>,
  );
}

const CARD_IDS = ["birthday-card", "fatigue-card", "seasonal-card"];

function renderedCards(): string[] {
  return CARD_IDS.filter((id) => screen.queryByTestId(id) !== null);
}

describe("InsightSlot", () => {
  beforeEach(() => {
    h.birthday = false;
    h.fatigue = false;
    h.ladder = false;
    h.safeContent = false;
    h.seasonalCandidate = null;
    h.seasonalEnabledCalls.length = 0;
  });

  it("renders only the birthday card when birthday and fatigue both apply", () => {
    h.birthday = true;
    h.fatigue = true;
    renderSlot();
    expect(renderedCards()).toEqual(["birthday-card"]);
    expect(screen.getByRole("link", { name: /see all insights/i })).toHaveAttribute(
      "href",
      "/dashboard/insights?from=birthday",
    );
    // Nothing is fetched for the seasonal card while a higher one is showing.
    expect(h.seasonalEnabledCalls.every((enabled) => !enabled)).toBe(true);
  });

  it("renders null when nothing applies", () => {
    const { container } = renderSlot();
    expect(container).toBeEmptyDOMElement();
  });

  it("falls through to fatigue, then to seasonal, one card at a time", () => {
    h.fatigue = true;
    h.seasonalCandidate = { recipeId: "r1" };
    const first = renderSlot();
    expect(renderedCards()).toEqual(["fatigue-card"]);
    first.unmount();

    h.fatigue = false;
    renderSlot();
    expect(renderedCards()).toEqual(["seasonal-card"]);
  });

  it("gives the slot to safe-food insurance while the ladder flag is on and it has alerts", () => {
    h.ladder = true;
    h.safeContent = true;
    renderSlot();
    expect(screen.getByRole("link", { name: /see all insights/i })).toHaveAttribute(
      "href",
      "/dashboard/insights?from=safeFood",
    );
  });

  it("does not carry a stale safe-food win over a flag off/on cycle", () => {
    h.ladder = true;
    h.safeContent = true;
    h.seasonalCandidate = { recipeId: "r1" };
    const view = renderSlot();
    expect(screen.getByRole("link", { name: /see all insights/i })).toHaveAttribute(
      "href",
      "/dashboard/insights?from=safeFood",
    );

    h.ladder = false;
    view.rerender(
      <MemoryRouter>
        <InsightSlot />
      </MemoryRouter>,
    );
    expect(renderedCards()).toEqual(["seasonal-card"]);

    // Back on, and the section now has nothing: no render in between may
    // treat the old "has content" as current and hide the seasonal card.
    h.safeContent = false;
    h.ladder = true;
    const from = h.seasonalEnabledCalls.length;
    view.rerender(
      <MemoryRouter>
        <InsightSlot />
      </MemoryRouter>,
    );
    expect(h.seasonalEnabledCalls.slice(from).every(Boolean)).toBe(true);
    expect(renderedCards()).toEqual(["seasonal-card"]);
  });
});
