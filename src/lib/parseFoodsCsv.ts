/**
 * Pure CSV -> pantry foods parser for ImportCsvDialog.
 *
 * It used to live inside the dialog, where it split every line on "," (so
 * `"Mac, Cheese",snack` became a food called `"Mac` in category ` Cheese"`),
 * copied every column it found onto the food (a `notes` column went straight
 * to the insert and failed it), pushed its errors onto the state array
 * directly (so none of them ever rendered), and silently skipped a short row.
 *
 * Rules:
 *   - RFC 4180 quoting: commas, doubled quotes and newlines inside quotes.
 *   - Only the columns a pantry food has are read (COLUMNS below); anything
 *     else in the file is ignored rather than written.
 *   - `name` is the one required column. A row with a different number of
 *     cells than the header is reported, not guessed at.
 *   - The same name twice (case-insensitive) imports once.
 *   - An empty is_safe / is_try_bite means "the file didn't say", which is
 *     ACQUIRED_FOOD_IS_SAFE / ACQUIRED_FOOD_IS_TRY_BITE (US-803). A parent who
 *     writes `true` in the column did say, and that is kept.
 */
import { z } from 'zod';
import type { Food, FoodCategory } from '@/types';
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from './foodSafetyDefault';

export const FOOD_CSV_COLUMNS = [
  'name',
  'category',
  'is_safe',
  'is_try_bite',
  'allergens',
  'aisle',
  'quantity',
  'unit',
] as const;

type FoodCsvColumn = (typeof FOOD_CSV_COLUMNS)[number];

export const FOOD_CSV_CATEGORIES: readonly FoodCategory[] = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
];

export interface ParseFoodsCsvResult {
  foods: Omit<Food, 'id'>[];
  errors: string[];
}

/**
 * Split CSV text into rows of cells, honouring quotes. A quoted field may
 * contain commas, newlines and `""` (a literal quote).
 */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'x']);
const FALSE_WORDS = new Set(['false', 'no', 'n', '0']);

const flag = (fallback: boolean) =>
  z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => s === '' || TRUE_WORDS.has(s) || FALSE_WORDS.has(s), {
      message: 'must be true or false',
    })
    .transform((s) => (s === '' ? fallback : TRUE_WORDS.has(s)));

const optionalText = z
  .string()
  .transform((s) => s.trim())
  .transform((s) => (s === '' ? undefined : s));

const FoodCsvRow = z.object({
  name: z.string().trim().min(1, 'name is empty').max(200, 'name is longer than 200 characters'),
  category: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .refine((s) => s === '' || (FOOD_CSV_CATEGORIES as readonly string[]).includes(s), {
      message: `category must be one of: ${FOOD_CSV_CATEGORIES.join(', ')}`,
    })
    .transform((s): FoodCategory => (s === '' ? 'snack' : (s as FoodCategory))),
  is_safe: flag(ACQUIRED_FOOD_IS_SAFE),
  is_try_bite: flag(ACQUIRED_FOOD_IS_TRY_BITE),
  allergens: z
    .string()
    .transform((s) =>
      s
        .split(/[;|]/)
        .map((a) => a.trim())
        .filter(Boolean)
    ),
  aisle: optionalText,
  quantity: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s === '' || (Number.isFinite(Number(s)) && Number(s) >= 0), {
      message: 'quantity must be a number, 0 or more',
    })
    .transform((s) => (s === '' ? undefined : Number(s))),
  unit: optionalText,
});

export function parseFoodsCsv(text: string): ParseFoodsCsvResult {
  const errors: string[] = [];
  const foods: Omit<Food, 'id'>[] = [];

  const rows = splitCsv(text ?? '');
  // Row numbers are file lines as a spreadsheet shows them: header is row 1.
  const numbered = rows
    .map((cells, index) => ({ cells, line: index + 1 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));

  if (numbered.length === 0) return { foods, errors: ['The file is empty.'] };

  const headers = numbered[0].cells.map((h) => h.trim().toLowerCase());
  if (!headers.includes('name')) {
    return { foods, errors: ['Missing required column: name'] };
  }

  const columnIndex = new Map<FoodCsvColumn, number>();
  for (const col of FOOD_CSV_COLUMNS) {
    const idx = headers.indexOf(col);
    if (idx >= 0) columnIndex.set(col, idx);
  }

  const firstLineForName = new Map<string, number>();

  for (const { cells: rawCells, line } of numbered.slice(1)) {
    // Trailing empty cells (a spreadsheet export padding a row) are not a
    // column-count problem.
    const cells = [...rawCells];
    while (cells.length > headers.length && cells[cells.length - 1].trim() === '') cells.pop();
    if (cells.length !== headers.length) {
      errors.push(`Row ${line}: expected ${headers.length} columns, found ${cells.length}`);
      continue;
    }

    const raw: Record<FoodCsvColumn, string> = {
      name: '',
      category: '',
      is_safe: '',
      is_try_bite: '',
      allergens: '',
      aisle: '',
      quantity: '',
      unit: '',
    };
    for (const [col, idx] of columnIndex) raw[col] = cells[idx] ?? '';

    const parsed = FoodCsvRow.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? '');
        return issue.message.startsWith(field) ? issue.message : `${field} ${issue.message}`;
      });
      const label = raw.name.trim() ? ` (${raw.name.trim()})` : '';
      errors.push(`Row ${line}${label}: ${issues.join('; ')}`);
      continue;
    }

    const row = parsed.data;
    const key = row.name.toLowerCase().replace(/\s+/g, ' ');
    const firstLine = firstLineForName.get(key);
    if (firstLine !== undefined) {
      errors.push(`Row ${line} (${row.name}): same name as row ${firstLine}, imported once`);
      continue;
    }
    firstLineForName.set(key, line);

    const food: Omit<Food, 'id'> = {
      name: row.name,
      category: row.category,
      is_safe: row.is_safe,
      is_try_bite: row.is_try_bite,
      // A write of the CSV's own aisle into the new household row, spread in
      // rather than assigned so it is not mistaken for a catalog read (US-795).
      ...(row.aisle !== undefined ? { aisle: row.aisle } : {}),
    };
    if (row.allergens.length > 0) food.allergens = row.allergens;
    if (row.quantity !== undefined) food.quantity = row.quantity;
    if (row.unit !== undefined) food.unit = row.unit;
    foods.push(food);
  }

  return { foods, errors };
}
