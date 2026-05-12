import { describe, it, expect, vi } from 'vitest';
import {
  createIngredientResolver,
  slugify,
  singularize,
  diceCoefficient,
  type TelemetryEvent,
} from './ingredientResolver';

// ---------------------------------------------------------------------------
// Mock supabase client builder
// ---------------------------------------------------------------------------
interface MockIngredient {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  default_unit: string | null;
}

interface MockAliasRow {
  ingredient_id: string | null;
  confidence: number;
}

interface MockClientOpts {
  ingredients?: MockIngredient[];
  /** Map keyed by lower-cased alias text; query is ilike with no wildcards = exact ci match. */
  aliases?: Map<string, MockAliasRow[]>;
  /** Captured insert payloads, in order. */
  insertedAliases?: Array<Record<string, unknown>>;
  /** If true, the ingredients SELECT returns an error. */
  failIngredientsLoad?: boolean;
  /** Counter for ingredients-select calls (cache test). */
  loadCount?: { n: number };
}

function buildMockClient(opts: MockClientOpts) {
  const aliases = opts.aliases ?? new Map<string, MockAliasRow[]>();
  return {
    from(table: string) {
      if (table === 'ingredients') {
        return {
          select: () => {
            if (opts.loadCount) opts.loadCount.n += 1;
            if (opts.failIngredientsLoad) {
              return Promise.resolve({ data: null, error: { message: 'forced failure' } });
            }
            return Promise.resolve({ data: opts.ingredients ?? [], error: null });
          },
        };
      }
      if (table === 'ingredient_aliases') {
        let aliasFilter: string | null = null;
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.ilike = (_col: string, val: string) => {
          aliasFilter = val.toLowerCase();
          return builder;
        };
        builder.not = () => builder;
        builder.order = () => builder;
        builder.insert = (row: Record<string, unknown>) => {
          opts.insertedAliases?.push(row);
          return Promise.resolve({ data: null, error: null });
        };
        // Thenable for `await builder` after the chained calls.
        builder.then = (
          resolve: (value: { data: MockAliasRow[]; error: null }) => void,
        ) => {
          const data = aliasFilter ? (aliases.get(aliasFilter) ?? []) : [];
          resolve({ data, error: null });
          return Promise.resolve({ data, error: null });
        };
        return builder;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

const CATALOG: MockIngredient[] = [
  { id: 'i-tomato', name: 'Tomato', slug: 'tomato', category: 'produce', default_unit: 'piece' },
  { id: 'i-cherry-tomato', name: 'Cherry Tomato', slug: 'cherry-tomato', category: 'produce', default_unit: 'pint' },
  { id: 'i-egg', name: 'Eggs', slug: 'egg', category: 'protein', default_unit: 'dozen' },
  { id: 'i-green-onion', name: 'Green Onion', slug: 'green-onion', category: 'produce', default_unit: 'bunch' },
  { id: 'i-olive-oil', name: 'Olive Oil', slug: 'olive-oil', category: 'pantry', default_unit: 'bottle' },
  { id: 'i-flour-ap', name: 'All-Purpose Flour', slug: 'flour-all-purpose', category: 'baking', default_unit: 'bag' },
];

// ===========================================================================
// String helpers
// ===========================================================================
describe('slugify', () => {
  it('lowercases and replaces non-alnum with hyphens', () => {
    expect(slugify('Olive Oil')).toBe('olive-oil');
    expect(slugify('All-Purpose Flour')).toBe('all-purpose-flour');
    expect(slugify('  Tomato  ')).toBe('tomato');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('---tomato---')).toBe('tomato');
  });

  it('strips diacritics (tomato vs tomato-with-accent)', () => {
    expect(slugify('tomáto')).toBe('tomato');
    expect(slugify('jalapeño')).toBe('jalapeno');
  });

  it('collapses multiple separators', () => {
    expect(slugify('cherry   tomato')).toBe('cherry-tomato');
    expect(slugify('salt&pepper')).toBe('salt-pepper');
  });
});

describe('singularize', () => {
  it('handles trailing -s', () => {
    expect(singularize('tomatoes')).toBe('tomatoe'); // imperfect; covered by slug + fuzzy fallback
    expect(singularize('eggs')).toBe('egg');
    expect(singularize('apples')).toBe('apple');
  });

  it('handles -ies -> -y', () => {
    expect(singularize('cherries')).toBe('cherry');
    expect(singularize('berries')).toBe('berry');
  });

  it('handles (ch|sh|x|z|ss)es -> -2', () => {
    expect(singularize('peaches')).toBe('peach');
    expect(singularize('boxes')).toBe('box');
    expect(singularize('dishes')).toBe('dish');
  });

  it('preserves -ss words', () => {
    expect(singularize('grass')).toBe('grass');
    expect(singularize('asparagus')).toBe('asparagus');
  });

  it('preserves single-char input', () => {
    expect(singularize('s')).toBe('s');
    expect(singularize('')).toBe('');
  });

  it('handles food-relevant irregulars', () => {
    expect(singularize('leaves')).toBe('leaf');
    expect(singularize('loaves')).toBe('loaf');
    expect(singularize('halves')).toBe('half');
  });
});

describe('diceCoefficient', () => {
  it('returns 1 for identical strings', () => {
    expect(diceCoefficient('tomato', 'tomato')).toBe(1);
  });

  it('returns 0 for fully disjoint short strings', () => {
    expect(diceCoefficient('ab', 'xy')).toBe(0);
  });

  it('returns high for one-char typo', () => {
    const score = diceCoefficient('tomato', 'tomatos');
    expect(score).toBeGreaterThan(0.7);
  });

  it('is symmetric', () => {
    const ab = diceCoefficient('cherry tomato', 'cherry-tomato');
    const ba = diceCoefficient('cherry-tomato', 'cherry tomato');
    expect(ab).toBeCloseTo(ba, 8);
  });
});

// ===========================================================================
// Resolver: slug match
// ===========================================================================
describe('resolver: slug match', () => {
  it('hits on exact slug', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    const result = await r.resolve('tomato');
    expect(result).toEqual({ id: 'i-tomato', confidence: 1, source: 'slug' });
  });

  it('hits on capitalized input', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('TOMATO'))?.id).toBe('i-tomato');
    expect((await r.resolve('Tomato'))?.id).toBe('i-tomato');
  });

  it('hits on whitespace-padded input', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('   tomato   '))?.id).toBe('i-tomato');
  });

  it('hits on multi-word input (slug form)', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('cherry-tomato'))?.id).toBe('i-cherry-tomato');
    expect((await r.resolve('Cherry Tomato'))?.id).toBe('i-cherry-tomato');
  });

  it('handles diacritics by stripping them in slug form', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('Tomáto'))?.id).toBe('i-tomato');
  });

  it('handles plural via singularize (eggs -> egg slug)', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('eggs'))?.id).toBe('i-egg');
    expect((await r.resolve('Eggs'))?.id).toBe('i-egg');
  });
});

