/**
 * Types for the CSP hash injector (US-845), so importing it from a test does
 * not add a TS7016 to the ratchet. The sibling scripts/ci/check-bundle-budget.mjs
 * has no declaration file and contributes one such error today.
 */
export declare function executableInlineScripts(html: string): string[];
export declare function sha256Source(body: string): string;
export declare function withScriptSrcHashes(headers: string, sources: string[]): string;
