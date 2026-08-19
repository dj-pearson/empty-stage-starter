//
// US-637: find a Chromium that already exists before reaching for a download.
//
// scripts/ensure-chromium.mjs used to resolve the browser only through
// playwright's own chromium.executablePath(), which points at the exact build
// number the installed playwright pins. An image that pre-bakes a DIFFERENT
// build has a perfectly usable browser that this lookup cannot see, so the
// script fell through to `npx playwright install chromium` and exited 1 when
// that download was blocked -- taking `npm run build` down with it, before vite
// even ran. That is a worse outcome than the one ensure-chromium exists to
// prevent.
//
// Both ensure-chromium.mjs (deciding whether to download) and prerender.mjs
// (deciding what to launch) resolve through here, so a browser found by one is
// the browser used by the other. They are separate processes chained by `&&`,
// so an env var set in the first does not reach the second -- the resolution
// has to be repeated, not passed along.
//

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Directories playwright is known to keep browser builds in. */
function browserRoots(env) {
  const roots = [];
  if (env.PLAYWRIGHT_BROWSERS_PATH) {
    roots.push(env.PLAYWRIGHT_BROWSERS_PATH);
  }
  const home = env.HOME || env.USERPROFILE;
  if (home) {
    roots.push(path.join(home, '.cache', 'ms-playwright'));
  }
  return roots.filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Executable paths to try inside a browser root, cheapest first: the plain
 * `chromium` symlink some images provide, then any chromium-* build directory.
 * Headless-shell builds are included -- prerendering never needs a headful one.
 */
function candidatesIn(root) {
  const out = [];
  out.push(path.join(root, 'chromium'));

  let entries = [];
  try {
    entries = readdirSync(root);
  } catch {
    return out;
  }

  // Newest build number first, so a mismatched-but-current build wins over an
  // ancient leftover.
  const builds = entries
    .filter((name) => /^chromium(_headless_shell)?-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));

  for (const build of builds) {
    out.push(
      path.join(root, build, 'chrome-linux', 'chrome'),
      path.join(root, build, 'chrome-linux', 'headless_shell'),
      path.join(root, build, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      path.join(root, build, 'chrome-win', 'chrome.exe'),
    );
  }
  return out;
}

/** A path that exists and is a file, following symlinks. */
function usable(candidate) {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a launchable Chromium, or null if nothing on disk works.
 *
 * Order: an explicit override, then playwright's own pinned build, then any
 * other build already present. Returns { executablePath, source } so callers
 * can say where it came from -- `pinned` means playwright is happy and no
 * executablePath override is needed at launch.
 */
export async function resolveChromium() {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (override) {
    return { executablePath: override, source: 'override' };
  }

  try {
    const { chromium } = await import('playwright');
    const pinned = chromium.executablePath();
    if (pinned && usable(pinned)) {
      return { executablePath: pinned, source: 'pinned' };
    }
  } catch {
    // playwright itself is unresolvable; the disk probe below may still work.
  }

  const probed = findExistingChromium(process.env);
  if (probed) {
    return { executablePath: probed, source: 'probed' };
  }

  return null;
}

/**
 * The disk probe on its own: the newest usable Chromium under any known browser
 * root, or null. Exported separately from resolveChromium so it can be tested
 * without depending on whether the machine running the tests happens to have
 * playwright's pinned build installed.
 */
export function findExistingChromium(env = process.env) {
  for (const root of browserRoots(env)) {
    for (const candidate of candidatesIn(root)) {
      if (usable(candidate)) return candidate;
    }
  }
  return null;
}
