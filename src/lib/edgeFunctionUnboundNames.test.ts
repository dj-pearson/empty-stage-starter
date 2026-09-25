import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * No deployed edge function evaluates a name that is not bound (US-856, for
 * the Deno tree).
 *
 * manage-subscription declared `corsHeaders` inside its default export and
 * used it by name in five module-level handlers. Each of those lines threw a
 * ReferenceError while building a 200 -- after Stripe and the database had
 * been written -- so every cancel, reactivate and plan change landed and was
 * reported to the parent as a failure. The typecheck ratchet holds TS2304 at
 * zero for src/, but supabase/functions/ is not in that project and `deno
 * check` needs the network, so nothing looked.
 *
 * This asks the TypeScript checker for "Cannot find name" (2304) and "Cannot
 * find namespace" (2503) on each handler with imports left unresolved. An
 * unresolved import is a different diagnostic (2307), and `Deno` is the
 * runtime's own global, so neither is counted.
 */
const FUNCTIONS_DIR = path.join(process.cwd(), 'supabase', 'functions');

/**
 * Handlers already carrying an unbound name when this test was written. Both
 * are admin SEO tools that reference `AIServiceV2`, `modelConfig` and `apiKey`
 * without importing or declaring them, so they throw on every call. Listed so
 * the guard can land without folding their repair into a billing change; the
 * list may only shrink, and a name here is a bug report, not a waiver.
 */
const KNOWN_UNBOUND = new Set(['analyze-semantic-keywords', 'optimize-page-content']);

/** Handlers that must stay clean whatever the list above says. */
const MUST_BE_CLEAN = ['manage-subscription', 'manage-payment-methods', 'generate-invoice', 'create-checkout'];

function unboundNamesByHandler(): Map<string, string[]> {
  const files = readdirSync(FUNCTIONS_DIR)
    .filter((name) => name !== '_shared' && name !== 'common')
    .map((name) => path.join(FUNCTIONS_DIR, name, 'index.ts'))
    .filter((file) => existsSync(file));

  const program = ts.createProgram(files, {
    noEmit: true,
    noResolve: true,
    target: ts.ScriptTarget.ES2022,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: [],
    skipLibCheck: true,
    allowImportingTsExtensions: true,
  });

  const found = new Map<string, string[]>();
  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) continue;
    for (const d of program.getSemanticDiagnostics(sourceFile)) {
      if (d.code !== 2304 && d.code !== 2503) continue;
      const text = ts.flattenDiagnosticMessageText(d.messageText, ' ');
      if (text.includes("'Deno'")) continue;
      const line = d.start !== undefined ? sourceFile.getLineAndCharacterOfPosition(d.start).line + 1 : 0;
      const name = path.basename(path.dirname(file));
      found.set(name, [...(found.get(name) ?? []), `${line}: ${text}`]);
    }
  }
  return found;
}

describe('every deployed edge function binds the names it evaluates', () => {
  const found = unboundNamesByHandler();

  it('keeps the billing handlers free of unbound names', () => {
    const offenders = MUST_BE_CLEAN.filter((name) => found.has(name)).map(
      (name) => `${name} ${found.get(name)!.join(' | ')}`,
    );
    expect(offenders, 'these throw ReferenceError at runtime').toEqual([]);
  });

  it('adds no new handler to the known-broken list', () => {
    const fresh = [...found.keys()].filter((name) => !KNOWN_UNBOUND.has(name));
    expect(fresh.map((name) => `${name} ${found.get(name)!.join(' | ')}`)).toEqual([]);
  });

  it('drops a handler from the known-broken list once it is fixed', () => {
    const fixed = [...KNOWN_UNBOUND].filter((name) => !found.has(name));
    expect(fixed, 'remove these from KNOWN_UNBOUND').toEqual([]);
  });
});
