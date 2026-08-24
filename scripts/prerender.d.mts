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
