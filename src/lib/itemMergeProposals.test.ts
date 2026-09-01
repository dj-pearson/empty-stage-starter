import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'zlib';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { proposeMerges, type MergeCandidateItem } from './itemMergeProposals';

const H = 'hh-1';
const item = (over: Partial<MergeCandidateItem> & { id: string; name: string }): MergeCandidateItem => ({
  household_id: H,
  ...over,
});

describe('grouping signals', () => {
  it('groups two rows that reduce to the same normalized name', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'Chicken Breast' }),
      item({ id: 'b', name: 'chicken breasts' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidence).toContain('identical_normalized_text');
    expect([groups[0].survivor.id, ...groups[0].duplicates.map((d) => d.id)].sort()).toEqual(['a', 'b']);
  });

  it('groups on a shared barcode even when the names read differently', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'Oberto beef jerky', barcode: '111' }),
      item({ id: 'b', name: 'jerky, original', barcode: '111' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidence).toContain('shared_barcode');
    expect(groups[0].confidence).toBe(1);
  });

  it('groups on a confirmed alias phrase in common', () => {
    const groups = proposeMerges(
      [item({ id: 'a', name: 'Macaroni' }), item({ id: 'b', name: 'Elbow pasta' })],
      { aliasesByItem: { a: ['mac'], b: ['mac'] } }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].evidence).toContain('alias_overlap');
  });

  it('records every signal that found the same set of rows', () => {
    const groups = proposeMerges(
      [
        item({ id: 'a', name: 'chicken breast', barcode: '111' }),
        item({ id: 'b', name: 'chicken breasts', barcode: '111' }),
      ],
      { aliasesByItem: { a: ['chook'], b: ['chook'] } }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].evidence.sort()).toEqual(
      ['alias_overlap', 'identical_normalized_text', 'shared_barcode'].sort()
    );
    // Strongest signal sets the confidence.
    expect(groups[0].confidence).toBe(1);
  });

  it('leaves genuinely different products alone', () => {
    expect(
      proposeMerges([
        item({ id: 'a', name: 'chicken breast' }),
        item({ id: 'b', name: 'chicken thigh' }),
        item({ id: 'c', name: 'almond milk' }),
        item({ id: 'd', name: 'whole milk' }),
      ])
    ).toEqual([]);
  });
});

describe('a group never mixes two different barcodes', () => {
  it('splits rows whose names match but whose barcodes differ', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'greek yogurt', barcode: '111' }),
      item({ id: 'b', name: 'Greek Yogurt', barcode: '222' }),
    ]);
    // Two distinct products that happen to be named alike. Neither subgroup
    // reaches two members, so nothing is proposed at all.
    expect(groups).toEqual([]);
  });

  it('attaches unbarcoded rows to the single barcoded product when there is one', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'greek yogurt', barcode: '111' }),
      item({ id: 'b', name: 'Greek Yogurt' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicates).toHaveLength(1);
  });

  it('will not attribute an unbarcoded row to either of two barcoded ones', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'greek yogurt', barcode: '111' }),
      item({ id: 'b', name: 'greek yogurt', barcode: '222' }),
      item({ id: 'c', name: 'greek yogurt' }),
    ]);
    // c could belong to either, so it is left out rather than guessed at.
    const allIds = groups.flatMap((g) => [g.survivor.id, ...g.duplicates.map((d) => d.id)]);
    expect(allIds).not.toContain('c');
  });

  it('treats blank and whitespace barcodes as absent, not as a shared value', () => {
    const groups = proposeMerges([
      item({ id: 'a', name: 'rice', barcode: '' }),
      item({ id: 'b', name: 'rice', barcode: '   ' }),
      item({ id: 'c', name: 'quinoa', barcode: '' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].evidence).toEqual(['identical_normalized_text']);
  });
});

describe('survivor choice', () => {
  it('keeps the row with the most movement history', () => {
    const groups = proposeMerges(
      [
        item({ id: 'few', name: 'rice', created_at: '2024-01-01' }),
        item({ id: 'many', name: 'Rice', created_at: '2026-01-01' }),
      ],
      { movementCounts: { few: 2, many: 40 } }
    );
    expect(groups[0].survivor.id).toBe('many');
    expect(groups[0].duplicates.map((d) => d.id)).toEqual(['few']);
  });

  it('falls back to the oldest created_at when history is equal', () => {
    const groups = proposeMerges([
      item({ id: 'new', name: 'rice', created_at: '2026-01-01' }),
      item({ id: 'old', name: 'Rice', created_at: '2024-01-01' }),
    ]);
    expect(groups[0].survivor.id).toBe('old');
  });

  it('sorts a missing created_at last rather than treating it as oldest', () => {
    const groups = proposeMerges([
      item({ id: 'nodate', name: 'rice' }),
      item({ id: 'dated', name: 'Rice', created_at: '2025-06-01' }),
    ]);
    expect(groups[0].survivor.id).toBe('dated');
  });

  it('is deterministic when nothing distinguishes the rows', () => {
    const a = proposeMerges([item({ id: 'b2', name: 'rice' }), item({ id: 'a1', name: 'Rice' })]);
    const b = proposeMerges([item({ id: 'a1', name: 'Rice' }), item({ id: 'b2', name: 'rice' })]);
    expect(a[0].survivor.id).toBe(b[0].survivor.id);
  });
});

