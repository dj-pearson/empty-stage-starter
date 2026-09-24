import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { FeatureLimitResult } from "@/lib/featureLimits";

const checkFeatureLimit = vi.fn<(feature: string) => Promise<FeatureLimitResult>>();
vi.mock("@/lib/featureLimits", () => ({
  checkFeatureLimit: (feature: string) => checkFeatureLimit(feature),
}));

const requestUpgradePrompt = vi.fn();
vi.mock("@/lib/upgradePromptBus", () => ({
  requestUpgradePrompt: (req: unknown) => requestUpgradePrompt(req),
}));

import { FeatureGate, FEATURE_GATE_RECHECK_MS, type FeatureGateState } from "./FeatureGate";

function renderGate(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("FeatureGate", () => {
  beforeEach(() => {
    checkFeatureLimit.mockReset();
    requestUpgradePrompt.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an aria-busy skeleton while checking, not an empty container", () => {
    checkFeatureLimit.mockReturnValue(new Promise(() => {}));
    const { container } = renderGate(
      <FeatureGate feature="ai_coach" label="Coach">
        <p>content</p>
      </FeatureGate>,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("content");
  });

  it("renders the lock with an h1 by default and fires the upgrade prompt once", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 0, current: 0 });
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach">
        <p>content</p>
      </FeatureGate>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Coach is locked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view plans/i })).toBeInTheDocument();
    expect(requestUpgradePrompt).toHaveBeenCalledTimes(1);
  });

  it("renders the lock heading as an h2 with headingLevel=2", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 0, current: 0 });
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach" headingLevel={2} allowWhenExhausted>
        <p>content</p>
      </FeatureGate>,
    );
    expect(await screen.findByRole("heading", { level: 2, name: "Coach is locked" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(requestUpgradePrompt).toHaveBeenCalledTimes(1);
  });

  it("renders children with exhausted=true and no upgrade prompt when the quota is spent", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 5, current: 5 });
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach" allowWhenExhausted>
        {(gate) => <p>exhausted:{String(gate.exhausted)}</p>}
      </FeatureGate>,
    );
    expect(await screen.findByText("exhausted:true")).toBeInTheDocument();
    expect(requestUpgradePrompt).not.toHaveBeenCalled();
  });

  it("keeps the lock for a spent quota when allowWhenExhausted is not set", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: false, limit: 5, current: 5 });
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach">
        <p>content</p>
      </FeatureGate>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Coach is locked" })).toBeInTheDocument();
  });

  it("passes the gate object to a function child", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: 10, current: 3 });
    let seen: FeatureGateState | null = null;
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach">
        {(gate) => {
          seen = gate;
          return <p>ready</p>;
        }}
      </FeatureGate>,
    );
    await screen.findByText("ready");
    expect(seen).toMatchObject({ exhausted: false, limit: 10, current: 3 });
    expect(typeof seen!.markExhausted).toBe("function");
  });

  it("markExhausted flips an allowed gate to exhausted", async () => {
    checkFeatureLimit.mockResolvedValue({ allowed: true, limit: 10, current: 9 });
    let mark: (() => void) | null = null;
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach" allowWhenExhausted>
        {(gate) => {
          mark = gate.markExhausted;
          return <p>exhausted:{String(gate.exhausted)}</p>;
        }}
      </FeatureGate>,
    );
    await screen.findByText("exhausted:false");
    act(() => mark!());
    expect(screen.getByText("exhausted:true")).toBeInTheDocument();
  });

  it("re-checks on window focus while blocked and switches to children when allowed", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    checkFeatureLimit.mockResolvedValueOnce({ allowed: false, limit: 0, current: 0 });
    renderGate(
      <FeatureGate feature="ai_coach" label="Coach">
        <p>content</p>
      </FeatureGate>,
    );
    await screen.findByRole("heading", { name: "Coach is locked" });

    // Inside the throttle window: no second RPC.
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(checkFeatureLimit).toHaveBeenCalledTimes(1);

    checkFeatureLimit.mockResolvedValueOnce({ allowed: true });
    now += FEATURE_GATE_RECHECK_MS + 1;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(screen.getByText("content")).toBeInTheDocument());
    expect(checkFeatureLimit).toHaveBeenCalledTimes(2);
  });
});
