import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * US-824 AC 4: the fixed overlays must not sit on top of each other.
 *
 * Four render together on every /dashboard route -- CookieConsentBanner and
 * AppInstallPrompt from App.tsx, SupportWidget and OfflineIndicator from
 * Dashboard.tsx. They all used the bottom edge:
 *
 *   AppInstallPrompt   bottom-4 left-4 right-4      (full width on a phone)
 *   OfflineIndicator   bottom-4 left-1/2            (centred pill)
 *   SupportWidget      bottom-6 right-6             (56px FAB)
 *   CookieConsentBanner bottom-0 inset-x-0 z-[100]  (over all of them)
 *
 * On a 390px phone the offline pill and the support FAB both landed INSIDE the
 * install card, and the consent bar covered the lot. This computes the boxes
 * from the Tailwind classes and fails on a real overlap, rather than asserting
 * that particular strings are present -- so a later reshuffle is checked on its
 * geometry, not on whether it matches today's wording.
 */

const ROOT = path.resolve(__dirname, "../..");
const REM = 16;

interface Box { name: string; left: number; right: number; bottom: number; top: number }

/** Tailwind spacing token -> px (`bottom-24` = 6rem = 96px). */
const spacing = (n: number) => (n / 4) * REM;

/**
 * Pull the positioning classes out of the source, ignoring comments.
 *
 * The first version matched anywhere in the file and picked up a COMMENT in
 * AppInstallPrompt describing the old broken layout ("rendered `fixed bottom-4
 * ... md:right-4`"), so it measured prose instead of code and reported the bug
 * as still present after it had been fixed. Comment lines are skipped now, and
 * the instrument test below fails if nothing is found at all.
 */
function classesOf(file: string, marker: RegExp): string {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const m = marker.exec(line);
    if (m) return m[0];
  }
  expect.fail(`no fixed-overlay class string found in ${file}`);
}

