import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/i18n";
import type { Food } from "@/types";

const addFoods = vi.fn();
let foods: Food[] = [];

vi.mock("@/contexts/AppContext", () => ({
  useFoods: () => ({ addFoods, foods }),
}));

import { ImportCsvDialog } from "./ImportCsvDialog";

function uploadCsv(text: string) {
  const file = new File([text], "foods.csv", { type: "text/csv" });
  fireEvent.change(screen.getByTestId("csv-file-input"), { target: { files: [file] } });
}

describe("ImportCsvDialog", () => {
  beforeEach(() => {
    addFoods.mockReset();
    foods = [];
  });

  it("opens from a controlled prop with no trigger of its own", () => {
    render(<ImportCsvDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import CSV" })).not.toBeInTheDocument();
  });

  it("keeps its own trigger when uncontrolled", async () => {
    render(<ImportCsvDialog />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Import CSV" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lists the rows it could not read", async () => {
    render(<ImportCsvDialog open onOpenChange={vi.fn()} />);
    uploadCsv('name,category\n"Mac, Cheese",snack\nCake,dessert\nShort');

    const list = await screen.findByTestId("csv-errors");
    expect(list).toHaveTextContent('Row 3 (Cake): category must be one of');
    expect(list).toHaveTextContent("Row 4: expected 2 columns, found 1");
    expect(screen.getByText("Mac, Cheese")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 food" })).toBeInTheDocument();
  });

  it("imports unmarked foods and closes through onOpenChange", async () => {
    addFoods.mockResolvedValue(true);
    const onOpenChange = vi.fn();
    render(<ImportCsvDialog open onOpenChange={onOpenChange} />);
    uploadCsv("name,category\nBroccoli,vegetable");

    await userEvent.setup().click(await screen.findByRole("button", { name: "Import 1 food" }));
    await waitFor(() => expect(addFoods).toHaveBeenCalledTimes(1));
    expect(addFoods.mock.calls[0][0]).toEqual([
      { name: "Broccoli", category: "vegetable", is_safe: false, is_try_bite: false },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
