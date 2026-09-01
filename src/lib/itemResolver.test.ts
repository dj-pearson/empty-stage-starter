import { describe, it, expect } from 'vitest';
import {
  resolveItem,
  resolveMergeRedirect,
  similarity,
  isProvisional,
  FUZZY_CONFIDENCE_THRESHOLD,
  type ResolveContext,
  type ResolveResult,
  type ResolverItem,
} from './itemResolver';
import { normalizeItemText } from './itemNormalize';

const HOUSEHOLD = 'hh-1';

/** Assert a concrete item was resolved and return it narrowed. */
function resolved(r: ResolveResult) {
  if (isProvisional(r)) {
    throw new Error(`expected a resolved item, got provisional "${r.proposedName}"`);
  }
  return r;
}

/** Assert nothing was resolved and return it narrowed. */
function provisional(r: ResolveResult) {
  if (!isProvisional(r)) throw new Error(`expected provisional, got item ${r.itemId}`);
  return r;
}

const chicken: ResolverItem = { id: 'item-chicken', name: 'Chicken breast', barcode: '012345678905' };
const milk: ResolverItem = { id: 'item-milk', name: 'Whole milk', barcode: null };

function ctx(over: Partial<ResolveContext> = {}): ResolveContext {
  return {
    items: [chicken, milk],
    aliases: [
      { item_id: 'item-chicken', normalized_text: normalizeItemText('chicken breast'), confidence: 1 },
      { item_id: 'item-milk', normalized_text: normalizeItemText('whole milk'), confidence: 1 },
    ],
    canonicalProducts: [],
    ...over,
  };
}

describe('step 1 — barcode exact', () => {
  it('resolves on barcode and reports the path', () => {
    const r = resolved(resolveItem({ text: 'anything at all', barcode: '012345678905', householdId: HOUSEHOLD }, ctx()));
    expect(r.itemId).toBe('item-chicken');
    expect(r.matchedBy).toBe('barcode');
    expect(r.confidence).toBe(1);
  });

  it('beats an alias that would have matched the text', () => {
    // Text says milk, barcode says chicken. The barcode is the one globally
    // unambiguous identifier, so it wins.
    const r = resolved(resolveItem({ text: 'whole milk', barcode: '012345678905', householdId: HOUSEHOLD }, ctx()));
    expect(r.itemId).toBe('item-chicken');
    expect(r.matchedBy).toBe('barcode');
  });

  it('ignores surrounding whitespace on the barcode', () => {
    const r = resolved(resolveItem({ text: 'x', barcode: '  012345678905 ', householdId: HOUSEHOLD }, ctx()));
    expect(r.matchedBy).toBe('barcode');
  });

  it('falls through when the barcode is unknown', () => {
    const r = resolveItem({ text: 'sploots', barcode: '999', householdId: HOUSEHOLD }, ctx());
    expect(isProvisional(r)).toBe(true);
  });
});

describe('step 2 — household alias, exact', () => {
  it('resolves a phrase this household confirmed', () => {
    const r = resolved(resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, ctx()));
    expect(r.itemId).toBe('item-chicken');
    expect(r.matchedBy).toBe('alias_exact');
  });

  it('matches through normalisation, so plurals and units do not split it', () => {
    for (const text of ['Chicken Breasts', '2 lb boneless skinless chicken breasts', 'chicken breast']) {
      const r = resolved(resolveItem({ text, householdId: HOUSEHOLD }, ctx()));
      expect(r.itemId).toBe('item-chicken');
      expect(r.matchedBy).toBe('alias_exact');
    }
  });

  it('carries the alias confidence rather than assuming 1', () => {
    const c = ctx({
      aliases: [{ item_id: 'item-chicken', normalized_text: normalizeItemText('chicken breast'), confidence: 0.6 }],
    });
    expect(resolved(resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, c)).confidence).toBe(0.6);
  });
});

describe('step 3 — household alias, fuzzy above threshold', () => {
  it('absorbs a typo', () => {
    const r = resolved(resolveItem({ text: 'chiken breast', householdId: HOUSEHOLD }, ctx()));
    expect(r.itemId).toBe('item-chicken');
    expect(r.matchedBy).toBe('alias_fuzzy');
    expect(r.confidence).toBeGreaterThanOrEqual(FUZZY_CONFIDENCE_THRESHOLD);
    expect(r.confidence).toBeLessThan(1);
  });

  it('refuses a different cut of meat, which is a different purchase', () => {
    const r = resolveItem({ text: 'chicken thigh', householdId: HOUSEHOLD }, ctx());
    expect(isProvisional(r)).toBe(true);
  });

  it('never lends more confidence than the alias itself has', () => {
    const c = ctx({
      aliases: [{ item_id: 'item-chicken', normalized_text: normalizeItemText('chicken breast'), confidence: 0.5 }],
    });
    const r = resolved(resolveItem({ text: 'chiken breast', householdId: HOUSEHOLD }, c));
    expect(r.confidence).toBeLessThanOrEqual(0.5);
  });

  it('picks the best alias, not the first one over the line', () => {
    const c = ctx({
      aliases: [
        { item_id: 'item-milk', normalized_text: normalizeItemText('chicken broth'), confidence: 1 },
        { item_id: 'item-chicken', normalized_text: normalizeItemText('chicken breast'), confidence: 1 },
      ],
    });
    expect(resolved(resolveItem({ text: 'chiken breast', householdId: HOUSEHOLD }, c)).itemId).toBe('item-chicken');
  });
});

