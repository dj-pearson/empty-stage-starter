/**
 * Types for scripts/build/stamp-sw.mjs (US-765).
 *
 * The script is plain ESM so `npm run build` can run it with node and no
 * build step of its own, but src/lib/swBuildStamp.test.ts imports its pure
 * functions to test them rather than reimplementing the logic in TypeScript
 * and letting the two drift. tsconfig.app.json includes only src and does not
 * set allowJs, so without this declaration that import is an untyped-module
 * error and lands in the typecheck ratchet.
 */

export declare const SW_BUILD_ID_PLACEHOLDER: string;
export declare function buildIdFromAssets(fileNames: readonly string[]): string;
export declare function stampServiceWorker(source: string, buildId: string): string;
