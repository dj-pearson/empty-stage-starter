import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import i18n from "@/i18n";
import "@/i18n/appLocale";
import { PRIVATE_SCOPE_KEYS } from "@/lib/householdScope";

/**
 * /dashboard/professional-settings. The cases are the ways it used to be wrong:
 * a failed read rendered an empty form (inviting a save over the profile), a
 * "Check Verification" button wrote status 'verified' from the browser, and a
 * first save sent contact_email '' which the valid_email CHECK rejects.
 */

type Res = { data: unknown; error: unknown };

let brandRes: Res;
let domainRes: Res;
const upsert = vi.fn();
const deleteEq = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "helmet" }, children),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1", householdId: null }),
}));

function readChain(res: () => Res) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => res(),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "professional_brand_settings") {
        return {
          ...readChain(() => brandRes),
          upsert: (body: unknown, opts: unknown) => {
            upsert(body, opts);
            const row = { id: "brand-1", created_at: "2026-01-01", updated_at: "2026-01-02", ...(body as object) };
            return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
          },
        };
      }
      if (table === "professional_custom_domains") {
        return {
          ...readChain(() => domainRes),
          delete: () => ({ eq: async (...args: unknown[]) => { deleteEq(...args); return { error: null }; } }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import ProfessionalSettings from "./ProfessionalSettings";

const STORED = {
  id: "brand-1",
  user_id: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  business_name: "Little Bites",
  contact_email: "old@example.com",
  phone_number: null,
  support_url: null,
  logo_url: null,
  platform_tagline: null,
  footer_text: "kept as is",
  favicon_url: null,
  primary_color: "#2f6d3c",
  secondary_color: "#a5d6a7",
  accent_color: "#ffa45b",
};

describe("ProfessionalSettings", () => {
  beforeEach(() => {
    brandRes = { data: null, error: null };
    domainRes = { data: null, error: null };
    upsert.mockReset();
    deleteEq.mockReset();
  });

  it("renders an alert with Retry and no form when the brand query errors", async () => {
    brandRes = { data: null, error: { message: "permission denied" } };
    render(<ProfessionalSettings />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save practice profile/i })).not.toBeInTheDocument();
  });

  it("has no Check Verification button, even for a pending domain", async () => {
    domainRes = { data: { id: "dom-1", domain_name: "coach.example.com" }, error: null };
    render(<ProfessionalSettings />);
    expect(await screen.findByText("coach.example.com")).toBeInTheDocument();
    expect(screen.getByText(/this domain isn't live/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /check verification/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/CNAME/)).not.toBeInTheDocument();
  });

  it("removes a leftover domain through the existing delete", async () => {
    domainRes = { data: { id: "dom-1", domain_name: "coach.example.com" }, error: null };
    render(<ProfessionalSettings />);
    await userEvent.click(await screen.findByRole("button", { name: /^remove$/i }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(deleteEq).toHaveBeenCalledWith("id", "dom-1"));
    await waitFor(() => expect(screen.queryByText("coach.example.com")).not.toBeInTheDocument());
  });

  it("saves a blank email as null, with only whitelisted columns", async () => {
    brandRes = { data: STORED, error: null };
    render(<ProfessionalSettings />);
    const email = await screen.findByLabelText(/contact email/i);
    const save = screen.getByRole("button", { name: /save practice profile/i });
    expect(save).toBeDisabled(); // clean

    await userEvent.clear(email);
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const [body, opts] = upsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(opts).toEqual({ onConflict: "user_id" });
    expect(body.contact_email).toBeNull();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("created_at");
    expect(body).not.toHaveProperty("updated_at");
    expect(body).not.toHaveProperty("footer_text");
    expect(body).not.toHaveProperty("favicon_url");
    // The conflict target: the signed-in user, taken from auth rather than the loaded row.
    expect(body.user_id).toBe("user-1");
  });

  it("keeps Save disabled while a field is invalid and shows the error on blur", async () => {
    render(<ProfessionalSettings />);
    const email = await screen.findByLabelText(/contact email/i);
    await userEvent.type(email, "a@b");
    await userEvent.tab();
    expect(email).toHaveAttribute("aria-invalid", "true");
    const describedBy = email.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy.split(" ").pop() ?? "")).toHaveTextContent(/email address/i);
    expect(screen.getByRole("button", { name: /save practice profile/i })).toBeDisabled();
  });

  it("lists every PRIVATE_SCOPE_KEYS label under What you never see", async () => {
    render(<ProfessionalSettings />);
    const list = await screen.findByTestId("professional-private-scope");
    for (const key of PRIVATE_SCOPE_KEYS) {
      const label = i18n.t(key);
      expect(label).not.toBe(key);
      expect(within(list).getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText(/Nothing on this page opens a family's account/i)).toBeInTheDocument();
  });
});
