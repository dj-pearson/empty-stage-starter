import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Every deployed edge function parses, and answers the contract the server
 * expects (US-773).
 *
 * 17 of the 93 handlers under supabase/functions/ did not parse. Each ended
 * with a stray `});` -- the tail of a `serve(async (req) => {...})` wrapper
 * that was removed when the tree was converted to `export default`, with the
 * closing paren left behind. A syntax error is not a slow route or a 500 from
 * inside the handler: edge-functions-server.ts loads these with a dynamic
 * import, so the module never evaluates and the route is dead.
 *
 * All 17 were routed in FUNCTIONS_MAP, calculate-food-similarity and
 * weekly-summary-generator among them.
 *
 * Nothing caught it. `deno check` needs the network to resolve esm.sh imports,
 * so it is not in CI; the Dockerfile does walk every index.ts with `deno cache`
 * at build time, and ends that line with `|| true`, which turns a file that
 * cannot be parsed into a silent skip and then a runtime failure. This test
 * parses with the TypeScript compiler's own parser instead, which resolves no
 * imports and needs no network.
 */
const FUNCTIONS_DIR = path.join(process.cwd(), 'supabase', 'functions');

function handlerFiles(): { name: string; file: string; source: string }[] {
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => name !== '_shared' && name !== 'common')
    .map((name) => ({ name, file: path.join(FUNCTIONS_DIR, name, 'index.ts') }))
    .filter(({ file }) => existsSync(file))
    .map(({ name, file }) => ({ name, file, source: readFileSync(file, 'utf8') }));
}

describe('every deployed edge function is loadable', () => {
  const handlers = handlerFiles();

  it('finds the tree at all', () => {
    expect(handlers.length).toBeGreaterThan(80);
  });

  it('parses, with no leftover serve() wrapper', () => {
    const broken = handlers
      .map(({ name, source, file }) => {
        const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
        // parseDiagnostics is not on the public type, but it is what the
        // parser fills in and what `tsc` reports as a syntax error.
        const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
        if (diagnostics.length === 0) return null;
        const first = diagnostics[0];
        const line = first.start !== undefined
          ? sourceFile.getLineAndCharacterOfPosition(first.start).line + 1
          : 0;
        return `${name}:${line} ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}`;
      })
      .filter(Boolean);

    expect(broken, 'these handlers cannot be imported, so their routes are dead').toEqual([]);
  });

  it('exports a default handler rather than calling serve()', () => {
    // The two trees target different runtimes. A serve() handler in the
    // deployed tree loads without error and then answers nothing, which is
    // harder to spot than a syntax error.
    const wrong = handlers
      .filter(({ source }) => !/export\s+default\s/.test(source))
      .map(({ name }) => name);

    expect(wrong).toEqual([]);
  });
});

/**
 * The guards US-773 ported out of the tree that never deploys stay ported.
 *
 * Scoped to the twelve names that used to exist in both trees. The wider tree
 * has more of both gaps -- 15 model-calling functions with no budget and 42
 * handlers forwarding a raw error message -- and that is US-870, not a licence
 * for these twelve to drift back.
 */
describe('the ported edge-function guards (US-773)', () => {
  const read = (name: string) =>
    readFileSync(path.join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');

  const METERED = [
    'ai-meal-plan',
    'calculate-food-similarity',
    'identify-product',
    'parse-receipt-image',
    'suggest-foods',
    'suggest-recipe',
  ];

  it.each(METERED)('%s meters the caller before it spends tokens', (name) => {
    expect(read(name)).toContain('gateAiRequest');
  });

  it.each(['generate-blog-content', 'generate-social-content'])(
    '%s meters the admin who triggers it',
    (name) => {
      // These keep requireAdmin -- gateAiRequest would WIDEN them to any
      // signed-in user -- so they call the limiter directly.
      const source = read(name);
      expect(source).toContain('requireAdmin');
      expect(source).toContain('enforceRateLimit');
    },
  );

  it.each([
    'ai-meal-plan',
    'calculate-food-similarity',
    'generate-blog-content',
    'generate-social-content',
    'identify-product',
    'parse-receipt-image',
    'parse-recipe',
    'stripe-webhook',
    'suggest-foods',
    'suggest-recipe',
    'update-blog-image',
  ])('%s refuses a method it does not serve', (name) => {
    // Either inline, or inside gateAiRequest, which does the method check
    // first so an unauthenticated GET never reaches requireUser.
    const source = read(name);
    expect(
      /method !== ["']POST["']/.test(source) || source.includes('gateAiRequest'),
      `${name} accepts any method`,
    ).toBe(true);
  });

  it('update-blog-image fetches its image under the SSRF guards', () => {
    const source = read('update-blog-image');
    // Its own comment called this an SSRF surface while the line below it was
    // a bare fetch(imageUrl) with no host check and no byte cap.
    expect(source).toContain('fetchGuardedResource');
    expect(source).toContain('MAX_IMAGE_BYTES');
    expect(source).not.toMatch(/^\s*const \w+ = await fetch\(imageUrl\)/m);
  });

  it.each([
    'ai-meal-plan',
    'calculate-food-similarity',
    'identify-product',
    'parse-receipt-image',
    'parse-recipe',
    'suggest-foods',
    'suggest-recipe',
    'update-blog-image',
  ])('%s does not forward a raw error message to the caller', (name) => {
    expect(read(name)).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(error|err|message|errorMessage)\b/);
  });
});
