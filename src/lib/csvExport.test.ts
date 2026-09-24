import { describe, it, expect } from 'vitest';
import { escapeCell, sanitizeFilename, toCsv } from './csvExport';

describe('toCsv (US-346)', () => {
  const cols = [
    { header: 'Platform', value: (r: { platform: string; note: string | null }) => r.platform },
    { header: 'Note', value: (r: { platform: string; note: string | null }) => r.note },
  ];

  it('emits a header row and one row per record', () => {
    const csv = toCsv([{ platform: 'gsc', note: 'ok' }], cols);
    expect(csv).toBe('Platform,Note\r\ngsc,ok');
  });

  it('quotes/escapes values containing commas, quotes, or newlines', () => {
    const csv = toCsv(
      [{ platform: 'a,b', note: 'say "hi"' }, { platform: 'line\nbreak', note: null }],
      cols,
    );
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('Platform,Note');
    expect(rows[1]).toBe('"a,b","say ""hi"""');
    expect(rows[2]).toBe('"line\nbreak",'); // null -> empty cell
  });

  it('handles an empty dataset (header only)', () => {
    expect(toCsv([], cols)).toBe('Platform,Note');
  });
});

describe('escapeCell formula guard', () => {
  it("prefixes a quote on '=SUM(A1)' so a spreadsheet does not evaluate it", () => {
    expect(escapeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCell('+1')).toBe("'+1");
    expect(escapeCell('-2 lb')).toBe("'-2 lb");
    expect(escapeCell('@cmd')).toBe("'@cmd");
  });

  it('leaves -3 as a number untouched', () => {
    expect(escapeCell(-3)).toBe('-3');
  });

  it('round-trips a name holding a quote and a comma', () => {
    const name = 'Ben & Jerry\'s "Chunky", large';
    const cell = escapeCell(name);
    expect(cell).toBe('"Ben & Jerry\'s ""Chunky"", large"');
    // Undo RFC-4180 quoting the way a spreadsheet would.
    expect(cell.slice(1, -1).replace(/""/g, '"')).toBe(name);
  });
});

describe('sanitizeFilename', () => {
  it('strips separators, colons and control characters', () => {
    expect(sanitizeFilename('Costco / Sat: list\\x\u0007.csv')).toBe('Costco  Sat listx.csv');
  });

  it('falls back when nothing is left', () => {
    expect(sanitizeFilename('//')).toBe('export');
  });
});
