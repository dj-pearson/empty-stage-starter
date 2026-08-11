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

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  console.log(
    "[ensure-chromium] PLAYWRIGHT_CHROMIUM_EXECUTABLE is set; prerender will use it",
  );
  process.exit(0);
}

let executablePath = null;
try {
  const { chromium } = await import("playwright");
  executablePath = chromium.executablePath();
} catch (err) {
  console.log(
    `[ensure-chromium] could not resolve playwright: ${err instanceof Error ? err.message : err}`,
  );
}

if (executablePath && existsSync(executablePath)) {
  console.log(`[ensure-chromium] chromium already present: ${executablePath}`);
  process.exit(0);
}

console.log("[ensure-chromium] chromium missing, installing it");
const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  // Fail here rather than letting prerender fail later: the error at this point
  // names the actual problem (the download), not a missing file downstream.
  console.error(
    "[ensure-chromium] `npx playwright install chromium` failed; prerender cannot run",
  );
  process.exit(1);
}

console.log("[ensure-chromium] chromium installed");