// ===========================================================================
// Resolver: name (lowercased) match
// ===========================================================================
describe('resolver: name match (cache lookup)', () => {
  it('matches lowercased canonical name even when slug differs', async () => {
    // "Eggs" name vs "egg" slug. Input "eggs" should match via name lookup.
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect((await r.resolve('Eggs'))?.id).toBe('i-egg');
  });
});

// ===========================================================================
// Resolver: alias match
// ===========================================================================
describe('resolver: alias match', () => {
  it('hits on alias above confidence floor', async () => {
    const aliases = new Map<string, MockAliasRow[]>([
      ['scallion', [{ ingredient_id: 'i-green-onion', confidence: 0.95 }]],
    ]);
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG, aliases }));
    const result = await r.resolve('scallion');
    expect(result).toEqual({ id: 'i-green-onion', confidence: 0.95, source: 'alias' });
  });

  it('returns null when alias is below confidence floor', async () => {
    const aliases = new Map<string, MockAliasRow[]>([
      ['mystery-veg', [{ ingredient_id: 'i-green-onion', confidence: 0.5 }]],
    ]);
    const inserted: Array<Record<string, unknown>> = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, aliases, insertedAliases: inserted }),
    );
    const result = await r.resolve('mystery-veg');
    expect(result).toBeNull();
    // Miss queued the raw name for admin curation.
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ alias: 'mystery-veg', source: 'user', confidence: 0, ingredient_id: null });
  });

  it('refuses to pick a winner when high-confidence aliases disagree (ambiguous)', async () => {
    const aliases = new Map<string, MockAliasRow[]>([
      [
        'red',
        [
          { ingredient_id: 'i-tomato', confidence: 0.85 },
          { ingredient_id: 'i-cherry-tomato', confidence: 0.85 },
        ],
      ],
    ]);
    const inserted: Array<Record<string, unknown>> = [];
    const events: TelemetryEvent[] = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, aliases, insertedAliases: inserted }),
      (ev) => events.push(ev),
    );
    const result = await r.resolve('red');
    expect(result).toBeNull();
    // Ambiguous miss should also be queued for admin disambiguation.
    expect(inserted).toHaveLength(1);
    expect(events.some((e) => e.kind === 'miss' && e.reason === 'ambiguous')).toBe(true);
  });

  it('accepts when multiple high-confidence aliases all point to the same ingredient_id', async () => {
    const aliases = new Map<string, MockAliasRow[]>([
      [
        'spring onion',
        [
          { ingredient_id: 'i-green-onion', confidence: 0.9 },
          { ingredient_id: 'i-green-onion', confidence: 0.85 },
        ],
      ],
    ]);
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG, aliases }));
    const result = await r.resolve('spring onion');
    expect(result?.id).toBe('i-green-onion');
    expect(result?.source).toBe('alias');
  });

  it('respects a custom confidenceFloor', async () => {
    const aliases = new Map<string, MockAliasRow[]>([
      ['cipolla', [{ ingredient_id: 'i-green-onion', confidence: 0.55 }]],
    ]);
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG, aliases }));
    expect(await r.resolve('cipolla')).toBeNull();
    const ok = await r.resolve('cipolla', { confidenceFloor: 0.5 });
    expect(ok?.id).toBe('i-green-onion');
  });
});

