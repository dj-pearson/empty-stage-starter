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
 * The guards hold across the whole tree (US-870).
 *
 * US-773 ported them into the twelve functions that had existed in both trees
 * and pinned those twelve by name. A list is a snapshot: the 94th function
 * added tomorrow is not on it. These read the tree instead.
 *
 * Measured before US-870: 21 functions call a model and 15 of them metered
 * nothing (tonight-mode was the only caller of enforceRateLimit in 93
 * functions), and 92 sites across 76 functions answered a `catch` with
 * `error.message`.
 */
describe('every model-calling function meters its caller', () => {
  const handlers = handlerFiles();

  /** The shared service every LLM call in this tree goes through. */
  const callsAModel = ({ source }: { source: string }) =>
    /AIServiceV2|ai-service-v2/.test(source);

  it('finds the model-calling functions at all', () => {
    expect(handlers.filter(callsAModel).length).toBeGreaterThan(15);
  });

  it('gates every one of them', () => {
    // gateAiRequest for a signed-in user (method check, auth and budget in
    // one), enforceRateLimit or meterAdminRequest for the admin-only ones --
    // gateAiRequest would WIDEN those to any signed-in caller.
    const ungated = handlers
      .filter(callsAModel)
      .filter(({ source }) => !/gateAiRequest|enforceRateLimit|meterAdminRequest/.test(source))
      .map(({ name }) => name);

    expect(ungated, 'these spend model tokens with no per-caller budget').toEqual([]);
  });
});

describe('no handler forwards a caught error to the caller', () => {
  const handlers = handlerFiles();

  /**
   * stripe-webhook is the one exception and it is documented in place: that
   * branch is signature verification, the reader is Stripe's dashboard, and
   * `Webhook Error: <reason>` is the shape its docs specify.
   */
  const EXEMPT = new Set(['stripe-webhook']);

  /**
   * Parsed rather than grepped. `{ error: publicMessage(error) }` contains the
   * message and `{ error: error.message }` forwards it, and both contain the
   * word "error" twice -- a regex that tells them apart is a regex nobody can
   * read six months from now.
   */
  function forwardedMessages(source: string, file: string): string[] {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const found: string[] = [];

    const inspect = (clause: ts.CatchClause) => {
      const param = clause.variableDeclaration?.name?.getText(sourceFile);
      if (!param) return;
      const tainted = new Set([param]);
      const collectLocals = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) {
          if (node.initializer.getText(sourceFile).includes(param)) tainted.add(node.name.getText(sourceFile));
        }
        ts.forEachChild(node, collectLocals);
      };
      collectLocals(clause.block);

      const findAssignments = (node: ts.Node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'error') {
          const text = node.initializer.getText(sourceFile);
          const mentionsCaught = [...tainted].some((n) => new RegExp(`\\b${n}\\b`).test(text));
          const contained = /^publicMessage\(/.test(text);
          if (mentionsCaught && !contained) found.push(text.replace(/\s+/g, ' ').slice(0, 60));
        }
        ts.forEachChild(node, findAssignments);
      };
      findAssignments(clause.block);
    };

    const walk = (node: ts.Node) => {
      if (ts.isCatchClause(node)) inspect(node);
      ts.forEachChild(node, walk);
    };
    walk(sourceFile);
    return found;
  }

  it('returns a contained message instead', () => {
    const forwarding = handlers
      .filter(({ name }) => !EXEMPT.has(name))
      .map(({ name, source, file }) => ({ name, sites: forwardedMessages(source, file) }))
      .filter(({ sites }) => sites.length > 0)
      .map(({ name, sites }) => `${name}: ${sites.join(' | ')}`);

    expect(forwarding, 'these put a thrown message in the response body').toEqual([]);
  });

  it('keeps a way to say something on purpose', () => {
    // Containment without an exception turns every fixable 400 into a shrug,
    // so PublicError exists and the deliberate throws use it.
    const errors = readFileSync(path.join(FUNCTIONS_DIR, '_shared', 'errors.ts'), 'utf8');
    expect(errors).toContain('export class PublicError');
    expect(errors).toContain('error instanceof PublicError');

    const users = handlers.filter(({ source }) => source.includes('throw new PublicError'));
    expect(users.length, 'nothing throws a PublicError, so the escape hatch is theatre').toBeGreaterThan(10);
    for (const { name, source } of users) {
      expect(source, `${name} throws PublicError without importing it`).toMatch(
        /import \{[^}]*PublicError[^}]*\} from ['"]\.\.\/_shared\/errors\.ts['"]/,
      );
    }
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
