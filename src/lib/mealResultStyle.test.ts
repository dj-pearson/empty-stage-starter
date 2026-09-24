import { describe, expect, it } from 'vitest';
import { NOT_LOGGED_STYLE, RESULT_STYLE } from './mealResultStyle';

const all = [...Object.values(RESULT_STYLE), NOT_LOGGED_STYLE];

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
