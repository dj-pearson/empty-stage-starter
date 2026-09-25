/**
 * CSV reading for the Settings import card (settings pass B).
 *
 * The importer used to split on "\n" and then on ",", which broke on the three
 * things a spreadsheet export actually produces: a byte-order mark in front of
 * the first header (Excel's "CSV UTF-8"), commas inside quoted fields ("Rice,
 * brown"), and CRLF line endings that left a "\r" on the last column. This is
 * an RFC 4180 reader, kept pure so the fixtures in csv.test.ts pin it.
 */
import type { FoodCategory } from "@/types";

const BOM = 0xfeff;

/**
 * Parse CSV text into records of raw fields.
 *
 * - A leading BOM is stripped.
 * - Fields may be quoted; inside quotes, commas and line breaks are literal
 *   and `""` is one quote character.
 * - Records end at LF, CRLF or a lone CR.
 * - Blank records (an empty line, including the trailing one most editors
 *   write) are dropped.
 *
 * A quote that appears mid-field (`ab"c`) is kept as a literal character
 * rather than opening a quoted section, which is what spreadsheets do.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === BOM ? input.slice(1) : input;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    record.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      endRecord();
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  if (fieldStarted || field !== "" || record.length > 0) endRecord();

  return records.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface CsvRow {
  /** Spreadsheet row number: the header is row 1, so the first data row is 2. */
  rowNumber: number;
  values: Record<string, string>;
}

export interface CsvTable {
  headers: string[];
  rows: CsvRow[];
}

/**
 * Parse CSV text with a header row. Headers are trimmed and lower-cased so
 * "Name" and "name " both address `name`; values are trimmed.
 */
export function parseCsvWithHeaders(input: string): CsvTable {
  const [head, ...body] = parseCsv(input);
  if (!head) return { headers: [], rows: [] };
  const headers = head.map((h) => h.trim().toLowerCase());
  const rows = body.map((fields, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, i) => {
      if (header) values[header] = (fields[i] ?? "").trim();
    });
    return { rowNumber: index + 2, values };
  });
  return { headers, rows };
}

/** Largest CSV the import card will read. A food list is a few KB. */
export const CSV_MAX_BYTES = 2 * 1024 * 1024;

const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
]);

export type CsvFileProblem = "not-csv" | "too-large" | null;

/**
 * Whether a picked file is one the importer should read. The extension check
 * is case-insensitive (Windows saves FOODS.CSV), and an empty MIME type is
 * accepted because several platforms leave it blank for .csv.
 */
export function checkCsvFile(file: { name: string; type: string; size: number }): CsvFileProblem {
  const hasCsvExtension = /\.csv$/i.test(file.name);
  const mime = file.type.toLowerCase();
  const hasCsvMime = mime === "" || CSV_MIME_TYPES.has(mime);
  if (!hasCsvExtension || !hasCsvMime) return "not-csv";
  if (file.size > CSV_MAX_BYTES) return "too-large";
  return null;
}

export const FOOD_CATEGORIES: readonly FoodCategory[] = [
  "protein",
  "carb",
  "dairy",
  "fruit",
  "vegetable",
  "snack",
];

const CATEGORY_ALIASES: Readonly<Record<string, FoodCategory>> = {
  proteins: "protein",
  meat: "protein",
  carbs: "carb",
  carbohydrate: "carb",
  carbohydrates: "carb",
  grain: "carb",
  grains: "carb",
  starch: "carb",
  fruits: "fruit",
  vegetables: "vegetable",
  veggie: "vegetable",
  veggies: "vegetable",
  veg: "vegetable",
  snacks: "snack",
  "dairy products": "dairy",
};

/**
 * A spreadsheet's category cell to a FoodCategory, or undefined when it is
 * blank or not one we know, so the caller's default applies. "Fruits",
 * " Vegetable " and "CARBS" all resolve.
 */
export function normalizeFoodCategory(raw: unknown): FoodCategory | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if ((FOOD_CATEGORIES as readonly string[]).includes(value)) return value as FoodCategory;
  return CATEGORY_ALIASES[value];
}
