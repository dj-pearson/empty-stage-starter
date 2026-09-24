import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import { KidFilterBar } from "./KidFilterBar";

const KIDS = [{ id: "ava", name: "Ava" }, { id: "sam", name: "Sam" }];

describe("KidFilterBar (Item 42)", () => {
  it("offers one toggle per kid, off by default", () => {
    const onChange = vi.fn();
    render(<KidFilterBar kids={KIDS} selectedKidId={null} onChange={onChange} hiddenCount={0} />);
    const ava = screen.getByRole("button", { name: "Only Ava's items" });
    expect(ava).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(ava);
    expect(onChange).toHaveBeenCalledWith("ava");
    expect(screen.queryByTestId("grocery-kid-filter-status")).not.toBeInTheDocument();
  });

  it("says whose items are showing and how many are hidden, with the way back beside it", () => {
    const onChange = vi.fn();
    render(<KidFilterBar kids={KIDS} selectedKidId="ava" onChange={onChange} hiddenCount={3} />);
    expect(screen.getByRole("button", { name: "Only Ava's items" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("grocery-kid-filter-status")).toHaveTextContent(
      "Showing only Ava's items. 3 other items hidden.",
    );
    fireEvent.click(screen.getByRole("button", { name: /show all items/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("tapping the chosen kid again turns the filter off", () => {
    const onChange = vi.fn();
    render(<KidFilterBar kids={KIDS} selectedKidId="sam" onChange={onChange} hiddenCount={1} />);
    expect(screen.getByTestId("grocery-kid-filter-status")).toHaveTextContent("1 other item hidden.");
    fireEvent.click(screen.getByRole("button", { name: "Only Sam's items" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders nothing when no kid has a row", () => {
    const { container } = render(<KidFilterBar kids={[]} selectedKidId={null} onChange={vi.fn()} hiddenCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
