import { describe, it, expect } from "vitest";
import { matchReceiptLinesToList, receiptMatchScore, receiptTokens } from "./receiptListMatch";
import type { GroceryItem } from "@/types";

const row = (id: string, name: string, checked = false): GroceryItem => ({
  id, name, checked, quantity: 1, unit: "", category: "snack",
});

describe("receiptTokens", () => {
  it("drops sizes and sale words, folds plurals", () => {
    expect(receiptTokens("ORG WHL MILK 1GAL")).toEqual(["whl", "milk"]);
    expect(receiptTokens("Bananas LB")).toEqual(["banana"]);
    expect(receiptTokens("Blueberries")).toEqual(["blueberry"]);
    expect(receiptTokens("")).toEqual([]);
  });
});

describe("receiptMatchScore", () => {
  it("scores the same food 3, a decorated spelling 2, a different food 0", () => {
    expect(receiptMatchScore("BANANAS", "banana")).toBe(3);
    expect(receiptMatchScore("ORG WHL MILK 1GAL", "Milk")).toBe(2);
    expect(receiptMatchScore("CHEDDAR", "cheddar cheese")).toBe(2);
    expect(receiptMatchScore("CHICKEN NUGGETS", "chicken breast")).toBe(0);
    expect(receiptMatchScore("EGGS", "bread")).toBe(0);
  });

  it("matches an abbreviated token of four letters or more", () => {
    expect(receiptMatchScore("STRAWB", "strawberries")).toBe(3);
    // Three letters is too short to trust.
    expect(receiptMatchScore("STR", "strawberries")).toBe(0);
  });
});

describe("matchReceiptLinesToList", () => {
  it("pairs each line with at most one unchecked row, best score first", () => {
    const rows = [row("r-milk", "Milk"), row("r-choc", "Chocolate milk"), row("r-bread", "Bread")];
    const lines = [
      { uid: "l1", parsedName: "CHOCOLATE MILK" },
      { uid: "l2", parsedName: "MILK 1GAL" },
      { uid: "l3", parsedName: "PAPER TOWELS" },
    ];
    const match = matchReceiptLinesToList(lines, rows);
    expect(match.get("l1")).toBe("r-choc");
    expect(match.get("l2")).toBe("r-milk");
    expect(match.has("l3")).toBe(false);
  });

  it("never pairs a row that is already checked", () => {
    const match = matchReceiptLinesToList([{ uid: "l1", parsedName: "MILK" }], [row("r1", "Milk", true)]);
    expect(match.size).toBe(0);
  });

  it("gives a row to only one of two lines for the same food", () => {
    const match = matchReceiptLinesToList(
      [{ uid: "l1", parsedName: "MILK" }, { uid: "l2", parsedName: "MILK" }],
      [row("r1", "Milk")],
    );
    expect(match.get("l1")).toBe("r1");
    expect(match.has("l2")).toBe(false);
  });
});