describe('step 4 — canonical_products seed', () => {
  const seeds = [
    { barcode: '5051234567890', normalized_name: normalizeItemText('greek yogurt'), category: 'dairy', default_unit: 'g', default_aisle: 'Dairy' },
  ];

  it('recognises by name and returns provisional WITH defaults, because no row exists here yet', () => {
    const r = provisional(resolveItem({ text: 'Greek Yogurt', householdId: HOUSEHOLD }, ctx({ canonicalProducts: seeds })));
    expect(r.matchedBy).toBe('canonical_product');
    expect(r.proposedName).toBe('Greek Yogurt');
    expect(r.seed?.category).toBe('dairy');
    expect(r.seed?.defaultUnit).toBe('g');
    expect(r.seed?.defaultAisle).toBe('Dairy');
  });

  it('recognises by barcode when the household has never scanned it', () => {
    const r = provisional(resolveItem({ text: 'unknown thing', barcode: '5051234567890', householdId: HOUSEHOLD }, ctx({ canonicalProducts: seeds })));
    expect(r.matchedBy).toBe('canonical_product');
    expect(r.seed?.barcode).toBe('5051234567890');
  });

  it('loses to a household alias, because the household knows its own kitchen', () => {
    const c = ctx({
      canonicalProducts: [{ normalized_name: normalizeItemText('chicken breast'), category: 'seed-category' }],
    });
    const r = resolved(resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, c));
    expect(r.matchedBy).toBe('alias_exact');
  });
});

describe('step 5 — propose new', () => {
  it('proposes the name in the parent words, not the normalized token soup', () => {
    const r = provisional(resolveItem({ text: '  Fancy   Sourdough  ', householdId: HOUSEHOLD }, ctx()));
    expect(r.matchedBy).toBe('none');
    expect(r.confidence).toBe(0);
    // normalizeItemText would give "fancy sourdough" sorted; a pantry row must
    // not be called that.
    expect(r.proposedName).toBe('Fancy Sourdough');
  });

  it('keeps an unknown barcode on the proposal so creating the item records it', () => {
    const r = provisional(resolveItem({ text: 'mystery item', barcode: '777', householdId: HOUSEHOLD }, ctx()));
    expect(r.seed?.barcode).toBe('777');
  });

  it('handles empty and whitespace-only text without throwing', () => {
    for (const text of ['', '   ']) {
      const r = provisional(resolveItem({ text, householdId: HOUSEHOLD }, ctx()));
      expect(r.matchedBy).toBe('none');
    }
  });
});

describe('merge redirect', () => {
  const merged: ResolverItem[] = [
    { id: 'dupe-1', name: 'chicken breasts', merged_into_id: 'item-chicken' },
    { id: 'item-chicken', name: 'Chicken breast', barcode: '012345678905' },
  ];

  it('returns the survivor when an alias points at a merged row', () => {
    const c: ResolveContext = {
      items: merged,
      aliases: [{ item_id: 'dupe-1', normalized_text: normalizeItemText('chicken breast'), confidence: 1 }],
    };
    expect(resolved(resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, c)).itemId).toBe('item-chicken');
  });

  it('follows a chain of merges', () => {
    const chain: ResolverItem[] = [
      { id: 'a', name: 'a', merged_into_id: 'b' },
      { id: 'b', name: 'b', merged_into_id: 'c' },
      { id: 'c', name: 'c' },
    ];
    expect(resolveMergeRedirect('a', chain)).toBe('c');
  });

  it('stops on a cycle instead of looping forever', () => {
    const cycle: ResolverItem[] = [
      { id: 'a', name: 'a', merged_into_id: 'b' },
      { id: 'b', name: 'b', merged_into_id: 'a' },
    ];
    expect(() => resolveMergeRedirect('a', cycle)).not.toThrow();
    expect(['a', 'b']).toContain(resolveMergeRedirect('a', cycle));
  });

  it('handles a row that points at itself', () => {
    expect(resolveMergeRedirect('a', [{ id: 'a', name: 'a', merged_into_id: 'a' }])).toBe('a');
  });

  it('leaves an unmerged id alone, including one not in the list', () => {
    expect(resolveMergeRedirect('item-chicken', merged)).toBe('item-chicken');
    expect(resolveMergeRedirect('ghost', merged)).toBe('ghost');
  });
});

describe('the threshold is a named constant', () => {
  it('is exported and sits where a typo passes but a different product does not', () => {
    expect(typeof FUZZY_CONFIDENCE_THRESHOLD).toBe('number');
    expect(similarity(normalizeItemText('chiken breast'), normalizeItemText('chicken breast')))
      .toBeGreaterThanOrEqual(FUZZY_CONFIDENCE_THRESHOLD);
    expect(similarity(normalizeItemText('chicken thigh'), normalizeItemText('chicken breast')))
      .toBeLessThan(FUZZY_CONFIDENCE_THRESHOLD);
  });
});

describe('purity', () => {
  it('does not mutate the context it is given', () => {
    const c = ctx();
    const snapshot = JSON.stringify(c);
    resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, c);
    resolveItem({ text: 'nothing known', householdId: HOUSEHOLD }, c);
    expect(JSON.stringify(c)).toBe(snapshot);
  });

  it('is referentially transparent', () => {
    const first = resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, ctx());
    resolveItem({ text: 'unrelated', householdId: HOUSEHOLD }, ctx());
    expect(resolveItem({ text: 'chicken breast', householdId: HOUSEHOLD }, ctx())).toEqual(first);
  });

  it('tolerates a context with empty tables', () => {
    const r = resolveItem({ text: 'anything', householdId: HOUSEHOLD }, { items: [], aliases: [] });
    expect(isProvisional(r)).toBe(true);
  });
});
