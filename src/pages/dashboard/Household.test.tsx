import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { HelmetProvider } from "react-helmet-async";
import { toast } from "sonner";
import i18n from "@/i18n";
import "@/i18n/appLocale";
import { SHARED_SCOPE_KEYS } from "@/lib/householdScope";

/**
 * The household page (US-789, rebuilt for US-840).
 *
 * The page answers "who can see my kids?". The cases below are the ways it
 * used to answer that wrong -- a failed roster query read as "You are the only
 * person in this household", a raw DB role on screen, a Remove button on every
 * row including your own, and a 0-row delete reported as success.
 */

const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";

type Res = { data: unknown; error: unknown };

let memberResponses: Res[] = [];
let memberDelete: Res = { data: [{ id: "m-2" }], error: null };
let codes: unknown[] = [];
const memberQueries = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) =>
    React.createElement("a", { href: to, className }, children),
  useNavigate: () => vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1", householdId: HOUSEHOLD_ID }),
}));

vi.mock("@/contexts/KidsContext", () => ({
  useKids: () => ({ kids: [{ id: "k-1", name: "Maya Baker" }] }),
}));

// Package C owns the invite card and its tests; here it only has to be mounted
// with the right props.
const invitesProps = vi.fn();
vi.mock("@/components/household/HouseholdInvites", () => ({
  HouseholdInvites: (props: { disabled: boolean }) => {
    invitesProps(props);
    return React.createElement("section", { "data-testid": "invites-stub" });
  },
}));

/**
 * Chainable PostgREST stand-in. Awaiting a read chain yields `res`; once
 * `.delete()` is called the chain yields `onDelete`'s result instead.
 */
function builder(res: Res, onDelete?: Res) {
  let current = res;
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(current).then(resolve, reject),
    maybeSingle: async () => ({
      data: Array.isArray(current.data) ? (current.data[0] ?? null) : current.data,
      error: current.error,
    }),
    single: async () => ({
      data: Array.isArray(current.data) ? (current.data[0] ?? null) : current.data,
      error: current.error,
    }),
    delete: () => {
      if (onDelete) current = onDelete;
      return chain;
    },
    update: () => {
      current = { data: [{ id: HOUSEHOLD_ID }], error: null };
      return chain;
    },
  };
  for (const m of ["select", "eq", "is", "gt", "in", "order", "limit", "neq"]) {
    chain[m] = () => chain;
  }
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "household_members") {
        memberQueries();
        // One response per call; the last one repeats.
        const res = memberResponses.length > 1 ? memberResponses.shift()! : memberResponses[0];
        return builder(res, memberDelete);
      }
      if (table === "households") return builder({ data: { name: "The Bakers" }, error: null });
      if (table === "profiles") {
        return builder({
          data: [
            { id: "user-1", full_name: "Dana Baker" },
            { id: "user-2", full_name: "Wes Baker" },
          ],
          error: null,
        });
      }
      if (table === "household_invite_codes") return builder({ data: codes, error: null });
      return builder({ data: [], error: null });
    }),
    rpc: vi.fn().mockResolvedValue({ data: HOUSEHOLD_ID, error: null }),
  },
}));

const DANA = {
  id: "m-1",
  user_id: "user-1",
  role: "parent",
  joined_at: "2026-01-05T00:00:00.000Z",
};
const WES = {
  id: "m-2",
  user_id: "user-2",
  role: "guardian",
  joined_at: "2026-02-11T00:00:00.000Z",
};

const ok = (rows: unknown[]): Res => ({ data: rows, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  memberResponses = [ok([DANA, WES])];
  memberDelete = { data: [{ id: "m-2" }], error: null };
  codes = [];
  try {
    localStorage.clear();
  } catch {
    // jsdom always has it; the guard is for parity with the page.
  }
});

async function renderPage() {
  const Household = (await import("./Household")).default;
  return render(
    <HelmetProvider>
      <Household />
    </HelmetProvider>
  );
}

