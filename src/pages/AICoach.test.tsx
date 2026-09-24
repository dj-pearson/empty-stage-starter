import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import type { FeatureLimitResult } from "@/lib/featureLimits";

const checkFeatureLimit = vi.fn<(feature: string) => Promise<FeatureLimitResult>>();
vi.mock("@/lib/featureLimits", () => ({
  checkFeatureLimit: (feature: string) => checkFeatureLimit(feature),
}));
vi.mock("@/lib/upgradePromptBus", () => ({ requestUpgradePrompt: vi.fn() }));
vi.mock("@/components/AIMealCoach", () => ({
  AIMealCoach: ({ exhausted, onLimitReached }: { exhausted?: boolean; onLimitReached?: () => void }) => (
    <div data-testid="coach">
      exhausted:{String(exhausted)}
      <button type="button" onClick={() => onLimitReached?.()}>
        server-402
      </button>
    </div>
  ),
}));

import AICoach from "./AICoach";

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <AICoach />
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe("AICoach page", () => {
  beforeEach(() => {
    checkFeatureLimit.mockReset();
  });

  it("renders exactly one h1 with the coach title", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 0, current: 0 });
    renderPage();
    await screen.findByRole("heading", { level: 2 });
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("AI Feeding Coach");
  });

  it("sets a description without 'nutrition advice' and keeps noindex", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: null });
    renderPage();
    await waitFor(() => {
      const desc = document.head.querySelector('meta[name="description"]');
      expect(desc?.getAttribute("content")).toContain("Not medical advice");
    });
    const desc = document.head.querySelector('meta[name="description"]')!.getAttribute("content")!;
    expect(desc.toLowerCase()).not.toContain("nutrition advice");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("shows the remaining line when the plan has a daily limit", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: 10, current: 3 });
    renderPage();
    expect(await screen.findByText("7 of 10 questions left today")).toBeInTheDocument();
  });

  it("hides the remaining line on an unlimited plan", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: null, current: 4 });
    renderPage();
    await screen.findByTestId("coach");
    expect(screen.queryByTestId("ai-coach-usage")).toBeNull();
  });

  it("keeps the coach readable when today's quota is spent", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 5, current: 5 });
    renderPage();
    expect(await screen.findByText("exhausted:true")).toBeInTheDocument();
    expect(screen.getByTestId("ai-coach-usage")).toHaveTextContent("No questions left today");
  });

  it("a server refusal mid-session flips the line to none with the upgrade link", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: 10, current: 9 });
    renderPage();
    expect(await screen.findByText("1 of 10 question left today")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "server-402" }));
    expect(await screen.findByText("exhausted:true")).toBeInTheDocument();
    expect(screen.getByTestId("ai-coach-usage")).toHaveTextContent("No questions left today");
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");
  });

  it("shows the upgrade path after a server refusal even when the page never learned a limit", async () => {
    // checkFeatureLimit fails open to { allowed: true } with no limit; the
    // server's 402 is then the first word on the quota.
    checkFeatureLimit.mockResolvedValue({ allowed: true });
    renderPage();
    await screen.findByText("exhausted:false");
    expect(screen.queryByTestId("ai-coach-usage")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "server-402" }));
    expect(await screen.findByText("exhausted:true")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/pricing");
  });
});
