import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ios/EatPal/ACCESSIBILITY.md states that app text uses semantic fonts and
 * names two deliberate exceptions. That was not true: 28 call sites in
 * Views/ passed a fixed point size to `.font(.system(size:))`, which does not
 * respond to the user's text-size setting at all. Most are SF Symbol hero art
 * inside fixed frames, where a fixed size is the right answer -- but three
 * were text a user has to read (the household invite code at 36pt, a filter
 * count at 10pt, a unit label at 9pt), and two of those sat under Apple's
 * 11pt floor. At AX5 the invite code became the smallest string on its screen.
 *
 * This suite keeps the document honest. It reads the Swift source, so it
 * fails here rather than in a VoiceOver sweep someone has to remember to run.
 *
 * Scope is the main app's Views. The widget and watch targets are excluded on
 * purpose: both render into system-fixed containers where Dynamic Type is
 * bounded by the platform rather than by us.
 */

const VIEWS = path.resolve(__dirname, '../../ios/EatPal/EatPal/Views');

/** Point size below which iOS text is considered unreadable by Apple's HIG. */
const MINIMUM_POINT_SIZE = 11;

/**
 * Fixed sizes on `Text` that are deliberate. Each entry is a file and the
 * reason the size is not scaled. Anything not listed here and not attached to
 * an `Image` is a regression.
 */
const ALLOWED_FIXED_TEXT = new Map([
  [
    'Components/ImagePicker.swift',
    'avatar initials, sized as a fraction of the caller-supplied avatar diameter',
  ],
  [
    'MealPlan/MealFeedbackSheet.swift',
    'emoji rating, sized by selection state as a tap affordance rather than as prose',
  ],
]);

function swiftFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return swiftFiles(full);
    return entry.name.endsWith('.swift') ? [full] : [];
  });
}

interface FixedFontSite {
  file: string;
  line: number;
  size: number | null;
  attachedToImage: boolean;
}

function fixedFontSites(): FixedFontSite[] {
  const sites: FixedFontSite[] = [];
  for (const file of swiftFiles(VIEWS)) {
    const relative = path.relative(VIEWS, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      const match = line.match(/\.font\(\.system\(size:\s*([^,)]+)/);
      if (!match) return;
      const raw = match[1].trim();
      // A modifier chain attaches to the nearest preceding view expression.
      let owner = '';
      for (let i = index - 1; i >= 0 && i > index - 8; i -= 1) {
        const candidate = lines[i].trim();
        if (candidate === '' || candidate.startsWith('//')) continue;
        if (candidate.startsWith('.')) continue; // still inside the chain
        owner = candidate;
        break;
      }
      sites.push({
        file: relative,
        line: index + 1,
        size: /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null,
        attachedToImage: owner.includes('Image('),
      });
    });
  }
  return sites;
}

const sites = fixedFontSites();

describe('iOS Dynamic Type', () => {
  it('finds the Views to check', () => {
    // Floor: "no violations" must not be true of an empty scan.
    expect(sites.length).toBeGreaterThan(10);
  });

  it('has no text below the 11pt floor', () => {
    const tooSmall = sites
      .filter((s) => s.size !== null && s.size < MINIMUM_POINT_SIZE)
      .map((s) => `${s.file}:${s.line} (${s.size}pt)`);
    expect(tooSmall).toEqual([]);
  });

  it('only fixes a text size where the reason is written down', () => {
    const unexplained = sites
      .filter((s) => !s.attachedToImage && s.size !== null)
      .filter((s) => !ALLOWED_FIXED_TEXT.has(s.file))
      .map((s) => `${s.file}:${s.line} (${s.size}pt)`);
    expect(unexplained).toEqual([]);
  });

  it('keeps the allowlist free of entries that no longer apply', () => {
    const stale = [...ALLOWED_FIXED_TEXT.keys()].filter(
      (file) => !sites.some((s) => s.file === file && !s.attachedToImage),
    );
    expect(stale).toEqual([]);
  });
});
