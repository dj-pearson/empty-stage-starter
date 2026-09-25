import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "@/i18n";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import SharedRecipe from "./SharedRecipe";

const TOKEN = "a".repeat(64);

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/r/:token" element={<SharedRecipe />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("SharedRecipe (/r/:token)", () => {
  it("renders the shared recipe read-only through the public RPC, with a sign-up CTA", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          name: "Mac and cheese",
          image_url: null,
          ingredients: [{ name: "Macaroni", quantity: 2, unit: "cups", group: null }],
          instructions: '["Boil pasta"]',
          prep_time: "5",
          cook_time: "15",
          total_time_minutes: 20,
          servings: "4",
        },
      ],
      error: null,
    });
    renderAt(`/r/${TOKEN}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Mac and cheese" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_shared_recipe", { p_token: TOKEN });
    // Never a table read: the page cannot see the sharer's household.
    expect(from).not.toHaveBeenCalled();
    expect(screen.getByText("2 cups Macaroni")).toBeInTheDocument();
    expect(screen.getByText("Boil pasta")).toBeInTheDocument();
    expect(screen.getByText("20 min total")).toBeInTheDocument();
    expect(screen.getByText("Serves 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", "/auth?tab=signup");
    expect(screen.queryByRole("button", { name: /edit|delete/i })).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toContain("noindex"),
    );
  });

  it("says the link is off when the token is unknown or revoked", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderAt(`/r/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "This link isn't active" })).toBeInTheDocument();
  });

  it("says it could not load on an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "network" } });
    renderAt(`/r/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Couldn't load this recipe" })).toBeInTheDocument();
  });
});
