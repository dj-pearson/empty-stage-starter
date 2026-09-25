import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@/i18n/appLocale";
import { invalidateSharedQueries } from "@/lib/sharedQuery";

/**
 * The route guard asks current_user_plan_name, the server-effective plan, so a
 * trial, App Store or complimentary Professional gets in and nobody else does.
 * A failed lookup is neither: it is a Retry.
 */

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ userId: "user-1", householdId: null }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { RequireProfessional } from "./RequireProfessional";

function renderGuard() {
  return render(
    <MemoryRouter>
      <RequireProfessional>
        <p>professional tools</p>
      </RequireProfessional>
    </MemoryRouter>,
  );
}

describe("RequireProfessional", () => {
  beforeEach(() => {
    rpc.mockReset();
    invalidateSharedQueries();
  });

  it("renders the children when the server says Professional", async () => {
    rpc.mockResolvedValue({ data: "Professional", error: null });
    renderGuard();
    expect(await screen.findByText("professional tools")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("current_user_plan_name");
  });

  it("shows the explainer and a Billing link, not the children, for another plan", async () => {
    rpc.mockResolvedValue({ data: "Family Plus", error: null });
    renderGuard();
    const link = await screen.findByRole("link", { name: /see your plan/i });
    expect(link).toHaveAttribute("href", "/dashboard/billing");
    expect(screen.getByText(/Professional settings come with the Professional plan/i)).toBeInTheDocument();
    expect(screen.queryByText("professional tools")).not.toBeInTheDocument();
  });

  it("shows Retry on an rpc error, and a retry that succeeds lets the user in", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    renderGuard();
    const retry = await screen.findByRole("button", { name: /try again/i });
    expect(screen.queryByText("professional tools")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /see your plan/i })).not.toBeInTheDocument();

    rpc.mockResolvedValueOnce({ data: "Professional", error: null });
    await userEvent.click(retry);
    await waitFor(() => expect(screen.getByText("professional tools")).toBeInTheDocument());
  });
});
