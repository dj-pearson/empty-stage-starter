import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food, FoodCategory, Kid } from "@/types";
import type { CatalogEntry } from "@/lib/effectiveFood";
import { getKidFoodFit, summarizeKidFits } from "@/lib/kidFit";
import { FoodCard } from "@/components/FoodCard";
import { PantryListItem } from "./PantryListItem";
import { PantryCategorySection } from "./PantryCategorySection";

const base: Food = {
  id: "f1",
  name: "Oat Bars",
  category: "snack",
  is_safe: true,
  is_try_bite: false,
  quantity: 1,
  unit: "box",
};

const food = (over: Partial<Food> = {}): Food => ({ ...base, ...over });
const noop = () => {};

describe("unknown category", () => {
  // The column is free text in the database; a row from the iOS app or an
  // import can carry anything, and one bad row used to crash the page.
  const odd = food({ category: "other" as unknown as FoodCategory });

  it("FoodCard renders it as Other", () => {
    render(<FoodCard food={odd} onEdit={noop} onDelete={noop} />);
    expect(screen.getByText("Oat Bars")).toBeInTheDocument();
    expect(screen.getAllByText("Other").length).toBeGreaterThan(0);
  });

  it("PantryListItem renders it", () => {
    render(<PantryListItem food={odd} onEdit={noop} onDelete={noop} />);
    expect(screen.getByText("Oat Bars")).toBeInTheDocument();
  });
});

describe("list quantity entry", () => {
  it("commits a typed 1.5 as 1.5, not 1 or 2", async () => {
    const user = userEvent.setup();
    const onQuantityChange = vi.fn();
    render(
      <PantryListItem
        food={food({ quantity: 4 })}
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={onQuantityChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Adjust Oat Bars quantity/ }));
    const input = await screen.findByLabelText("Quantity of Oat Bars");
    expect(input).toHaveAttribute("step", "any");
    expect(input).toHaveAttribute("inputmode", "decimal");
    await user.clear(input);
    await user.type(input, "1.5");
    await user.click(screen.getByRole("button", { name: "Set" }));
    expect(onQuantityChange).toHaveBeenCalledWith("f1", 1.5);
  });

  it("'-' on 0.5 asks before emptying instead of going negative", async () => {
    const user = userEvent.setup();
    const onQuantityChange = vi.fn();
    render(
      <PantryListItem
        food={food({ quantity: 0.5 })}
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={onQuantityChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Decrease Oat Bars" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(onQuantityChange).not.toHaveBeenCalled();
  });
});

describe("zero-quantity parity", () => {
  it("list '-' from 1 opens the dialog and 'Threw it out' records waste", async () => {
    const user = userEvent.setup();
    const onWaste = vi.fn();
    const onQuantityChange = vi.fn();
    render(
      <PantryListItem
        food={food({ quantity: 1 })}
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={onQuantityChange}
        onWaste={onWaste}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Decrease Oat Bars" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Threw it out" }));
    expect(onWaste).toHaveBeenCalledWith("f1", 1);
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it("FoodCard '-' on 0.5 is live and opens the same dialog", async () => {
    const user = userEvent.setup();
    const onQuantityChange = vi.fn();
    render(
      <FoodCard food={food({ quantity: 0.5 })} onEdit={noop} onDelete={noop} onQuantityChange={onQuantityChange} />,
    );
    const minus = screen.getByRole("button", { name: "Decrease Oat Bars" });
    expect(minus).toBeEnabled();
    await user.click(minus);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Keep at 0" }));
    expect(onQuantityChange).toHaveBeenCalledWith("f1", 0);
  });
});

describe("grouped grid", () => {
  const catalog: CatalogEntry = {
    id: "c1",
    name: "Oat Bars",
    default_category: "snack",
    default_aisle_section: null,
    verification: "unverified",
    source: "openfoodfacts",
  };

  it("forwards the catalog credit and onWaste to the grid card", async () => {
    const user = userEvent.setup();
    const onWaste = vi.fn();
    const linked = food({ canonical_id: "c1" });
    render(
      <PantryCategorySection
        category="snack"
        items={[linked]}
        isOpen
        onToggle={noop}
        viewMode="grid"
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={noop}
        onWaste={onWaste}
        kidAllergens={[]}
        getCatalog={(f) => (f.canonical_id === "c1" ? catalog : null)}
      />,
    );
    expect(screen.getByRole("link", { name: /open food facts/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decrease Oat Bars" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Threw it out" }));
    expect(onWaste).toHaveBeenCalledWith("f1", 1);
  });

  it("counts out and low separately in the header", () => {
    const items = [
      food({ id: "a", name: "A", quantity: 0 }),
      food({ id: "b", name: "B", quantity: 0 }),
      food({ id: "c", name: "C", quantity: 0 }),
      food({ id: "d", name: "D", quantity: 9 }),
    ];
    render(
      <PantryCategorySection
        category="snack"
        items={items}
        isOpen={false}
        onToggle={noop}
        viewMode="list"
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={noop}
        kidAllergens={[]}
      />,
    );
    expect(screen.getByText("3 out")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ low/)).not.toBeInTheDocument();
  });

  it("passes the category to onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <PantryCategorySection
        category="snack"
        items={[food()]}
        isOpen={false}
        onToggle={onToggle}
        viewMode="list"
        onEdit={noop}
        onDelete={noop}
        onQuantityChange={noop}
        kidAllergens={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Snacks/ }));
    expect(onToggle).toHaveBeenCalledWith("snack");
  });
});

