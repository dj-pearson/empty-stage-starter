import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import "@/i18n/appLocale";

const h = vi.hoisted(() => ({
  links: [] as Array<Record<string, unknown>>,
  revokeAll: vi.fn(),
  share: { enabled: true, loaded: true, pending: false, setEnabled: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", householdId: "h1" }) }));
vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({
    members: [{ id: "m2", user_id: "u2", role: "parent", joined_at: "", profiles: { full_name: "Sam" }, isSelf: false, isOwner: false }],
  }),
}));
vi.mock("@/hooks/useHouseholdShareLinks", () => ({
  useHouseholdShareLinks: () => ({
    links: h.links,
    status: "ready",
    busyIds: new Set<string>(),
    revoke: vi.fn(),
    revokeAll: h.revokeAll,
    reload: vi.fn(),
  }),
}));
vi.mock("@/hooks/usePickyWinSharePref", () => ({ usePickyWinSharePref: () => h.share }));
vi.mock("@/hooks/useWeekStartsOn", () => ({
  useWeekStartsOnSetting: () => ({ weekStartsOn: 1, setWeekStartsOn: vi.fn(), signedIn: true }),
}));

import { PrivacySection } from "./PrivacySection";
import { PlannerSection } from "./PlannerSection";

beforeEach(() => {
  h.links = [];
  h.revokeAll.mockReset();
  h.share = { enabled: true, loaded: true, pending: false, setEnabled: vi.fn() };
});

const renderPrivacy = () =>
  render(
    <MemoryRouter>
      <PrivacySection />
    </MemoryRouter>,
  );

describe("PrivacySection", () => {
  it("lists what the household sees and links to the household page", () => {
    renderPrivacy();
    expect(screen.getByText("Your household sees")).toBeInTheDocument();
    expect(screen.getByText("Only you see")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage your household" })).toHaveAttribute("href", "/dashboard/household");
  });

  it("shows the empty state when no recipe is public", () => {
    renderPrivacy();
    expect(screen.getByText("No recipes are public. Share one from any recipe.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn off all links" })).not.toBeInTheDocument();
  });

  it("names who made each link and confirms before turning them all off", async () => {
    const user = userEvent.setup();
    h.revokeAll.mockResolvedValue({ revoked: 2, failed: 0 });
    h.links = [
      { id: "s1", url: "https://x/r/1", createdAt: new Date().toISOString(), createdBy: "u1", recipeId: "r1", recipeName: "Tacos" },
      { id: "s2", url: "https://x/r/2", createdAt: new Date().toISOString(), createdBy: "u2", recipeId: "r2", recipeName: null },
    ];
    renderPrivacy();
    expect(screen.getByText(/Made by you/)).toBeInTheDocument();
    expect(screen.getByText(/Made by Sam/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off the link to Tacos" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn off all links" }));
    expect(h.revokeAll).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Turn them all off" }));
    expect(h.revokeAll).toHaveBeenCalledTimes(1);
  });

  it("disables the Win Network switch until the account value has loaded", () => {
    h.share = { enabled: true, loaded: false, pending: false, setEnabled: vi.fn() };
    renderPrivacy();
    expect(screen.getByRole("switch", { name: "Share my try-bite results anonymously" })).toBeDisabled();
  });
});

describe("PlannerSection", () => {
  it("hosts the week start and the device-only grocery automation", () => {
    render(<PlannerSection />);
    expect(screen.getByRole("radio", { name: "Monday" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Auto-add predicted run-outs" })).toBeInTheDocument();
    expect(screen.getByText("This device only")).toBeInTheDocument();
  });
});
