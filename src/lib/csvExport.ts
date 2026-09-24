/**
 * Tiny CSV export helper (US-346). RFC-4180-ish quoting so values containing
 * commas, quotes, or newlines survive a round-trip into a spreadsheet.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/**
 * Leading characters a spreadsheet reads as the start of a formula. A grocery
 * row named "=HYPERLINK(...)" is text the household typed, and opening the
 * export must not run it (CSV injection). Only strings are guarded: a real
 * number such as -3 is data and is written as-is.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function escapeCell(value: unknown): string {
  if (value == null) return '';
  let str = String(value);
  if (typeof value === 'string' && FORMULA_LEAD.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Serialize rows to a CSV string with an explicit column order. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(','));
  return [head, ...body].join('\r\n');
}

/**
 * A filename safe to hand to a download: path separators, the drive-letter
 * colon and control characters are removed, so a list named "Costco / Sat"
 * cannot write outside the download folder or fail on Windows.
 */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\:\u0000-\u001f\u007f]/g, '').trim();
  return cleaned || 'export';
}

/**
 * Trigger a browser download of `csv` as `filename`. No-op-safe outside a DOM
 * (returns false) so it can be called from non-browser contexts.
 */
export function downloadCsv(filename: string, csv: string): boolean {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return false;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeFilename(filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