// ===========================================================================
// Resolver: fuzzy match
// ===========================================================================
describe('resolver: fuzzy match', () => {
  it('hits via Sorensen-Dice when name is mistyped', async () => {
    // 'tomatos' vs 'tomato' Dice score should be > 0.7.
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    const result = await r.resolve('tomatos');
    // Singularize first strips the trailing 's', so slug match likely wins.
    // Either way, we expect i-tomato.
    expect(result?.id).toBe('i-tomato');
  });

  it('returns null when fuzzy score is below floor', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, insertedAliases: inserted }),
    );
    const result = await r.resolve('completelyunknownthing');
    expect(result).toBeNull();
    expect(inserted).toHaveLength(1);
  });

  it('fuzzy recovers from a one-char typo (oliv oil -> olive oil)', async () => {
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    const result = await r.resolve('oliv oil');
    expect(result?.id).toBe('i-olive-oil');
    expect(result?.source).toBe('fuzzy');
  });

  it('fuzzy does NOT match qualifier-heavy strings like "olive oil extra virgin" - bigram ratio too low', async () => {
    // Documents the limit: 'olive oil' is 8 bigrams; the input is 21. Even
    // 100% overlap gives Dice = 16/29 = 0.55, below the 0.7 floor. This is
    // intentional: a long noisy string should be aliased explicitly via
    // US-306, not silently absorbed into a high-confidence match.
    const r = createIngredientResolver(buildMockClient({ ingredients: CATALOG }));
    expect(await r.resolve('olive oil extra virgin', { queuePendingAlias: false })).toBeNull();
  });
});

// ===========================================================================
// Resolver: empty input, queue suppression
// ===========================================================================
describe('resolver: edge cases', () => {
  it('returns null for empty / whitespace-only input without querying or queueing', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const events: TelemetryEvent[] = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, insertedAliases: inserted }),
      (ev) => events.push(ev),
    );
    expect(await r.resolve('')).toBeNull();
    expect(await r.resolve('   ')).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(events.every((e) => e.kind === 'miss' && e.reason === 'empty-input')).toBe(true);
  });

  it('queuePendingAlias: false suppresses the alias insert on miss', async () => {
    const inserted: Array<Record<string, unknown>> = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, insertedAliases: inserted }),
    );
    const result = await r.resolve('nonexistent-zzz', { queuePendingAlias: false });
    expect(result).toBeNull();
    expect(inserted).toHaveLength(0);
  });
});

