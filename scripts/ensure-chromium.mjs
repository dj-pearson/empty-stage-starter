#!/usr/bin/env node
//
// Cloudflare Pages runs `npm clean-install`, which installs the playwright
// PACKAGE but never its browser binaries. scripts/prerender.mjs then dies with
//
//   browserType.launch: Executable doesn't exist at
//   /opt/buildhome/.cache/ms-playwright/chromium_headless_shell-*/...
//
// and because the build command is `vite build && node scripts/prerender.mjs`,
// a missing browser fails the WHOLE deploy. That is how tryeatpal.com went
// unpublished while every commit still compiled cleanly: vite succeeded, the
// prerender step exited 1, and Pages discarded the build.
//
// Resolve the browser and install it only when it is actually missing, so local
// builds and warm CI caches pay nothing.
//
// US-637: "missing" now means nothing usable is on disk anywhere, not just that
// playwright's pinned build number is absent. An image that pre-bakes a
// different Chromium build used to send this script into a download it did not
// need, and a blocked download exited 1 and took the build with it -- the exact
// failure the script exists to prevent, arrived at from the other side.

import { spawnSync } from "node:child_process";
import { resolveChromium } from "./resolve-chromium.mjs";

const found = await resolveChromium();

if (found) {
  const how = {
    override: "PLAYWRIGHT_CHROMIUM_EXECUTABLE is set",
    pinned: "playwright's own build is present",
    probed: "found an existing build on disk",
  }[found.source];
  console.log(`[ensure-chromium] ${how}: ${found.executablePath}`);
  process.exit(0);
}

console.log("[ensure-chromium] no chromium found on disk, installing one");
const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  // Fail here rather than letting prerender fail later: the error at this point
  // names the actual problem (the download), not a missing file downstream.
  console.error(
    "[ensure-chromium] `npx playwright install chromium` failed and no existing\n" +
      "                  chromium was found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to a\n" +
      "                  browser binary, or PRERENDER=0 to skip prerendering (which\n" +
      "                  ships the site client-rendered only).",
  );
  process.exit(1);
}

console.log("[ensure-chromium] chromium installed");
