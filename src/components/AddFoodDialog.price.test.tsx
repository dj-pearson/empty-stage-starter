/** Item 22: the food editor's optional price, saved with its currency. */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@/i18n";
import type { Food } from "@/types";

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    ilike: () => query,
    limit: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { from: () => query } };
});

import { AddFoodDialog } from "./AddFoodDialog";

const priceInput = () => screen.getByLabelText(/^Price per/);

describe("AddFoodDialog price", () => {
  it("saves a typed price with a currency", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddFoodDialog open onOpenChange={vi.fn()} onSave={onSave} editFood={null} />);
    fireEvent.change(screen.getByLabelText("Food name *"), { target: { value: "Milk" } });
    fireEvent.change(priceInput(), { target: { value: "3.49" } });
    fireEvent.click(screen.getByRole("button", { name: "Add food" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0] as Food;
    expect(saved.price_per_unit).toBe(3.49);
    expect(saved.currency).toMatch(/^[A-Z]{3}$/);
  });

  it("sends no price when the field is blank", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<AddFoodDialog open onOpenChange={vi.fn()} onSave={onSave} editFood={null} />);
    fireEvent.change(screen.getByLabelText("Food name *"), { target: { value: "Milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Add food" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("price_per_unit");
  });

  it("will not save a price it cannot read", () => {
    render(<AddFoodDialog open onOpenChange={vi.fn()} onSave={vi.fn()} editFood={null} />);
    fireEvent.change(screen.getByLabelText("Food name *"), { target: { value: "Milk" } });
    fireEvent.change(priceInput(), { target: { value: "cheap" } });
    expect(priceInput()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Add food" })).toBeDisabled();
  });

  it("shows an existing price and clears it when emptied", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const milk: Food = {
      id: "f1",
      name: "Milk",
      category: "dairy",
      is_safe: false,
      is_try_bite: false,
      quantity: 1,
      unit: "gal",
      price_per_unit: 4.2,
      currency: "EUR",
    };
    render(<AddFoodDialog open onOpenChange={vi.fn()} onSave={onSave} editFood={milk} />);
    expect(priceInput()).toHaveValue("4.2");
    expect(screen.getByText("EUR")).toBeInTheDocument();
    fireEvent.change(priceInput(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ price_per_unit: null, currency: null });
  });
});
