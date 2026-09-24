/**
 * Prices in the pantry (item 22): parse what a parent typed, pick a currency
 * for a price that came with none, and format an amount for the reader's
 * locale. Pure; no React.
 *
 * A price is stored with an ISO 4217 code, never as a bare number
 * (inventory_movements.price_currency_together says the same thing), so every
 * entry path needs a currency. A receipt says which one; a typed price takes
 * the one the viewer's locale implies.
 */

/** Region -> currency, for the regions this app is used in. Everything else is USD. */
const REGION_CURRENCY: Readonly<Record<string, string>> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  PT: "EUR",
  FI: "EUR",
  GR: "EUR",
  LU: "EUR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  IN: "INR",
  JP: "JPY",
  MX: "MXN",
  BR: "BRL",
  ZA: "ZAR",
  SG: "SGD",
  PH: "PHP",
};

export const FALLBACK_CURRENCY = "USD";

/** True for a three-letter uppercase code Intl can format. */
export function isCurrencyCode(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value });
    return true;
  } catch {
    return false;
  }
}

/** The region part of a locale tag ("en-GB" -> "GB"), filled in when absent. */
function regionOf(locale: string): string | null {
  try {
    const loc = new Intl.Locale(locale);
    return loc.region ?? loc.maximize().region ?? null;
  } catch {
    const m = /[-_]([A-Za-z]{2})\b/.exec(locale);
    return m ? m[1].toUpperCase() : null;
  }
}

/** The currency a price typed in this locale is most likely in. */
export function localeCurrency(locale: string | null | undefined): string {
  if (!locale) return FALLBACK_CURRENCY;
  const region = regionOf(locale);
  return (region && REGION_CURRENCY[region]) || FALLBACK_CURRENCY;
}

/** The browser's own locale list, best first, for localeCurrency. */
export function viewerLocale(fallback = "en-US"): string {
  if (typeof navigator !== "undefined") {
    const first = navigator.languages?.[0] ?? navigator.language;
    if (first) return first;
  }
  return fallback;
}

/**
 * A typed price, or null. Accepts "3.40", "3,40", "$3.40" and " 3 ";
 * refuses negatives, non-numbers and an empty field (no price is not zero).
 */
export function parsePriceInput(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[^\d.,-]/g, "");
  if (cleaned === "" || cleaned.includes("-")) return null;
  // One comma and no dot is a decimal comma ("3,40"); otherwise commas group.
  const normalized =
    cleaned.includes(",") && !cleaned.includes(".") && /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(",", ".")
      : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** An amount in its currency, formatted for `locale`. Falls back to "12.50 XYZ". */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * A price and its currency, or nothing. Mirrors the price_currency_together
 * CHECK, so a caller can spread the result straight into a row.
 */
export function pricePairOrNull(
  price: unknown,
  currency: unknown,
): { unitPrice: number; currency: string } | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  if (!isCurrencyCode(currency)) return null;
  return { unitPrice: price, currency };
}

/**
 * True when a price per `priceUnit` can stand as a price per `foodUnit`.
 * Units compare trimmed and case-blind, and must be the same unit (both empty
 * counts). Unlike a quantity merge, a unitless food does not take any unit: a
 * price "per lb" stored on a bare-count food would later cost "2 thrown out"
 * as 2 lb.
 */
export function priceUnitFits(foodUnit: string | null | undefined, priceUnit: string | null | undefined): boolean {
  return (foodUnit ?? "").trim().toLowerCase() === (priceUnit ?? "").trim().toLowerCase();
}
