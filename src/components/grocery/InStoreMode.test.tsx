import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@/i18n";
import type { GroceryItem } from "@/types";
import { InStoreMode, type InStoreModeProps } from "./InStoreMode";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const row = (id: string, name: string, aisle: string, extra: Partial<GroceryItem> = {}): GroceryItem => ({
  id, name, aisle, checked: false, quantity: 1, unit: "", category: "snack", ...extra,
});

// "Dairy" comes after "Produce" in the typical store's walk.
const MILK = row("m", "Milk", "Dairy", { quantity: 2, unit: "gal" });
const YOGURT = row("y", "Yogurt", "Dairy");
const APPLES = row("a", "Apples", "Produce");

function setup(overrides: Partial<InStoreModeProps> = {}) {
  const props: InStoreModeProps = {
    items: [MILK, YOGURT, APPLES],
    walkContext: null,
    done: 0,
    total: 3,
    onToggle: vi.fn(),
    onQuantityStep: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onExit: vi.fn(),
    ...overrides,
  };
  const utils = render(<InStoreMode {...props} />);
  return { ...utils, props, rerenderWith: (next: Partial<InStoreModeProps>) => utils.rerender(<InStoreMode {...props} {...next} />) };
}

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
});

describe("InStoreMode (Item 18)", () => {
  it("shows one aisle at a time, first in the store's walk order", () => {
    setup();
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Produce");
    expect(screen.getAllByTestId("in-store-row")).toHaveLength(1);
    expect(screen.getByTestId("in-store-aisle-position")).toHaveTextContent("Aisle 1 of 2");
    expect(screen.getByTestId("in-store-progress")).toHaveTextContent("0 of 3");
  });

  it("checks off with a big target and keeps edit, quantity and delete behind a tap", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /check off apples/i }));
    expect(props.onToggle).toHaveBeenCalledWith(APPLES);

    expect(screen.queryByTestId("in-store-row-tools")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apples" }));
    const tools = screen.getByTestId("in-store-row-tools");
    fireEvent.click(within(tools).getByRole("button", { name: /increase apples/i }));
    expect(props.onQuantityStep).toHaveBeenCalledWith(APPLES, 1);
    fireEvent.click(within(tools).getByRole("button", { name: /edit/i }));
    expect(props.onEdit).toHaveBeenCalledWith(APPLES);
    fireEvent.click(within(tools).getByRole("button", { name: /remove/i }));
    expect(props.onDelete).toHaveBeenCalledWith(APPLES);
  });

  it("moves on to the next aisle by itself when the current one empties", () => {
    const { rerenderWith } = setup();
    // Checked but still lingering: the aisle stays put.
    rerenderWith({ items: [MILK, YOGURT, { ...APPLES, checked: true }], done: 1 });
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Produce");
    // The linger ends and the row leaves.
    rerenderWith({ items: [MILK, YOGURT], done: 1 });
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Dairy");
    expect(screen.getAllByTestId("in-store-row")).toHaveLength(2);
    expect(screen.getByTestId("in-store-aisle-position")).toHaveTextContent("Aisle 1 of 1");
  });

  it("walks aisles by hand too", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /next aisle/i }));
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Dairy");
    expect(screen.getByRole("button", { name: /next aisle/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /previous aisle/i }));
    expect(screen.getByTestId("in-store-aisle")).toHaveTextContent("Produce");
  });

  it("says when the trip is done and offers checkout", () => {
    const onFinish = vi.fn();
    setup({ items: [], done: 3, total: 3, onFinish, finishLabel: "Finish shopping (3)" });
    expect(screen.getByTestId("in-store-done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /finish shopping/i }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("exits from the button and from Escape", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: /^exit$/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onExit).toHaveBeenCalledTimes(2);
  });

  it("Escape aimed at a dialog opened over it (Edit) does not end the trip", () => {
    const { props } = setup();
    const edit = document.createElement("div");
    edit.setAttribute("role", "dialog");
    edit.setAttribute("data-state", "open");
    document.body.appendChild(edit);
    try {
      fireEvent.keyDown(window, { key: "Escape" });
      expect(props.onExit).not.toHaveBeenCalled();
    } finally {
      edit.remove();
    }
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onExit).toHaveBeenCalledTimes(1);
  });

  it("says when the list is filtered to one kid", () => {
    setup({ filterLabel: "Only Ava's items. 2 others hidden." });
    expect(screen.getByTestId("in-store-filter")).toHaveTextContent("Only Ava's items");
  });

  it("asks for a screen wake lock where the API exists, and says so", async () => {
    const request = vi.fn(async () => ({ released: false, release: vi.fn(async () => {}) }));
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    setup();
    expect(request).toHaveBeenCalledWith("screen");
    expect(await screen.findByText(/screen stays on/i)).toBeInTheDocument();
  });
});
