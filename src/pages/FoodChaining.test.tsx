import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { useState } from "react";
import type { FeatureLimitResult } from "@/lib/featureLimits";
import type { Food, Kid } from "@/types";

const h = vi.hoisted(() => ({
  checkFeatureLimit: vi.fn(),
  trackEvent: vi.fn(),
  setActiveKid: vi.fn(),
  recMounts: vi.fn(),
  useFoodLadder: vi.fn(),
  from: vi.fn(),
  writes: vi.fn(),
  ladderRows: [] as Record<string, unknown>[],
  state: {
    kids: [] as Kid[],
    activeKidId: null as string | null,
    foods: [] as Food[],
    kidsHydrated: true,
    foodsHydrated: true,
  },
  rerender: null as null | (() => void),
}));

vi.mock("@/lib/featureLimits", () => ({
  checkFeatureLimit: (feature: string) => h.checkFeatureLimit(feature),
}));
vi.mock("@/lib/upgradePromptBus", () => ({ requestUpgradePrompt: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: { trackEvent: h.trackEvent } }));
vi.mock("@/hooks/useFeatureFlag", () => ({ useFeatureFlag: () => true }));
vi.mock("@/hooks/useFoodLadder", () => ({ useFoodLadder: h.useFoodLadder }));
vi.mock("@/components/FoodChainingRecommendations", async () => {
  const { useEffect } = await import("react");
  return {
    FoodChainingRecommendations: ({ kid, targetFoodId }: { kid: Kid; targetFoodId: string | null }) => {
      useEffect(() => {
        h.recMounts(kid.id);
        // Mount only: a remount (the page's key={kid.id}) is what this counts.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <div data-testid="recs">
          {kid.id}:{String(targetFoodId)}
        </div>
      );
    },
  };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      h.from(table);
      const write = (op: string) => () => {
        h.writes(table, op);
        return Promise.resolve({ data: null, error: null });
      };
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: h.ladderRows, error: null }),
        }),
        update: write("update"),
        upsert: write("upsert"),
        insert: write("insert"),
      };
    },
  },
}));
vi.mock("@/contexts/AppContext", () => ({
  useKids: () => ({
    kids: h.state.kids,
    activeKidId: h.state.activeKidId,
    kidsHydrated: h.state.kidsHydrated,
    setActiveKid: (id: string | null) => {
      h.setActiveKid(id);
      h.state.activeKidId = id;
      h.rerender?.();
    },
  }),
  useFoods: () => ({ foods: h.state.foods, foodsHydrated: h.state.foodsHydrated }),
}));

import FoodChaining from "./FoodChaining";

const kid = (id: string, name: string): Kid => ({ id, name, age: 4 }) as Kid;
const food = (id: string, name: string): Food => ({ id, name, category: "carb", is_safe: true, is_try_bite: false }) as Food;

let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}

/** Re-renders the page itself when the mocked context changes (children props would bail out). */
function Harness() {
  const [, setTick] = useState(0);
  h.rerender = () => setTick((n) => n + 1);
  return (
    <>
      <FoodChaining />
      <LocationProbe />
    </>
  );
}

