import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import type { GroceryItem, Kid } from "@/types";
import { summarizeKidFits, type KidFit } from "@/lib/kidFit";
import { GroceryRow } from "./GroceryRow";
import { GroceryGroupHeader } from "./GroceryGroupHeader";

const milk: GroceryItem = {
  id: "g1",
  name: "Milk",
  quantity: 2,
  unit: "gal",
  checked: false,
  category: "dairy",
};

function kidFit(over: Partial<KidFit> = {}): KidFit {
  return {
    allergen: null,
    disliked: false,
    alwaysEats: false,
    safe: false,
    tryBite: false,
    tries: 0,
    ate: 0,
    offered: 0,
    lastResult: null,
    ...over,
  };
}

const noop = () => {};

describe("GroceryRow", () => {
  it("renders no edit or delete buttons in compact mode", () => {
    render(
      <GroceryRow
        item={milk}
        checked={false}
        compact
        onToggle={noop}
        onOpen={noop}
        onQuantityStep={noop}
        onDelete={noop}
      />,
    );
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /increase/i })).not.toBeInTheDocument();
    // The name still opens the row, which is where those controls live.
    const onOpen = vi.fn();
    render(<GroceryRow item={{ ...milk, id: "g2", name: "Eggs" }} checked={false} compact onToggle={noop} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Eggs" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("labels every control with the item name", () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(
      <GroceryRow
        item={milk}
        checked={false}
        compact={false}
        onToggle={onToggle}
        onOpen={noop}
        onQuantityStep={noop}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Check off Milk" }));
    expect(onToggle).toHaveBeenCalledWith(milk);
    expect(screen.getByRole("button", { name: "Edit Milk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Increase Milk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decrease Milk" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Milk" }));
    expect(onDelete).toHaveBeenCalledWith(milk);
  });

  it("gives the pending icon screen-reader text", () => {
    render(<GroceryRow item={milk} checked={false} compact pending onToggle={noop} onOpen={noop} />);
    expect(screen.getByText("Not synced yet")).toHaveClass("sr-only");
  });

  it("shows the meta line: servings as ×N, who it is for, who added it", () => {
    render(
      <GroceryRow
        item={{ ...milk, quantity: 3, unit: "servings" }}
        checked
        compact
        forKidNames={["Ava", "Sam"]}
        addedByName="Dana"
        measureNote="1 cup"
        onToggle={noop}
        onOpen={noop}
      />,
    );
    expect(screen.getByText("×3")).toBeInTheDocument();
    expect(screen.getByText("For Ava, Sam")).toBeInTheDocument();
    expect(screen.getByText("Added by Dana")).toBeInTheDocument();
    expect(screen.getByText("Also needed: 1 cup")).toHaveClass("truncate");
    expect(screen.getByRole("checkbox", { name: "Uncheck Milk" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Milk" })).toHaveClass("line-through");
  });

  it("renders the destructive chip for an allergen in grocery mode, and nothing reassuring", () => {
    const leo: Kid = { id: "k1", name: "Leo", allergens: ["peanuts"] };
    const ava: Kid = { id: "k2", name: "Ava", allergens: [] };
    const fit = summarizeKidFits([
      { kid: leo, fit: kidFit({ allergen: "peanut" }) },
      { kid: ava, fit: kidFit({ safe: true }) },
    ]);
    render(<GroceryRow item={milk} checked={false} compact fit={fit} onToggle={noop} onOpen={noop} />);
    const chip = screen.getByText("Not for Leo: peanut").closest("li");
    expect(chip).toHaveAttribute("data-tone", "danger");
    expect(chip?.className).toContain("text-destructive");
  });

  it("does not print 'Allergy not checked' on a row that matched no food", () => {
    const ava: Kid = { id: "k2", name: "Ava" };
    const fit = summarizeKidFits([{ kid: ava, fit: kidFit() }], { unchecked: 1 });
    render(<GroceryRow item={milk} checked={false} compact fit={fit} onToggle={noop} onOpen={noop} />);
    expect(screen.queryByText(/Allergy not checked/)).not.toBeInTheDocument();
  });
});

describe("GroceryGroupHeader", () => {
  it("is a heading wrapping an expandable button when collapsible", () => {
    const onToggle = vi.fn();
    render(
      <GroceryGroupHeader
        id="grp-dairy"
        label="Dairy"
        count={4}
        expanded={false}
        collapsible
        onToggle={onToggle}
        aisleNumber="12"
        position={4}
        total={7}
      />,
    );
    const heading = screen.getByRole("heading", { level: 3 });
    const button = screen.getByRole("button");
    expect(heading).toContainElement(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "grp-dairy");
    expect(screen.getByText("Aisle 12 - Dairy")).toBeInTheDocument();
    expect(screen.getByText("4 of 7")).toBeInTheDocument();
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("is a plain heading when it cannot collapse", () => {
    render(<GroceryGroupHeader id="grp-p" label="Produce" count={1} expanded collapsible={false} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Produce");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
