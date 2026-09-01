import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { normalizeItemText } from './itemNormalize';
import { toCanonical, isUnknown, type CanonicalItemFacts } from './canonicalUnits';
import {
  resolveItem,
  isProvisional,
  type ResolveContext,
  type ResolveResult,
} from './itemResolver';

/**
 * US-660: the shared cross-platform case tables.
 *
 * These cases live in tests/fixtures/kitchen-loop/*.json and are asserted by
 * BOTH this suite and the Swift mirror (US-682), so the two implementations of
 * the resolver, the normaliser and the unit converter cannot drift apart.
 *
 * This is the same arrangement as tests/fixtures/ingredient-parse-cases.json,
 * which src/lib/parse-grocery-text.test.ts and
 * ios/EatPal/EatPalTests/SharedIngredientParseCasesTests.swift already share.
 *
 * Add cases to the fixture, not here. A case with no matching implementation
 * behaviour fails this suite, which is the whole point: the fixture is the
 * specification and the code answers to it.
 *
 * Resolved with process.cwd() rather than import.meta.url, matching the
 * existing shared-fixture suite — import.meta.url is not a file: URL under the
 * jsdom environment these run in.
 */
const FIXTURE_DIR = resolve(process.cwd(), 'tests/fixtures/kitchen-loop');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, file), 'utf8')) as T;
}

/**
 * A broken path that silently yields an empty list would turn this whole suite
 * green while asserting nothing, which is exactly the failure the CI-gate test
 * in ciGatesWired.test.ts exists to prevent elsewhere. Guard it directly.
 */
describe('the shared fixtures are actually being read', () => {
  it('finds the fixture directory and every expected file', () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json')).sort();
    expect(files).toEqual([
      'canonical-unit-cases.json',
      'normalize-cases.json',
      'resolve-cases.json',
    ]);
  });
});

// ---------------------------------------------------------------------------

interface NormalizeCase {
  name: string;
  input: string;
  expected: string;
}

describe('shared fixtures: normalizeItemText', () => {
  const { cases } = load<{ cases: NormalizeCase[] }>('normalize-cases.json');

  it('has enough cases to be worth trusting', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(normalizeItemText(c.input)).toBe(c.expected);
  });
});

// ---------------------------------------------------------------------------

interface CanonicalCase {
  name: string;
  quantity: number;
  unit: string;
  item: CanonicalItemFacts;
  tolerance?: number;
  expected:
    | { value: number; unit: 'g' | 'ml' | 'count' }
    | { unknown: true; reasonMatches: string };
}

describe('shared fixtures: toCanonical', () => {
  const { cases } = load<{ cases: CanonicalCase[] }>('canonical-unit-cases.json');

  it('has enough cases to be worth trusting', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const actual = toCanonical(c.quantity, c.unit, c.item);

    if ('unknown' in c.expected) {
      expect(isUnknown(actual)).toBe(true);
      if (isUnknown(actual)) {
        expect(actual.reason).toContain(c.expected.reasonMatches);
      }
      return;
    }

    expect(isUnknown(actual)).toBe(false);
    if (isUnknown(actual)) return;
    expect(actual.unit).toBe(c.expected.unit);
    expect(Math.abs(actual.value - c.expected.value)).toBeLessThanOrEqual(c.tolerance ?? 0.01);
  });
});

// ---------------------------------------------------------------------------

interface ResolveCase {
  name: string;
  input: { text: string; barcode?: string | null };
  expected: {
    itemId?: string;
    matchedBy?: string;
    provisional?: true;
    proposedName?: string;
    seed?: Record<string, unknown>;
  };
}

describe('shared fixtures: resolveItem', () => {
  const fixture = load<{ context: ResolveContext; cases: ResolveCase[] }>('resolve-cases.json');
  const { context, cases } = fixture;

  it('has enough cases to be worth trusting', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it('declares aliases already normalised, as the column stores them', () => {
    // If a fixture author writes a raw phrase here instead of its normalised
    // form, exact matching silently stops working and every case degrades to
    // fuzzy or provisional. Catch that in the fixture, not in a puzzling
    // downstream failure.
    for (const alias of context.aliases) {
      expect(normalizeItemText(alias.normalized_text)).toBe(alias.normalized_text);
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const actual: ResolveResult = resolveItem(
      { text: c.input.text, barcode: c.input.barcode ?? null, householdId: 'hh-fixture' },
      context
    );

    if (c.expected.provisional) {
      expect(isProvisional(actual)).toBe(true);
      if (!isProvisional(actual)) return;
      if (c.expected.matchedBy) expect(actual.matchedBy).toBe(c.expected.matchedBy);
      if (c.expected.proposedName !== undefined) {
        expect(actual.proposedName).toBe(c.expected.proposedName);
      }
      if (c.expected.seed) {
        for (const [key, value] of Object.entries(c.expected.seed)) {
          expect(actual.seed?.[key as keyof typeof actual.seed]).toBe(value);
        }
      }
      return;
    }

    expect(isProvisional(actual)).toBe(false);
    if (isProvisional(actual)) return;
    if (c.expected.itemId) expect(actual.itemId).toBe(c.expected.itemId);
    if (c.expected.matchedBy) expect(actual.matchedBy).toBe(c.expected.matchedBy);
  });
});
