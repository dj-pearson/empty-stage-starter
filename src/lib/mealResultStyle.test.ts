import { describe, expect, it } from 'vitest';
import { NOT_LOGGED_STYLE, RESULT_STYLE, TANTRUM_STYLE, attemptOutcomeStyle } from './mealResultStyle';

const all = [...Object.values(RESULT_STYLE), NOT_LOGGED_STYLE, TANTRUM_STYLE];

describe('RESULT_STYLE', () => {
  it('keeps ate and tasted apart', () => {
    expect(RESULT_STYLE.ate.className).not.toBe(RESULT_STYLE.tasted.className);
    expect(RESULT_STYLE.ate.dotClassName).not.toBe(RESULT_STYLE.tasted.dotClassName);
    expect(RESULT_STYLE.ate.Icon).not.toBe(RESULT_STYLE.tasted.Icon);
  });

  it('uses semantic tokens only: no text-white, no hex or rgb literal', () => {
    for (const style of all) {
      for (const cls of `${style.className} ${style.dotClassName}`.split(/\s+/)) {
        expect(cls).not.toContain('text-white');
        expect(cls).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(cls).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
      }
    }
  });

  it('gives every style an icon', () => {
    for (const style of all) expect(style.Icon).toBeTruthy();
  });
});

describe('attemptOutcomeStyle', () => {
  it('maps the three plain outcomes onto the meal result styles', () => {
    expect(attemptOutcomeStyle('success')).toBe(RESULT_STYLE.ate);
    expect(attemptOutcomeStyle('partial')).toBe(RESULT_STYLE.tasted);
    expect(attemptOutcomeStyle('refused')).toBe(RESULT_STYLE.refused);
  });

  it('gives tantrum its own frozen style, apart from refused', () => {
    const tantrum = attemptOutcomeStyle('tantrum');
    expect(tantrum).toBe(TANTRUM_STYLE);
    expect(Object.isFrozen(tantrum)).toBe(true);
    expect(tantrum.className).not.toBe(RESULT_STYLE.refused.className);
    expect(tantrum.Icon).not.toBe(RESULT_STYLE.refused.Icon);
  });

  it('falls back to NOT_LOGGED_STYLE for anything unknown', () => {
    expect(attemptOutcomeStyle('')).toBe(NOT_LOGGED_STYLE);
    expect(attemptOutcomeStyle('happy')).toBe(NOT_LOGGED_STYLE);
  });
});
