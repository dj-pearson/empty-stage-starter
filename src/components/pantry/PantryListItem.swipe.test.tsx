/**
 * Item 21: the list row's swipes and the buttons that stand in for them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food } from "@/types";
import { PantryListItem } from "./PantryListItem";

// jsdom has no PointerEvent, and without one pointerId, pointerType and
// isPrimary never reach the handler.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
}

let reduced = false;
vi.mock("@/hooks/useReducedMotion", () => ({ useReducedMotion: () => reduced }));

const milk: Food = {
  id: "f1",
  name: "Milk",
  category: "dairy",
  is_safe: false,
  is_try_bite: false,
  quantity: 3,
  unit: "gal",
};
const noop = () => {};

function renderRow(over: Partial<Parameters<typeof PantryListItem>[0]> = {}) {
  const onAddToGrocery = vi.fn();
  const onUsedUp = vi.fn();
  render(
    <PantryListItem
      food={milk}
      onEdit={noop}
      onDelete={noop}
      onQuantityChange={noop}
      onAddToGrocery={onAddToGrocery}
      onUsedUp={onUsedUp}
      {...over}
    />
  );
  return { onAddToGrocery, onUsedUp, row: screen.getByTestId("pantry-list-row") };
}

function swipe(row: HTMLElement, dx: number, dy = 0, pointerType = "touch") {
  fireEvent.pointerDown(row, { pointerId: 1, isPrimary: true, pointerType, clientX: 150, clientY: 20 });
  fireEvent.pointerMove(row, { pointerId: 1, isPrimary: true, pointerType, clientX: 150 + dx / 2, clientY: 20 + dy / 2 });
  fireEvent.pointerMove(row, { pointerId: 1, isPrimary: true, pointerType, clientX: 150 + dx, clientY: 20 + dy });
  fireEvent.pointerUp(row, { pointerId: 1, isPrimary: true, pointerType, clientX: 150 + dx, clientY: 20 + dy });
}

beforeEach(() => {
  reduced = false;
});

describe("PantryListItem swipes", () => {
  it("swipe right adds to the grocery list", () => {
    const { row, onAddToGrocery, onUsedUp } = renderRow();
    swipe(row, 140);
    expect(onAddToGrocery).toHaveBeenCalledWith(milk);
    expect(onUsedUp).not.toHaveBeenCalled();
  });

  it("swipe left marks it used up", () => {
    const { row, onAddToGrocery, onUsedUp } = renderRow();
    swipe(row, -140);
    expect(onUsedUp).toHaveBeenCalledWith(milk);
    expect(onAddToGrocery).not.toHaveBeenCalled();
  });

  it("a short or vertical drag does nothing", () => {
    const { row, onAddToGrocery, onUsedUp } = renderRow();
    swipe(row, 40);
    swipe(row, 30, 160);
    expect(onAddToGrocery).not.toHaveBeenCalled();
    expect(onUsedUp).not.toHaveBeenCalled();
  });

  it("a mouse drag is not a swipe", () => {
    const { row, onAddToGrocery } = renderRow();
    swipe(row, 140, 0, "mouse");
    expect(onAddToGrocery).not.toHaveBeenCalled();
  });

  it("does not add again when the food is already on the list", () => {
    const { row, onAddToGrocery } = renderRow({ onList: true });
    swipe(row, 140);
    expect(onAddToGrocery).not.toHaveBeenCalled();
  });

  it("still works with reduced motion, without moving the row", () => {
    reduced = true;
    const { row, onUsedUp } = renderRow();
    fireEvent.pointerDown(row, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 150, clientY: 20 });
    fireEvent.pointerMove(row, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 40, clientY: 20 });
    const moved = row.querySelector<HTMLElement>("[style*='translateX']");
    expect(moved).toBeNull();
    fireEvent.pointerUp(row, { pointerId: 1, isPrimary: true, pointerType: "touch", clientX: 40, clientY: 20 });
    expect(onUsedUp).toHaveBeenCalledTimes(1);
  });
});

describe("PantryListItem swipe alternatives", () => {
  it("has a visible Used up button and a grocery button", async () => {
    const { onAddToGrocery, onUsedUp } = renderRow();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mark Milk used up" }));
    await user.click(screen.getByRole("button", { name: "Add Milk to grocery list" }));
    expect(onUsedUp).toHaveBeenCalledWith(milk);
    expect(onAddToGrocery).toHaveBeenCalledWith(milk);
  });

  it("offers no Used up on an empty row", () => {
    renderRow({ food: { ...milk, quantity: 0 } });
    expect(screen.queryByRole("button", { name: "Mark Milk used up" })).not.toBeInTheDocument();
  });

  it("keeps edit and delete reachable from the row menu", async () => {
    const onEdit = vi.fn();
    renderRow({ onEdit });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Milk" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(milk);
  });
});

describe("PantryListItem after a swipe", () => {
  it("a later tap on a row button still works when the swipe fired no click", async () => {
    const onQuantityChange = vi.fn();
    const { row } = renderRow({ onQuantityChange });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    swipe(row, 60); // horizontal, too short to commit, and no click follows
    now.mockReturnValue(5_000);
    fireEvent.click(screen.getByRole("button", { name: "Increase Milk" }));
    now.mockRestore();
    expect(onQuantityChange).toHaveBeenCalled();
  });

  it("swallows the click that the drag itself produces", () => {
    const onQuantityChange = vi.fn();
    const { row } = renderRow({ onQuantityChange });
    swipe(row, 60);
    fireEvent.click(screen.getByRole("button", { name: "Increase Milk" }));
    expect(onQuantityChange).not.toHaveBeenCalled();
  });

  it("leaves the page tappable after Delete from the row menu is cancelled", async () => {
    renderRow();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "More for Milk" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));
    expect(document.body.style.pointerEvents).not.toBe("none");
  });
});
