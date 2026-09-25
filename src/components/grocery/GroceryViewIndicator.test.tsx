import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import { GroceryViewIndicator } from "./GroceryViewIndicator";

function setup(overrides: Partial<Parameters<typeof GroceryViewIndicator>[0]> = {}) {
  const props = {
    kidName: null,
    hiddenCount: 0,
    byCategory: false,
    storeName: null,
    onClearKid: vi.fn(),
    onClearGroup: vi.fn(),
    onClearStore: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  const view = render(<GroceryViewIndicator {...props} />);
  return { ...props, ...view };
}

describe("GroceryViewIndicator", () => {
  it("renders nothing at the defaults, so it costs the first screen nothing", () => {
    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });

  it("names each setting that is off its default, and each X clears only its own", () => {
    const p = setup({ kidName: "Emma", hiddenCount: 3, byCategory: true, storeName: "Corner Shop" });
    expect(screen.getByText("Emma's items, 3 hidden")).toBeInTheDocument();
    expect(screen.getByText("By category")).toBeInTheDocument();
    expect(screen.getByText("Store: Corner Shop")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show everyone's items" }));
    expect(p.onClearKid).toHaveBeenCalledTimes(1);
    expect(p.onClearGroup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Group by aisle again" }));
    expect(p.onClearGroup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Use the typical store" }));
    expect(p.onClearStore).toHaveBeenCalledTimes(1);
  });

  it("says nothing about hidden rows when the filter hides none", () => {
    setup({ kidName: "Emma" });
    expect(screen.getByText("Emma's items")).toBeInTheDocument();
  });

  it("tapping a chip's label reopens the sheet", () => {
    const p = setup({ byCategory: true });
    fireEvent.click(screen.getByRole("button", { name: "By category. Change list view" }));
    expect(p.onEdit).toHaveBeenCalledTimes(1);
  });
});