/** Approximate a phone-width layout box from the positioning classes. */
function box(name: string, cls: string, viewport: number, height: number, width?: number): Box {
  const bottomN = /(?:^|\s)bottom-(\d+)/.exec(cls);
  const topN = /(?:^|\s)top-(\d+)/.exec(cls);
  const bottom = bottomN ? spacing(Number(bottomN[1])) : /bottom-0/.test(cls) ? 0 : NaN;

  if (topN) {
    // Anchored to the top: express as a bottom-origin box for comparison.
    const t = spacing(Number(topN[1]));
    const w = width ?? 200;
    return { name, left: (viewport - w) / 2, right: (viewport + w) / 2,
             bottom: 10_000 - t - height, top: 10_000 - t };
  }

  let left: number, right: number;
  if (/inset-x-0/.test(cls)) {
    left = 0; right = viewport;
  } else if (/left-1\/2/.test(cls)) {
    const w = width ?? 200;
    left = (viewport - w) / 2; right = (viewport + w) / 2;
  } else {
    const l = /(?:^|\s)left-(\d+)/.exec(cls);
    const r = /(?:^|\s)right-(\d+)/.exec(cls);
    left = l ? spacing(Number(l[1])) : viewport - (width ?? 0) - (r ? spacing(Number(r[1])) : 0);
    right = r ? viewport - spacing(Number(r[1])) : viewport - (l ? spacing(Number(l[1])) : 0);
    if (width && r && !l) left = right - width;
  }
  return { name, left, right, bottom, top: bottom + height };
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;

// 320 is the narrowest phone still in use (iPhone SE 1st gen). It matters:
// at 390 the centred offline pill and the right-hand FAB happen to miss each
// other, so a check at 390 alone passes even with the banner back on the
// bottom edge. The collision only shows up when the viewport is narrow enough
// for the centred pill to reach the FAB.
const PHONES = [320, 390];

function liveOverlays(viewport: number): Box[] {
  const install = classesOf(
    "src/components/AppInstallPrompt.tsx",
    /fixed bottom-\d+[^"]*/,
  );
  const offline = classesOf(
    "src/components/OfflineIndicator.tsx",
    /fixed (?:bottom|top)-\d+ left-1\/2[^"]*/,
  );
  const support = classesOf("src/components/SupportWidget.tsx", /fixed bottom-\d+ right-\d+[^"]*/);

  return [
    box("AppInstallPrompt", install, viewport, 120),
    box("OfflineIndicator", offline, viewport, 40, 200),
    box("SupportWidget", support, viewport, 56, 56),
  ];
}

describe.each(PHONES)("bottom-edge overlays do not collide at %ipx", (viewport) => {
  const boxes = liveOverlays(viewport);

  it("found all three to measure", () => {
    // Guard the instrument: a class-string change that stops matching would
    // otherwise pass this file with nothing measured.
    expect(boxes.map((b) => b.name)).toEqual([
      "AppInstallPrompt",
      "OfflineIndicator",
      "SupportWidget",
    ]);
    expect(boxes.every((b) => Number.isFinite(b.bottom))).toBe(true);
  });

  it.each([
    ["AppInstallPrompt", "OfflineIndicator"],
    ["AppInstallPrompt", "SupportWidget"],
    ["OfflineIndicator", "SupportWidget"],
  ])("%s does not overlap %s", (a, b) => {
    const boxA = boxes.find((x) => x.name === a)!;
    const boxB = boxes.find((x) => x.name === b)!;
    expect(overlaps(boxA, boxB)).toBe(false);
  });

  it("the install prompt clears the support FAB", () => {
    const install = boxes.find((b) => b.name === "AppInstallPrompt")!;
    const fab = boxes.find((b) => b.name === "SupportWidget")!;
    expect(install.bottom).toBeGreaterThanOrEqual(fab.top);
  });
});

describe("the consent bar owns the very bottom", () => {
  it("nothing else sits at bottom-0", () => {
    const consent = readFileSync(
      path.join(ROOT, "src/components/CookieConsentBanner.tsx"),
      "utf8",
    );
    expect(consent).toMatch(/fixed inset-x-0 bottom-0 z-\[100\]/);
    for (const b of liveOverlays(390)) expect(b.bottom).toBeGreaterThan(0);
  });
});

/**
 * P2: the dashboard shell's own fixed layers, at a phone and a laptop width.
 *
 * SupportWidget's floating button (fixed bottom-6 right-6, z-50) sat exactly on
 * the quick-actions FAB's desktop spot (md:bottom-6 md:right-6, z-40) and
 * covered it. The shell now renders the widget with hideTrigger and opens it
 * from the header and the More sheet, so the FAB is the only thing in that
 * corner. On a phone the FAB has to clear the bottom nav, whose height is h-16
 * plus `safe-bottom` (max(1rem, env(safe-area-inset-bottom))).
 *
 * Responsive prefixes are resolved per viewport here: a `md:` utility wins from
 * 768px up, the unprefixed one below it.
 */
const MD = 768;

/** px for `bottom-6`, `bottom-0` or the FAB's calc(), at a given safe-area inset. */
function offsetPx(value: string, inset: number): number {
  const n = /^(\d+)$/.exec(value);
  if (n) return spacing(Number(n[1]));
  const calc = /^\[calc\((\d+(?:\.\d+)?)rem\+max\((\d+(?:\.\d+)?)rem,env\(safe-area-inset-bottom\)\)\+(\d+(?:\.\d+)?)rem\)\]$/.exec(value);
  if (calc) {
    return Number(calc[1]) * REM + Math.max(Number(calc[2]) * REM, inset) + Number(calc[3]) * REM;
  }
  return NaN;
}

/** The effective value of `prop-*` at this viewport, honouring `md:`. */
function utility(cls: string, prop: "bottom" | "right" | "left", viewport: number): string | undefined {
  const tokens = cls.split(/\s+/);
  const base = tokens.find((t) => t.startsWith(`${prop}-`));
  const md = tokens.find((t) => t.startsWith(`md:${prop}-`));
  const picked = viewport >= MD && md ? md.slice(3) : base;
  return picked?.slice(prop.length + 1);
}

function cornerBox(name: string, cls: string, viewport: number, size: number, inset: number): Box {
  const bottom = offsetPx(utility(cls, "bottom", viewport) ?? "", inset);
  const right = viewport - offsetPx(utility(cls, "right", viewport) ?? "", inset);
  return { name, left: right - size, right, bottom, top: bottom + size };
}

const dashboardSrc = () => readFileSync(path.join(ROOT, "src/pages/Dashboard.tsx"), "utf8");

function fabClasses(): string {
  const src = readFileSync(path.join(ROOT, "src/components/QuickActionsFab.tsx"), "utf8");
  const m = /FAB_POSITION_CLASSES =\s*"([^"]+)"/.exec(src);
  if (!m) expect.fail("FAB_POSITION_CLASSES not found in QuickActionsFab.tsx");
  return m[1];
}

function bottomNavBox(viewport: number, inset: number): Box | null {
  // The bar only exists in the mobile shell.
  if (viewport >= MD) return null;
  const src = dashboardSrc();
  expect(src).toMatch(/fixed bottom-0 left-0 right-0[^"]*safe-bottom/);
  expect(src).toMatch(/flex justify-around items-center h-16"/);
  return { name: "BottomNav", left: 0, right: viewport, bottom: 0, top: spacing(16) + Math.max(REM, inset) };
}

const SAFE_AREA_INSETS = [0, 34];

describe.each([390, 1280])("the dashboard shell's fixed layers at %ipx", (viewport) => {
  it("renders the support widget without its floating trigger", () => {
    // The support entry points are the header icon and the More sheet row;
    // neither is fixed, so neither can sit on the FAB.
    expect(dashboardSrc()).toMatch(/<SupportWidget[^>]*\bhideTrigger\b/);
    expect(dashboardSrc()).not.toMatch(/<QuickActionMenu\b/);
  });

  it.each(SAFE_AREA_INSETS)("the FAB clears the bottom nav (inset %ipx)", (inset) => {
    const fab = cornerBox("QuickActionsFab", fabClasses(), viewport, 56, inset);
    expect(Number.isFinite(fab.bottom)).toBe(true);
    const nav = bottomNavBox(viewport, inset);
    if (nav) {
      expect(overlaps(fab, nav)).toBe(false);
      // And with a visible gap, not touching.
      expect(fab.bottom - nav.top).toBeGreaterThanOrEqual(REM);
    }
  });

  it("would collide with the old floating support button, which is why it is hidden", () => {
    // Guard the instrument: if this stopped reporting an overlap, the
    // hideTrigger assertion above would be guarding nothing.
    const fab = cornerBox("QuickActionsFab", fabClasses(), viewport, 56, 0);
    const support = cornerBox(
      "SupportWidget",
      classesOf("src/components/SupportWidget.tsx", /fixed bottom-\d+ right-\d+[^"]*/),
      viewport,
      56,
      0,
    );
    if (viewport >= MD) expect(overlaps(fab, support)).toBe(true);
  });

  it("the offline banner does not reach the FAB or the nav", () => {
    const offline = classesOf("src/components/OfflineIndicator.tsx", /fixed (?:bottom|top)-\d+ left-1\/2[^"]*/);
    const banner = box("OfflineIndicator", offline, viewport, 40, 200);
    const fab = cornerBox("QuickActionsFab", fabClasses(), viewport, 56, 0);
    expect(overlaps(banner, fab)).toBe(false);
    const nav = bottomNavBox(viewport, 0);
    if (nav) expect(overlaps(banner, nav)).toBe(false);
  });

  /*
   * Known and outside this package: AppInstallPrompt (fixed bottom-24, full
   * width below md) overlaps the FAB on a phone, as it overlapped the old
   * QuickActionMenu at bottom-20. It is dismissable and only shows where the
   * browser offers installation. Moving it belongs in AppInstallPrompt.tsx.
   */
  it.todo("the install prompt clears the FAB on a phone");
});
