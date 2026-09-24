import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { GroceryItem } from "@/types";
import { PurchasePrices } from "./PurchasePrices";

const milk: GroceryItem = { id: "g1", name: "Milk", quantity: 1, unit: "gal", checked: true, category: "dairy" };

describe("PurchasePrices (item 22)", () => {
  it("stays out of the way until asked", () => {
    render(<PurchasePrices items={[milk]} onSetPrice={vi.fn()} />);
    expect(screen.queryByLabelText("Milk, per gal")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add prices/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("saves a typed price with a currency when the field is left", async () => {
    const onSetPrice = vi.fn();
    render(<PurchasePrices items={[milk]} onSetPrice={onSetPrice} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Add prices/ }));
    const field = screen.getByLabelText("Milk, per gal");
    await user.type(field, "3.49");
    fireEvent.blur(field);
    expect(onSetPrice).toHaveBeenCalledWith(milk, { unitPrice: 3.49, currency: expect.stringMatching(/^[A-Z]{3}$/) });
  });

  it("keeps a row's own currency, and clears a price that is emptied", async () => {
    const onSetPrice = vi.fn();
    const priced = { ...milk, price_per_unit: 2, currency: "EUR" };
    render(<PurchasePrices items={[priced]} onSetPrice={onSetPrice} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Add prices/ }));
    expect(screen.getByText("EUR")).toBeInTheDocument();
    const field = screen.getByLabelText("Milk, per gal");
    await user.clear(field);
    fireEvent.blur(field);
    expect(onSetPrice).toHaveBeenCalledWith(priced, null);
  });

  it("does not save what it cannot read", async () => {
    const onSetPrice = vi.fn();
    render(<PurchasePrices items={[milk]} onSetPrice={onSetPrice} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Add prices/ }));
    const field = screen.getByLabelText("Milk, per gal");
    await user.type(field, "abc");
    fireEvent.blur(field);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(onSetPrice).not.toHaveBeenCalled();
  });
});