// ===========================================================================
// Resolver: telemetry
// ===========================================================================
describe('resolver: telemetry', () => {
  it('emits hit events with source + confidence', async () => {
    const events: TelemetryEvent[] = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG }),
      (ev) => events.push(ev),
    );
    await r.resolve('tomato');
    expect(events).toContainEqual({ kind: 'hit', source: 'slug', confidence: 1 });
  });

  it('per-call onTelemetry overrides resolver-instance hook', async () => {
    const instance: TelemetryEvent[] = [];
    const call: TelemetryEvent[] = [];
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG }),
      (ev) => instance.push(ev),
    );
    await r.resolve('tomato', { onTelemetry: (ev) => call.push(ev) });
    expect(call).toHaveLength(1);
    expect(instance).toHaveLength(0);
  });

  it('does not throw when telemetry hook itself throws', async () => {
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG }),
      () => {
        throw new Error('boom');
      },
    );
    await expect(r.resolve('tomato')).resolves.toMatchObject({ id: 'i-tomato' });
  });
});

// ===========================================================================
// Resolver: cache
// ===========================================================================
describe('resolver: cache', () => {
  it('loads ingredients once per instance (cache hit on subsequent calls)', async () => {
    const loadCount = { n: 0 };
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, loadCount }),
    );
    await r.resolve('tomato');
    await r.resolve('eggs');
    await r.resolve('olive oil');
    expect(loadCount.n).toBe(1);
  });

  it('invalidateCache forces a reload', async () => {
    const loadCount = { n: 0 };
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, loadCount }),
    );
    await r.resolve('tomato');
    r.invalidateCache();
    await r.resolve('eggs');
    expect(loadCount.n).toBe(2);
  });

  it('warmCache pre-loads', async () => {
    const loadCount = { n: 0 };
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, loadCount }),
    );
    await r.warmCache();
    expect(loadCount.n).toBe(1);
    await r.resolve('tomato');
    expect(loadCount.n).toBe(1); // still 1 - cache was warmed
  });

  it('parallel calls share a single in-flight load', async () => {
    const loadCount = { n: 0 };
    const r = createIngredientResolver(
      buildMockClient({ ingredients: CATALOG, loadCount }),
    );
    await Promise.all([r.resolve('tomato'), r.resolve('eggs'), r.resolve('olive oil')]);
    expect(loadCount.n).toBe(1);
  });
});

// ===========================================================================
// Resolver: load failure surfaces
// ===========================================================================
describe('resolver: load failure', () => {
  it('throws if the ingredients select returns an error', async () => {
    const r = createIngredientResolver(buildMockClient({ failIngredientsLoad: true }));
    await expect(r.resolve('tomato')).rejects.toThrow(/ingredientResolver: load failed/);
  });
});

// ===========================================================================
// Spy on console.warn so a failed alias query doesn't pollute test output
// ===========================================================================
describe('resolver: noisy paths quiet', () => {
  it('alias-query failure logs but does not throw, and falls through to fuzzy', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = buildMockClient({ ingredients: CATALOG });
      // Patch the aliases path to return an error after first chain call.
      const origFrom = client.from.bind(client);
      client.from = ((table: string) => {
        if (table === 'ingredient_aliases') {
          let inserted = false;
          const b: Record<string, unknown> = {};
          b.select = () => b;
          b.ilike = () => b;
          b.not = () => b;
          b.order = () => b;
          b.insert = () => {
            inserted = true;
            return Promise.resolve({ data: null, error: null });
          };
          b.then = (resolve: (value: { data: null; error: { message: string } }) => void) => {
            // Return error on the SELECT chain.
            if (!inserted) {
              resolve({ data: null, error: { message: 'alias query down' } });
            }
            return Promise.resolve({ data: null, error: { message: 'alias query down' } });
          };
          return b;
        }
        return origFrom(table);
      }) as typeof client.from;

      // 'tomato' should still hit via slug; alias error path isn't exercised.
      // Use a slug-miss input so alias path runs.
      const r = createIngredientResolver(client);
      const result = await r.resolve('xxxxxnotaslug', { queuePendingAlias: false });
      expect(result).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
