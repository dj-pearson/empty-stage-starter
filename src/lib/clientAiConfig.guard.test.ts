import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

/**
 * US-709: no edge function may take its AI endpoint or its API-key env-var name
 * from the request body.
 *
 * The hole this closes: parse-recipe and suggest-recipe accepted an `aiModel`
 * object from the client, then ran `Deno.env.get(aiModel.api_key_env_var)` and
 * POSTed the result to `aiModel.endpoint_url`. Any signed-in user could name a
 * server secret and an endpoint they controlled and be handed the value.
 *
 * These are static source checks rather than live HTTP probes: the tree they
 * guard is Deno, the gate here is vitest under Node, and the failure mode is a
 * branch existing at all. A function that never reads `aiModel` cannot honour
 * one, whatever a request body carries.
 */

const FUNCTIONS_DIR = path.resolve(__dirname, '../../supabase/functions');

/**
 * Strip comments before matching. A comment documenting the removal ("aiModel
 * is ignored") must not read as the branch it documents.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const readFn = (name: string) =>
  stripComments(readFileSync(path.join(FUNCTIONS_DIR, name, 'index.ts'), 'utf-8'));

const readComponent = (name: string) =>
  stripComments(readFileSync(path.resolve(__dirname, '../components', name), 'utf-8'));

/** Every function directory in the deployed tree that has an index.ts. */
function deployedFunctions(): string[] {
  return readdirSync(FUNCTIONS_DIR)
    .filter((name) => {
      const dir = path.join(FUNCTIONS_DIR, name);
      if (!statSync(dir).isDirectory()) return false;
      try {
        return statSync(path.join(dir, 'index.ts')).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Functions still allowed to read `api_key_env_var` off a row they fetched
 * themselves from `ai_settings` with the service-role client. The value comes
 * from an admin-managed table, never from the caller, so the escalation path
 * this test guards does not exist there. `_shared/ai-service-v2.ts` is the
 * intended home for all of it; these are the remaining migrations.
 */
const SERVER_ROW_READERS = new Set([
  'test-ai-model', // admin tool whose entire purpose is validating a configured row
  'suggest-recipes-from-pantry',
  'repurpose-content',
]);

describe('client-supplied AI config (US-709)', () => {
  it.each(['parse-recipe', 'suggest-recipe'])(
    '%s does not read aiModel from the request body',
    (fn) => {
      const src = readFn(fn);
      expect(src).not.toMatch(/\baiModel\b\s*[,}]/); // destructured out of req.json()
      expect(src).not.toMatch(/aiModel\./);
      expect(src).not.toMatch(/aiModel\.endpoint_url/);
    }
  );

  it.each(['parse-recipe', 'suggest-recipe'])('%s resolves its model server-side', (fn) => {
    const src = readFn(fn);
    expect(src).toMatch(/new AIServiceV2\(\)/);
    expect(src).toMatch(/aiService\.generateContent\(/);
  });

  it.each(['parse-recipe', 'suggest-recipe'])('%s stays gated to signed-in callers', (fn) => {
    expect(readFn(fn)).toMatch(/await requireUser\(req\)/);
  });

  it('leaves no function reading api_key_env_var off caller input', () => {
    const offenders = deployedFunctions()
      .filter((fn) => !SERVER_ROW_READERS.has(fn))
      .filter((fn) => /api_key_env_var/.test(readFn(fn)));
    expect(offenders).toEqual([]);
  });

  it.each(['ImportRecipeDialog.tsx', 'RecipeBuilder.tsx'])(
    '%s no longer selects an AI model to send',
    (component) => {
      const src = readComponent(component);
      expect(src).not.toMatch(/from\(['"]ai_settings['"]\)/);
      expect(src).not.toMatch(/aiModel:/);
    }
  );
});
