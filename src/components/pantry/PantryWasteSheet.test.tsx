import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/i18n";
import { WasteReportBody } from "./PantryWasteSheet";
import { buildWasteReport, type ReportMovement } from "@/lib/wasteReport";

const NOW = new Date();
const at = new Date(NOW.getFullYear(), NOW.getMonth(), 1, 12).toISOString();

const mv = (over: Partial<ReportMovement> & Pick<ReportMovement, "id" | "item_id" | "reason" | "delta">): ReportMovement => ({
  canonical_unit: "count",
  display_quantity: over.delta,
  display_unit: null,
  occurred_at: at,
  ...over,
});

function renderReport(movements: ReportMovement[]) {
  const report = buildWasteReport({
    movements,
    foods: [
      { id: "broc", name: "Broccoli", unit: "head", is_try_bite: true, price_per_unit: 1.6, currency: "USD" },
      { id: "yog", name: "Yogurt", unit: "cup", is_safe: true },
    ],
    now: NOW,
  });
  render(<WasteReportBody report={report} loading={false} error={false} />);
}

describe("WasteReportBody", () => {
  it("names try-bite waste and its cost, and says when a price is missing", () => {
    renderReport([
      mv({ id: "1", item_id: "broc", reason: "waste", delta: -2, display_unit: "head" }),
      mv({ id: "2", item_id: "yog", reason: "expire", delta: -1, display_unit: "cup" }),
    ]);
    expect(screen.getByText("About $3.20 of try-bite broccoli")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Try bites" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Safe foods" })).toBeInTheDocument();
    expect(screen.getByText("No price yet")).toBeInTheDocument();
    expect(screen.getByTestId("waste-total")).toHaveTextContent("About $3.20 thrown out");
    expect(screen.getByText(/1 item has no price yet/)).toBeInTheDocument();
  });

  it("is honest when nothing has a price", () => {
    renderReport([mv({ id: "1", item_id: "yog", reason: "waste", delta: -1, display_unit: "cup" })]);
    expect(screen.getByTestId("waste-total")).toHaveTextContent("No prices yet for what was thrown out");
  });

  it("has an empty state", () => {
    renderReport([]);
    expect(screen.getByText("Nothing thrown out this month.")).toBeInTheDocument();
  });
});
