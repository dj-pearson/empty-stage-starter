import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => ({
  birthday: false,
  fatigue: false,
  ladder: false,
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
vi.mock("@/components/SafeFoodInsuranceSection", () => ({
  SafeFoodInsuranceSection: () => null,
}));
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
      "/dashboard/insights",
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
});
