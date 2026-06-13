import { describe, it, expect } from 'vitest';
import { toCsv } from './csvExport';

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
