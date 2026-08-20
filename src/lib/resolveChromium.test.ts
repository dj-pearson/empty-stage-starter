import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { findExistingChromium, resolveChromium } from '../../scripts/resolve-chromium.mjs';

/**
 * US-637: `npm run build` used to die before vite ran whenever playwright's
 * pinned Chromium build was absent and the download was blocked -- even with a
 * perfectly usable Chromium sitting in PLAYWRIGHT_BROWSERS_PATH under a
 * different build number. These cover the probe that now looks for it.
 *
 * findExistingChromium is tested rather than resolveChromium for the disk
 * cases, because resolveChromium checks playwright's pinned build first and
 * whether THAT exists depends on the machine running the tests.
 */

let root: string;

const makeBuild = (dir: string, build: string, binary = 'chrome') => {
  const full = path.join(dir, build, 'chrome-linux');
  mkdirSync(full, { recursive: true });
  const bin = path.join(full, binary);
  writeFileSync(bin, '');
  return bin;
};

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pw-probe-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('findExistingChromium (US-637)', () => {
  it('returns null when the root holds no browser', () => {
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBeNull();
  });

  it('returns null when no root is configured at all', () => {
    expect(findExistingChromium({})).toBeNull();
  });

  it('finds a build whose number does not match anything playwright pins', () => {
    const bin = makeBuild(root, 'chromium-1194');
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(bin);
  });

  it('accepts a headless shell build, which is all prerendering needs', () => {
    const bin = makeBuild(root, 'chromium_headless_shell-1194', 'headless_shell');
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(bin);
  });

  it('prefers the newest build number, not the first one readdir returns', () => {
    makeBuild(root, 'chromium-1100');
    const newer = makeBuild(root, 'chromium-1200');
    // 1100 sorts before 1200 lexically too, so also check a case where it does not:
    makeBuild(root, 'chromium-999');
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(newer);
  });

  it('prefers a plain `chromium` entry over a versioned build directory', () => {
    makeBuild(root, 'chromium-1194');
    const direct = path.join(root, 'chromium');
    writeFileSync(direct, '');
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(direct);
  });

  it('follows a `chromium` symlink to a real binary', () => {
    const bin = makeBuild(root, 'chromium-1194');
    const link = path.join(root, 'chromium');
    symlinkSync(bin, link);
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(link);
  });

  it('ignores a directory that only looks like a build', () => {
    mkdirSync(path.join(root, 'chromium-1194'), { recursive: true });
    expect(findExistingChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBeNull();
  });

  it('falls back to the HOME cache when PLAYWRIGHT_BROWSERS_PATH is unset', () => {
    const cache = path.join(root, '.cache', 'ms-playwright');
    mkdirSync(cache, { recursive: true });
    const bin = makeBuild(cache, 'chromium-1194');
    expect(findExistingChromium({ HOME: root })).toBe(bin);
  });
});

describe('resolveChromium precedence (US-637)', () => {
  const saved = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  afterEach(() => {
    if (saved === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = saved;
  });

  it('honours an explicit override above everything else', async () => {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = '/custom/chrome';
    await expect(resolveChromium()).resolves.toEqual({
      executablePath: '/custom/chrome',
      source: 'override',
    });
  });

  it('reports where the browser came from, so the build log says which one ran', async () => {
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    const found = await resolveChromium();
    // This environment has no pinned build, so it must probe or find nothing.
    if (found) expect(['pinned', 'probed']).toContain(found.source);
  });
});