function rowFor(name: string): HTMLElement {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("Household page", () => {
  it("shows an error with a retry, never 'only person', when the roster query fails", async () => {
    const user = userEvent.setup();
    memberResponses = [
      { data: null, error: { code: "PGRST200", message: "Could not find a relationship" } },
      ok([DANA, WES]),
    ];
    await renderPage();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/couldn't load your household/i)).toBeInTheDocument();
    expect(screen.queryByText(/only person/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /members/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("invites-stub")).not.toBeInTheDocument();

    const before = memberQueries.mock.calls.length;
    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    await waitFor(() => expect(memberQueries.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByText("Wes Baker")).toBeInTheDocument());
  });

  it("marks the owner viewer's row and shows translated roles, not DB values", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    const dana = rowFor("Dana Baker");
    expect(within(dana).getByText("Owner")).toBeInTheDocument();
    expect(within(dana).getByText("(You)")).toBeInTheDocument();
    expect(within(dana).getByText("Plan holder")).toBeInTheDocument();
    expect(within(dana).getByText(/co-parent/i)).toBeInTheDocument();
    expect(within(rowFor("Wes Baker")).getByText(/caregiver/i)).toBeInTheDocument();

    expect(screen.queryByText("parent")).not.toBeInTheDocument();
    expect(screen.queryByText("guardian")).not.toBeInTheDocument();
  });

  it("gives every destructive control an accessible name", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    // Icon-only buttons with no name are the defect US-768 found on the
    // settings tabs. Not repeating it on the page that removes people.
    expect(screen.getByRole("button", { name: /more actions for wes baker/i })).toBeInTheDocument();
    // Your own row has no remove control at all.
    expect(screen.queryByRole("button", { name: /more actions for dana baker/i })).not.toBeInTheDocument();
  });

  it("gives a non-owner no way to remove others, and Leave on their own row", async () => {
    // Wes joined first, so Wes holds the plan and Dana (the viewer) does not.
    memberResponses = [ok([{ ...DANA, joined_at: "2026-03-01T00:00:00.000Z" }, { ...WES, joined_at: "2026-01-01T00:00:00.000Z" }])];
    await renderPage();
    await waitFor(() => expect(screen.getByText("Wes Baker")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /more actions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/remove from household/i)).not.toBeInTheDocument();

    const leave = within(rowFor("Dana Baker")).getByRole("button", { name: /leave household/i });
    expect(leave).toBeEnabled();
  });

  it("keeps a member listed and says so when the delete removes no rows", async () => {
    const user = userEvent.setup();
    memberDelete = { data: [], error: null };
    await renderPage();
    await waitFor(() => expect(screen.getByText("Wes Baker")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /more actions for wes baker/i }));
    await user.click(await screen.findByRole("menuitem", { name: /remove from household/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/remove wes baker from the household/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/no longer see maya/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/anything they added stays here/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /^remove$/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("Wes Baker")).toBeInTheDocument());
  });

  it("nudges a sole member to invite someone", async () => {
    memberResponses = [ok([DANA])];
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    expect(screen.getByText(/add a co-parent, grandparent or nanny/i)).toBeInTheDocument();
    expect(screen.queryByText(/only person/i)).not.toBeInTheDocument();
    // And they cannot leave the household they are alone in.
    expect(screen.getByRole("button", { name: /leave household/i })).toBeDisabled();
  });

  it("only saves a changed name of 1-60 characters, and Escape restores it", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    expect(screen.getByRole("heading", { level: 1, name: "The Bakers" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /rename household the bakers/i }));

    const input = screen.getByLabelText(/household name/i, { selector: "input" });
    const save = screen.getByRole("button", { name: /^save$/i });
    expect(input).toHaveValue("The Bakers");
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "x".repeat(61) } });
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "Baker House" } });
    expect(save).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText(/household name/i, { selector: "input" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "The Bakers" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /rename household the bakers/i })).toHaveFocus()
    );
  });

  it("states the sharing contract and links to the care cards", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    const sharedHeading = await screen.findByRole("heading", { name: /shared with everyone here/i });
    const shared = within(sharedHeading.closest("section") as HTMLElement).getAllByRole("listitem");
    expect(shared).toHaveLength(SHARED_SCOPE_KEYS.length);
    expect(screen.getByText(i18n.t("household.scope.nothingCrosses"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /care cards/i })).toHaveAttribute("href", "/dashboard/kids");
  });

  it("mounts the invite card enabled while online", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId("invites-stub")).toBeInTheDocument());
    expect(invitesProps).toHaveBeenLastCalledWith(expect.objectContaining({ disabled: false }));
  });
});
