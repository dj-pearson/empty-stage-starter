import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * The light-theme colour tokens meet WCAG AA against the surfaces they are
 * actually used on (US-822).
 *
 * Written because the same defect has now been found three times by hand.
 * --primary sat at 53% until an axe scan caught it, was moved to 38% measured
 * against --background alone, and was still under the line on every tinted
 * callout in the app; --destructive was at 3.78:1 the whole time. Each was
 * found by running a browser, which happens rarely. The arithmetic does not
 * need a browser.
 *
 * The surfaces are the real ones, sampled from built pages: --background, a
 * white card, and the warm and neutral tints that callouts are drawn on. The
 * worst of them is what a token has to clear, not the most flattering.
 */
const CSS = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8');

/** The `:root` block, i.e. the light theme. Dark overrides live under .dark. */
const LIGHT_BLOCK = CSS.slice(0, CSS.indexOf('.dark'));

function token(name: string): [number, number, number] {
  const pattern = `--${name}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`;
  const match = LIGHT_BLOCK.match(new RegExp(pattern));
  if (!match) throw new Error(`token --${name} not found in the light theme block`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rr, gg, bb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Surfaces sampled from the built pages, worst (darkest) last. */
const SURFACES: Record<string, [number, number, number]> = {
  'white card': hex('#ffffff'),
  '--background': hex('#faf8f5'),
  'neutral tint': hex('#f5f3f0'),
  'green tint': hex('#e3efe4'),
  'warm callout': hex('#f4e7dd'),
};

const AA_NORMAL_TEXT = 4.5;

/**
 * Tokens that do NOT meet AA yet, with the ratio measured the day this test
 * landed (US-822).
 *
 * A ratchet rather than a skip, in the same spirit as the lint and typecheck
 * baselines: the assertion is >=, so darkening either colour tightens the gate
 * on its own and lightening one fails. Both are brand colours used across the
 * app, and changing them is a design decision with a blast radius, which is
 * why they are recorded here instead of being quietly adjusted.
 */
const KNOWN_BELOW_AA: Record<string, number> = {
  // Floors sit a hundredth below the measurement so a float that rounds to the
  // same displayed value does not fail the gate on arithmetic alone.
  secondary: 3.34, // measured 3.35
  accent: 4.32, // measured 4.33
};

describe('light-theme tokens carry their own text', () => {
  for (const name of ['primary', 'destructive', 'secondary', 'accent']) {
    it(`${name} reads against its foreground`, () => {
      const bg = hslToRgb(token(name));
      const fg = hslToRgb(token(`${name}-foreground`));
      const ratio = contrast(fg, bg);
      const floor = KNOWN_BELOW_AA[name] ?? AA_NORMAL_TEXT;
      expect(
        ratio,
        `--${name}-foreground on --${name} is ${ratio.toFixed(2)}:1 (floor ${floor})`
      ).toBeGreaterThanOrEqual(floor);
    });
  }

  it('lists only the tokens still known to be below AA', () => {
    // So the exception list cannot outlive the exception. When secondary or
    // accent is fixed, this fails and the entry comes out.
    expect(Object.keys(KNOWN_BELOW_AA).sort()).toEqual(['accent', 'secondary']);
  });
});

describe('tokens used as text read on every surface they are drawn on', () => {
  // primary and destructive both render as text -- links, active nav labels,
  // inline error copy -- not only as button fills.
  for (const name of ['primary', 'destructive']) {
    for (const [surfaceName, surface] of Object.entries(SURFACES)) {
      it(`${name} on the ${surfaceName}`, () => {
        const ratio = contrast(hslToRgb(token(name)), surface);
        expect(ratio, `--${name} on ${surfaceName} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          AA_NORMAL_TEXT
        );
      });
    }
  }
});

/**
 * US-858: --safe-food and --try-bite, which nothing here covered.
 *
 * Every serious accessibility violation left in the signed-in app is white text
 * on one of two colours, and both of them are these:
 *
 *   #16a249  hsl(142 76% 36%)  --safe-food, and --secondary, which is the SAME
 *                              COLOUR DEFINED TWICE      3.33:1   9 nodes
 *   #f97015  hsl(24 95% 53%)   --try-bite                2.85:1   3 nodes
 *
 * They are the most repeated coloured elements in the product -- one or two per
 * food card -- and they were the one part of the palette with no arithmetic
 * behind it, so the only thing that ever noticed was an axe run that needs a
 * built site, a fake backend and a browser.
 *
 * WHAT WOULD FIX THEM, measured against white text and against the worst
 * surface each is drawn on as text:
 *
 *   --safe-food  36% -> 27%    white 5.50:1, as text 4.53:1
 *   --try-bite   53% -> 35.5%  white 5.49:1, as text 4.53:1
 *
 * Not applied here. --try-bite at 35.5% is hue 24 sat 95% -- which is
 * --primary, exactly (24 95% 35%, darkened for this same reason in US-822). So
 * the arithmetic fix collapses "try bite" into the brand primary, and choosing
 * between that, a new hue, and dark-on-fill badge text is a design decision
 * with a blast radius, not a test's call. Recorded as ratchets, in the same
 * spirit as KNOWN_BELOW_AA above: darkening either token tightens the gate on
 * its own, and lightening one fails.
 */
const WHITE: [number, number, number] = [255, 255, 255];

/** Ratios measured 2026-09-11, floors a hundredth below so float rounding alone
 *  cannot fail the gate. */
const BADGE_FILL_FLOORS: Record<string, number> = {
  'safe-food': 3.32, // measured 3.33
  'try-bite': 2.84, // measured 2.85
};

describe('the food-status tokens carry the white text drawn on them', () => {
  for (const name of Object.keys(BADGE_FILL_FLOORS)) {
    it(`white on --${name}`, () => {
      // Literal white, not a -foreground token: these badges are written
      // `bg-safe-food text-white` in the components, so white is what has to be
      // measured whatever a token might say.
      const ratio = contrast(WHITE, hslToRgb(token(name)));
      expect(
        ratio,
        `white on --${name} is ${ratio.toFixed(2)}:1 (floor ${BADGE_FILL_FLOORS[name]}, AA wants ${AA_NORMAL_TEXT})`
      ).toBeGreaterThanOrEqual(BADGE_FILL_FLOORS[name]);
    });
  }

  it('says out loud that neither of them meets AA yet', () => {
    // So a reader of a green run does not take these two for passing. When one
    // is fixed its floor becomes 4.5 and it comes off this list.
    for (const [name, floor] of Object.entries(BADGE_FILL_FLOORS)) {
      expect(floor, `--${name} is listed as below AA but its floor is at or above it`).toBeLessThan(
        AA_NORMAL_TEXT
      );
    }
  });
});

describe('--safe-food and --secondary are the same colour', () => {
  it('so a fix to one that misses the other leaves half the badges failing', () => {
    // Nine of the twelve remaining violations are #16a249, split across
    // bg-secondary chips on grocery and recipes and bg-safe-food badges on the
    // pantry. Whoever darkens one has to darken both, and this is where they
    // find that out.
    expect(token('safe-food')).toEqual(token('secondary'));
  });
});