describe('scope and eligibility', () => {
  it('never groups across households', () => {
    expect(
      proposeMerges([
        item({ id: 'a', name: 'rice', household_id: 'hh-1' }),
        item({ id: 'b', name: 'Rice', household_id: 'hh-2' }),
      ])
    ).toEqual([]);
  });

  it('falls back to user scope when household_id is null', () => {
    const groups = proposeMerges([
      { id: 'a', name: 'rice', household_id: null, user_id: 'u1' },
      { id: 'b', name: 'Rice', household_id: null, user_id: 'u1' },
      { id: 'c', name: 'rice', household_id: null, user_id: 'u2' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicates).toHaveLength(1);
  });

  it('ignores rows already merged into a survivor', () => {
    expect(
      proposeMerges([
        item({ id: 'a', name: 'rice' }),
        item({ id: 'b', name: 'Rice', merged_into_id: 'a' }),
      ])
    ).toEqual([]);
  });

  it('ignores rows whose name normalises to nothing', () => {
    expect(proposeMerges([item({ id: 'a', name: '' }), item({ id: 'b', name: '   ' })])).toEqual([]);
  });
});

describe('ordering and purity', () => {
  it('returns groups strongest evidence first', () => {
    const groups = proposeMerges([
      item({ id: 'n1', name: 'rice' }),
      item({ id: 'n2', name: 'Rice' }),
      item({ id: 'b1', name: 'jerky', barcode: '999' }),
      item({ id: 'b2', name: 'beef jerky original', barcode: '999' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].confidence).toBeGreaterThanOrEqual(groups[1].confidence);
    expect(groups[0].evidence).toContain('shared_barcode');
  });

  it('does not mutate its input', () => {
    const input = [item({ id: 'a', name: 'rice' }), item({ id: 'b', name: 'Rice' })];
    const snapshot = JSON.stringify(input);
    proposeMerges(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('tolerates an empty list and malformed rows', () => {
    expect(proposeMerges([])).toEqual([]);
    expect(() => proposeMerges([undefined as unknown as MergeCandidateItem])).not.toThrow();
  });
});

/**
 * US-662 criterion 5 asked for these assertions to run against the real
 * duplicates in Database_Backup. Both backups turn out to hold only 18 foods
 * rows across 2 scopes, with no duplicates at all, so there are none to assert
 * against — see the story notes.
 *
 * What the real rows CAN still prove is the direction that matters most for a
 * proposal surface: that a household's genuine, distinct groceries do not get
 * proposed for merging. A false positive here asks a parent to collapse two
 * things they deliberately keep apart.
 */
describe('real catalog rows produce no false positives', () => {
  const BACKUP = resolve(process.cwd(), 'Database_Backup/db_cluster-11-12-2025@05-21-32.backup.gz');

  const rows: MergeCandidateItem[] = (() => {
    if (!existsSync(BACKUP)) return [];
    const lines = gunzipSync(readFileSync(BACKUP)).toString('utf8').replace(/\r\n/g, '\n').split('\n');
    const i = lines.findIndex((l) => l.startsWith('COPY public.foods ('));
    if (i < 0) return [];
    const cols = lines[i].match(/\(([^)]*)\)/)![1].split(',').map((c) => c.trim());
    const out: MergeCandidateItem[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j].replace(/[\r\s]+$/, '');
      if (line.length === 2 && line.charCodeAt(0) === 92 && line.charCodeAt(1) === 46) break;
      if (!lines[j]) continue;
      const parts = lines[j].split('\t');
      const o: Record<string, string | null> = {};
      cols.forEach((c, k) => (o[c] = parts[k] === '\\N' ? null : parts[k]));
      out.push(o as unknown as MergeCandidateItem);
    }
    return out;
  })();

  it('reads the tracked backup rather than silently asserting nothing', () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => typeof r.id === 'string' && r.id.length > 0)).toBe(true);
  });

  it('proposes no merges across a real catalog of distinct groceries', () => {
    const groups = proposeMerges(rows);
    const described = groups.map((g) => [g.survivor.name, ...g.duplicates.map((d) => d.name)]);
    expect(described).toEqual([]);
  });
});
