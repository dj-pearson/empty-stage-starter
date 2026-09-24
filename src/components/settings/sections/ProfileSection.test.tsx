import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  household: {
    loading: false,
    householdName: "The Rivera House",
    members: [
      {
        id: "m1",
        user_id: "user-a",
        role: "parent",
        joined_at: "2026-01-01",
        profiles: null,
        isSelf: true,
        isOwner: true,
      },
    ],
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser: h.getUser, updateUser: h.updateUser } },
}));
vi.mock("@/hooks/useHousehold", () => ({ useHousehold: () => h.household }));

import { ProfileSection } from "./ProfileSection";

const user = {
  id: "user-a",
  email: "sam@example.com",
  created_at: "2025-03-14T12:00:00Z",
  user_metadata: { display_name: "Sam" },
};

beforeEach(() => {
  h.getUser.mockReset().mockResolvedValue({ data: { user } });
  h.updateUser.mockReset();
  h.household.loading = false;
});

async function renderLoaded() {
  render(<ProfileSection />);
  const input = await screen.findByLabelText("Display name");
  return { input: input as HTMLInputElement, ue: userEvent.setup() };
}

const saveButton = () => screen.getByRole("button", { name: /save name|saving/i });

describe("ProfileSection", () => {
  it("disables Save while the name is unchanged", async () => {
    const { input, ue } = await renderLoaded();
    expect(input.value).toBe("Sam");
    expect(saveButton()).toBeDisabled();
    await ue.type(input, " ");
    // Trailing space trims back to the saved name.
    expect(saveButton()).toBeDisabled();
  });

  it("disables Save when the name is blank", async () => {
    const { input, ue } = await renderLoaded();
    await ue.clear(input);
    expect(saveButton()).toBeDisabled();
    await ue.type(input, "   ");
    expect(saveButton()).toBeDisabled();
  });

  it("caps the input at 60 characters", async () => {
    const { input } = await renderLoaded();
    expect(input).toHaveAttribute("maxLength", "60");
  });

  it("shows the household role instead of a made-up title", async () => {
    await renderLoaded();
    expect(screen.queryByText(/Head of Household/i)).not.toBeInTheDocument();
    expect(screen.getByText(/in The Rivera House/)).toBeInTheDocument();
  });

  it("renders no role line while the household loads", async () => {
    h.household.loading = true;
    await renderLoaded();
    expect(screen.queryByText(/The Rivera House/)).not.toBeInTheDocument();
  });

  it("keeps the email read-only, not disabled", async () => {
    await renderLoaded();
    const email = screen.getByLabelText("Sign-in email");
    expect(email).toHaveAttribute("readonly");
    expect(email).not.toBeDisabled();
  });

  it("saves from the form and says so without reloading", async () => {
    h.updateUser.mockResolvedValue({
      data: { user: { ...user, user_metadata: { display_name: "Sam Rivera" } } },
      error: null,
    });
    const { input, ue } = await renderLoaded();
    await ue.clear(input);
    await ue.type(input, "  Sam Rivera ");
    expect(saveButton()).toBeEnabled();
    await ue.click(saveButton());
    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(h.updateUser).toHaveBeenCalledWith({
      data: { display_name: "Sam Rivera", full_name: "Sam Rivera" },
    });
    expect(h.getUser).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Sam Rivera");
    expect(saveButton()).toBeDisabled();
  });
});
