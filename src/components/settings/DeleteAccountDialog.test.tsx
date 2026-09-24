import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

const h = vi.hoisted(() => ({
  order: [] as string[],
  invoke: vi.fn(),
  signOut: vi.fn(),
  scrub: vi.fn(),
  replace: vi.fn(),
  exportRun: vi.fn(),
  members: [] as Array<{
    id: string;
    user_id: string;
    role: string;
    joined_at: string;
    profiles: { full_name: string | null } | null;
    isSelf: boolean;
    isOwner: boolean;
  }>,
  subscription: null as null | Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signOut: (...args: unknown[]) => {
        h.order.push("signOut");
        return h.signOut(...args);
      },
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-a" } } }),
    },
  },
}));
vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: h.invoke }));
vi.mock("@/lib/signOutScrub", () => ({
  scrubDeletedAccount: (...args: unknown[]) => {
    h.order.push("scrub");
    return h.scrub(...args);
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "user-a", householdId: "hh-1" }) }));
vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({
    loading: false,
    householdName: "The Rivera House",
    members: h.members,
  }),
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ subscription: h.subscription }),
}));
vi.mock("@/hooks/useAccountExport", () => ({
  useAccountExport: () => ({ run: h.exportRun, running: false, result: null, failed: false }),
}));

import { DeleteAccountDialog } from "./DeleteAccountDialog";

const self = {
  id: "m1",
  user_id: "user-a",
  role: "parent",
  joined_at: "2026-01-01",
  profiles: { full_name: "Sam" },
  isSelf: true,
  isOwner: true,
};

const originalLocation = window.location;

beforeEach(() => {
  h.order = [];
  h.invoke.mockReset();
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.scrub.mockReset();
  h.replace.mockReset();
  h.exportRun.mockReset();
  h.members = [self];
  h.subscription = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, replace: h.replace },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

function renderDialog() {
  const onOpenChange = vi.fn();
  render(<DeleteAccountDialog open onOpenChange={onOpenChange} />);
  return { onOpenChange, user: userEvent.setup() };
}

const confirmButton = () => screen.getByRole("button", { name: /delete my account|deleting/i });

describe("DeleteAccountDialog", () => {
  it("keeps the delete button disabled until the confirm word is typed", async () => {
    const { user } = renderDialog();
    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "delet");
    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "e");
    expect(confirmButton()).toBeEnabled();
  });

  it("stays open while the delete is in flight", async () => {
    h.invoke.mockReturnValue(new Promise(() => {}));
    const { user, onOpenChange } = renderDialog();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(confirmButton());
    await waitFor(() => expect(screen.getByText("Deleting your account...")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeDisabled();
  });

  it("names the co-parent who loses what this account created", () => {
    h.members = [
      self,
      {
        id: "m2",
        user_id: "user-b",
        role: "parent",
        joined_at: "2026-02-01",
        profiles: { full_name: "Alex" },
        isSelf: false,
        isOwner: false,
      },
    ];
    renderDialog();
    expect(screen.getByText("Alex will lose these too")).toBeInTheDocument();
    expect(screen.getByText(/can't be transferred to another member yet/)).toBeInTheDocument();
  });

  it("shows no household warning for a household of one", () => {
    renderDialog();
    expect(screen.queryByText(/will lose these too/)).not.toBeInTheDocument();
  });

  it("says the deletion was incomplete when the server reports partial failures", async () => {
    h.invoke.mockResolvedValue({
      data: { success: true, partialFailures: { "storage:images": "timeout", meal_voting: 'relation "meal_voting" does not exist' } },
      error: null,
    });
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(confirmButton());
    expect(await screen.findByText("Account deleted, with something left over")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("treats a missing-table failure as nothing left behind", async () => {
    h.invoke.mockResolvedValue({
      data: { success: true, partialFailures: { meal_voting: 'relation "meal_voting" does not exist' } },
      error: null,
    });
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(confirmButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/?deleted=1"));
  });

  it("on success scrubs this device before signing out locally, then leaves", async () => {
    h.invoke.mockResolvedValue({ data: { success: true, partialFailures: {} }, error: null });
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "delete");
    await user.click(confirmButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/?deleted=1"));
    expect(h.scrub).toHaveBeenCalledWith("user-a");
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(h.order).toEqual(["scrub", "signOut"]);
    // No subscription, so no cancel call.
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("delete-account", { body: {} });
  });

  it("cancels a live Stripe subscription first, and stops if that fails", async () => {
    h.subscription = {
      status: "active",
      plan_name: "Pro",
      cancel_at_period_end: false,
      is_complementary: false,
      stripe_subscription_id: "sub_123",
    };
    h.invoke.mockResolvedValueOnce({ data: null, error: new Error("stripe down") });
    const { user } = renderDialog();
    expect(screen.getByText(/Pro subscription is cancelled first/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(confirmButton());
    expect(await screen.findByText(/couldn't cancel your subscription/)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("manage-subscription", { body: { action: "cancel" } });
  });

  it("does not call cancel for a complimentary plan", async () => {
    h.subscription = {
      status: "active",
      plan_name: "Pro",
      cancel_at_period_end: false,
      is_complementary: true,
      stripe_subscription_id: null,
    };
    h.invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(confirmButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalled());
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("delete-account", { body: {} });
  });
});
