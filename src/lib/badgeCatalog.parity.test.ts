import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { BADGE_CATALOG, BADGE_IDS, BADGE_TIER_RANK } from './badgeCatalog';

/**
 * The badge catalog exists twice: in BadgeService.swift, where iOS evaluates
 * and writes earns to kid_badges, and in badgeCatalog.ts, where the web reads
 * them back. A case added on one side only shows up as a badge the web cannot
 * name, or a tile the web draws in the wrong tier.
 *
 * Checked as source text, because there is no Swift toolchain in CI, in the
 * style of exposureLadder.parity.test.ts.
 */
const swift = readFileSync(
  path.resolve(__dirname, '../../ios/EatPal/EatPal/Services/BadgeService.swift'),
  'utf-8',
);

const between = (start: string, end: string): string => {
  const from = swift.indexOf(start);
  expect(from, `${start} moved`).toBeGreaterThan(-1);
  const to = swift.indexOf(end, from);
  expect(to, `${end} after ${start} moved`).toBeGreaterThan(from);
  return swift.slice(from, to);
};

describe('badge catalog parity: TypeScript vs Swift', () => {
  it('has the same cases, as rawValues, in the same order', () => {
    const block = between('enum Badge: String', 'var id: String');
    const rawValues = [...block.matchAll(/^\s*case\s+(\w+)(?:\s*=\s*"([^"]+)")?/gm)].map(
      (m) => m[2] ?? m[1],
    );
    expect(rawValues).toEqual([...BADGE_IDS]);
    expect(BADGE_CATALOG.map((b) => b.id)).toEqual([...BADGE_IDS]);
  });

  it('has the same tier numbers', () => {
    const block = between('enum BadgeTier: Int', '}');
    const tiers = Object.fromEntries(
      [...block.matchAll(/case\s+(\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(tiers).toEqual(BADGE_TIER_RANK);
  });

  it('puts every badge in the same tier', () => {
    const block = between('var tier: BadgeTier', 'func criteria');
    const swiftTier = new Map<string, string>();
    for (const m of block.matchAll(/case\s+([^:]+):\s*return\s+\.(\w+)/g)) {
      for (const id of m[1].matchAll(/\.(\w+)/g)) swiftTier.set(id[1], m[2]);
    }
    expect(Object.fromEntries(swiftTier)).toEqual(
      Object.fromEntries(BADGE_CATALOG.map((b) => [b.id, b.tier])),
    );
  });

  it('marks recipeChef, and only it, as household-scoped', () => {
    expect(swift).toMatch(/case \.recipeChef:[\s\S]{0,200}ctx\.recipes\.count/);
    expect(BADGE_CATALOG.filter((b) => b.household).map((b) => b.id)).toEqual(['recipeChef']);
  });

  it('carries no English copy', () => {
    const src = readFileSync(path.resolve(__dirname, 'badgeCatalog.ts'), 'utf-8');
    expect(src).not.toMatch(/First Try-Bite|Week Warrior|Perfect Week/);
  });
});
