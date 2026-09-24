import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";

/**
 * With onAddToPantry, a pantry scan is a request to the page, not a write:
 * the dialog must not touch supabase at all, and a re-scan of something the
 * family already has is "+1", a delta, never an absolute total.
 */

const SCANNED = "0123456789012";

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    static getCameras = () => Promise.resolve([{ id: "cam", label: "back camera" }]);
    start(_id: string, _config: unknown, onSuccess: (text: string) => void) {
      setTimeout(() => onSuccess(SCANNED), 0);
      return Promise.resolve();
    }
    stop() {
      return Promise.resolve();
    }
    clear() {
      return Promise.resolve();
    }
  }
  return { Html5Qrcode, Html5QrcodeSupportedFormats: {} };
});

vi.mock("@/lib/platform", () => ({ isMobile: () => false }));

const invokeEdgeFunction = vi.fn();
vi.mock("@/lib/edge-functions", () => ({
  invokeEdgeFunction: (...args: unknown[]) => invokeEdgeFunction(...args),
}));

const from = vi.fn();
const getUser = vi.fn();
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
  },
}));

import { BarcodeScannerDialog } from "./BarcodeScannerDialog";

const inPantry = {
  success: true,
  food: {
    name: "Cheerios",
    category: "Breakfast cereals",
    allergens: ["oats"],
    source: "Your Pantry",
    existing_quantity: 2,
    existing_unit: "boxes",
    in_pantry: true,
  },
};

const fresh = {
  success: true,
  food: {
    name: "Goldfish Crackers",
    category: "en:snacks",
    allergens: ["wheat", "milk"],
    source: "Open Food Facts",
    in_pantry: false,
  },
};

async function scan() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /start camera scan/i }));
  return user;
}

describe("BarcodeScannerDialog with onAddToPantry", () => {
  beforeEach(() => {
    invokeEdgeFunction.mockReset();
    from.mockReset();
    getUser.mockReset();
    rpc.mockReset();
  });

  it("re-scanning a pantry item shows the stock and +1 commits a delta of 1", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: inPantry, error: null });
    const onAddToPantry = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(
      <BarcodeScannerDialog
        open
        onOpenChange={onOpenChange}
        targetTable="foods"
        onAddToPantry={onAddToPantry}
        pantryFoods={[
          { id: "other", name: "Rice", barcode: "999" },
          { id: "food-cheerios", name: "Cheerios", barcode: SCANNED },
        ]}
      />
    );
    const user = await scan();

    expect(await screen.findByTestId("barcode-in-pantry")).toHaveTextContent("You have 2 boxes");
    await user.click(screen.getByRole("button", { name: "Add 1 more Cheerios" }));

    await waitFor(() => expect(onAddToPantry).toHaveBeenCalledTimes(1));
    const payload = onAddToPantry.mock.calls[0][0];
    expect(payload).toMatchObject({ delta: 1, existingFoodId: "food-cheerios", barcode: SCANNED, unit: "boxes" });
    expect(payload.food).toMatchObject({ is_safe: false, is_try_bite: false, allergens: ["oats"] });
    expect(payload.food).not.toHaveProperty("aisle");
    expect(from).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("the stepper on a pantry item adds that many more", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: inPantry, error: null });
    const onAddToPantry = vi.fn().mockResolvedValue(true);
    render(<BarcodeScannerDialog open onOpenChange={vi.fn()} targetTable="foods" onAddToPantry={onAddToPantry} />);
    const user = await scan();

    await user.click(await screen.findByRole("button", { name: "Increase quantity" }));
    await user.click(screen.getByRole("button", { name: "Add 2 more" }));

    await waitFor(() => expect(onAddToPantry).toHaveBeenCalled());
    expect(onAddToPantry.mock.calls[0][0].delta).toBe(2);
    expect(from).not.toHaveBeenCalled();
  });

  it("a new product is handed over unmarked, and a refusal keeps the dialog open", async () => {
    invokeEdgeFunction.mockResolvedValue({ data: fresh, error: null });
    const onAddToPantry = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    render(<BarcodeScannerDialog open onOpenChange={onOpenChange} targetTable="foods" onAddToPantry={onAddToPantry} />);
    const user = await scan();

    await user.click(await screen.findByRole("button", { name: "Add to pantry" }));

    await waitFor(() => expect(onAddToPantry).toHaveBeenCalled());
    const payload = onAddToPantry.mock.calls[0][0];
    expect(payload.delta).toBe(1);
    expect(payload.existingFoodId).toBeUndefined();
    expect(payload.food).toMatchObject({
      name: "Goldfish Crackers",
      category: "snack",
      is_safe: false,
      allergens: ["wheat", "milk"],
      canonical_id: null,
      barcode: SCANNED,
    });
    expect(from).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText("Goldfish Crackers")).toBeInTheDocument();
  });
});
