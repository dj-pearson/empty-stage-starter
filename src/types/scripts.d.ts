/**
 * Type declarations for the build scripts that unit tests import.
 *
 * scripts/*.mjs are plain JavaScript run by node, not part of any tsconfig
 * project, so importing them from a .ts test is an implicit-any error. These
 * shapes are hand-written and deliberately narrow: only what the tests call.
 * If a script's export changes, the test fails to typecheck, which is the
 * point.
 */

declare module '*/scripts/resolve-chromium.mjs' {
  export function resolveChromium(): Promise<{
    executablePath: string;
    source: 'override' | 'pinned' | 'probed';
  } | null>;

  export function findExistingChromium(env?: Record<string, string | undefined>): string | null;
}

declare module '*/scripts/prerender.mjs' {
  export function discoverDynamicRoutes(config: {
    sources?: Array<{
      name?: string;
      table: string;
      select: string;
      filter?: string;
      filters?: string[];
      pattern: string;
      limit?: number;
    }>;
  }): Promise<string[]>;

  export function classifyPrerenderFailures(counts: {
    staticFailed: number;
    dynamicTotal: number;
    dynamicFailed: number;
  }): { fatal: boolean; reason: string };
}
