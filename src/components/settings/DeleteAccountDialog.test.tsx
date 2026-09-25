import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { DeleteAccountPreflight } from "@/lib/accountDeletion";

type InvokeResult = { data: unknown; error: Error | null };

const h = vi.hoisted(() => ({
  order: [] as string[],
  deleteResult: null as null | (() => Promise<{ data: unknown; error: Error | null }>),
  preflightResult: null as null | { data: unknown; error: Error | null },
  invoke: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  scrub: vi.fn(),
  replace: vi.fn(),
  exportRun: vi.fn(),
  hasPassword: true,
  email: "sam@example.test" as string | null,
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
      signInWithPassword: (...args: unknown[]) => {
        h.order.push("signInWithPassword");
        return h.signInWithPassword(...args);
      },
      signInWithOtp: (...args: unknown[]) => h.signInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => {
        h.order.push("verifyOtp");
        return h.verifyOtp(...args);
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
vi.mock("@/hooks/useBindStatus", () => ({
  useBindStatus: () => ({
    loading: false,
    user: h.email ? { email: h.email } : null,
    hasPassword: h.hasPassword,
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
  profiles: { full_name: "Jo" },
  isSelf: true,
  isOwner: true,
};

const coparent = {
  id: "m2",
  user_id: "user-b",
  role: "parent",
  joined_at: "2026-02-01",
  profiles: { full_name: "Sam" },
  isSelf: false,
  isOwner: false,
};

function sharedPreflight(overrides: Partial<DeleteAccountPreflight["households"][number]> = {}): DeleteAccountPreflight {
  return {
    soleMember: false,
    households: [
      {
        householdId: "hh-1",
        householdName: "The Rivera House",
        successorUserId: "user-b",
        successorName: "Sam R",
        successorRole: "parent",
        remainingMembers: 1,
        kidNames: ["Mia", "Leo"],
        ...overrides,
      },
    ],
    transferred: { kids: 2 },
    deleted: { kids: 0 },
  };
}

const SOLE: DeleteAccountPreflight = { soleMember: true, households: [], transferred: {}, deleted: { kids: 1 } };

const originalLocation = window.location;

beforeEach(() => {
  h.order = [];
  h.invoke.mockReset().mockImplementation((name: string, opts: { body?: { mode?: string } }) => {
    if (name === "delete-account" && opts?.body?.mode === "preflight") {
      return Promise.resolve(h.preflightResult);
    }
    h.order.push(name);
    return h.deleteResult ? h.deleteResult() : Promise.resolve({ data: { success: true, partialFailures: {} }, error: null });
  });
  h.preflightResult = { data: { success: true, mode: "preflight", preflight: SOLE }, error: null };
  h.deleteResult = null;
  h.signOut.mockReset().mockResolvedValue({ error: null });
  h.signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  h.signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  h.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  h.scrub.mockReset();
  h.replace.mockReset();
  h.exportRun.mockReset();
  h.hasPassword = true;
  h.email = "sam@example.test";
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

const deleteButton = () => screen.getByRole("button", { name: "Delete my account" });
const finalButton = () => screen.getByRole("button", { name: /confirm and delete|deleting/i });

async function confirmWord(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.queryByText(/Checking what stays/)).not.toBeInTheDocument());
  await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
  await user.click(deleteButton());
}

const deleteCalls = () =>
  h.invoke.mock.calls.filter(([name, opts]) => name === "delete-account" && opts?.body?.mode !== "preflight");

describe("DeleteAccountDialog", () => {
  it("keeps the delete button disabled until the preflight is back and the word is typed", async () => {
    let answer: (value: InvokeResult) => void = () => {};
    h.invoke.mockImplementationOnce(() => new Promise<InvokeResult>((resolve) => (answer = resolve)));
    const { user } = renderDialog();
    expect(screen.getByText("Checking what stays with your household...")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    expect(deleteButton()).toBeDisabled();
    answer({ data: { preflight: SOLE }, error: null });
    await waitFor(() => expect(deleteButton()).toBeEnabled());
    await user.clear(screen.getByLabelText(/type delete to confirm/i));
    await user.type(screen.getByLabelText(/type delete to confirm/i), "delet");
    expect(deleteButton()).toBeDisabled();
  });

  it("asks the server what would happen, as the web client", async () => {
    renderDialog();
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith("delete-account", {
        body: { mode: "preflight" },
        headers: { "X-Client-Info": "eatpal-web/1" },
      })
    );
  });

  it("names the children and the co-parent they stay with, from the roster", async () => {
    h.members = [self, coparent];
    h.preflightResult = { data: { preflight: sharedPreflight() }, error: null };
    renderDialog();
    expect(await screen.findByText("Mia and Leo stay with Sam")).toBeInTheDocument();
    expect(screen.getByText(/move to Sam, who becomes its owner/)).toBeInTheDocument();
    expect(screen.queryByText("Everything will be deleted")).not.toBeInTheDocument();
    expect(screen.queryByText(/Child profiles, foods, recipes and meal plans you created/)).not.toBeInTheDocument();
  });

  it("falls back to the profile name the server sent when the roster lacks them", async () => {
    h.preflightResult = { data: { preflight: sharedPreflight() }, error: null };
    renderDialog();
    expect(await screen.findByText("Mia and Leo stay with Sam R")).toBeInTheDocument();
  });

  it("uses a role label when nobody has a name", async () => {
    h.preflightResult = {
      data: { preflight: sharedPreflight({ successorName: null, kidNames: [] }) },
      error: null,
    };
    renderDialog();
    expect(await screen.findByText("Your household's data stays with your co-parent")).toBeInTheDocument();
  });

  it("tells a sole member everything goes", async () => {
    renderDialog();
    expect(await screen.findByText("Everything will be deleted")).toBeInTheDocument();
    expect(screen.getByText(/Child profiles, foods, recipes and meal plans you created/)).toBeInTheDocument();
  });

  it("says so when the preflight fails, and still lets the parent delete", async () => {
    h.preflightResult = { data: null, error: new Error("down") };
    const { user } = renderDialog();
    expect(await screen.findByText(/couldn't check your household just now/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    expect(deleteButton()).toBeEnabled();
  });

  it("signs in again with the password, then deletes as the web client, and never cancels Stripe itself", async () => {
    h.subscription = {
      status: "active",
      plan_name: "Pro",
      cancel_at_period_end: false,
      is_complementary: false,
      stripe_subscription_id: "sub_123",
    };
    const { user } = renderDialog();
    expect(await screen.findByText(/Pro subscription is cancelled when you delete/)).toBeInTheDocument();
    await confirmWord(user);
    expect(screen.getByText("Sign in again to delete")).toBeInTheDocument();
    expect(finalButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Password for sam@example.test"), "hunter22");
    await user.click(finalButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/?deleted=1"));
    expect(h.signInWithPassword).toHaveBeenCalledWith({ email: "sam@example.test", password: "hunter22" });
    expect(h.order).toEqual(["signInWithPassword", "delete-account", "scrub", "signOut"]);
    expect(deleteCalls()).toEqual([
      ["delete-account", { body: {}, headers: { "X-Client-Info": "eatpal-web/1" } }],
    ]);
    expect(h.invoke.mock.calls.some(([name]) => name === "manage-subscription")).toBe(false);
    expect(h.scrub).toHaveBeenCalledWith("user-a");
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not delete on a wrong password", async () => {
    h.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", status: 400 } });
    const { user } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "nope");
    await user.click(finalButton());
    expect(await screen.findByText("That password isn't right.")).toBeInTheDocument();
    expect(deleteCalls()).toEqual([]);
  });

  it("uses an emailed code for an account without a password", async () => {
    h.hasPassword = false;
    const { user } = renderDialog();
    await confirmWord(user);
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(h.signInWithOtp).toHaveBeenCalledWith({
      email: "sam@example.test",
      options: { shouldCreateUser: false },
    });
    expect(await screen.findByText("We sent a 6-digit code to sam@example.test.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("6-digit code"), "123456");
    await user.click(finalButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/?deleted=1"));
    expect(h.verifyOtp).toHaveBeenCalledWith({ email: "sam@example.test", token: "123456", type: "email" });
    expect(h.order.slice(0, 2)).toEqual(["verifyOtp", "delete-account"]);
  });

  it("asks again when the server says the sign-in is too old", async () => {
    h.deleteResult = () =>
      Promise.resolve({
        data: null,
        error: new Error("Edge Function 'delete-account' failed: Please sign in again to confirm it is you."),
      });
    const { user } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "hunter22");
    await user.click(finalButton());
    expect(await screen.findByText(/more than 10 minutes old/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password for/)).toHaveValue("");
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("says the account was kept when the server could not cancel the subscription", async () => {
    h.deleteResult = () =>
      Promise.resolve({
        data: null,
        error: new Error(
          "Edge Function 'delete-account' failed: Failed to cancel your subscription, so your account was not deleted"
        ),
      });
    const { user } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "hunter22");
    await user.click(finalButton());
    expect(await screen.findByText(/couldn't cancel your subscription, so your account wasn't deleted/)).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("stays open while the delete is in flight", async () => {
    h.deleteResult = () => new Promise(() => {});
    const { user, onOpenChange } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "hunter22");
    await user.click(finalButton());
    await waitFor(() => expect(screen.getByText("Deleting your account...")).toBeInTheDocument());
    await user.keyboard("{Escape}");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeDisabled();
  });

  it("says the deletion was incomplete when the server reports partial failures", async () => {
    h.deleteResult = () =>
      Promise.resolve({
        data: {
          success: true,
          partialFailures: { "storage:images": "timeout", meal_voting: 'relation "meal_voting" does not exist' },
        },
        error: null,
      });
    const { user } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "hunter22");
    await user.click(finalButton());
    expect(await screen.findByText("Account deleted, with something left over")).toBeInTheDocument();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("treats a missing-table failure as nothing left behind", async () => {
    h.deleteResult = () =>
      Promise.resolve({
        data: { success: true, partialFailures: { meal_voting: 'relation "meal_voting" does not exist' } },
        error: null,
      });
    const { user } = renderDialog();
    await confirmWord(user);
    await user.type(screen.getByLabelText(/Password for/), "hunter22");
    await user.click(finalButton());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/?deleted=1"));
  });
});
