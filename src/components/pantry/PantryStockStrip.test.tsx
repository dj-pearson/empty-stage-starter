import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food } from "@/types";
import { PantryStockStrip, type PantryStockStripProps } from "./PantryStockStrip";
import { PantryKidLens } from "./PantryKidLens";

const milk: Food = { id: "m", name: "Milk", category: "dairy", is_safe: true, is_try_bite: false, quantity: 1 };

const props = (over: Partial<PantryStockStripProps> = {}): PantryStockStripProps => ({
  safeRunningLow: [],
  lowCount: 0,
  outCount: 0,
  untrackedCount: 0,
  stockFilter: "all",
  onFilter: vi.fn(),
  onAddAll: vi.fn(),
  onAddSafe: vi.fn(),
  onShowUntracked: vi.fn(),
  ...over,
});

describe("PantryStockStrip", () => {
  it("renders with empty data", () => {
    // Also the guard for a missing useTranslation: a t() with no binding
    // throws ReferenceError on render.
    render(<PantryStockStrip {...props()} />);
    expect(screen.getByText("All stocked")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 out of stock, 0 running low");
  });

  it("collapses to one line naming the next thing to run out", async () => {
    const user = userEvent.setup();
    const p = props({ soonest: { name: "Bread", days: 4 }, untrackedCount: 2 });
    render(<PantryStockStrip {...p} />);
    expect(screen.getByText("All stocked; next to run out: Bread, about 4 days")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /to list/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2 not counted yet" }));
    expect(p.onShowUntracked).toHaveBeenCalled();
  });

  it("toggles the out and low filters with aria-pressed", async () => {
    const user = userEvent.setup();
    const onFilter = vi.fn();
    const { rerender } = render(<PantryStockStrip {...props({ lowCount: 2, outCount: 1, onFilter })} />);
    const out = screen.getByRole("button", { name: /1 out/ });
    const low = screen.getByRole("button", { name: /2 low/ });
    expect(out).toHaveAttribute("aria-pressed", "false");
    await user.click(out);
    expect(onFilter).toHaveBeenLastCalledWith("out-of-stock");

    rerender(<PantryStockStrip {...props({ lowCount: 2, outCount: 1, onFilter, stockFilter: "low-stock" })} />);
    expect(screen.getByRole("button", { name: /2 low/ })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /2 low/ }));
    expect(onFilter).toHaveBeenLastCalledWith("all");
    expect(low).toBeDefined();
  });

  it("Add all fires onAddAll with the combined count on the button", async () => {
    const user = userEvent.setup();
    const p = props({ lowCount: 2, outCount: 1 });
    render(<PantryStockStrip {...p} />);
    await user.click(screen.getByRole("button", { name: "Add 3 to list" }));
    expect(p.onAddAll).toHaveBeenCalledTimes(1);
  });

  it("puts a kid's safe foods first with their own button", async () => {
    const user = userEvent.setup();
    const p = props({ safeRunningLow: [milk], kidName: "Ava", lowCount: 1 });
    render(<PantryStockStrip {...p} />);
    expect(screen.getByText("Ava's safe foods low: Milk")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add these" }));
    expect(p.onAddSafe).toHaveBeenCalledTimes(1);
  });
});

describe("PantryKidLens", () => {
  it("renders nothing without kids", () => {
    const { container } = render(
      <PantryKidLens kids={[]} selectedKidId={null} onSelect={vi.fn()} fitFilter="all" onFitFilter={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the selection and toggles fit chips", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onFitFilter = vi.fn();
    render(
      <PantryKidLens
        kids={[{ id: "k1", name: "Ava" }, { id: "k2", name: "Leo" }]}
        selectedKidId="k1"
        onSelect={onSelect}
        fitFilter="eats"
        onFitFilter={onFitFilter}
      />,
    );
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ava" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All kids" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "All kids" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    await user.click(screen.getByRole("button", { name: "Eats it" }));
    expect(onFitFilter).toHaveBeenCalledWith("all");
    await user.click(screen.getByRole("button", { name: "Avoid" }));
    expect(onFitFilter).toHaveBeenCalledWith("avoid");
  });
});
