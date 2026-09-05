/**
 * Types for scripts/ci/check-bundle-budget.mjs (US-775).
 *
 * src/lib/bundleBudget.test.ts imports chunkKey to test it against real Vite
 * filenames rather than reimplementing the parsing. tsconfig.app.json includes
 * only src and does not set allowJs, so without this the import is an
 * untyped-module error that lands in the typecheck ratchet.
 */
export declare function chunkKey(fileName: string): string;