function renderPage(url = "/dashboard/food-chaining") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[url]}>
        <Harness />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("FoodChaining page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ladderRows = [];
    h.state = {
      kids: [kid("k1", "Maya"), kid("k2", "Leo")],
      activeKidId: "k1",
      foods: [food("f1", "Pasta"), food("f2", "Rice")],
      kidsHydrated: true,
      foodsHydrated: true,
    };
    h.checkFeatureLimit.mockResolvedValue({ allowed: true } satisfies FeatureLimitResult);
  });

  it("renders exactly one h1, for the active child, when the gate allows", async () => {
    renderPage();
    await screen.findByTestId("recs");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Maya's food chains");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("keeps its own h1 and makes the lock heading an h2 when blocked", async () => {
    h.checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 0, current: 0 } satisfies FeatureLimitResult);
    renderPage();
    const lock = await screen.findByRole("heading", { level: 2 });
    expect(lock).toHaveTextContent("Food Chaining is locked");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByTestId("recs")).toBeNull();
    // The kid chips stay usable outside the gate.
    expect(screen.getByRole("group", { name: "Choose a child" })).toBeInTheDocument();
  });

  it("applies ?kid=k2&food=f1, then strips both params", async () => {
    renderPage("/dashboard/food-chaining?kid=k2&food=f1&other=1");
    expect(await screen.findByText("k2:f1")).toBeInTheDocument();
    expect(h.setActiveKid).toHaveBeenCalledWith("k2");
    await waitFor(() => expect(lastSearch).toBe("?other=1"));
  });

  it("ignores unknown ids and still strips them", async () => {
    renderPage("/dashboard/food-chaining?kid=nope&food=nope");
    expect(await screen.findByText("k1:null")).toBeInTheDocument();
    expect(h.setActiveKid).not.toHaveBeenCalled();
    await waitFor(() => expect(lastSearch).toBe(""));
  });

  it("waits for kids and foods before reading the deep link", async () => {
    h.state.foodsHydrated = false;
    const view = renderPage("/dashboard/food-chaining?kid=k2&food=f1");
    await screen.findByTestId("recs");
    expect(h.setActiveKid).not.toHaveBeenCalled();
    expect(lastSearch).toBe("?kid=k2&food=f1");
    h.state.foodsHydrated = true;
    act(() => h.rerender?.());
    expect(await screen.findByText("k2:f1")).toBeInTheDocument();
    view.unmount();
  });

  it("auto-selects the only child when none is active", async () => {
    h.state.kids = [kid("k1", "Maya")];
    h.state.activeKidId = null;
    renderPage();
    await screen.findByTestId("recs");
    expect(h.setActiveKid).toHaveBeenCalledTimes(1);
    expect(h.setActiveKid).toHaveBeenCalledWith("k1");
  });

  it("asks whose chains with several children and none active, with no dead end", async () => {
    h.state.activeKidId = null;
    renderPage();
    expect(await screen.findByText(/Whose chains\?/)).toBeInTheDocument();
    expect(screen.queryByText(/Please select a child/i)).toBeNull();
    expect(screen.queryByTestId("recs")).toBeNull();
    expect(h.setActiveKid).not.toHaveBeenCalled();
  });

  it("links to Kids when there are no children", async () => {
    h.state.kids = [];
    h.state.activeKidId = null;
    renderPage();
    expect(await screen.findByRole("link", { name: "Add a child to start a chain" })).toHaveAttribute(
      "href",
      "/dashboard/kids",
    );
  });

  it("never fires exposure_ladder_viewed, and fires ladder_link_shown once", async () => {
    renderPage();
    await screen.findByRole("link", { name: /ladder/ });
    // ladder_link_shown fires from a passive effect after the link commits, so
    // on a loaded CI runner findByRole can resolve before it has run. Wait for
    // the event, then check it fired only once.
    const names = () => h.trackEvent.mock.calls.map((c) => c[0]);
    await waitFor(() => expect(names()).toContain("ladder_link_shown"));
    expect(names()).not.toContain("exposure_ladder_viewed");
    expect(names().filter((n) => n === "ladder_link_shown")).toHaveLength(1);
    await waitFor(() =>
      expect(h.trackEvent).toHaveBeenCalledWith("picky_win_tab_opened", { surface: "food_chaining" }),
    );
  });

  it("reads the ladder without writing it, and names the next food", async () => {
    h.ladderRows = [
      {
        id: "r1",
        kid_id: "k1",
        food_id: "f2",
        status: "active",
        current_rung: "touching",
        consecutive_successes: 1,
        consecutive_holds: 0,
        next_due_on: null,
      },
    ];
    renderPage();
    const link = await screen.findByRole("link", { name: "Next on Maya's ladder: Rice" });
    expect(link).toHaveAttribute("href", "/dashboard/food-tracker?food=f2");
    fireEvent.click(link);
    expect(h.trackEvent).toHaveBeenCalledWith("ladder_link_clicked", expect.objectContaining({ has_next: true }));
    expect(h.from).toHaveBeenCalledWith("kid_food_ladder");
    expect(h.writes).not.toHaveBeenCalled();
    expect(h.useFoodLadder).not.toHaveBeenCalled();
  });

  it("remounts the recommendations on a kid change", async () => {
    renderPage();
    await screen.findByText("k1:null");
    fireEvent.click(screen.getByRole("button", { name: /Leo/ }));
    expect(await screen.findByText("k2:null")).toBeInTheDocument();
    expect(h.recMounts.mock.calls.map((c) => c[0])).toEqual(["k1", "k2"]);
  });
});
