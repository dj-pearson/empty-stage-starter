/**
 * Types for the testable exports of scripts/prerender.mjs (US-653).
 *
 * The script is plain ESM JavaScript because it runs from `npm run build`
 * without a compile step, so importing it from a .ts test is an implicit `any`
 * (TS7016). src/lib/prerenderFailurePolicy.test.ts, prerenderDiscovery.test.ts
 * and prerenderSnapshotPolicy.test.ts have all been importing it untyped.
 *
 * Only the exported, browser-free helpers are declared. Everything else in that
 * file needs Playwright and a dist/ directory and is not importable anyway.
 */

export interface PrerenderFailureCounts {
  staticFailed: number;
  dynamicTotal: number;
  dynamicFailed: number;
}

export interface PrerenderFailureVerdict {
  fatal: boolean;
  reason: string;
}

export function classifyPrerenderFailures(
  counts: PrerenderFailureCounts
): PrerenderFailureVerdict;

export interface PrerenderManifestInput {
  results?: Array<{ route: string }>;
  skipped?: string[];
  failures?: Array<{ route: string }>;
  budgetMs: number;
  generatedAt: string;
}

export interface PrerenderManifestFile {
  generatedAt: string;
  budgetMs: number;
  rendered: string[];
  skipped: string[];
  failed: string[];
}

export function buildPrerenderManifest(run: PrerenderManifestInput): PrerenderManifestFile;

export function discoverDynamicRoutes(...args: unknown[]): Promise<string[]>;

export function validateSnapshot(...args: unknown[]): unknown;

/** Absolute path the snapshot for `route` is written to, under dist/. */
export function outputPathFor(route: string): string;

/**
 * US-816: the modulepreload hrefs app-shell.html declares, which is the whole
 * allowance a prerendered route's saved HTML is permitted to keep.
 */
export function shellPreloadHrefs(shellHtml: string): Set<string>;

/**
 * Remove the modulepreload links __vitePreload injected at runtime and the
 * prerenderer froze into the snapshot. Changes nothing else in the document.
 */
export function stripRuntimePreloads(html: string, allowedHrefs: Set<string>): string;

/**
 * US-570: selectors for transient client-side UI a snapshot must not keep. The
 * toaster is what turned up -- `/pricing` raised `toast.error("Failed to load
 * pricing plans")` and the prerenderer froze it into the HTML crawlers read.
 */
export const TRANSIENT_SNAPSHOT_SELECTORS: string[];

/**
 * Remove them from a document, returning how many elements went. Exported so
 * the rule can be exercised against a DOM: the call site runs inside
 * page.evaluate, where nothing from the module is in scope.
 */
export function stripTransientUi(doc: Document, selectors: readonly string[]): number;
