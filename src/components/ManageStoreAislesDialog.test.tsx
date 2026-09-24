import { describe, it, expect, vi, beforeEach } from "vitest";
import "@/i18n";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import type { StoreAisleRow, StoreLayoutRow } from "@/lib/storeLayouts";

/**
 * Move up / Move down replace the decorative drag handle. The swap is
 * optimistic, so a failed write has to put both rows back.
 */
const AISLES: StoreAisleRow[] = [
  { id: "a1", store_layout_id: "s1", aisle_name: "Produce", aisle_number: null, sort_order: 1, created_at: null },
  { id: "a2", store_layout_id: "s1", aisle_name: "Dairy", aisle_number: null, sort_order: 2, created_at: null },
  { id: "a3", store_layout_id: "s1", aisle_name: "Snacks", aisle_number: null, sort_order: 3, created_at: null },
];

const updates: Array<{ id: string; sort_order: number }> = [];
let failUpdates = false;
let releaseUpdates: () => void = () => {};
let gate: Promise<void> = Promise.resolve();

vi.mock("@/integrations/supabase/client", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    let pendingUpdate: { sort_order: number } | null = null;
    let id = "";
    chain.select = () => chain;
    chain.order = () => chain;
    chain.update = (values: { sort_order: number }) => {
      pendingUpdate = values;
      return chain;
    };
    chain.eq = (col: string, value: string) => {
      if (col === "id") id = value;
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (!pendingUpdate) return Promise.resolve(resolve({ data: AISLES, error: null }));
      const values = pendingUpdate;
      return gate.then(() => {
        updates.push({ id, sort_order: values.sort_order });
        return resolve(
          failUpdates && id === "a1"
            ? { data: null, error: { message: "permission denied" } }
            : { data: [{ id }], error: null },
        );
      });
    };
    return chain;
  };
  return { supabase: { from } };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const { ManageStoreAislesDialog } = await import("./ManageStoreAislesDialog");

const STORE: StoreLayoutRow = {
  id: "s1",
  name: "Kroger",
  store_name: "Kroger",
  household_id: "h1",
  user_id: "u1",
  address: null,
  aisle_overrides: {},
  banner_image_url: null,
  created_at: null,
  is_default: false,
  slug: null,
  store_chain: null,
  store_location: null,
  updated_at: null,
};

const rowNames = () =>
  within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.replace(/^\d+/, "") ?? "");

describe("ManageStoreAislesDialog reordering", () => {
  beforeEach(() => {
    updates.length = 0;
    failUpdates = false;
    gate = new Promise<void>((resolve) => {
      releaseUpdates = resolve;
    });
  });

  it("Move up swaps sort_order with the aisle above", async () => {
    const onAislesChanged = vi.fn();
    render(<ManageStoreAislesDialog open onOpenChange={() => {}} storeLayout={STORE} onAislesChanged={onAislesChanged} />);
    await screen.findByText("Dairy");

    fireEvent.click(screen.getByRole("button", { name: "Move Dairy up" }));
    // Optimistic: the order changes before the server answers.
    expect(rowNames()).toEqual(["Dairy", "Produce", "Snacks"]);

    releaseUpdates();
    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: "a2", sort_order: 1 },
        { id: "a1", sort_order: 2 },
      ]),
    );
    await waitFor(() => expect(onAislesChanged).toHaveBeenCalled());
    expect(rowNames()).toEqual(["Dairy", "Produce", "Snacks"]);
  });

  it("rolls back when the write fails", async () => {
    failUpdates = true;
    const onAislesChanged = vi.fn();
    render(<ManageStoreAislesDialog open onOpenChange={() => {}} storeLayout={STORE} onAislesChanged={onAislesChanged} />);
    await screen.findByText("Dairy");

    fireEvent.click(screen.getByRole("button", { name: "Move Dairy up" }));
    expect(rowNames()).toEqual(["Dairy", "Produce", "Snacks"]);

    releaseUpdates();
    await waitFor(() => expect(rowNames()).toEqual(["Produce", "Dairy", "Snacks"]));
    expect(onAislesChanged).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.error).toHaveBeenCalled();
  });
});
