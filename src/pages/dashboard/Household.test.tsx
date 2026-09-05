import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { HelmetProvider } from "react-helmet-async";

/**
 * The household page (US-789).
 *
 * Web had only ManageHouseholdDialog, a modal reached from one button on Home,
 * against iOS's full HouseholdSettingsView. This covers the two things that
 * page exists to do -- show who is in the household, and hand somebody an
 * invite -- because handing out access to a family's records is not a thing to
 * find broken in production.
 */

const rpc = vi.fn();
const del = vi.fn();
let members: unknown[] = [];
let codes: unknown[] = [];

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    React.createElement("a", { href: to }, children),
  useNavigate: () => vi.fn(),
}));

/** Chainable PostgREST stand-in; awaiting any chain yields the table's rows. */
function builder(rows: unknown, onDelete?: () => void) {
  const result = { data: rows, error: null };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    maybeSingle: async () => ({
      data: Array.isArray(rows) ? (rows[0] ?? null) : rows,
      error: null,
    }),
    single: async () => ({ data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null }),
    delete: () => {
      onDelete?.();
      return chain;
    },
    update: () => chain,
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
        // The hook calls this twice: once for the caller's household_id, once
        // for the roster. maybeSingle() takes the first row of whatever is
        // returned, so one array serves both.
        return builder(members.length ? members : [{ household_id: "hh-1" }], () => del("member"));
      }
      if (table === "households") return builder({ name: "The Bakers" });
      if (table === "household_invite_codes") return builder(codes, () => del("code"));
      return builder([]);
    }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const MEMBERS = [
  {
    household_id: "hh-1",
    id: "m-1",
    user_id: "user-1",
    role: "parent",
    joined_at: "2026-01-05T00:00:00.000Z",
    profiles: { full_name: "Dana Baker" },
  },
  {
    household_id: "hh-1",
    id: "m-2",
    user_id: "user-2",
    role: "caregiver",
    joined_at: "2026-02-11T00:00:00.000Z",
    profiles: { full_name: "Wes Baker" },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  members = MEMBERS;
  codes = [];
  rpc.mockResolvedValue({ data: "K7M2QP", error: null });
});

async function renderPage() {
  const Household = (await import("./Household")).default;
  return render(
    <HelmetProvider>
      <Household />
    </HelmetProvider>
  );
}

describe("Household page", () => {
  it("lists every member with their role", async () => {
    await renderPage();

    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());
    expect(screen.getByText("Wes Baker")).toBeInTheDocument();
    expect(screen.getByText("parent")).toBeInTheDocument();
    expect(screen.getByText("caregiver")).toBeInTheDocument();
  });

  it("gives every destructive control an accessible name", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    // Icon-only buttons with no name are the defect US-768 found on the
    // settings tabs. Not repeating it on the page that removes people.
    expect(screen.getByRole("button", { name: /remove dana baker/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove wes baker/i })).toBeInTheDocument();
  });

  it("creates an invite through the RPC, never by inserting a code itself", async () => {
    const user = userEvent.setup();
    await renderPage();
    await waitFor(() => expect(screen.getByText("Dana Baker")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /create invite link/i }));

    // The code is generated server-side by create_household_invite, which is
    // what makes it unguessable and what ties it to the caller's household. A
    // client that made up its own code would be a client that could invite
    // itself into somebody else's.
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("create_household_invite", { p_role: "parent" }));
  });

  it("shows an outstanding code with a way to copy and to revoke it", async () => {
    codes = [
      {
        id: "c-1",
        code: "K7M2QP",
        role: "parent",
        created_at: "2026-09-05T00:00:00.000Z",
        expires_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
        used_at: null,
      },
    ];
    await renderPage();

    await waitFor(() => expect(screen.getByText("K7M2QP")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /copy invite link for K7M2QP/i })).toBeInTheDocument();

    // The old dialog created codes in household_invite_codes but listed
    // household_invitations, so a live code was invisible and could not be
    // taken back. Revoking is the whole reason to list them.
    const revoke = screen.getByRole("button", { name: /revoke invite K7M2QP/i });
    await userEvent.setup().click(revoke);
    await waitFor(() => expect(del).toHaveBeenCalledWith("code"));
  });

  it("says so plainly when no invite is outstanding", async () => {
    codes = [];
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText(/no invite links are outstanding/i)).toBeInTheDocument()
    );
  });

  it("reports how long a code has left, not a raw timestamp", async () => {
    codes = [
      {
        id: "c-1",
        code: "ABC123",
        role: "parent",
        created_at: "2026-09-05T00:00:00.000Z",
        // 6h plus a margin. expiresIn FLOORS, deliberately -- telling somebody
        // an invite lasts longer than it does is the bad direction to be wrong
        // in -- so a flat 6h elapses into "in 5h" during test setup.
        expires_at: new Date(Date.now() + 6 * 3_600_000 + 300_000).toISOString(),
        used_at: null,
      },
    ];
    await renderPage();

    const row = await screen.findByText("ABC123");
    // textContent, not getByText: the line is split across a clock icon and
    // two text nodes, so an element-scoped matcher finds nothing.
    expect(row.closest("li")!.textContent).toMatch(/expires in 6h/i);
    expect(row.closest("li")!.textContent).toMatch(/joins as parent/i);
  });
});