describe("kid fit on items", () => {
  const ava: Kid = { id: "k1", name: "Ava", allergens: ["Peanuts"] };
  const nutty = food({ name: "Trail Mix", allergens: ["peanut"], is_safe: true });
  const fit = summarizeKidFits([{ kid: ava, fit: getKidFoodFit(ava, nutty, []) }]);

  it("names the kid on the allergen chip, matched through the alias", () => {
    render(<FoodCard food={nutty} onEdit={noop} onDelete={noop} fit={fit} />);
    const chip = screen.getByText(/Not for Ava/);
    expect(chip.closest("[data-tone]")).toHaveAttribute("data-tone", "danger");
  });

  it("never shows a Safe badge next to an allergen chip", () => {
    render(<FoodCard food={nutty} onEdit={noop} onDelete={noop} fit={fit} />);
    expect(screen.queryByText("Safe")).not.toBeInTheDocument();
    expect(screen.queryByText(/Safe for/)).not.toBeInTheDocument();
  });

  it("the list row shows the same chip", () => {
    render(<PantryListItem food={nutty} onEdit={noop} onDelete={noop} fit={fit} />);
    expect(screen.getByText(/Not for Ava/)).toBeInTheDocument();
    expect(screen.queryByText("Safe")).not.toBeInTheDocument();
  });

  it("the legacy path matches allergens canonically and drops Safe", () => {
    render(<FoodCard food={nutty} onEdit={noop} onDelete={noop} kidAllergens={["Peanuts"]} />);
    expect(screen.getByText("peanut")).toBeInTheDocument();
    expect(screen.queryByText("Safe")).not.toBeInTheDocument();
  });
});

describe("add to grocery", () => {
  const add = /Add Oat Bars to grocery list/;

  it("is offered on low and out cards only", () => {
    const { rerender } = render(
      <FoodCard food={food({ quantity: 9 })} onEdit={noop} onDelete={noop} onAddToGrocery={noop} />,
    );
    expect(screen.queryByRole("button", { name: add })).not.toBeInTheDocument();
    rerender(<FoodCard food={food({ quantity: 2 })} onEdit={noop} onDelete={noop} onAddToGrocery={noop} />);
    expect(screen.getByRole("button", { name: add })).toBeInTheDocument();
    rerender(<FoodCard food={food({ quantity: 0 })} onEdit={noop} onDelete={noop} onAddToGrocery={noop} />);
    expect(screen.getByRole("button", { name: add })).toBeInTheDocument();
  });

  it("calls back with the food", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const f = food({ quantity: 0 });
    render(<FoodCard food={f} onEdit={noop} onDelete={noop} onAddToGrocery={onAdd} />);
    await user.click(screen.getByRole("button", { name: add }));
    expect(onAdd).toHaveBeenCalledWith(f);
  });

  it("shows a disabled On list state when it is already on the list", () => {
    render(<FoodCard food={food({ quantity: 0 })} onEdit={noop} onDelete={noop} onAddToGrocery={noop} onList />);
    expect(screen.queryByRole("button", { name: add })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /On list/ })).toBeDisabled();
  });

  it("shows days left on a low card", () => {
    render(<FoodCard food={food({ quantity: 2 })} onEdit={noop} onDelete={noop} runsOutInDays={3} />);
    expect(screen.getByText("about 3 days left")).toBeInTheDocument();
  });

  it("an out list row offers the list in the quantity slot and marks itself Out", () => {
    render(
      <PantryListItem food={food({ quantity: 0 })} onEdit={noop} onDelete={noop} onAddToGrocery={noop} />,
    );
    expect(screen.getAllByRole("button", { name: add })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Decrease Oat Bars" })).not.toBeInTheDocument();
    expect(screen.getByText("Out")).toBeInTheDocument();
  });
});
