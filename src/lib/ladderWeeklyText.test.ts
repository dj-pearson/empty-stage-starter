/**
 * US-604: the narrative renders through i18n keys, not hardcoded English.
 *
 * These tests use a fake `t` that echoes the key and its interpolations, so a
 * missing or renamed key shows up here rather than as raw `foodLadder.weekly.*`
 * text in a parent's report.
 */

import { describe, it, expect } from 'vitest';
import enJson from '@/i18n/locales/en.json';
import { renderLadderWeekly, type Translate } from './ladderWeeklyText';
import { summarizeLadderWeek } from './ladderWeekly';
import type { LadderAttempt } from './exposureLadder';

/** Resolves against the real en.json, with i18next-style `_one`/`_other`. */
const translate: Translate = (key, options) => {
  const count = typeof options?.count === 'number' ? options.count : undefined;
  const lookup = (k: string): unknown =>
    k.split('.').reduce<unknown>((node, part) => {
      if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
        return (node as Record<string, unknown>)[part];
      }
      return undefined;
    }, enJson as unknown);

  const plural =
    count === undefined ? undefined : lookup(`${key}_${count === 1 ? 'one' : 'other'}`);
  const value = plural ?? lookup(key) ?? options?.defaultValue;
  if (typeof value !== 'string') return key;

  return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
    String(options?.[name] ?? (name === 'count' ? count : '') ?? '')
  );
};

const WEEK_START = '2026-03-02';
const WEEK_END = '2026-03-08';

function attempt(
  foodId: string,
  day: string,
  outcome: string,
  stage: string | null = null
): LadderAttempt {
  return { kidId: 'kid-1', foodId, stage, outcome, attemptedAt: `${day}T18:00:00.000Z` };
}

function render(attempts: LadderAttempt[], names: Record<string, string>) {
  const summary = summarizeLadderWeek({
    attempts,
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    kidId: 'kid-1',
    foodNames: names,
  })!;
  return renderLadderWeekly(summary, translate, { kidName: 'Emma', locale: 'en' });
}

describe('renderLadderWeekly', () => {
  it('resolves every key it uses — no raw foodLadder.weekly.* leaks into the copy', () => {
    const text = render(
      [
        attempt('broccoli', '2026-02-20', 'partial', 'touching'),
        attempt('broccoli', '2026-03-03', 'success'),
        attempt('broccoli', '2026-03-06', 'success'),
        attempt('peas', '2026-02-25', 'partial', 'licking'),
        attempt('peas', '2026-03-04', 'partial'),
        attempt('yogurt', '2026-02-24', 'success', 'small_bite'),
        attempt('yogurt', '2026-03-05', 'tantrum'),
        attempt('nuggets', '2026-02-26', 'partial', 'full_portion'),
        attempt('nuggets', '2026-03-02', 'success'),
        attempt('nuggets', '2026-03-08', 'success'),
      ],
      { broccoli: 'Broccoli', peas: 'Peas', yogurt: 'Yogurt', nuggets: 'Nuggets' }
    );

    const all = [text.title, text.headline, ...text.lines].join(' ');
    expect(all).not.toMatch(/foodLadder\./);
    expect(all).not.toMatch(/\{\{/);

    expect(text.headline).toContain('Emma');
    expect(text.headline).toContain('4 foods');
    expect(text.lines.join(' ')).toContain('Broccoli (Touching → Smelling)');
    expect(text.lines.join(' ')).toContain('Peas at Licking');
    expect(text.lines.join(' ')).toContain('Yogurt to Tiny taste');
  });

  it('frames a no-advancement week as participation, not as a shortfall', () => {
    const text = render(
      [
        attempt('peas', '2026-03-03', 'partial', 'licking'),
        attempt('peas', '2026-03-06', 'partial'),
      ],
      { peas: 'Peas' }
    );

    const body = text.lines.join(' ');
    expect(body).toContain('repeat exposure at the same step');
    expect(body).toContain('Emma');
    // Never about how much was eaten.
    expect(body).not.toMatch(/\bbites?\b|\bportion\b|\bate\b/i);
  });

  it('caps how many foods it names and counts the rest', () => {
    const names: Record<string, string> = {};
    const attempts: LadderAttempt[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      names[id] = `Food ${id.toUpperCase()}`;
      attempts.push(attempt(id, '2026-03-03', 'partial', 'licking'));
    }

    const heldLine = render(attempts, names).lines.find((l) => l.startsWith('Held steady'))!;
    expect(heldLine).toContain('Food A');
    expect(heldLine).toContain('Food C');
    expect(heldLine).not.toContain('Food D');
    expect(heldLine).toContain('2 more');
  });

  it('uses singular copy for a single mastered food', () => {
    const text = render(
      [
        attempt('nuggets', '2026-02-26', 'partial', 'full_portion'),
        attempt('nuggets', '2026-03-02', 'success'),
        attempt('nuggets', '2026-03-08', 'success'),
      ],
      { nuggets: 'Nuggets' }
    );

    expect(text.lines.join(' ')).toContain('1 food has been mastered so far.');
  });

  it('falls back to a neutral name when the child has none', () => {
    const summary = summarizeLadderWeek({
      attempts: [attempt('peas', '2026-03-03', 'partial', 'licking')],
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      foodNames: { peas: 'Peas' },
    })!;

    const text = renderLadderWeekly(summary, translate, { kidName: '  ' });
    expect(text.headline).toContain('Your child');
  });
});
