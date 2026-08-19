import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  RUNGS,
  ADVANCE_THRESHOLD,
  REPEAT_DAYS,
  COOLDOWN_DAYS,
  TANTRUM_COOLDOWN_DAYS,
  AUTO_PAUSE_REFUSALS,
} from './exposureLadder';

/**
 * The exposure ladder is implemented TWICE: here, for the web, and in
 * ios/EatPal/EatPal/Ladder/ExposureLadderPolicy.swift for the live iOS app.
 * Both write the same kid_food_ladder rows.
 *
 * US-639 showed what happens to a rule with two implementations and no guard:
 * the pantry's stock-status logic quietly diverged between web and mobile on
 * negative quantities. This one decides which food a child is offered next and
 * how fast they climb, so drift here means a child progresses differently
 * depending on which device their parent logged the exposure from.
 *
 * Checked as source text, because there is no Swift toolchain in CI. This
 * cannot prove the two behave identically -- it pins the numbers and the rung
 * vocabulary, which is where a one-sided edit does its damage. The branch logic
 * was compared by hand on 2026-08-19 and matched, including the UTC-anchored
 * date arithmetic on both sides.
 */
const swift = readFileSync(
  path.resolve(__dirname, '../../ios/EatPal/EatPal/Ladder/ExposureLadderPolicy.swift'),
  'utf-8',
);

const swiftConstant = (name: string): number | undefined => {
  const m = swift.match(new RegExp(`static let ${name}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : undefined;
};

describe('exposure ladder parity: TypeScript vs Swift', () => {
  it.each([
    ['advanceThreshold', ADVANCE_THRESHOLD],
    ['repeatDays', REPEAT_DAYS],
    ['cooldownDays', COOLDOWN_DAYS],
    ['tantrumCooldownDays', TANTRUM_COOLDOWN_DAYS],
    ['autoPauseRefusals', AUTO_PAUSE_REFUSALS],
  ])('%s matches', (swiftName, tsValue) => {
    expect(swiftConstant(swiftName as string)).toBe(tsValue);
  });

  it('has the same eight rungs, in the same order', () => {
    // Swift spells them camelCase with an explicit rawValue where the wire
    // format differs: `case tinyTaste = "tiny_taste"`. The rawValue is what
    // reaches food_attempts.stage, so that is what has to match.
    const block = swift.slice(swift.indexOf('enum LadderRung'), swift.indexOf('var index'));
    const rawValues = [...block.matchAll(/case\s+(\w+)(?:\s*=\s*"([^"]+)")?/g)].map(
      (m) => m[2] ?? m[1],
    );

    expect(rawValues).toEqual([...RUNGS]);
  });

  it('clamps at the bottom rung rather than underflowing, on both sides', () => {
    expect(swift).toMatch(/guard i > 0 else \{ return LadderRung\.allCases\[0\] \}/);
  });

  it('anchors date arithmetic to UTC on the Swift side, as addDays does here', () => {
    // A local-timezone formatter would shift next_due_on by a day for anyone
    // west of GMT, and disagree with the web for the same attempt.
    expect(swift).toMatch(/TimeZone\(secondsFromGMT:\s*0\)/);
  });
});
