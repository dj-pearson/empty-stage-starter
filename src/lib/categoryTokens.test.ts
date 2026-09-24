import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Item 24: the pantry category tokens (--cat-*) meet WCAG AA wherever they
 * carry text. Same arithmetic as themeContrast.test.ts, for the tokens that
 * file does not know about.
 *
 *   fill as text   on the card, on the page background and on its own soft tint
 *   foreground     on the fill (an active pill, the icon tile)
 */
const CSS = readFileSync(path.join(process.cwd(), "src", "index.css"), "utf8");
const LIGHT_BLOCK = CSS.slice(0, CSS.indexOf(".dark"));
const DARK_BLOCK = (() => {
  const rest = CSS.slice(CSS.indexOf(".dark {"));
  const end = rest.indexOf(".high-contrast");
  return end === -1 ? rest : rest.slice(0, end);
})();

type Hsl = [number, number, number];

function readToken(block: string, name: string): Hsl {
  const m = block.match(
    new RegExp(`--${name}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`)
  );
  if (!m) throw new Error(`--${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hslToRgb([h, s, l]: Hsl): Hsl {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function luminance(hsl: Hsl): number {
  const [r, g, b] = hslToRgb(hsl).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Hsl, b: Hsl): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const CATEGORIES = ["protein", "carb", "dairy", "fruit", "vegetable", "snack", "other"];
const AA = 4.5;

describe.each([
  ["light", LIGHT_BLOCK],
  ["dark", DARK_BLOCK],
] as const)("%s theme category tokens", (_theme, block) => {
  const card = readToken(block, "card");
  const background = readToken(block, "background");

  for (const cat of CATEGORIES) {
    it(`${cat}: the fill reads as text on card, background and its soft tint`, () => {
      const fill = readToken(block, `cat-${cat}`);
      const soft = readToken(block, `cat-${cat}-soft`);
      for (const [label, surface] of [
        ["card", card],
        ["background", background],
        ["soft", soft],
      ] as const) {
        const ratio = contrast(fill, surface);
        expect(ratio, `--cat-${cat} on ${label}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`${cat}: the foreground reads on the fill`, () => {
      const ratio = contrast(readToken(block, `cat-${cat}-foreground`), readToken(block, `cat-${cat}`));
      expect(ratio, `--cat-${cat}-foreground: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
    });
  }
});
