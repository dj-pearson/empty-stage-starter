import { describe, it, expect } from "vitest";
import { formatMoney, isCurrencyCode, localeCurrency, parsePriceInput, priceUnitFits, pricePairOrNull } from "./money";

describe("localeCurrency", () => {
  it("reads the region of the locale", () => {
    expect(localeCurrency("en-US")).toBe("USD");
    expect(localeCurrency("en-GB")).toBe("GBP");
    expect(localeCurrency("fr-FR")).toBe("EUR");
    expect(localeCurrency("en-CA")).toBe("CAD");
  });

  it("falls back to USD for an unknown or missing locale", () => {
    expect(localeCurrency(undefined)).toBe("USD");
    expect(localeCurrency("xx-ZZ")).toBe("USD");
  });
});

describe("parsePriceInput", () => {
  it("takes the ways a price gets typed", () => {
    expect(parsePriceInput("3.40")).toBe(3.4);
    expect(parsePriceInput("$3.40")).toBe(3.4);
    expect(parsePriceInput("3,40")).toBe(3.4);
    expect(parsePriceInput("1,250.5")).toBe(1250.5);
    expect(parsePriceInput(" 2 ")).toBe(2);
  });

  it("an empty field is no price, not zero", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("   ")).toBeNull();
    expect(parsePriceInput(undefined)).toBeNull();
  });

  it("refuses negatives and words", () => {
    expect(parsePriceInput("-2")).toBeNull();
    expect(parsePriceInput("free")).toBeNull();
  });
});

describe("currency helpers", () => {
  it("accepts real codes only", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("$")).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
  });

  it("keeps a price only with its currency", () => {
    expect(pricePairOrNull(2.5, "EUR")).toEqual({ unitPrice: 2.5, currency: "EUR" });
    expect(pricePairOrNull(2.5, null)).toBeNull();
    expect(pricePairOrNull(-1, "EUR")).toBeNull();
    expect(pricePairOrNull(null, "EUR")).toBeNull();
  });

  it("formats in the reader's locale", () => {
    expect(formatMoney(3.4, "USD", "en-US")).toBe("$3.40");
    expect(formatMoney(3.4, "EUR", "de-DE")).toMatch(/3,40/);
  });
});

describe("priceUnitFits", () => {
  it("matches units case-blind, and a unitless food takes only a unitless price", () => {
    expect(priceUnitFits("Gal", "gal ")).toBe(true);
    expect(priceUnitFits("", "lb")).toBe(false);
    expect(priceUnitFits("", null)).toBe(true);
    expect(priceUnitFits("bag", "lb")).toBe(false);
  });
});
