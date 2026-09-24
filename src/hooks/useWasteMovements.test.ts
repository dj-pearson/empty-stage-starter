import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ householdId: null }) }));
vi.mock("@/contexts/AppContext", () => ({ useInventory: () => ({ movements: [] }) }));

import { parseReportRows } from "./useWasteMovements";

describe("parseReportRows", () => {
  it("coerces NUMERIC strings, as a realtime payload can carry them", () => {
    const [row] = parseReportRows([
      {
        id: "m1",
        item_id: "f1",
        delta: "-2",
        canonical_unit: "count",
        display_quantity: "-2",
        display_unit: "bag",
        reason: "waste",
        occurred_at: "2026-09-02T10:00:00Z",
        unit_price: "1.25",
        currency: "USD",
      },
    ]);
    expect(row).toMatchObject({ delta: -2, display_quantity: -2, unit_price: 1.25, reversed_by_id: null });
  });

  it("drops a row with no id, no item or no usable delta", () => {
    expect(
      parseReportRows([
        { item_id: "f1", delta: 1 },
        { id: "m", delta: 1 },
        { id: "m", item_id: "f1", delta: "" },
        null,
      ])
    ).toEqual([]);
  });
});
