import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "@/i18n";
import { buildCareReport } from "@/lib/careReport";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import SharedCareReport from "./SharedCareReport";

const TOKEN = "c".repeat(64);

const report = buildCareReport({
  kidFirstName: "Sam",
  from: "2026-09-01",
  to: "2026-09-30",
  attempts: [
    { foodId: "carrot", stage: "looking", outcome: "refused", attemptedAt: "2026-09-02T18:00:00Z", preparationMethod: null },
    { foodId: "kiwi", stage: null, outcome: "success", attemptedAt: "2026-09-03T18:00:00Z", preparationMethod: null },
  ],
  ladderRows: [{ foodId: "carrot", currentRung: "looking", status: "active" }],
  foodNames: { carrot: "Carrot", kiwi: "Kiwi" },
  safeFoodNames: ["Pasta"],
  includeNotes: false,
});

function renderAt(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/care/:token" element={<SharedCareReport />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

describe("SharedCareReport (/care/:token)", () => {
  it("renders the snapshot through the public RPC and never reads a table", async () => {
    rpc.mockResolvedValue({
      data: [{ report, shared_at: "2026-09-30T12:00:00Z", expires_at: "2026-10-30T12:00:00Z" }],
      error: null,
    });
    renderAt(`/care/${TOKEN}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Care report for Sam" })).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_shared_care_report", { p_token: TOKEN });
    expect(from).not.toHaveBeenCalled();
    expect(screen.getByText("Logged on 2 days")).toBeInTheDocument();
    expect(screen.getByText("Pasta")).toBeInTheDocument();
    expect(screen.getByText(/Kiwi: first offered/)).toBeInTheDocument();
    // The ladder shows refusals plainly.
    expect(screen.getByText("Carrot")).toBeInTheDocument();
  });

  it("reads an unknown, revoked or expired link as not available", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderAt(`/care/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "This report isn't available" })).toBeInTheDocument();
  });

  it("refuses a snapshot it cannot read rather than rendering half of it", async () => {
    rpc.mockResolvedValue({
      data: [{ report: { version: 2 }, shared_at: "2026-09-30T12:00:00Z", expires_at: "2026-10-30T12:00:00Z" }],
      error: null,
    });
    renderAt(`/care/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "This report isn't available" })).toBeInTheDocument();
  });

  it("says so when the read fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    renderAt(`/care/${TOKEN}`);
    expect(await screen.findByRole("heading", { name: "Couldn't load this report" })).toBeInTheDocument();
  });
});
