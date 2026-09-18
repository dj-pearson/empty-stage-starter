/**
 * Types for scripts/ci/new-errors.mjs (US-802).
 *
 * src/lib/newErrors.test.ts imports the parsers and the diff to test them
 * against real tsc and eslint output rather than reimplementing the parsing.
 * tsconfig.app.json includes only src and does not set allowJs, so without this
 * the import is an untyped-module error -- and worse than that: it drags
 * scripts/ into the program and changes what tsc reports elsewhere. Measured at
 * +5 net (13 new, 8 gone) in files the branch never touched, which is precisely
 * the ".mjs imports resolving as unknown" trap this story was filed about.
 * Same shape as check-bundle-budget.d.mts, for the same reason.
 */

export interface ParsedError {
  file: string;
  line: number;
  code: string;
  message: string;
  raw: string;
}

export interface KeyedError extends ParsedError {
  key: string;
}

export declare function relativise(file: string, root?: string): string;
export declare function parseTypecheckErrors(text: string, root?: string): ParsedError[];
export declare function parseLintErrors(text: string, root?: string): ParsedError[];
export declare function keyErrors(errors: ParsedError[]): KeyedError[];
export declare function newErrors(head: ParsedError[], base: ParsedError[]): KeyedError[];
export declare function groupByFile(errors: ParsedError[]): Map<string, ParsedError[]>;
