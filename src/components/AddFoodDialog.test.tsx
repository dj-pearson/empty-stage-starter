import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food } from "@/types";

const catalogRows = [
  {
    id: "cat-pb",
    name: "Peanut Butter",
    default_category: "protein",
    serving_size_text: "2 tbsp",
    package_quantity_text: "16 oz",
    servings_per_container: 14,
    allergens: ["peanut", "soy"],
    verification: "verified",
  },
];

vi.mock("@/integrations/supabase/client", () => {
  const query = {
    select: () => query,
    ilike: () => query,
    limit: () => Promise.resolve({ data: catalogRows, error: null }),
  };
  return { supabase: { from: () => query } };
});

import { AddFoodDialog } from "./AddFoodDialog";

function setup(onSave = vi.fn().mockResolvedValue(true), editFood: Food | null = null) {
  const onOpenChange = vi.fn();
  render(<AddFoodDialog open onOpenChange={onOpenChange} onSave={onSave} editFood={editFood} />);
  return { onSave, onOpenChange };
}

const nameInput = () => screen.getByLabelText("Food name *");
const saveButton = () => screen.getByRole("button", { name: "Add food" });

describe("AddFoodDialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("saves a new food as not safe and not a try bite (US-803)", async () => {
    const { onSave, onOpenChange } = setup();
    expect(screen.getByRole("radio", { name: "Not set" })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(nameInput(), { target: { value: "Broccoli" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Broccoli", is_safe: false, is_try_bite: false });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("safe and try bite are one choice, not two switches", async () => {
    const { onSave } = setup();
    const user = userEvent.setup();
    fireEvent.change(nameInput(), { target: { value: "Peas" } });
    await user.click(screen.getByRole("radio", { name: "Safe food" }));
    await user.click(screen.getByRole("radio", { name: "Try bite" }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ is_safe: false, is_try_bite: true });
  });

  it("carries the catalog pick's allergens and canonical_id, and lets one be removed", async () => {
    const { onSave } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search the food catalog"), "peanut");
    await user.click(await screen.findByText("Peanut Butter", {}, { timeout: 2000 }));

    expect(nameInput()).toHaveValue("Peanut Butter");
    await user.click(screen.getByRole("button", { name: "Remove allergen soy" }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      name: "Peanut Butter",
      allergens: ["peanut"],
      canonical_id: "cat-pb",
      is_safe: false,
    });
  });

  it("accepts a decimal quantity and zero", async () => {
    const { onSave } = setup();
    fireEvent.change(nameInput(), { target: { value: "Milk" } });
    const qty = screen.getByLabelText("Quantity in stock");
    expect(qty).toHaveAttribute("step", "0.25");
    expect(qty).toHaveAttribute("min", "0");

    fireEvent.change(qty, { target: { value: "0.5" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].quantity).toBe(0.5);
  });

  it("steps down to zero and no further", async () => {
    setup();
    const user = userEvent.setup();
    const dec = screen.getByRole("button", { name: "Decrease quantity" });
    await user.click(dec);
    expect(screen.getByLabelText("Quantity in stock")).toHaveValue(0);
    expect(dec).toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-pressed", "false");
  });

  it("stays open with the form intact when the save is refused", async () => {
    const { onSave, onOpenChange } = setup(vi.fn().mockResolvedValue(false));
    fireEvent.change(nameInput(), { target: { value: "Cheese" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(saveButton()).not.toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(nameInput()).toHaveValue("Cheese");
  });

  it("loads the edited food's allergens and safety", () => {
    setup(vi.fn(), {
      id: "f1",
      name: "Hummus",
      category: "protein",
      is_safe: true,
      is_try_bite: false,
      allergens: ["sesame"],
      quantity: 0.5,
    });
    expect(screen.getByRole("radio", { name: "Safe food" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Remove allergen sesame" })).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity in stock")).toHaveValue(0.5);
  });
});
